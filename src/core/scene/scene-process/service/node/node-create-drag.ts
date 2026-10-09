import { CCObject, Node, Prefab, Vec3, director, instantiate } from 'cc';

import { Service, ServiceEvents } from '../core';
import { Rpc } from '../../rpc';

import {
    BUILTIN_NODE_CREATE_TARGETS,
    NodeType,
    type BuiltinNodeCreateEntryId,
    type BeginCreateDragResult,
    type CancelCreateDragResult,
    type CommitCreateDragResult,
    type CreateDragCancelReason,
    type CreateDragError,
    type CreateDragErrorCode,
    type CreateDragSession,
    type IBeginCreateDragParams,
    type ICancelCreateDragParams,
    type ICommitCreateDragParams,
    type ICreateDragConfirmation,
    type ICreateDragItem,
    type ICreateDragPointer,
    type IUpdateCreateDragParams,
    type PrefabCanvasHandling,
    type UpdateCreateDragResult,
} from '../../../common';

import NODE_CONFIGS, { type NodeConfig } from './node-type-config';
import { createNodeByAsset, loadAny } from './node-create';
import { getUICanvasNode, getUITransformParentNode, setLayer } from './node-utils';
import nodeMgr from './index';
import { validateNodeName } from '../../../../engine/editor-extends/manager/path-utils';
import type { IEditorSessionService, IEditorSessionSnapshot } from '../core/editor-session';
import type { IPendingPrefabCanvasMutation, IPrefabCanvasUndoRecord } from './prefab-canvas-mutation';
import {
    computeWorldDropPoint,
    pointerMatchesCanvas,
    validatePointer,
} from './drag-placement';

const NodeMgr = EditorExtends.Node;

const DontSave = CCObject.Flags.DontSave;
const HideInHierarchy = CCObject.Flags.HideInHierarchy;
const LockedInEditor = CCObject.Flags.LockedInEditor;

const CANVAS_ASSET_UUID_2D = '4c33600e-9ca9-483b-b734-946008261697';
const CANVAS_ASSET_UUID_3D = 'f773db21-62b8-4540-956a-29bacf5ddbf5';

/** 内置创建目标 entryId → NodeType；模板与 Canvas 策略由 NODE_CONFIGS 提供 */
const BUILTIN_ENTRY_TO_NODE_TYPE: Record<BuiltinNodeCreateEntryId, NodeType> = {
    empty: NodeType.EMPTY,
    label: NodeType.LABEL,
    'particle-system-2d': NodeType.PARTICLE,
    'rich-text': NodeType.RICH_TEXT,
    sprite: NodeType.SPRITE,
    'sprite-splash': NodeType.SPRITE_SPLASH,
    'tiled-map': NodeType.TILED_MAP,
    button: NodeType.BUTTON,
    'canvas-2d': NodeType.CANVAS,
    'canvas-3d': NodeType.CANVAS,
    'edit-box': NodeType.EDIT_BOX,
    layout: NodeType.LAYOUT,
    mask: NodeType.MASK,
    'progress-bar': NodeType.PROGRESS_BAR,
    'scroll-view': NodeType.SCROLL_VIEW,
    slider: NodeType.SLIDER,
    toggle: NodeType.TOGGLE,
    'toggle-group': NodeType.TOGGLE_GROUP,
    'video-player': NodeType.VIDEO_PLAYER,
    'web-view': NodeType.WEB_VIEW,
    widget: NodeType.WIDGET,
};

/** 固定 workMode 的内置项，绕过当前 Scene 的 2D/3D 模式 */
const BUILTIN_FORCED_WORK_MODE: Partial<Record<BuiltinNodeCreateEntryId, '2d' | '3d'>> = {
    'canvas-2d': '2d',
    'canvas-3d': '3d',
    'particle-system-2d': '2d',
};

const BUILTIN_URL_TO_ENTRY = new Map<string, BuiltinNodeCreateEntryId>(
    (Object.entries(BUILTIN_NODE_CREATE_TARGETS) as [BuiltinNodeCreateEntryId, string][])
        .map(([entryId, url]) => [url, entryId]),
);

const BUILTIN_URL_PREFIX = 'db://internal/node-library/';

/** 终态会话保留上限，用于拒绝重复 begin 与返回缓存结果，超出后按插入顺序淘汰 */
const MAX_RETAINED_SESSIONS = 64;

type SessionState = CreateDragSession['state'] | 'preparing';

interface IResolvedBuiltinTarget {
    kind: 'builtin';
    entryId: BuiltinNodeCreateEntryId;
    item: ICreateDragItem;
}

interface IResolvedAssetTarget {
    kind: 'asset';
    uuid: string;
    type?: string;
    item: ICreateDragItem;
}

type ResolvedTarget = IResolvedBuiltinTarget | IResolvedAssetTarget;

