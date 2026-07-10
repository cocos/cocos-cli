import {
    Animation,
    AnimationClip,
    Node,
} from 'cc';
import type { AnimationState } from 'cc';
import {
    AnimationPlayState,
    AnimationEventReason,
    IAnimationClipDump,
    IAnimationClipsInfo,
    IAnimationEditClipOptions,
    IAnimationEnterOptions,
    IAnimationExitOptions,
    IAnimationOperation,
    IAnimationOperationOptions,
    IAnimationOperationResult,
    IAnimationSaveOptions,
    IAnimationPlayStateOptions,
    IAnimationQueryAuxiliaryCurveValueAtFrameOptions,
    IAnimationQueryClipOptions,
    IAnimationQueryPropertyValueAtFrameOptions,
    IAnimationRootInfo,
    IAnimationRootResult,
    IAnimationService,
    IAnimationSetTimeOptions,
    IAnimationStateInfo,
    IAnimationTargetOptions,
    IAnimationTimeOptions,
    IAnimationValue,
    IUndoScope,
    NodeEventType,
} from '../../common';
import { BaseService, register, Service, ServiceEvents } from './core';
import {
    animationClipSnapshotsEqual,
    captureAnimationClipSnapshot,
    restoreAnimationClipSnapshot,
    type IAnimationClipSnapshot,
} from './animation/clip-snapshot';
import { syncAnimationClipDuration } from './animation/clip-duration';
import { applyClipOperation, validateAnimationOperation } from './animation/clip-operations';
import { queryAuxiliaryCurveValueAtFrame } from './animation/auxiliary-curve';
import { captureAnimationSampledState, restoreAnimationSampledState } from './animation/sampled-state';
import { saveAnimationServiceClip } from './animation/service-save';
import { AnimationStateRegistry } from './animation/state-registry';
import { AnimationClipSnapshotCommand } from './animation/undo';
import { IAnimationSession } from './animation/types';
import { clipUuid, ensureClipEvents, getClipSample } from './animation/utils';
import { serializeAnimationPropertyValue } from './animation/property-value';
import { AnimationServicePlayback } from './animation/service-playback';
import { isAllowedSkeletonAnimationOperation, isAnimationOperationResult, shouldSyncClipDuration } from './animation/operation-policy';
import { normalizeAnimationOperation } from './animation/operation-normalizer';
import {
    loadAnimationClip,
    queryAnimationClipsInfo,
    queryNodeAnimationData,
    rebindAnimationComponentClip,
    resolveAnimationClip,
} from './animation/clip-library';
import {
    getAnimationMode,
    getNodeByPath,
    getNodeByUuid,
    getNodePath,
    isSkeletonClip,
    isUsingBakedAnimation,
    queryAnimationComponent,
    queryAnimationRootNode,
    readPropertyValue,
} from './animation/scene-node';
import {
    assertAnimationEditorOpened,
    createAnimationPropertyCurveMetadataContext,
    createAnimationServiceClipDump,
    createAnimationServiceClipEvent,
    getAnimationSessionRootNode,
    isCurrentAnimationSessionClipQuery,
    queryAnimationServiceProperties,
    requireAnimationSession,
    resolveAnimationFrameQueryNode,
    resolveAnimationRootTarget,
    resolveAnimationTargetNode,
} from './animation/service-target';

const SELF_SAVE_ASSET_REFRESH_SUPPRESSION_MS = 5000;

