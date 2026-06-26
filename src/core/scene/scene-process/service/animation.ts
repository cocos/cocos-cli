import {
    Animation,
    AnimationClip,
    AnimationState,
    CCClass,
    Component,
    Node,
    Scene,
    SkeletalAnimation,
    animation,
    js,
} from 'cc';
import {
    AnimationPlayState,
    IAnimationClipMenuItem,
    IAnimationClipsInfo,
    IAnimationEditClipOptions,
    IAnimationEnterOptions,
    IAnimationExitOptions,
    IAnimationPlayStateOptions,
    IAnimationPropertyInfo,
    IAnimationRootInfo,
    IAnimationRootResult,
    IAnimationService,
    IAnimationSetTimeOptions,
    IAnimationStateInfo,
    IAnimationTargetOptions,
    IAnimationTimeOptions,
    NodeEventType,
} from '../../common';
import { BaseService, register, Service } from './core';
import dumpUtil from './dump';
import { Rpc } from '../rpc';

const NodeMgr = EditorExtends.Node;

interface IAnimationData {
    node: Node;
    animComp: Animation | animation.AnimationController;
    clips: AnimationClip[];
    defaultClip: AnimationClip | null;
}

interface IAnimationSession {
    previousEditorType: 'scene' | 'prefab' | 'unknown';
    previousSelection: string[];
    restoreSelectionOnExit: boolean;
    rootUuid: string;
    rootPath: string;
    clipUuid: string;
    sampledRootDump: unknown;
}

const DEFAULT_PROPERTIES: IAnimationPropertyInfo[] = [
    createPropertyInfo('position', 'cc.Vec3'),
    createPropertyInfo('eulerAngles', 'cc.Vec3', 'rotation(eulerAngles)'),
    createPropertyInfo('rotation', 'cc.Quat', 'rotation(quaternion)'),
    createPropertyInfo('scale', 'cc.Vec3'),
];

const ACTIVE_PROPERTY = createPropertyInfo('active', 'cc.Boolean');

function createPropertyInfo(name: string, type: string, displayName = name, comp?: string): IAnimationPropertyInfo {
    return {
        name,
        key: comp ? `${comp}.${name}` : name,
        displayName,
        type: { value: type },
        menuName: displayName,
        comp,
    };
}

function cloneDump<T>(dump: T): T {
    return JSON.parse(JSON.stringify(dump)) as T;
}

function clipUuid(clip: AnimationClip | null | undefined): string {
    return ((clip as any)?._uuid || (clip as any)?.uuid || '') as string;
}

@register('Animation')
export class AnimationService extends BaseService<Record<string, any>> implements IAnimationService {
    private _session: IAnimationSession | null = null;
    private _animationStateMap = new Map<string, AnimationState>();
    private _curEditTime = 0;
    private _playState: AnimationPlayState = 'stop';

    async enter(options: IAnimationEnterOptions): Promise<IAnimationStateInfo> {
        this._assertEditorOpened();

        if (this._session) {
            await this.exit({ restoreSelection: false, restoreSampledSceneState: true });
        }

        const rootNode = this._queryAnimationRootNode(this._resolveNode(options));
        const animData = await this._queryNodeAnimationData(rootNode);
        const clip = this._resolveClip(animData, options.clipUuid);
        const uuid = clipUuid(clip);
        if (!uuid) {
            throw new Error('Animation clip uuid is empty.');
        }

        const sampledRootDump = dumpUtil.dumpNode(rootNode, { includeComponents: true });
        this._session = {
            previousEditorType: Service.Editor.getCurrentEditorType(),
            previousSelection: Service.Selection.query(),
            restoreSelectionOnExit: options.restoreSelectionOnExit ?? true,
            rootUuid: rootNode.uuid,
            rootPath: this._getNodePath(rootNode),
            clipUuid: uuid,
            sampledRootDump: sampledRootDump ? cloneDump(sampledRootDump) : null,
        };

        this._playState = 'stop';
        this._curEditTime = 0;
        await this._getAnimationState(uuid);
        await this.setTime({ time: 0 });
        return await this.queryState();
    }