interface PreparedEntry {
    item: ICreateDragItem;
    root: Node;
    canvasRequired: boolean;
    workMode: '2d' | '3d';
    isBuiltin: boolean;
    /** 普通 Prefab 资源保留模板关联；内置与非 Prefab 资源为 false */
    originalPrefabLinked: boolean;
    /** 子树每个节点添加临时 flag 前的原始 objFlags */
    flagsBefore: Map<Node, number>;
    addedFlags: number;
}

interface DragSession {
    sessionId: string;
    state: SessionState;
    editorSession: IEditorSessionSnapshot;
    fingerprint: string;
    workMode: '2d' | '3d';
    lastSequence: number;
    latestPointer: ICreateDragPointer | null;
    dropPointer: ICreateDragPointer | null;
    confirmation: { id: string; choices: PrefabCanvasHandling[] } | null;
    prefabCanvasHandling?: PrefabCanvasHandling;
    entries: PreparedEntry[];
    tempCanvas: Node | null;
    tempCanvasOwned: boolean;
    cameraRectAtBegin: { x: number; y: number; width: number; height: number } | null;
    committedResult: Extract<CreateDragSession, { state: 'committed' }> | null;
    cancelledResult: Extract<CreateDragSession, { state: 'cancelled' }> | null;
    abortLoad: boolean;
    opChain: Promise<unknown>;
    beginPromise: Promise<BeginCreateDragResult> | null;
}

/** NodeService 暴露给拖拽管理器的私有能力，避免复制创建/撤销逻辑 */
export interface ICreateDragHost {
    resolveCanvasTransaction(
        workMode: string,
        canvasRequired: boolean,
        parent: Node | null,
        position: Vec3 | undefined,
        prefabCanvasHandling?: PrefabCanvasHandling,
    ): Promise<{ parent: Node | null; mutation: IPendingPrefabCanvasMutation | null }>;
    collectSceneNodeUuidsForUndo(): Set<string> | null;
    beginPrefabCanvasUndoCapture(beforeUuids: Set<string> | null): IPrefabCanvasUndoRecord[] | null;
    endPrefabCanvasUndoCapture(): void;
    recordCreateNodeCommand(
        beforeUuids: Set<string> | null,
        paths: string[],
        records: IPrefabCanvasUndoRecord[] | null,
    ): void;
}

function ok<T>(value: T): { ok: true; value: T } {
    return { ok: true, value };
}

/** Editor 服务同时实现 IEditorSessionService，但公共类型未暴露会话方法，这里按内部契约访问 */
function editorSessionService(): IEditorSessionService {
    return Service.Editor as typeof Service.Editor & IEditorSessionService;
}

function dragError(
    code: Exclude<CreateDragErrorCode, 'COMMIT_RECOVERY_FAILED'>,
    message: string,
): { ok: false; error: CreateDragError } {
    return { ok: false, error: { code, message } };
}

let confirmationSequence = 0;

function nextConfirmationId(): string {
    return `drag-confirm-${Date.now().toString(36)}-${(++confirmationSequence).toString(36)}`;
}

/**
 * Scene 拖拽创建会话管理器
 * 负责临时节点准备、落点预览、Canvas/Prefab 确认、整批 Undo 与失败恢复
 * 每个 Scene 仅允许一个活跃预览；生命周期操作会自动取消活跃会话
 */
export class NodeCreateDragManager {
    private readonly _sessions = new Map<string, DragSession>();
    private _activeSessionId: string | null = null;
    /** COMMIT_RECOVERY_FAILED 后暂停该 runtime 的拖拽创建，保留现场交由人工处理 */
    private _suspended = false;

    private readonly _onSceneOperation = (): void => {
        void this.cancelActive('scene-operation');
    };

    private readonly _onUndoChanged = (): void => {
        const session = this._getActiveSession();
        // 仅取消未进入提交的预览；committing/committed 由提交流程自身处理，避免 endGroup 自触发
        if (session && (session.state === 'preparing' || session.state === 'previewing' || session.state === 'needs-confirmation')) {
            void this.cancelActive('scene-operation');
        }
    };

    constructor(private readonly _host: ICreateDragHost) {
        ServiceEvents.on('editor:save', this._onSceneOperation);
        ServiceEvents.on('editor:reload', this._onSceneOperation);
        ServiceEvents.on('undo:changed', this._onUndoChanged);
        ServiceEvents.on('scene:dimension-changed', this._onSceneOperation);
    }

    dispose(): void {
        const session = this._getActiveSession();
        if (session && session.state !== 'committing') {
            this._cancelNow(session, 'disposed');
        }

        ServiceEvents.off('editor:save', this._onSceneOperation);
        ServiceEvents.off('editor:reload', this._onSceneOperation);
        ServiceEvents.off('undo:changed', this._onUndoChanged);
        ServiceEvents.off('scene:dimension-changed', this._onSceneOperation);

        this._sessions.clear();
        this._activeSessionId = null;
    }

    /** 生命周期兜底：取消当前活跃预览；提交中则等待其完成 */
    async cancelActive(reason: CreateDragCancelReason): Promise<void> {
        const session = this._getActiveSession();
        if (!session) {
            return;
        }

        if (session.state === 'committing') {
            await this._chain(session, async () => undefined);
            return;
        }

        this._cancelNow(session, reason);
    }