@register('Animation')
export class AnimationService extends BaseService<Record<string, any>> implements IAnimationService {
    private _session: IAnimationSession | null = null;
    private readonly _animationStates = new AnimationStateRegistry(
        () => this._getSessionRootNode(),
        async (uuid) => resolveAnimationClip(await queryNodeAnimationData(this._getSessionRootNode(), uuid), uuid),
    );
    private _curEditTime = 0;
    private _playState: AnimationPlayState = 'stop';
    private readonly _selfSavedClipRefreshes = new Map<string, number>();
    private readonly _playback = new AnimationServicePlayback({
        getCurrentState: () => this._session ? this._animationStates.get(this._session.clipUuid) : undefined,
        getEditTime: () => this._curEditTime,
        getPlayState: () => this._playState,
        setEditTime: (time) => { this._curEditTime = time; },
        setPlayState: (playState) => { this._playState = playState; },
        enterAnimationMode: () => Service.Engine.enterAnimationMode(),
        exitAnimationMode: () => Service.Engine.exitAnimationMode(),
        repaintInEditMode: () => Service.Engine.repaintInEditMode(),
        broadcastTimeChanged: (reason) => this._broadcastTimeChanged(reason),
        broadcastStateChanged: async (reason) => {
            const currentState = await this.queryState();
            this._broadcastStateChanged(reason, currentState);
        },
    });
    private readonly _onAssetRefreshed = (uuid: string) => {
        void this._refreshCurrentClipAsset(uuid).catch((error) => {
            this._disposeSession();
            console.error('[Animation] refresh animation clip failed:', error);
        });
    };

    constructor() {
        super();
        ServiceEvents?.on?.('asset-refresh', this._onAssetRefreshed);
    }

    async enter(options: IAnimationEnterOptions): Promise<IAnimationStateInfo> {
        assertAnimationEditorOpened(Service.Editor.getRootNode());

        if (this._session) {
            await this.exit({ restoreSelection: false, restoreSampledSceneState: true });
        }

        const rootNode = queryAnimationRootNode(this._resolveNode(options), Service.Editor.getRootNode());
        const animData = await queryNodeAnimationData(rootNode, options.clipUuid, { recoverClipBinding: true });
        const clip = resolveAnimationClip(animData, options.clipUuid);
        const uuid = clipUuid(clip);
        if (!uuid) {
            throw new Error('Animation clip uuid is empty.');
        }

        this._session = {
            previousEditorType: Service.Editor.getCurrentEditorType(),
            previousSelection: Service.Selection.query(),
            restoreSelectionOnExit: options.restoreSelectionOnExit ?? true,
            rootUuid: rootNode.uuid,
            rootPath: getNodePath(rootNode),
            clipUuid: uuid,
            sampledRootState: captureAnimationSampledState(rootNode),
            undoBaseline: Service.Undo.createCheckpoint(),
            globalDirtyAtEnter: Service.Undo.isDirty(),
        };

        this._playState = 'stop';
        this._curEditTime = 0;
        await this._getAnimationState(uuid);
        await this.setTime({ time: 0 });
        const state = await this.queryState();
        this._broadcastStateChanged('enter', state);
        return state;
    }

    async exit(options: IAnimationExitOptions): Promise<IAnimationStateInfo> {
        const session = requireAnimationSession(this._session);

        if (options.save) {
            await this.save();
        }

        await this._stopCurrent();

        const shouldRestoreSampledState = options.restoreSampledSceneState ?? true;
        if (shouldRestoreSampledState && session.sampledRootState) {
            const rootNode = getNodeByUuid(session.rootUuid);
            if (rootNode) {
                await restoreAnimationSampledState(rootNode, session.sampledRootState);
                this._emitNodeChanged(rootNode);
            }
        }

        this._animationStates.clear();
        Service.Engine.exitAnimationMode();

        const shouldRestoreSelection = options.restoreSelection ?? session.restoreSelectionOnExit;
        if (shouldRestoreSelection) {
            this._restoreSelection(session.previousSelection);
        }

        this._session = null;
        this._curEditTime = 0;
        this._playState = 'stop';
        await Service.Engine.repaintInEditMode();
        const state = await this.queryState();
        this._broadcastStateChanged('exit', state);
        return state;
    }