    async exit(options: IAnimationExitOptions): Promise<IAnimationStateInfo> {
        const session = this._requireSession();

        if (options.save) {
            await this.save();
        }

        await this._stopCurrent();

        const shouldRestoreSampledState = options.restoreSampledSceneState ?? true;
        if (shouldRestoreSampledState && session.sampledRootDump) {
            const rootNode = this._getNodeByUuid(session.rootUuid);
            if (rootNode) {
                await dumpUtil.restoreNode(rootNode, session.sampledRootDump);
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
        return await this.queryState();
    }

    async queryState(): Promise<IAnimationStateInfo> {
        const editorType = Service.Editor.getCurrentEditorType();
        const selection = Service.Selection.query();
        if (!this._session) {
            return {
                active: false,
                editorType,
                mode: this._getMode(editorType),
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
        const rootNode = this._queryAnimationRootNode(this._resolveNode(options));
        return {
            rootUuid: rootNode.uuid,
            rootPath: this._getNodePath(rootNode),
        };
    }

    async queryRootInfo(options: IAnimationTargetOptions): Promise<IAnimationRootInfo> {
        const rootNode = this._resolveRootNode(options);
        const clipsInfo = await this._queryClipsInfo(rootNode);
        return {
            ...clipsInfo,
            nodeTreeDump: await Service.Node.queryNodeTree({ path: clipsInfo.rootPath }),
            clipDump: null,
            time: this._session ? await this.queryTime({ clipUuid: clipsInfo.defaultClip }) : 0,
            state: this._playState,
            useBakedAnimation: this._isUsingBakedAnimation(rootNode),
        };
    }

    async queryClips(options: IAnimationTargetOptions): Promise<IAnimationClipsInfo> {
        return await this._queryClipsInfo(this._resolveRootNode(options));
    }

    async queryProperties(options: IAnimationTargetOptions): Promise<IAnimationPropertyInfo[]> {
        const node = this._resolveNode(options);
        const root = this._session ? this._getNodeByUuid(this._session.rootUuid) : this._queryAnimationRootNode(node);
        const isChild = Boolean(root && root !== node);
        const properties = isChild ? [ACTIVE_PROPERTY, ...DEFAULT_PROPERTIES] : [...DEFAULT_PROPERTIES];

        for (const comp of node.components) {
            if (!comp || comp instanceof Animation) {
                continue;
            }
            properties.push(...this._queryComponentAnimableProperties(comp));
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
        return true;
    }

    async changePlayState(options: IAnimationPlayStateOptions): Promise<boolean> {
        this._requireSession();
        const state = await this._getAnimationState(options.clipUuid || this._session!.clipUuid);

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
                break;
            case 'pause':
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
                break;
            case 'stop':
                await this._stopCurrent();
                break;
            default:
                throw new Error(`Unsupported animation play operation: ${String(options.operate)}`);
        }

        await Service.Engine.repaintInEditMode();
        return true;
    }

    async changeEditClip(options: IAnimationEditClipOptions): Promise<boolean> {
        const session = this._requireSession();
        if (options.clipUuid === session.clipUuid) {
            return true;
        }

        await this._stopCurrent();
        this._resolveClip(await this._queryNodeAnimationData(this._getSessionRootNode()), options.clipUuid);
        session.clipUuid = options.clipUuid;
        this._curEditTime = 0;
        await this._getAnimationState(options.clipUuid);
        await this.setTime({ time: 0 });
        return true;
    }

    async save(): Promise<boolean> {
        const session = this._requireSession();
        if (this._isSkeletonClip(session.clipUuid)) {
            throw new Error('Saving skeleton animation metadata is not implemented yet.');
        }

        const state = await this._getAnimationState(session.clipUuid);
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

    private _getMode(editorType: 'scene' | 'prefab' | 'unknown') {
        if (editorType === 'scene') {
            return 'general';
        }
        if (editorType === 'prefab') {
            return 'prefab';
        }
        return 'unknown';
    }

    private _resolveRootNode(options: IAnimationTargetOptions): Node {
        const node = this._resolveNode(options);
        return options.rootPath || options.rootUuid ? node : this._queryAnimationRootNode(node);
    }

    private _resolveNode(options: IAnimationTargetOptions | IAnimationEnterOptions): Node {
        this._assertEditorOpened();
        const uuid = 'rootUuid' in options ? options.rootUuid : undefined;
        const path = 'rootPath' in options ? options.rootPath : undefined;
        const nodeUuid = 'nodeUuid' in options ? options.nodeUuid : undefined;
        const nodePath = 'nodePath' in options ? options.nodePath : undefined;
        const target = this._getNodeByUuid(uuid || nodeUuid || '') || this._getNodeByPath(path || nodePath || '');
        if (target) {
            return target;
        }

        const selection = Service.Selection.query();
        if (selection.length > 0) {
            const selected = this._getNodeByPath(selection[0]);
            if (selected) {
                return selected;
            }
        }

        throw new Error('Animation target node is required.');
    }

    private _queryAnimationRootNode(node: Node): Node {
        let current: Node | null = node;
        const editorRoot = Service.Editor.getRootNode();
        while (current) {
            if (this._queryAnimationComponent(current)) {
                return current;
            }
            if (current === editorRoot || current.parent instanceof Scene) {
                break;
            }
            current = current.parent;
        }
        return node;
    }

    private _queryAnimationComponent(node: Node): Animation | animation.AnimationController | null {
        const controllerCtor = (animation as any).AnimationController;
        const controller = controllerCtor ? node.getComponent(controllerCtor) : null;
        if (controller) {
            return controller as animation.AnimationController;
        }
        return node.getComponent(Animation);
    }

    private async _queryNodeAnimationData(node: Node): Promise<IAnimationData> {
        const animComp = this._queryAnimationComponent(node);
        if (!animComp) {
            throw new Error(`Animation component not found on node: ${this._getNodePath(node)}`);
        }

        let clips: AnimationClip[] = [];
        let defaultClip: AnimationClip | null = null;
        if (animComp instanceof Animation) {
            clips = (animComp.clips || []).filter((clip): clip is AnimationClip => Boolean(clip?.name));
            defaultClip = animComp.defaultClip || clips[0] || null;
        } else {
            clips = (await this._visitAnimationClipsInController(animComp))
                .filter((clip): clip is AnimationClip => Boolean(clip?.name));
            defaultClip = clips[0] || null;
        }

        clips = this._uniqAnimationClips(clips);
        if (!defaultClip?.name) {
            defaultClip = clips[0] || null;
        }
        if (clips.length === 0 || !defaultClip) {
            throw new Error(`Animation clips not found on node: ${this._getNodePath(node)}`);
        }

        return { node, animComp, clips, defaultClip };
    }

    private _resolveClip(animData: IAnimationData, uuid?: string): AnimationClip {
        const targetUuid = uuid || clipUuid(animData.defaultClip);
        const clip = animData.clips.find((item) => clipUuid(item) === targetUuid);
        if (!clip) {
            throw new Error(`Animation clip not found: ${targetUuid}`);
        }
        return clip;
    }

    private async _queryClipsInfo(rootNode: Node): Promise<IAnimationClipsInfo> {
        const animData = await this._queryNodeAnimationData(rootNode);
        return {
            rootUuid: rootNode.uuid,
            rootPath: this._getNodePath(rootNode),
            clipsMenu: this._decodeClipsMenu(animData.clips),
            defaultClip: clipUuid(animData.defaultClip),
        };
    }

    private async _getAnimationState(uuid: string): Promise<AnimationState> {
        const session = this._requireSession();
        const existed = this._animationStateMap.get(uuid);
        if (existed) {
            return existed;
        }

        const clip = this._resolveClip(await this._queryNodeAnimationData(this._getSessionRootNode()), uuid);
        const state = new AnimationState(clip);
        (state as any)._curveLoaded = false;
        state.initialize(this._getSessionRootNode());
        this._animationStateMap.set(uuid, state);
        return state;
    }

    private async _stopCurrent(): Promise<void> {
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

    private _queryComponentAnimableProperties(component: Component): IAnimationPropertyInfo[] {
        const ctor = component.constructor as any;
        const props = Array.isArray(ctor.__props__) ? ctor.__props__ as string[] : [];
        const compName = js.getClassName(component);
        const result: IAnimationPropertyInfo[] = [];
        for (const prop of props) {
            const type = this._queryAnimablePropertyType(ctor, component as any, prop);
            if (!type) {
                continue;
            }
            result.push(createPropertyInfo(prop, type, `${compName}.${prop}`, compName));
        }
        return result;
    }

    private _queryAnimablePropertyType(ctor: Function, component: Record<string, unknown>, prop: string): string {
        if (prop === 'type' || prop === '__scriptAsset') {
            return '';
        }
        const attr = CCClass.attr(ctor, prop);
        if (!attr || attr.animatable === false || attr.readonly) {
            return '';
        }
        const type = attr.type;
        if (typeof type === 'string') {
            return type;
        }
        if (type instanceof (CCClass.Attr as any).PrimitiveType) {
            return type.name;
        }
        if (typeof type === 'function') {
            return js.getClassName(type);
        }
        const value = component[prop];
        if (typeof value === 'number') {
            return 'cc.Number';
        }
        if (typeof value === 'boolean') {
            return 'cc.Boolean';
        }
        if (typeof value === 'string') {
            return 'cc.String';
        }
        return '';
    }

    private _restoreSelection(selection: string[]): void {
        Service.Selection.clear();
        for (const path of selection.slice().reverse()) {
            if (this._getNodeByPath(path)) {
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

    private _getSessionRootNode(): Node {
        const session = this._requireSession();
        const rootNode = this._getNodeByUuid(session.rootUuid);
        if (!rootNode) {
            throw new Error(`Animation root node not found: ${session.rootUuid}`);
        }
        return rootNode;
    }

    private _getNodeByUuid(uuid: string): Node | null {
        if (!uuid) {
            return null;
        }
        return NodeMgr.getNode(uuid) || null;
    }

    private _getNodeByPath(path: string): Node | null {
        if (!path) {
            return null;
        }
        return NodeMgr.getNodeByPath(path) || null;
    }

    private _getNodePath(node: Node): string {
        return NodeMgr.getNodePath(node) || '';
    }

    private _decodeClipsMenu(clips: AnimationClip[]): IAnimationClipMenuItem[] {
        return clips.map((clip) => ({
            uuid: clipUuid(clip),
            name: clip.name,
        }));
    }

    private _uniqAnimationClips(clips: AnimationClip[]): AnimationClip[] {
        const seen = new Set<string>();
        const result: AnimationClip[] = [];
        for (const clip of clips) {
            const uuid = clipUuid(clip);
            if (!uuid || seen.has(uuid)) {
                continue;
            }
            seen.add(uuid);
            result.push(clip);
        }
        return result;
    }

    private async _visitAnimationClipsInController(controller: animation.AnimationController): Promise<AnimationClip[]> {
        const system = (globalThis as any).System;
        if (system?.import) {
            const mod = await system.import('cc/editor/new-gen-anim');
            if (typeof mod?.visitAnimationClipsInController === 'function') {
                return Array.from(mod.visitAnimationClipsInController(controller) as Iterable<AnimationClip>);
            }
        }

        const mod = await import('cc/editor/new-gen-anim');
        if (typeof mod.visitAnimationClipsInController !== 'function') {
            throw new Error('visitAnimationClipsInController is not available.');
        }
        return Array.from(mod.visitAnimationClipsInController(controller) as Iterable<AnimationClip>);
    }

    private _isUsingBakedAnimation(rootNode: Node): boolean {
        const animComp = this._queryAnimationComponent(rootNode);
        return animComp instanceof SkeletalAnimation && Boolean(animComp.useBakedAnimation);
    }

    private _isSkeletonClip(uuid: string): boolean {
        if (uuid.includes('@')) {
            return true;
        }
        const rootNode = this._session ? this._getNodeByUuid(this._session.rootUuid) : null;
        return Boolean(rootNode && this._queryAnimationComponent(rootNode) instanceof SkeletalAnimation);
    }
}