    async begin(params: IBeginCreateDragParams): Promise<BeginCreateDragResult> {
        const invalid = this._validateBeginParams(params);
        if (invalid) {
            return invalid;
        }

        if (this._suspended) {
            return dragError('NOT_EDITABLE', 'Scene drag creation is suspended after an unrecovered commit failure.');
        }
        if (!Service.Editor.getRootNode()) {
            return dragError('NOT_EDITABLE', 'The scene is not opened.');
        }
        if (Service.PreviewPlay?.getState?.() !== 'stop') {
            return dragError('NOT_EDITABLE', 'The scene is not editable while preview is running.');
        }

        const fingerprint = JSON.stringify(
            params.items.map(item => ({ dbURL: item.dbURL, name: item.name ?? null })),
        );

        const existing = this._sessions.get(params.sessionId);
        if (existing) {
            if (existing.state === 'committed' || existing.state === 'cancelled') {
                return dragError('SESSION_CONFLICT', 'The drag session has already finished.');
            }
            if (existing.fingerprint !== fingerprint) {
                return dragError('SESSION_CONFLICT', 'The session id is already bound to a different drag request.');
            }
            // 相同请求重试复用原会话
            return existing.beginPromise!;
        }

        if (this._getActiveSession()) {
            return dragError('SESSION_CONFLICT', 'Another drag session is already active in this scene.');
        }

        const session: DragSession = {
            sessionId: params.sessionId,
            state: 'preparing',
            editorSession: editorSessionService().getEditorSession(),
            fingerprint,
            workMode: Service.Camera?.is2D ? '2d' : '3d',
            lastSequence: params.pointer.sequence,
            latestPointer: params.pointer,
            dropPointer: null,
            confirmation: null,
            entries: [],
            tempCanvas: null,
            tempCanvasOwned: false,
            cameraRectAtBegin: this._readCameraRect(),
            committedResult: null,
            cancelledResult: null,
            abortLoad: false,
            opChain: Promise.resolve(),
            beginPromise: null,
        };

        this._sessions.set(session.sessionId, session);
        this._activeSessionId = session.sessionId;
        this._pruneSessions();

        // 同步登记后才进入首个 await，满足 update/commit/cancel 无需等待 begin 返回
        session.beginPromise = this._chain(session, () => this._prepare(session, params));
        return session.beginPromise;
    }

    async update(params: IUpdateCreateDragParams): Promise<UpdateCreateDragResult> {
        const session = this._sessions.get(params?.sessionId);
        if (!session) {
            return dragError('SESSION_CLOSED', 'The drag session does not exist.');
        }
        if (session.state === 'committed' || session.state === 'cancelled') {
            return dragError('SESSION_CLOSED', 'The drag session has already finished.');
        }
        if (!validatePointer(params.pointer)) {
            return dragError('INVALID_REQUEST', 'The drag pointer is invalid.');
        }

        if (!editorSessionService().isCurrentEditorSession(session.editorSession)) {
            this._cancelNow(session, 'runtime-invalidated');
            return dragError('STALE_SCENE', 'The bound editor session has changed.');
        }
        if (!pointerMatchesCanvas(params.pointer)) {
            return dragError('VIEWPORT_CHANGED', 'The canvas render size changed during the drag.');
        }

        // 加载期间只记录最新位置，资源就绪后统一应用
        if (session.state === 'preparing') {
            if (params.pointer.sequence > session.lastSequence) {
                session.lastSequence = params.pointer.sequence;
                session.latestPointer = params.pointer;
            }
            return ok({ sessionId: session.sessionId, state: 'preparing' });
        }

        if (session.state === 'needs-confirmation' || session.state === 'committing') {
            return ok({ sessionId: session.sessionId, state: 'ignored' });
        }

        if (params.pointer.sequence <= session.lastSequence) {
            return ok({ sessionId: session.sessionId, state: 'ignored' });
        }

        session.lastSequence = params.pointer.sequence;
        session.latestPointer = params.pointer;
        this._applyPreviewPosition(session, params.pointer);
        return ok({ sessionId: session.sessionId, state: 'previewing' });
    }

    async commit(params: ICommitCreateDragParams): Promise<CommitCreateDragResult> {
        const session = this._sessions.get(params?.sessionId);
        if (!session) {
            return dragError('SESSION_CLOSED', 'The drag session does not exist.');
        }
        if (session.state === 'committed') {
            return ok(session.committedResult!);
        }
        if (session.state === 'cancelled') {
            return ok(session.cancelledResult!);
        }
        if (!validatePointer(params.pointer)) {
            return dragError('INVALID_REQUEST', 'The drag pointer is invalid.');
        }

        // 链式排在 prepare 之后：快速 drop 时复用尚在准备的节点
        return this._chain(session, () => this._commitImpl(session, params));
    }

