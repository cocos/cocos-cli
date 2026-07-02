import {
    Animation,
    AnimationClip,
    AnimationState,
    Node,
} from 'cc';
import {
    AnimationPlayState,
    AnimationEventReason,
    IAnimationClipEvent,
    IAnimationClipDump,
    IAnimationClipsInfo,
    IAnimationEditClipOptions,
    IAnimationEnterOptions,
    IAnimationExitOptions,
    IAnimationOperation,
    IAnimationOperationOptions,
    IAnimationOperationResult,
    IAnimationPlayStateOptions,
    IAnimationQueryAuxiliaryCurveValueAtFrameOptions,
    IAnimationPropertyInfo,
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
    NodeEventType,
} from '../../common';
import { BaseService, register, Service, ServiceEvents } from './core';
import { Rpc } from '../rpc';
import { createClipDump } from './animation/clip-dump';
import {
    animationClipSnapshotsEqual,
    captureAnimationClipSnapshot,
    restoreAnimationClipSnapshot,
    type IAnimationClipSnapshot,
} from './animation/clip-snapshot';
import { syncAnimationClipDuration } from './animation/clip-duration';
import { applyClipOperation, validateAnimationOperation } from './animation/clip-operations';
import { queryAuxiliaryCurveValueAtFrame } from './animation/auxiliary-curve';
import { saveSkeletonAnimationMeta } from './animation/skeleton-meta';
import { captureAnimationSampledState, restoreAnimationSampledState } from './animation/sampled-state';
import { AnimationClipSnapshotCommand } from './animation/undo';
import { IAnimationSession } from './animation/types';
import { clipUuid, getClipSample } from './animation/utils';
import type { IPropertyCurveMetadataContext } from './animation/property-curve';
import { queryAnimationPropertyMetadata, queryComponentAnimableProperties } from './animation/property-metadata';
import { normalizeProvidedAnimationPropertyOperationValue, serializeAnimationPropertyValue } from './animation/property-value';
import { ACTIVE_PROPERTY, DEFAULT_PROPERTIES } from './animation/property-menu';
import { isAllowedSkeletonAnimationOperation, isAnimationOperationResult, shouldSyncClipDuration } from './animation/operation-policy';
import {
    loadAnimationClip,
    queryAnimationClipsInfo,
    queryNodeAnimationData,
    rebindAnimationComponentClip,
    resolveAnimationClip,
} from './animation/clip-library';
import {
    extractSampledOperationValue,
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

@register('Animation')
export class AnimationService extends BaseService<Record<string, any>> implements IAnimationService {
    private _session: IAnimationSession | null = null;
    private _animationStateMap = new Map<string, AnimationState>();
    private _curEditTime = 0;
    private _playState: AnimationPlayState = 'stop';
    private _playbackTimeBroadcastTimer: ReturnType<typeof setInterval> | null = null;
    private _lastPlaybackBroadcastTime = Number.NaN;
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
        this._assertEditorOpened();

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
        const session = this._requireSession();

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

        this._clearAnimationStates();
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
        const clipsInfo = await queryAnimationClipsInfo(rootNode);
        const defaultClipUuid = clipsInfo.defaultClip;
        return {
            ...clipsInfo,
            nodeTreeDump: await Service.Node.queryNodeTree({ path: clipsInfo.rootPath }),
            clipDump: defaultClipUuid ? await this.queryClip({ rootUuid: rootNode.uuid, clipUuid: defaultClipUuid }) : null,
            time: this._session && defaultClipUuid ? await this.queryTime({ clipUuid: defaultClipUuid }) : 0,
            state: this._playState,
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
            const state = this._isCurrentSessionClipQuery(options, uuid, hasTarget)
                ? this._animationStateMap.get(uuid)
                : undefined;
            if (state) {
                return this._createClipDump(this._getSessionRootNode(), state.clip, state);
            }
        }

        const { rootNode, clip } = await this._resolveClipForQuery(options);
        const uuid = clipUuid(clip);
        const state = this._session?.rootUuid === rootNode.uuid
            ? this._animationStateMap.get(uuid)
            : undefined;
        return this._createClipDump(rootNode, clip, state);
    }

    private _isCurrentSessionClipQuery(options: IAnimationQueryClipOptions, clipUuid: string, hasTarget: boolean): boolean {
        if (!this._session || clipUuid !== this._session.clipUuid) {
            return false;
        }
        if (!hasTarget) {
            return true;
        }
        return options.rootUuid === this._session.rootUuid
            || options.rootPath === this._session.rootPath
            || options.nodeUuid === this._session.rootUuid
            || options.nodePath === this._session.rootPath;
    }

    async queryProperties(options: IAnimationTargetOptions): Promise<IAnimationPropertyInfo[]> {
        const node = this._resolveNode(options);
        const root = this._session ? getNodeByUuid(this._session.rootUuid) : queryAnimationRootNode(node, Service.Editor.getRootNode());
        const isChild = Boolean(root && root !== node);
        const properties = isChild ? [ACTIVE_PROPERTY, ...DEFAULT_PROPERTIES] : [...DEFAULT_PROPERTIES];

        for (const comp of node.components) {
            if (!comp || comp instanceof Animation) {
                continue;
            }
            properties.push(...queryComponentAnimableProperties(comp));
        }

        return properties;
    }

    async queryTime(options: IAnimationTimeOptions): Promise<number> {
        if (!this._session) {
            return 0;
        }
        const state = this._animationStateMap.get(options.clipUuid || this._session.clipUuid);
        return state?.current ?? this._curEditTime;
    }

    async queryPropertyValueAtFrame(options: IAnimationQueryPropertyValueAtFrameOptions): Promise<IAnimationValue> {
        const session = this._requireSession();
        const uuid = options.clipUuid || session.clipUuid;
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to operate: '${uuid}'`);
        }

        const state = await this._getAnimationState(uuid);
        const previousTime = state.current ?? this._curEditTime;
        const sample = getClipSample(state.clip);
        let value: unknown;
        try {
            state.weight = 1;
            state.setTime(options.frame / sample);
            if (!state.isPaused) {
                state.pause();
            }
            state.sample();

            const node = this._resolveFrameQueryNode(options);
            value = readPropertyValue(node, options.propKey);
        } finally {
            state.setTime(previousTime);
            if (!state.isPaused) {
                state.pause();
            }
            state.sample();
            this._curEditTime = previousTime;
            await Service.Engine.repaintInEditMode();
        }
        return serializeAnimationPropertyValue(value);
    }

    async queryAuxiliaryCurveValueAtFrame(options: IAnimationQueryAuxiliaryCurveValueAtFrameOptions) {
        const session = this._requireSession();
        const uuid = options.clipUuid || session.clipUuid;
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to operate: '${uuid}'`);
        }

        const state = await this._getAnimationState(uuid);
        return queryAuxiliaryCurveValueAtFrame(state.clip, options.name, options.frame);
    }

    async setTime(options: IAnimationSetTimeOptions): Promise<boolean> {
        const session = this._requireSession();
        const state = await this._getAnimationState(session.clipUuid);
        let playTime = options.time;
        if (playTime > state.duration) {
            playTime = state.duration;
        }
        if (playTime < 0) {
            playTime = 0;
        }

        if (((state.clip.wrapMode & AnimationClip.WrapMode.Reverse) === AnimationClip.WrapMode.Reverse)) {
            playTime = state.duration - playTime;
        }

        state.weight = 1;
        state.setTime(playTime);
        if (!state.isPaused) {
            state.pause();
        }
        state.sample();
        this._curEditTime = playTime;
        await Service.Engine.repaintInEditMode();
        this._broadcastTimeChanged('set-time');
        return true;
    }

    async changePlayState(options: IAnimationPlayStateOptions): Promise<boolean> {
        const session = this._requireSession();
        const uuid = options.clipUuid || session.clipUuid;
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to operate: '${uuid}'`);
        }
        const state = await this._getAnimationState(uuid);

        switch (options.operate) {
            case 'play':
                state.weight = 1;
                if (state.isPlaying && state.isPaused) {
                    state.resume();
                } else {
                    state.play();
                }
                this._playState = 'playing';
                Service.Engine.enterAnimationMode();
                this._startPlaybackTimeBroadcast();
                break;
            case 'pause':
                this._stopPlaybackTimeBroadcast();
                state.pause();
                this._curEditTime = state.current;
                this._playState = 'pause';
                Service.Engine.exitAnimationMode();
                break;
            case 'resume':
                if (!state.isPlaying) {
                    state.weight = 1;
                    state.play();
                }
                state.resume();
                this._playState = 'playing';
                Service.Engine.enterAnimationMode();
                this._startPlaybackTimeBroadcast();
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
        const session = this._requireSession();
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

    async applyOperation(options: IAnimationOperationOptions): Promise<IAnimationOperationResult> {
        const session = this._requireSession();
        if (!Array.isArray(options.operations)) {
            throw new Error('Animation operations must be an array.');
        }

        const rootNode = this._getSessionRootNode();
        const state = await this._getAnimationState(session.clipUuid);
        const propertyMetadataContext = this._createPropertyCurveMetadataContext(rootNode);
        const shouldRecordUndo = options.recordUndo !== false;
        const before = captureAnimationClipSnapshot(state.clip, propertyMetadataContext);
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

            const normalized = await this._normalizeAnimationOperation(inputOperation, session.clipUuid, rootNode, session.rootPath);
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
            shouldSyncDuration = shouldSyncDuration || shouldSyncClipDuration(operation);
        }

        if (shouldSyncDuration) {
            syncAnimationClipDuration(state.clip);
        }
        this._resetAnimationState(session.clipUuid);
        this._createAnimationState(session.clipUuid, state.clip);
        await this.setTime({ time: this._curEditTime });
        const after = shouldRecordUndo ? captureAnimationClipSnapshot(state.clip, propertyMetadataContext) : null;
        if (before && after && !animationClipSnapshotsEqual(before, after)) {
            Service.Undo.push(new AnimationClipSnapshotCommand({
                clipUuid: session.clipUuid,
                before,
                after,
                applySnapshot: (snapshot) => this._restoreCurrentClipSnapshot(session.clipUuid, snapshot),
            }));
        }
        this._broadcastClipChanged('operation');
        return {
            state: 'success',
            result: true,
        };
    }

    private async _normalizeAnimationOperation(
        operation: IAnimationOperation,
        currentClipUuid: string,
        rootNode: Node,
        rootPath: string,
    ): Promise<IAnimationOperation | IAnimationOperationResult> {
        const type = (operation as any)?.type;
        if (type === 'updatePropertyKeyData') {
            const keyOperation = operation as Extract<IAnimationOperation, { type: 'updatePropertyKeyData' }>;
            const keyData = keyOperation.keyData ?? keyOperation.curveData;
            return keyData === keyOperation.keyData ? operation : { ...keyOperation, keyData };
        }
        if (type !== 'createPropertyKey' && type !== 'updatePropertyKey') {
            return operation;
        }

        const keyOperation = operation as Extract<IAnimationOperation, { type: 'createPropertyKey' | 'updatePropertyKey' }>;
        const keyData = keyOperation.keyData ?? keyOperation.curveData;
        if (keyOperation.value !== undefined) {
            const value = await normalizeProvidedAnimationPropertyOperationValue(rootNode, rootPath, keyOperation, {
                queryNodeByUuid: (uuid) => getNodeByUuid(uuid),
                queryNodePath: (node) => getNodePath(node),
            });
            return { ...keyOperation, keyData, value };
        }
        if (keyOperation.type === 'updatePropertyKey' && keyData) {
            return {
                ...keyOperation,
                type: 'updatePropertyKeyData',
                keyData,
            };
        }

        try {
            const sampled = await this.queryPropertyValueAtFrame({
                clipUuid: keyOperation.clipUuid || currentClipUuid,
                nodePath: keyOperation.nodePath,
                nodeUuid: keyOperation.nodeUuid,
                propKey: keyOperation.propKey,
                frame: keyOperation.frame,
            });
            const value = extractSampledOperationValue(sampled, keyOperation.channel);
            if (value === undefined) {
                return {
                    state: 'failure',
                    result: false,
                    reason: `Failed to sample animation property value: ${keyOperation.propKey}`,
                };
            }
            return { ...keyOperation, keyData, value };
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            return {
                state: 'failure',
                result: false,
                reason: normalized.message,
            };
        }
    }

    async save(): Promise<boolean> {
        const session = this._requireSession();
        const state = await this._getAnimationState(session.clipUuid);
        if (isSkeletonClip(session.clipUuid, this._getSessionRootNode())) {
            await saveSkeletonAnimationMeta(session.clipUuid, state.clip);
            return true;
        }

        const content = EditorExtends.serialize(state.clip);
        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [session.clipUuid]);
        if (assetInfo) {
            await Rpc.getInstance().request('assetManager', 'saveAsset', [assetInfo.uuid, content]);
        } else {
            await Rpc.getInstance().request('assetManager', 'createAsset', [{
                target: `db://assets/${state.clip.name}.anim`,
                content,
            }]);
        }
        return true;
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

    private _assertEditorOpened(): void {
        if (!Service.Editor.getRootNode()) {
            throw new Error('Animation editor requires an opened scene or prefab.');
        }
    }

    private _requireSession(): IAnimationSession {
        if (!this._session) {
            throw new Error('Animation editing session is not active.');
        }
        return this._session;
    }

    private _resolveRootNode(options: IAnimationTargetOptions): Node {
        const node = this._resolveNode(options);
        return options.rootPath || options.rootUuid ? node : queryAnimationRootNode(node, Service.Editor.getRootNode());
    }

    private _resolveNode(options: IAnimationTargetOptions | IAnimationEnterOptions): Node {
        this._assertEditorOpened();
        const uuid = 'rootUuid' in options ? options.rootUuid : undefined;
        const path = 'rootPath' in options ? options.rootPath : undefined;
        const nodeUuid = 'nodeUuid' in options ? options.nodeUuid : undefined;
        const nodePath = 'nodePath' in options ? options.nodePath : undefined;
        const target = getNodeByUuid(uuid || nodeUuid || '') || getNodeByPath(path || nodePath || '');
        if (target) {
            return target;
        }

        const selection = Service.Selection.query();
        if (selection.length > 0) {
            const selected = getNodeByPath(selection[0]);
            if (selected) {
                return selected;
            }
        }

        throw new Error('Animation target node is required.');
    }

    private _resolveFrameQueryNode(options: IAnimationQueryPropertyValueAtFrameOptions): Node {
        const session = this._requireSession();
        const nodeByUuid = getNodeByUuid(options.nodeUuid || '');
        if (nodeByUuid) {
            return nodeByUuid;
        }

        const path = options.nodePath || session.rootPath;
        const nodeByPath = getNodeByPath(path);
        if (nodeByPath) {
            return nodeByPath;
        }

        if (options.nodePath && !options.nodePath.startsWith(session.rootPath)) {
            const relativeNode = getNodeByPath(`${session.rootPath}/${options.nodePath}`);
            if (relativeNode) {
                return relativeNode;
            }
        }

        throw new Error(`Animation target node is required: ${path}`);
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

    private _createClipDump(rootNode: Node, clip: AnimationClip, state?: AnimationState): IAnimationClipDump {
        return createClipDump(clip, state, {
            isSkeleton: isSkeletonClip(clipUuid(clip), rootNode),
            useBakedAnimation: isUsingBakedAnimation(rootNode),
            queryPropertyMetadata: (nodePath, propKey) => queryAnimationPropertyMetadata(rootNode, nodePath, propKey),
        });
    }

    private _createPropertyCurveMetadataContext(rootNode: Node): IPropertyCurveMetadataContext {
        return {
            queryPropertyMetadata: (nodePath, propKey) => queryAnimationPropertyMetadata(rootNode, nodePath, propKey),
        };
    }

    private async _getAnimationState(uuid: string): Promise<AnimationState> {
        const session = this._requireSession();
        const existed = this._animationStateMap.get(uuid);
        if (existed) {
            return existed;
        }

        const clip = resolveAnimationClip(await queryNodeAnimationData(this._getSessionRootNode(), uuid), uuid);
        return this._createAnimationState(uuid, clip);
    }

    private async _stopCurrent(): Promise<void> {
        this._stopPlaybackTimeBroadcast();
        if (!this._session) {
            return;
        }
        const state = this._animationStateMap.get(this._session.clipUuid);
        if (state) {
            state.setTime(0);
            if (!state.isPaused) {
                state.pause();
            }
            state.sample();
            state.stop();
        }
        this._curEditTime = 0;
        this._playState = 'stop';
        Service.Engine.exitAnimationMode();
    }

    private _clearAnimationStates(): void {
        for (const state of this._animationStateMap.values()) {
            try {
                state.destroy();
            } catch (e) {
                console.warn('[Animation] destroy animation state failed:', e);
            }
        }
        this._animationStateMap.clear();
    }

    private _resetAnimationState(uuid: string): void {
        const state = this._animationStateMap.get(uuid);
        if (!state) {
            return;
        }
        try {
            state.destroy();
        } catch (e) {
            console.warn('[Animation] destroy animation state failed:', e);
        }
        this._animationStateMap.delete(uuid);
    }

    private async _restoreFailedOperationSnapshot(clip: AnimationClip, snapshot: IAnimationClipSnapshot, rootNode: Node): Promise<void> {
        try {
            await restoreAnimationClipSnapshot(clip, snapshot);
        } catch (error) {
            console.error('[Animation] restore failed operation snapshot failed:', error);
            throw error;
        }
        const state = this._animationStateMap.get(clipUuid(clip));
        if (state) {
            (state as any)._curveLoaded = false;
            state.initialize(rootNode);
        }
        await this.setTime({ time: this._curEditTime });
    }

    private async _restoreCurrentClipSnapshot(uuid: string, snapshot: IAnimationClipSnapshot): Promise<void> {
        const session = this._requireSession();
        if (uuid !== session.clipUuid) {
            throw new Error(`current edit clip: '${session.clipUuid}' but you want to restore: '${uuid}'`);
        }

        const state = await this._getAnimationState(uuid);
        const clip = state.clip;
        this._resetAnimationState(uuid);
        await restoreAnimationClipSnapshot(clip, snapshot);
        this._createAnimationState(uuid, clip);
        await this.setTime({ time: this._curEditTime });
        this._broadcastClipChanged('undo-redo');
    }

    private _createAnimationState(uuid: string, clip: AnimationClip): AnimationState {
        const state = new AnimationState(clip);
        (state as any)._curveLoaded = false;
        state.initialize(this._getSessionRootNode());
        this._animationStateMap.set(uuid, state);
        return state;
    }

    private async _refreshCurrentClipAsset(uuid: string): Promise<void> {
        if (!this._session || this._session.clipUuid !== uuid) {
            return;
        }

        const time = this._curEditTime;
        const clip = await loadAnimationClip(uuid);
        const rootNode = this._getSessionRootNode();
        const animComp = queryAnimationComponent(rootNode);
        if (clip && animComp instanceof Animation) {
            rebindAnimationComponentClip(animComp, clip);
        }
        this._resetAnimationState(uuid);
        const state = await this._getAnimationState(uuid);
        await this.setTime({ time: Math.min(time, state.duration) });
        this._broadcastClipChanged('asset-refresh');
    }

    private _disposeSession(): void {
        this._stopPlaybackTimeBroadcast();
        this._clearAnimationStates();
        Service.Engine.exitAnimationMode();
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
        const event = this._createAnimationClipEvent(reason);
        if (!event) {
            return;
        }
        this.broadcast('animation:time-changed', {
            ...event,
            time: this._curEditTime,
            playState: this._playState,
        });
    }

    private _startPlaybackTimeBroadcast(): void {
        this._stopPlaybackTimeBroadcast();
        this._lastPlaybackBroadcastTime = Number.NaN;
        this._playbackTimeBroadcastTimer = setInterval(() => {
            this._broadcastPlaybackTimeTick();
        }, 100);
    }

    private _stopPlaybackTimeBroadcast(): void {
        if (this._playbackTimeBroadcastTimer) {
            clearInterval(this._playbackTimeBroadcastTimer);
            this._playbackTimeBroadcastTimer = null;
        }
    }

    private _broadcastPlaybackTimeTick(): void {
        if (!this._session || this._playState !== 'playing') {
            this._stopPlaybackTimeBroadcast();
            return;
        }
        const state = this._animationStateMap.get(this._session.clipUuid);
        const time = state?.current;
        if (!state || state.isPaused) {
            this._stopPlaybackTimeBroadcast();
            return;
        }
        if (!state.isPlaying) {
            this._stopPlaybackTimeBroadcast();
            const duration = Number.isFinite(state.duration) ? state.duration : this._curEditTime;
            this._curEditTime = Math.max(0, duration);
            state.weight = 1;
            state.setTime(this._curEditTime);
            state.sample();
            this._playState = 'stop';
            Service.Engine.exitAnimationMode();
            void Service.Engine.repaintInEditMode();
            this._broadcastTimeChanged('play-state');
            void this.queryState()
                .then((currentState) => this._broadcastStateChanged('play-state', currentState))
                .catch((error) => console.error('[Animation] broadcast playback stop state failed:', error));
            return;
        }
        if (typeof time !== 'number' || !Number.isFinite(time)) {
            return;
        }
        if (Math.abs(time - this._lastPlaybackBroadcastTime) < 0.001) {
            return;
        }
        this._curEditTime = time;
        this._lastPlaybackBroadcastTime = time;
        this._broadcastTimeChanged('play-state');
    }

    private _broadcastClipChanged(reason: AnimationEventReason): void {
        const event = this._createAnimationClipEvent(reason);
        if (!event) {
            return;
        }
        this.broadcast('animation:clip-changed', event);
    }

    private _createAnimationClipEvent(reason: AnimationEventReason): IAnimationClipEvent | null {
        if (!this._session) {
            return null;
        }
        return {
            reason,
            rootUuid: this._session.rootUuid,
            rootPath: this._session.rootPath,
            clipUuid: this._session.clipUuid,
        };
    }

    private _getSessionRootNode(): Node {
        const session = this._requireSession();
        const rootNode = getNodeByUuid(session.rootUuid);
        if (!rootNode) {
            throw new Error(`Animation root node not found: ${session.rootUuid}`);
        }
        return rootNode;
    }

}