    async queryState(): Promise<IAnimationStateInfo> {
        const editorType = Service.Editor.getCurrentEditorType();
        const selection = Service.Selection.query();
        if (!this._session) {
            return {
                active: false,
                editorType,
                mode: getAnimationMode(editorType),
                rootUuid: '',
                rootPath: '',
                clipUuid: '',
                time: 0,
                playState: 'stop',
                dirty: false,
                selection,
                restoreSelectionOnExit: true,
            };
        }

        return {
            active: true,
            editorType,
            mode: 'animation',
            rootUuid: this._session.rootUuid,
            rootPath: this._session.rootPath,
            clipUuid: this._session.clipUuid,
            time: this._curEditTime,
            playState: this._playState,
            dirty: this._isAnimationSessionDirty(this._session),
            selection,
            restoreSelectionOnExit: this._session.restoreSelectionOnExit,
        };
    }

    async queryRoot(options: IAnimationTargetOptions): Promise<IAnimationRootResult> {
        const rootNode = queryAnimationRootNode(this._resolveNode(options), Service.Editor.getRootNode());
        return {
            rootUuid: rootNode.uuid,
            rootPath: getNodePath(rootNode),
        };
    }

    async queryRootInfo(options: IAnimationTargetOptions): Promise<IAnimationRootInfo> {
        const rootNode = this._resolveRootNode(options);
        if (!queryAnimationComponent(rootNode)) {
            const rootPath = getNodePath(rootNode);
            return {
                rootUuid: rootNode.uuid,
                rootPath,
                clipsMenu: [],
                defaultClip: '',
                nodeTreeDump: await Service.Node.queryNodeTree({ path: rootPath }),
                clipDump: null,
                time: 0,
                state: 'stop',
                useBakedAnimation: false,
            };
        }
        const clipsInfo = await queryAnimationClipsInfo(rootNode);
        const activeSession = this._session?.rootUuid === rootNode.uuid ? this._session : null;
        const clipUuid = activeSession?.clipUuid || clipsInfo.defaultClip;
        return {
            ...clipsInfo,
            nodeTreeDump: await Service.Node.queryNodeTree({ path: clipsInfo.rootPath }),
            clipDump: clipUuid ? await this.queryClip({ rootUuid: rootNode.uuid, clipUuid }) : null,
            time: activeSession && clipUuid ? await this.queryTime({ clipUuid }) : 0,
            state: activeSession ? this._playState : 'stop',
            useBakedAnimation: isUsingBakedAnimation(rootNode),
        };
    }

    async queryClips(options: IAnimationTargetOptions): Promise<IAnimationClipsInfo> {
        return await queryAnimationClipsInfo(this._resolveRootNode(options));
    }

    async queryClip(options: IAnimationQueryClipOptions): Promise<IAnimationClipDump> {
        const hasTarget = Boolean(options.rootPath || options.rootUuid || options.nodePath || options.nodeUuid);
        if (this._session) {
            const uuid = options.clipUuid || this._session.clipUuid;
            const state = isCurrentAnimationSessionClipQuery(this._session, options, uuid, hasTarget)
                ? this._animationStates.get(uuid)
                : undefined;
            if (state) {
                return createAnimationServiceClipDump(this._getSessionRootNode(), state.clip, state);
            }
        }

        const { rootNode, clip } = await this._resolveClipForQuery(options);
        const uuid = clipUuid(clip);
        const state = this._session?.rootUuid === rootNode.uuid
            ? this._animationStates.get(uuid)
            : undefined;
        return createAnimationServiceClipDump(rootNode, clip, state);
    }

    async queryProperties(options: IAnimationTargetOptions) {
        const node = this._resolveNode(options);
        const root = this._session ? getNodeByUuid(this._session.rootUuid) : queryAnimationRootNode(node, Service.Editor.getRootNode());
        return queryAnimationServiceProperties(node, root);
    }

    async queryTime(options: IAnimationTimeOptions): Promise<number> {
        if (!this._session) {
            return 0;
        }
        const uuid = options.clipUuid || this._session.clipUuid;
        if (uuid === this._session.clipUuid) {
            return this._curEditTime;
        }
        const state = this._animationStates.get(uuid);
        return state?.current ?? 0;
    }