    async cancel(params: ICancelCreateDragParams): Promise<CancelCreateDragResult> {
        const session = this._sessions.get(params?.sessionId);
        if (!session) {
            return dragError('SESSION_CLOSED', 'The drag session does not exist.');
        }
        if (session.state === 'committed') {
            return ok(session.committedResult!);
        }
        if (session.state === 'cancelled') {
            return ok(session.cancelledResult!);
        }

        // 提交中等待提交或恢复完成，不删除已提交节点
        if (session.state === 'committing') {
            return this._chain(session, async () => {
                if (session.state === 'committed') {
                    return ok(session.committedResult!);
                }
                return ok(session.cancelledResult ?? { sessionId: session.sessionId, state: 'cancelled' as const });
            });
        }

        return ok(this._cancelNow(session, params?.reason ?? 'error'));
    }

    // --- begin 准备阶段 ---

    private async _prepare(session: DragSession, params: IBeginCreateDragParams): Promise<BeginCreateDragResult> {
        try {
            const targets = await this._resolveItems(params.items);
            if (this._isAborted(session)) {
                return this._finishCancelled(session);
            }
            if (!editorSessionService().isCurrentEditorSession(session.editorSession)) {
                this._cleanupSync(session);
                return this._finishCancelled(session, dragError('STALE_SCENE', 'The bound editor session changed while loading.'));
            }

            if (targets.length === 0) {
                this._cleanupSync(session);
                return this._finishCancelled(session, dragError('NO_CREATABLE_ITEMS', 'No creatable items were resolved from the drag payload.'));
            }

            for (const target of targets) {
                const entry = await this._createTempEntry(target, session);
                if (this._isAborted(session)) {
                    if (entry?.root.isValid) {
                        entry.root.destroy();
                    }
                    break;
                }
                if (!entry) {
                    continue;
                }
                session.entries.push(entry);
                if (!editorSessionService().isCurrentEditorSession(session.editorSession)) {
                    this._cleanupSync(session);
                    return this._finishCancelled(session, dragError('STALE_SCENE', 'The bound editor session changed while loading.'));
                }
            }

            if (this._isAborted(session)) {
                this._cleanupSync(session);
                return this._finishCancelled(session);
            }

            if (session.entries.length === 0) {
                this._cleanupSync(session);
                return this._finishCancelled(session, dragError('NO_CREATABLE_ITEMS', 'No creatable items were resolved from the drag payload.'));
            }

            await this._attachPreview(session);
            if (this._isAborted(session)) {
                this._cleanupSync(session);
                return this._finishCancelled(session);
            }

            session.state = 'previewing';
            this._applyPreviewPosition(session, session.latestPointer ?? params.pointer);
            return ok({ sessionId: session.sessionId, state: 'previewing' });
        } catch (error) {
            this._cleanupSync(session);
            const code: Exclude<CreateDragErrorCode, 'COMMIT_RECOVERY_FAILED'> =
                error instanceof InvalidRequestError ? 'INVALID_REQUEST' : 'ASSET_LOAD_FAILED';
            return this._finishCancelled(session, dragError(code, error instanceof Error ? error.message : String(error)));
        }
    }