    async queryPropertyValueAtFrame(options: IAnimationQueryPropertyValueAtFrameOptions): Promise<IAnimationValue> {
        const session = requireAnimationSession(this._session);
        const uuid = options.clipUuid || session.clipUuid;
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to operate: '${uuid}'`);
        }

        if (this._playState === 'playing') {
            const node = resolveAnimationFrameQueryNode(options, session);
            return serializeAnimationPropertyValue(readPropertyValue(node, options.propKey));
        }

        const state = await this._getAnimationState(uuid);
        const previousTime = this._curEditTime;
        const previousStateTime = typeof state.current === 'number' && Number.isFinite(state.current)
            ? state.current
            : previousTime;
        const wasPlaying = state.isPlaying;
        const wasPaused = state.isPaused;
        const sample = getClipSample(state.clip);
        let value: IAnimationValue;
        try {
            state.weight = 1;
            state.setTime(options.frame / sample);
            if (!state.isPaused) {
                state.pause();
            }
            state.sample();

            const node = resolveAnimationFrameQueryNode(options, session);
            value = serializeAnimationPropertyValue(readPropertyValue(node, options.propKey));
        } finally {
            state.setTime(wasPlaying ? previousStateTime : previousTime);
            if (wasPlaying && !wasPaused) {
                state.sample();
                state.resume();
            } else if (!state.isPaused) {
                state.pause();
                state.sample();
            } else {
                state.sample();
            }
            this._curEditTime = previousTime;
            await Service.Engine.repaintInEditMode();
        }
        return value;
    }

    async queryAuxiliaryCurveValueAtFrame(options: IAnimationQueryAuxiliaryCurveValueAtFrameOptions) {
        const session = requireAnimationSession(this._session);
        const uuid = options.clipUuid || session.clipUuid;
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to operate: '${uuid}'`);
        }

        const state = await this._getAnimationState(uuid);
        return queryAuxiliaryCurveValueAtFrame(state.clip, options.name, options.frame);
    }

    async setTime(options: IAnimationSetTimeOptions): Promise<boolean> {
        const session = requireAnimationSession(this._session);
        const state = await this._getAnimationState(session.clipUuid);
        let editTime = options.time;
        if (editTime < 0) {
            editTime = 0;
        }
        let sampleTime = editTime;

        if (((state.clip.wrapMode & AnimationClip.WrapMode.Reverse) === AnimationClip.WrapMode.Reverse)) {
            sampleTime = state.duration - Math.min(editTime, state.duration);
        }

        state.weight = 1;
        state.setTime(sampleTime);
        if (!state.isPaused) {
            state.pause();
        }
        state.sample();
        this._curEditTime = editTime;
        await Service.Engine.repaintInEditMode();
        this._broadcastTimeChanged('set-time');
        return true;
    }

    async changePlayState(options: IAnimationPlayStateOptions): Promise<boolean> {
        const session = requireAnimationSession(this._session);
        const uuid = options.clipUuid || session.clipUuid;
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to operate: '${uuid}'`);
        }
        const state = await this._getAnimationState(uuid);

        switch (options.operate) {
            case 'play':
                this._playback.play(state);
                break;
            case 'pause':
                this._playback.pause(state);
                break;
            case 'resume':
                this._playback.resume(state);
                break;
            case 'stop':
                await this._stopCurrent();
                break;
            default:
                throw new Error(`Unsupported animation play operation: ${String(options.operate)}`);
        }

        await Service.Engine.repaintInEditMode();
        this._broadcastStateChanged('play-state', await this.queryState());
        return true;
    }

    async changeEditClip(options: IAnimationEditClipOptions): Promise<boolean> {
        const session = requireAnimationSession(this._session);
        if (options.clipUuid === session.clipUuid) {
            return true;
        }

        await this._stopCurrent();
        resolveAnimationClip(await queryNodeAnimationData(this._getSessionRootNode(), options.clipUuid, { recoverClipBinding: true }), options.clipUuid);
        session.clipUuid = options.clipUuid;
        this._curEditTime = 0;
        await this._getAnimationState(options.clipUuid);
        await this.setTime({ time: 0 });
        this._broadcastClipChanged('change-clip');
        this._broadcastStateChanged('change-clip', await this.queryState());
        return true;
    }

    async applyOperations(options: IAnimationOperationOptions): Promise<IAnimationOperationResult> {
        const session = requireAnimationSession(this._session);
        if (!Array.isArray(options.operations)) {
            throw new Error('Animation operations must be an array.');
        }

        const rootNode = this._getSessionRootNode();
        const state = await this._getAnimationState(session.clipUuid);
        const propertyMetadataContext = createAnimationPropertyCurveMetadataContext(rootNode);
        const shouldRecordUndo = options.recordUndo !== false;
        const before = captureAnimationClipSnapshot(state.clip, propertyMetadataContext);
        const appliedOperations: IAnimationOperation[] = [];
        let shouldSyncDuration = false;
        let shouldRestoreOnFailure = false;
        for (const inputOperation of options.operations) {
            const inputFailure = validateAnimationOperation(inputOperation, session.clipUuid);
            if (inputFailure) {
                if (shouldRestoreOnFailure) {
                    await this._restoreFailedOperationSnapshot(state.clip, before, rootNode);
                }
                return inputFailure;
            }
            if (isSkeletonClip(session.clipUuid, rootNode) && !isAllowedSkeletonAnimationOperation(inputOperation)) {
                const skeletonFailure = {
                    state: 'failure',
                    result: false,
                    reason: `Method '${inputOperation.type}' is not allowed in skeleton animation.`,
                } as IAnimationOperationResult;
                if (shouldRestoreOnFailure) {
                    await this._restoreFailedOperationSnapshot(state.clip, before, rootNode);
                }
                return skeletonFailure;
            }

            const normalized = await normalizeAnimationOperation(inputOperation, {
                currentClipUuid: session.clipUuid,
                rootNode,
                rootPath: session.rootPath,
                queryPropertyValueAtFrame: (queryOptions) => this.queryPropertyValueAtFrame(queryOptions),
            });
            if (isAnimationOperationResult(normalized)) {
                if (shouldRestoreOnFailure) {
                    await this._restoreFailedOperationSnapshot(state.clip, before, rootNode);
                }
                return normalized;
            }

            const operation = normalized;
            const failure = validateAnimationOperation(operation, session.clipUuid);
            if (failure) {
                if (shouldRestoreOnFailure) {
                    await this._restoreFailedOperationSnapshot(state.clip, before, rootNode);
                }
                return failure;
            }

            let result = false;
            shouldRestoreOnFailure = true;
            try {
                result = await applyClipOperation(state, operation, {
                    rootNode,
                    rootPath: session.rootPath,
                    queryPropertyMetadata: propertyMetadataContext.queryPropertyMetadata,
                });
            } catch (error) {
                const normalizedError = error instanceof Error ? error : new Error(String(error));
                await this._restoreFailedOperationSnapshot(state.clip, before, rootNode);
                return {
                    state: 'failure',
                    result: false,
                    reason: normalizedError.message,
                };
            }
            if (!result) {
                const failureResult = {
                    state: 'failure',
                    result: false,
                    reason: `call method ${operation.type} failed`,
                } as IAnimationOperationResult;
                await this._restoreFailedOperationSnapshot(state.clip, before, rootNode);
                return failureResult;
            }
            appliedOperations.push(operation);
            shouldSyncDuration = shouldSyncDuration || shouldSyncClipDuration(operation);
        }

        if (shouldSyncDuration) {
            syncAnimationClipDuration(state.clip);
        }
        this._animationStates.reset(session.clipUuid);
        this._animationStates.create(session.clipUuid, state.clip);
        await this.setTime({ time: this._curEditTime });
        const after = shouldRecordUndo ? captureAnimationClipSnapshot(state.clip, propertyMetadataContext) : null;
        if (before && after && !animationClipSnapshotsEqual(before, after)) {
            const undoCommand = new AnimationClipSnapshotCommand({
                clipUuid: session.clipUuid,
                before,
                after,
                applySnapshot: (snapshot) => this._restoreCurrentClipSnapshot(session.clipUuid, snapshot),
            });
            const previousScope = options.absorbPreviousScenePropertyUndo === true
                ? this._createPreviousScenePropertyUndoScope(session.rootPath, appliedOperations)
                : null;
            if (previousScope) {
                Service.Undo.pushWithPrevious(undoCommand, {
                    label: 'Animation Property Commit',
                    type: 'animation:property-commit',
                    scope: {
                        assetUuid: session.clipUuid,
                        editorType: 'animation',
                        mode: 'animation',
                    },
                    previousScope,
                    previousTypes: ['node:set-property', 'component:set-property', 'recording:snapshot'],
                });
            } else {
                Service.Undo.push(undoCommand);
            }
        }
        this._broadcastClipChanged('operation');
        return {
            state: 'success',
            result: true,
        };
    }

    async save(options: IAnimationSaveOptions = {}): Promise<boolean> {
        const session = requireAnimationSession(this._session);
        const state = await this._getAnimationState(session.clipUuid);
        const rootNode = this._getSessionRootNode();
        ensureClipEvents(state.clip);
        this._markSelfSavedClipRefresh(session.clipUuid);
        let saved = false;
        try {
            saved = await saveAnimationServiceClip({
                session,
                rootNode,
                clip: state.clip,
            });
        } catch (error) {
            this._selfSavedClipRefreshes.delete(session.clipUuid);
            throw error;
        }
        if (saved) {
            const animComp = queryAnimationComponent(rootNode);
            if (animComp instanceof Animation) {
                rebindAnimationComponentClip(animComp, state.clip);
            }
            this._markSelfSavedClipRefresh(session.clipUuid);
            if (options.saveScene === true) {
                await this._saveSceneForAnimationSession(session);
            } else {
                const animationScope = this._createAnimationUndoScope(session.clipUuid);
                const hasNonAnimationDifference = Service.Undo.hasDifferenceOutsideScope(session.undoBaseline, animationScope);
                if (!session.globalDirtyAtEnter && !hasNonAnimationDifference) {
                    Service.Undo.markSaved();
                }
            }
            session.undoBaseline = Service.Undo.createCheckpoint();
            session.globalDirtyAtEnter = Service.Undo.isDirty();
        } else {
            this._selfSavedClipRefreshes.delete(session.clipUuid);
        }
        return saved;
    }

    onAssetDeleted(uuid: string): void {
        if (!this._session || this._session.clipUuid !== uuid) {
            return;
        }
        void this.exit({ restoreSelection: false, restoreSampledSceneState: true }).catch((error) => {
            this._disposeSession();
            console.error('[Animation] exit after animation clip deletion failed:', error);
        });
    }

    onEditorClosed(): void {
        this._disposeSession();
    }

    private _resolveRootNode(options: IAnimationTargetOptions): Node {
        return resolveAnimationRootTarget(options, Service.Editor.getRootNode(), Service.Selection.query());
    }

    private _resolveNode(options: IAnimationTargetOptions | IAnimationEnterOptions): Node {
        return resolveAnimationTargetNode(options, Service.Editor.getRootNode(), Service.Selection.query());
    }

    private async _resolveClipForQuery(options: IAnimationQueryClipOptions): Promise<{ rootNode: Node; clip: AnimationClip }> {
        const hasTarget = Boolean(options.rootPath || options.rootUuid || options.nodePath || options.nodeUuid);
        const rootNode = hasTarget ? this._resolveRootNode(options) : this._getSessionRootNode();
        const defaultUuid = this._session?.rootUuid === rootNode.uuid ? this._session.clipUuid : undefined;
        const targetUuid = options.clipUuid || defaultUuid;
        const animData = await queryNodeAnimationData(rootNode, targetUuid);
        return {
            rootNode,
            clip: resolveAnimationClip(animData, targetUuid),
        };
    }

    private async _getAnimationState(uuid: string): Promise<AnimationState> {
        requireAnimationSession(this._session);
        return this._animationStates.getOrCreate(uuid);
    }

    private async _stopCurrent(): Promise<void> {
        await this._playback.stopCurrent();
    }

    private async _restoreFailedOperationSnapshot(clip: AnimationClip, snapshot: IAnimationClipSnapshot, _rootNode: Node): Promise<void> {
        const uuid = clipUuid(clip);
        try {
            await this._restoreClipSnapshotWithStateRecreation(uuid, clip, snapshot);
        } catch (error) {
            console.error('[Animation] restore failed operation snapshot failed:', error);
            throw error;
        }
        await this.setTime({ time: this._curEditTime });
    }

    private async _restoreCurrentClipSnapshot(uuid: string, snapshot: IAnimationClipSnapshot): Promise<void> {
        const session = requireAnimationSession(this._session);
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to restore: '${uuid}'`);
        }

        const state = await this._getAnimationState(uuid);
        const clip = state.clip;
        await this._restoreClipSnapshotWithStateRecreation(uuid, clip, snapshot, true);
        await this.setTime({ time: this._curEditTime });
        this._broadcastClipChanged('undo-redo');
    }

    private async _restoreClipSnapshotWithStateRecreation(
        uuid: string,
        clip: AnimationClip,
        snapshot: IAnimationClipSnapshot,
        shouldRecreateState = Boolean(this._animationStates.get(uuid)),
    ): Promise<void> {
        if (shouldRecreateState) {
            // Destroy the old state before replacing clip tracks; destroy() may touch curves it initialized.
            this._animationStates.reset(uuid);
        }
        try {
            await restoreAnimationClipSnapshot(clip, snapshot);
        } catch (error) {
            if (shouldRecreateState) {
                this._animationStates.create(uuid, clip);
            }
            throw error;
        }
        if (shouldRecreateState) {
            this._animationStates.create(uuid, clip);
        }
    }

    private async _refreshCurrentClipAsset(uuid: string): Promise<void> {
        if (!this._session || this._session.clipUuid !== uuid) {
            return;
        }
        if (this._shouldSuppressSelfSavedClipRefresh(uuid)) {
            return;
        }

        const time = this._curEditTime;
        const clip = await loadAnimationClip(uuid);
        if (!this._session || this._session.clipUuid !== uuid) {
            return;
        }
        if (this._shouldSuppressSelfSavedClipRefresh(uuid)) {
            return;
        }
        const rootNode = this._getSessionRootNode();
        const animComp = queryAnimationComponent(rootNode);
        if (clip && animComp instanceof Animation) {
            rebindAnimationComponentClip(animComp, clip);
        }
        this._animationStates.reset(uuid);
        await this._getAnimationState(uuid);
        await this.setTime({ time });
        this._broadcastClipChanged('asset-refresh');
    }

    private _disposeSession(): void {
        this._playback.dispose();
        this._animationStates.clear();
        this._selfSavedClipRefreshes.clear();
        this._session = null;
        this._curEditTime = 0;
        this._playState = 'stop';
    }

    private _restoreSelection(selection: string[]): void {
        Service.Selection.clear();
        for (const path of selection.slice().reverse()) {
            if (getNodeByPath(path)) {
                Service.Selection.select(path);
            }
        }
    }

    private _emitNodeChanged(node: Node): void {
        this.emit('node:change', node, {
            source: 'editor',
            type: NodeEventType.NOTIFY_NODE_CHANGED,
            record: false,
        });
    }

    private _broadcastStateChanged(reason: AnimationEventReason, state: IAnimationStateInfo): void {
        this.broadcast('animation:state-changed', { reason, state });
    }

    private _broadcastTimeChanged(reason: AnimationEventReason): void {
        const event = createAnimationServiceClipEvent(this._session, reason);
        if (!event) {
            return;
        }
        this.broadcast('animation:time-changed', {
            ...event,
            time: this._curEditTime,
            playState: this._playState,
        });
    }

    private _broadcastClipChanged(reason: AnimationEventReason): void {
        const event = createAnimationServiceClipEvent(this._session, reason);
        if (!event) {
            return;
        }
        this.broadcast('animation:clip-changed', event);
    }

    private async _saveSceneForAnimationSession(session: IAnimationSession): Promise<void> {
        const rootNode = getNodeByUuid(session.rootUuid);
        if (!rootNode || !session.sampledRootState) {
            await Service.Editor.save({});
            return;
        }

        const editTime = this._curEditTime;
        await this._stopCurrent();
        await restoreAnimationSampledState(rootNode, session.sampledRootState);
        try {
            await Service.Editor.save({});
        } finally {
            await this.setTime({ time: editTime });
        }
    }

    private _getSessionRootNode(): Node {
        return getAnimationSessionRootNode(requireAnimationSession(this._session));
    }

    private _isAnimationSessionDirty(session: IAnimationSession): boolean {
        return Service.Undo.hasScopedDifference(session.undoBaseline, this._createAnimationUndoScope(session.clipUuid));
    }

    private _createAnimationUndoScope(clipUuid: string): Partial<IUndoScope> {
        return {
            assetUuid: clipUuid,
            editorType: 'animation',
            mode: 'animation',
        };
    }

    private _markSelfSavedClipRefresh(uuid: string): void {
        this._selfSavedClipRefreshes.set(uuid, Date.now());
    }

    private _shouldSuppressSelfSavedClipRefresh(uuid: string): boolean {
        const savedAt = this._selfSavedClipRefreshes.get(uuid);
        if (savedAt === undefined) {
            return false;
        }
        if (Date.now() - savedAt <= SELF_SAVE_ASSET_REFRESH_SUPPRESSION_MS) {
            return true;
        }
        this._selfSavedClipRefreshes.delete(uuid);
        return false;
    }

    private _createPreviousScenePropertyUndoScope(rootPath: string, operations: IAnimationOperation[]): Partial<IUndoScope> | null {
        if (operations.length === 0) {
            return null;
        }
        const targets = new Map<string, { nodePath: string; propPath: string }>();
        for (const operation of operations) {
            if (!('propKey' in operation)) {
                return null;
            }
            const nodePath = this._resolveScenePropertyNodePath(rootPath, operation);
            if (!nodePath) {
                return null;
            }
            const target = { nodePath, propPath: operation.propKey };
            targets.set(`${target.nodePath}\n${target.propPath}`, target);
        }
        if (targets.size !== 1) {
            return null;
        }
        const [target] = targets.values();
        return {
            editorType: 'scene',
            nodePath: target.nodePath,
            propPath: target.propPath,
        };
    }

    private _resolveScenePropertyNodePath(rootPath: string, operation: { nodePath?: string; nodeUuid?: string }): string | null {
        if (operation.nodeUuid) {
            const node = getNodeByUuid(operation.nodeUuid);
            return node ? getNodePath(node) : null;
        }
        const normalizedRootPath = normalizeSceneNodePath(rootPath);
        const normalizedNodePath = normalizeSceneNodePath(operation.nodePath || '');
        if (!normalizedNodePath || normalizedNodePath === normalizedRootPath) {
            return normalizedRootPath;
        }
        if (normalizedRootPath && normalizedNodePath.startsWith(`${normalizedRootPath}/`)) {
            return normalizedNodePath;
        }
        return normalizedRootPath ? `${normalizedRootPath}/${normalizedNodePath}` : normalizedNodePath;
    }

}

function normalizeSceneNodePath(path: string): string {
    return String(path || '').replace(/^\/+|\/+$/g, '');
}