    private async _resolveItems(items: ICreateDragItem[]): Promise<ResolvedTarget[]> {
        const resolved: ResolvedTarget[] = [];
        const seen = new Set<string>();
        const editingPrefabUuid = this._getEditingPrefabUuid();

        for (const item of items) {
            const builtinEntryId = BUILTIN_URL_TO_ENTRY.get(item.dbURL);
            if (builtinEntryId === undefined && item.dbURL.startsWith(BUILTIN_URL_PREFIX)) {
                throw new InvalidRequestError(`Unknown builtin node create target: ${item.dbURL}`);
            }

            if (builtinEntryId !== undefined) {
                const key = `builtin:${builtinEntryId}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                resolved.push({ kind: 'builtin', entryId: builtinEntryId, item });
                continue;
            }

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [item.dbURL]);
            if (!assetInfo?.uuid) {
                continue;
            }
            // 防止把正在编辑的 Prefab 拖入自身造成循环引用
            if (editingPrefabUuid && assetInfo.uuid === editingPrefabUuid) {
                continue;
            }
            const key = `asset:${assetInfo.uuid}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            resolved.push({ kind: 'asset', uuid: assetInfo.uuid, type: assetInfo.type, item });
        }

        return resolved;
    }

    private async _createTempEntry(target: ResolvedTarget, session: DragSession): Promise<PreparedEntry | null> {
        let root: Node;
        let canvasRequired: boolean;
        let isBuiltin: boolean;
        let originalPrefabLinked = false;
        let workMode = session.workMode;

        if (target.kind === 'builtin') {
            isBuiltin = true;
            const nodeType = BUILTIN_ENTRY_TO_NODE_TYPE[target.entryId];
            workMode = BUILTIN_FORCED_WORK_MODE[target.entryId] ?? session.workMode;
            const config = this._selectNodeConfig(nodeType, workMode);

            if (nodeType === NodeType.EMPTY || !config.assetUuid) {
                root = new Node(config.name || 'Node');
                nodeMgr.ensureUITransformComponent(root);
                canvasRequired = Boolean(config.canvasRequired);
            } else {
                const result = await createNodeByAsset({
                    uuid: config.assetUuid,
                    canvasRequired: Boolean(config.canvasRequired),
                    workMode,
                });
                root = result.node;
                canvasRequired = Boolean(config.canvasRequired || result.canvasRequired);
            }
            // 内置模板移除 Prefab 关联
            Service.Prefab.removePrefabInfoFromNode(root, true);
        } else {
            isBuiltin = false;
            const result = await createNodeByAsset({
                uuid: target.uuid,
                type: target.type,
                workMode: session.workMode,
            });
            root = result.node;
            canvasRequired = result.canvasRequired;
            if (target.type === 'cc.Prefab') {
                originalPrefabLinked = true;
            } else {
                Service.Prefab.removePrefabInfoFromNode(root, true);
            }
        }

        if (!root?.isValid) {
            return null;
        }

        if (target.item.name) {
            root.name = target.item.name;
        }

        const addedFlags = DontSave | HideInHierarchy;
        const flagsBefore = new Map<Node, number>();
        root.walk((child: Node) => {
            flagsBefore.set(child, child.objFlags);
            child.objFlags |= addedFlags;
        });

        return {
            item: target.item,
            root,
            canvasRequired,
            workMode,
            isBuiltin,
            originalPrefabLinked,
            flagsBefore,
            addedFlags,
        };
    }

    private _selectNodeConfig(nodeType: NodeType, workMode: '2d' | '3d'): NodeConfig {
        const paramsArray = NODE_CONFIGS[nodeType as string];
        if (!paramsArray || paramsArray.length === 0) {
            throw new Error(`Node type '${nodeType}' is not implemented`);
        }

        let config = paramsArray[0];
        const projectType = config['project-type'];
        if (projectType && projectType !== workMode.toLowerCase() && paramsArray.length > 1) {
            config = paramsArray[1];
        }

        return config;
    }

    /** 将临时根挂入场景图以便预览渲染；UI 项挂到本会话自建的隐藏 Canvas 下 */
    private async _attachPreview(session: DragSession): Promise<void> {
        const scene = director.getScene();
        if (!scene) {
            return;
        }

        const needsCanvas = session.entries.some(entry => entry.canvasRequired);
        if (needsCanvas) {
            session.tempCanvas = await this._createSessionTempCanvas(session.workMode);
            session.tempCanvasOwned = true;
        }

        for (const entry of session.entries) {
            const parent = entry.canvasRequired && session.tempCanvas ? session.tempCanvas : scene;
            entry.root.setParent(parent);
        }
    }

    private async _createSessionTempCanvas(workMode: '2d' | '3d'): Promise<Node> {
        const scene = director.getScene()!;
        const canvasAssetUuid = workMode === '2d' ? CANVAS_ASSET_UUID_2D : CANVAS_ASSET_UUID_3D;
        const canvasAsset = await loadAny<Prefab>(canvasAssetUuid);
        const canvasNode = instantiate(canvasAsset) as Node;

        canvasNode['_prefab'] = null;
        canvasNode.name = '__drag_preview_canvas__';
        canvasNode.objFlags |= DontSave | HideInHierarchy | LockedInEditor;
        canvasNode.walk((child: Node) => {
            child.objFlags |= DontSave | HideInHierarchy;
        });
        canvasNode.setParent(scene);
        return canvasNode;
    }

    private _applyPreviewPosition(session: DragSession, pointer: ICreateDragPointer | null): void {
        if (!pointer) {
            return;
        }

        const excludeNodes = this._collectExcludeNodes(session);
        for (const entry of session.entries) {
            if (!entry.root.isValid) {
                continue;
            }
            const world = computeWorldDropPoint(pointer, {
                workMode: entry.workMode,
                canvasRequired: entry.canvasRequired,
                canvasNode: entry.canvasRequired ? session.tempCanvas : null,
                excludeNodes,
            });
            if (world) {
                entry.root.setWorldPosition(world);
            }
        }

        // 预览节点不会触发普通节点的重绘监听，更新位置后主动刷新画布
        void Service.Engine.repaintInEditMode();
    }

    private _collectExcludeNodes(session: DragSession): Node[] {
        const nodes: Node[] = [];
        for (const entry of session.entries) {
            if (entry.root.isValid) {
                nodes.push(entry.root);
            }
        }
        if (session.tempCanvas?.isValid) {
            nodes.push(session.tempCanvas);
        }
        return nodes;
    }

    // --- commit 提交阶段 ---

    private async _commitImpl(session: DragSession, params: ICommitCreateDragParams): Promise<CommitCreateDragResult> {
        if (session.state === 'committed') {
            return ok(session.committedResult!);
        }
        if (session.state === 'cancelled') {
            return ok(session.cancelledResult!);
        }
        if (session.state === 'preparing') {
            // prepare 失败或已中止
            return ok(session.cancelledResult ?? { sessionId: session.sessionId, state: 'cancelled' });
        }

        if (!editorSessionService().isCurrentEditorSession(session.editorSession)) {
            this._cancelNow(session, 'runtime-invalidated');
            return dragError('STALE_SCENE', 'The bound editor session has changed.');
        }
        if (this._suspended || Service.PreviewPlay?.getState?.() !== 'stop') {
            this._cancelNow(session, 'scene-operation');
            return dragError('NOT_EDITABLE', 'The scene is not editable.');
        }

        // 首次 drop 冻结最终坐标，确认后沿用同一位置
        if (!session.dropPointer) {
            session.dropPointer = params.pointer;
        }

        if (session.state === 'needs-confirmation') {
            const confirmation = params.confirmation;
            const expected = session.confirmation;
            if (!confirmation || !expected || confirmation.id !== expected.id || !expected.choices.includes(confirmation.choiceId)) {
                return dragError('INVALID_CONFIRMATION', 'The confirmation id or choice does not match the pending request.');
            }
            session.prefabCanvasHandling = confirmation.choiceId;
        } else if (this._needsPrefabCanvasConfirmation(session)) {
            if (!params.confirmation) {
                const id = nextConfirmationId();
                const choices: PrefabCanvasHandling[] = ['add-root-ui-transform', 'create-canvas'];
                session.confirmation = { id, choices };
                session.state = 'needs-confirmation';
                const confirmation: ICreateDragConfirmation = { id, kind: 'prefab-canvas', choices };
                return ok({ sessionId: session.sessionId, state: 'needs-confirmation', confirmation });
            }

            const expected = session.confirmation;
            const confirmation = params.confirmation;
            if (!expected || confirmation.id !== expected.id || !expected.choices.includes(confirmation.choiceId)) {
                return dragError('INVALID_CONFIRMATION', 'The confirmation id or choice does not match the pending request.');
            }
            session.prefabCanvasHandling = confirmation.choiceId;
        }

        const dropPointer = session.dropPointer;
        if (!pointerMatchesCanvas(dropPointer) || !this._cameraRectMatches(session)) {
            this._cancelNow(session, 'error');
            return dragError('VIEWPORT_CHANGED', 'The canvas or camera viewport changed before the drop could be committed.');
        }

        session.state = 'committing';
        return this._mount(session, dropPointer);
    }

    private _needsPrefabCanvasConfirmation(session: DragSession): boolean {
        if (Service.Editor.getCurrentEditorType() !== 'prefab') {
            return false;
        }
        if (!session.entries.some(entry => entry.canvasRequired)) {
            return false;
        }

        const root = Service.Editor.getRootNode();
        if (!root) {
            return false;
        }

        const canvasNode = getUICanvasNode(root, false);
        const uiTransformParent = getUITransformParentNode(root);
        return !canvasNode && !uiTransformParent;
    }

    private async _mount(session: DragSession, dropPointer: ICreateDragPointer): Promise<CommitCreateDragResult> {
        await Service.Editor.lock();

        let groupId: string | null = null;
        let beforeUuids: Set<string> | null = null;
        let records: IPrefabCanvasUndoRecord[] | null = null;
        const mounted: { entry: PreparedEntry; mutation: IPendingPrefabCanvasMutation | null }[] = [];

        try {
            const sceneRoot = Service.Editor.getRootNode();
            if (!sceneRoot) {
                throw new Error('The scene is not opened.');
            }

            // 先解除预览挂载，再解析正式父级，避免选中本会话的预览 Canvas
            this._detachPreview(session);

            beforeUuids = this._host.collectSceneNodeUuidsForUndo();
            records = this._host.beginPrefabCanvasUndoCapture(beforeUuids);
            groupId = Service.Undo.beginGroup({ label: 'Drag Create Node' });

            const nodePaths: string[] = [];
            // 提交期射线需排除本批全部临时根，避免命中尚未挂载的兄弟项
            const batchRoots = session.entries.map(entry => entry.root).filter(node => node.isValid);

            for (const entry of session.entries) {
                if (!entry.root.isValid) {
                    throw new Error('A prepared drag node became invalid before commit.');
                }

                this._restoreFlags(entry);

                const resolution = await this._host.resolveCanvasTransaction(
                    entry.workMode,
                    entry.canvasRequired,
                    sceneRoot,
                    undefined,
                    session.prefabCanvasHandling,
                );
                const parent: Node = (resolution.parent ?? sceneRoot) as Node;

                const world = computeWorldDropPoint(dropPointer, {
                    workMode: entry.workMode,
                    canvasRequired: entry.canvasRequired,
                    canvasNode: entry.canvasRequired ? parent : null,
                    excludeNodes: batchRoots,
                });

                ServiceEvents.emit('node:before-add', entry.root);
                ServiceEvents.emit('node:before-change', parent);

                if (parent.layer && parent !== sceneRoot) {
                    setLayer(entry.root, parent.layer, true);
                }

                entry.root.setParent(parent);
                if (world) {
                    entry.root.setWorldPosition(world);
                }
                resolution.mutation?.commit();

                const shouldUnlink = entry.isBuiltin || !entry.originalPrefabLinked;
                if (shouldUnlink && Service.Editor.getCurrentEditorType() !== 'prefab') {
                    Service.Prefab.removePrefabInfoFromNode(entry.root, true);
                }

                ServiceEvents.emit('node:add', entry.root);
                mounted.push({ entry, mutation: resolution.mutation });

                const path = NodeMgr.getNodePath(entry.root);
                if (path) {
                    nodePaths.push(path);
                }
            }

            this._host.endPrefabCanvasUndoCapture();
            this._host.recordCreateNodeCommand(beforeUuids, nodePaths, records);
            Service.Undo.endGroup(groupId);
            groupId = null;

            this._destroyTempCanvas(session);
            session.entries = [];

            session.state = 'committed';
            session.committedResult = { sessionId: session.sessionId, state: 'committed', nodePaths };
            if (this._activeSessionId === session.sessionId) {
                this._activeSessionId = null;
            }
            return ok(session.committedResult);
        } catch (error) {
            this._host.endPrefabCanvasUndoCapture();
            if (groupId) {
                try {
                    Service.Undo.cancelGroup(groupId);
                } catch (cancelError) {
                    console.error('[NodeCreateDrag] failed to cancel undo group', cancelError);
                }
                groupId = null;
            }

            const affectedNodePaths = this._rollbackMount(mounted);
            if (affectedNodePaths.length > 0) {
                // 恢复失败：保留现场，暂停该 runtime 的拖拽创建，交由人工处理
                session.state = 'cancelled';
                session.cancelledResult = { sessionId: session.sessionId, state: 'cancelled' };
                if (this._activeSessionId === session.sessionId) {
                    this._activeSessionId = null;
                }
                this._suspended = true;
                return {
                    ok: false,
                    error: {
                        code: 'COMMIT_RECOVERY_FAILED',
                        message: error instanceof Error ? error.message : String(error),
                        affectedNodePaths,
                    },
                };
            }

            this._cleanupSync(session);
            session.state = 'cancelled';
            session.cancelledResult = { sessionId: session.sessionId, state: 'cancelled' };
            if (this._activeSessionId === session.sessionId) {
                this._activeSessionId = null;
            }
            return dragError('COMMIT_FAILED', error instanceof Error ? error.message : String(error));
        } finally {
            if (groupId) {
                try {
                    Service.Undo.cancelGroup(groupId);
                } catch (cancelError) {
                    console.error('[NodeCreateDrag] failed to cancel undo group in finally', cancelError);
                }
            }
            Service.Editor.unlock();
        }
    }

    /** 逆序回滚已挂载项；返回仍残留在场景中的节点路径（恢复失败） */
    private _rollbackMount(mounted: { entry: PreparedEntry; mutation: IPendingPrefabCanvasMutation | null }[]): string[] {
        const affected: string[] = [];

        for (let i = mounted.length - 1; i >= 0; i--) {
            const { entry, mutation } = mounted[i];
            try {
                if (mutation) {
                    mutation.rollback();
                }
                if (entry.root.isValid) {
                    entry.root.setParent(null);
                    entry.root.destroy();
                }
            } catch (rollbackError) {
                console.error('[NodeCreateDrag] rollback failed for an entry', rollbackError);
                if (entry.root.isValid && entry.root.parent) {
                    const path = NodeMgr.getNodePath(entry.root);
                    if (path) {
                        affected.push(path);
                    }
                }
            }
        }

        return affected;
    }

    // --- cancel / 清理 ---

    private _cancelNow(session: DragSession, reason: CreateDragCancelReason): Extract<CreateDragSession, { state: 'cancelled' }> {
        if (session.state === 'preparing') {
            session.abortLoad = true;
        }

        this._cleanupSync(session);
        session.state = 'cancelled';
        session.cancelledResult = { sessionId: session.sessionId, state: 'cancelled' };
        if (this._activeSessionId === session.sessionId) {
            this._activeSessionId = null;
        }

        if (reason) {
            // reason 仅用于日志与埋点，清理行为一致
        }

        return session.cancelledResult;
    }

    private _cleanupSync(session: DragSession): void {
        for (const entry of session.entries) {
            if (entry.root.isValid) {
                try {
                    entry.root.setParent(null);
                } catch (error) {
                    console.error('[NodeCreateDrag] failed to detach a temp node', error);
                }
                try {
                    entry.root.destroy();
                } catch (error) {
                    console.error('[NodeCreateDrag] failed to destroy a temp node', error);
                }
            }
        }
        session.entries = [];
        this._destroyTempCanvas(session);

        // 移除预览后也要刷新画布，避免离开场景或取消拖拽后仍显示旧画面
        void Service.Engine.repaintInEditMode();
    }

    private _destroyTempCanvas(session: DragSession): void {
        if (session.tempCanvasOwned && session.tempCanvas?.isValid) {
            try {
                // destroy 延迟到帧末执行，先移出场景树，避免正式父级查找再次选中预览 Canvas
                session.tempCanvas.setParent(null);
                session.tempCanvas.destroy();
            } catch (error) {
                console.error('[NodeCreateDrag] failed to destroy the temp canvas', error);
            }
        }
        session.tempCanvas = null;
        session.tempCanvasOwned = false;
    }

    /**
     * 提交前解除临时节点的挂载，并清理预览 Canvas
     *
     * 隐藏节点在场景内换父级不会更新编辑器路径，先移出场景，让正式挂载重新注册整棵子树
     * 最终位置在提交时按 dropPointer 重新计算
     */
    private _detachPreview(session: DragSession): void {
        for (const entry of session.entries) {
            if (entry.root.isValid) {
                entry.root.setParent(null);
            }
        }

        this._destroyTempCanvas(session);
    }

    private _restoreFlags(entry: PreparedEntry): void {
        entry.flagsBefore.forEach((original, node) => {
            if (!node.isValid) {
                return;
            }
            // 仅清除本次添加且原本不存在的 flag 位，保留原有 flags
            const added = entry.addedFlags & ~original;
            node.objFlags &= ~added;
        });
    }

    private _finishCancelled(
        session: DragSession,
        result?: BeginCreateDragResult,
    ): BeginCreateDragResult {
        session.state = 'cancelled';
        session.cancelledResult = { sessionId: session.sessionId, state: 'cancelled' };
        if (this._activeSessionId === session.sessionId) {
            this._activeSessionId = null;
        }

        if (result && !result.ok) {
            return result;
        }
        return ok(session.cancelledResult);
    }

    // --- 通用工具 ---

    private _chain<T>(session: DragSession, op: () => Promise<T>): Promise<T> {
        const run = session.opChain.then(op, op);
        session.opChain = run.then(() => undefined, () => undefined);
        return run;
    }

    private _isAborted(session: DragSession): boolean {
        return session.abortLoad || session.state === 'cancelled';
    }

    private _getActiveSession(): DragSession | null {
        if (!this._activeSessionId) {
            return null;
        }
        const session = this._sessions.get(this._activeSessionId);
        if (!session) {
            return null;
        }
        if (session.state === 'committed' || session.state === 'cancelled') {
            return null;
        }
        return session;
    }

    private _pruneSessions(): void {
        if (this._sessions.size <= MAX_RETAINED_SESSIONS) {
            return;
        }

        for (const [id, session] of this._sessions) {
            if (this._sessions.size <= MAX_RETAINED_SESSIONS) {
                break;
            }
            if (id === this._activeSessionId) {
                continue;
            }
            if (session.state === 'committed' || session.state === 'cancelled') {
                this._sessions.delete(id);
            }
        }
    }

    private _getEditingPrefabUuid(): string | null {
        if (Service.Editor.getCurrentEditorType() !== 'prefab') {
            return null;
        }
        const rootNode = Service.Editor.getRootNode();
        return rootNode?.['_prefab']?.asset?._uuid ?? null;
    }

    private _readCameraRect(): { x: number; y: number; width: number; height: number } | null {
        const rect = Service.Camera?.getCamera?.()?.rect;
        if (!rect) {
            return null;
        }
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }

    private _cameraRectMatches(session: DragSession): boolean {
        const begin = session.cameraRectAtBegin;
        if (!begin) {
            return true;
        }
        const current = this._readCameraRect();
        if (!current) {
            return true;
        }

        const tolerance = 1e-3;
        return Math.abs(current.x - begin.x) <= tolerance
            && Math.abs(current.y - begin.y) <= tolerance
            && Math.abs(current.width - begin.width) <= tolerance
            && Math.abs(current.height - begin.height) <= tolerance;
    }

    private _validateBeginParams(params: IBeginCreateDragParams): ReturnType<typeof dragError> | null {
        if (!params || typeof params.sessionId !== 'string' || params.sessionId.length === 0) {
            return dragError('INVALID_REQUEST', 'A non-empty sessionId is required.');
        }
        if (!Array.isArray(params.items) || params.items.length === 0) {
            return dragError('INVALID_REQUEST', 'At least one drag item is required.');
        }
        if (!validatePointer(params.pointer)) {
            return dragError('INVALID_REQUEST', 'The drag pointer is invalid.');
        }

        for (const item of params.items) {
            if (!item || typeof item.dbURL !== 'string' || item.dbURL.length === 0) {
                return dragError('INVALID_REQUEST', 'Each drag item requires a non-empty dbURL.');
            }
            if (item.name !== undefined) {
                const nameError = validateNodeName(item.name);
                if (nameError) {
                    return dragError('INVALID_REQUEST', nameError);
                }
            }
        }

        return null;
    }
}

/** 区分请求校验失败与资源加载失败，便于映射错误码 */
class InvalidRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidRequestError';
    }
}
