import type { Node } from 'cc';
import { IRemovedComponentInfo, ISetPropertyOptions, IComponent } from './component';
import { IVec3, IQuat } from './value-types';
import { IServiceEvents } from '../scene-process/service/core';
import { IPrefabStateInfo, ITargetOverrideInfo } from './prefab';
import type { IProperty } from '../@types/public';
import type { IScene } from './editor/scene';

// ====== Hierarchy tree types (for queryNodeTree) ======

export interface INodeTreeComponent {
    isCustom: boolean;
    type: string;
    value: string;
    extends: string[];
}

export interface INodeTreeItem {
    name: string;
    active: boolean;
    locked: boolean;
    type: string;
    uuid: string;
    children: INodeTreeItem[];
    prefab: IPrefabStateInfo;
    parent: string;
    path: string;
    isScene: boolean;
    readonly: boolean;
    components: INodeTreeComponent[];
}

export interface IQueryNodeTreeParams {
    path?: string;
}

/** 一批节点及其子树的序列化数据 */
export interface SerializedNodeData {
    /** 数据格式版本，反序列化时会进行校验 */
    version: 1;

    /** 所有根节点共用的 Cocos JSON 对象图，用于保留批内引用 */
    serialized: string;

    /** 按根节点的序列化顺序保存世界变换，keepWorldTransform 为 true 时使用 */
    rootTransforms: {
        position: IVec3;
        rotation: IQuat;
        scale: IVec3;
    }[];

    /** 本批数据范围外的节点或组件引用，资源引用仍保存在 serialized 中 */
    externalReferences: {
        /** 对应 serialized 中 $nodeReference 标记的占位 ID */
        id: string;
        type: 'node' | 'component';
        /** 引用目标的原始 UUID，供 'resolve' 策略查找 */
        uuid: string;
    }[];
}

export interface ISerializeNodesParams {
    paths: string[];
}

export interface ICreateBySerializedDataParams {
    data: SerializedNodeData;
    /** 目标父节点必须已存在，传入 '/' 时使用当前编辑器的根节点 */
    parentPath: string;
    /** 插入位置从 0 开始，默认追加到末尾 */
    siblingIndex?: number;
    /** 为 true 时恢复保存的世界变换，否则保留序列化数据中的局部变换 */
    keepWorldTransform?: boolean;
    /** 默认清空外部引用；'resolve' 会按原始 UUID 在目标 Runtime 中查找，找不到则置空 */
    externalReferences?: 'resolve' | 'clear';
}

export enum NodeType {
    EMPTY = 'Empty', // 空节点
    TERRAIN = 'Terrain', // 地形节点
    CAMERA = 'Camera', // 摄像机节点(需要用过 TWorkMode 来区分 2D 和 3D)

    SPRITE = 'Sprite', // 精灵节点(需要用过 TWorkMode 来区分 2D 和 3D)
    SPRITE_SPLASH = 'SpriteSplash', // 单色
    GRAPHICS = 'Graphics', // 图形节点
    LABEL = 'Label', // 文本节点
    MASK = 'Mask', // 遮罩节点
    PARTICLE = 'Particle', // 粒子节点(需要用过 TWorkMode 来区分 2D 和 3D)
    TILED_MAP = 'TiledMap', // 瓦片地图节点

    CAPSULE = 'Capsule', // 胶囊体节点
    CONE = 'Cone', // 圆锥体节点
    CUBE = 'Cube', // 立方体节点
    CYLINDER = 'Cylinder', // 圆柱体节点
    PLANE = 'Plane', // 平面节点
    QUAD = 'Quad', // 四边形节点
    SPHERE = 'Sphere', // 球体节点
    TORUS = 'Torus', // 圆环体节点

    BUTTON = 'Button', // 按钮节点
    CANVAS = 'Canvas', // 画布节点(需要用过 TWorkMode 来区分 2D 和 3D)
    EDIT_BOX = 'EditBox', // 输入框节点
    LAYOUT = 'Layout', // 布局节点
    PAGE_VIEW = 'PageView', // 页面视图节点
    PROGRESS_BAR = 'ProgressBar', // 进度条节点
    RICH_TEXT = 'RichText', // 富文本节点
    SCROLL_VIEW = 'ScrollView', // 滚动视图节点
    SLIDER = 'Slider', // 滑动条节点
    TOGGLE = 'Toggle', // 切换节点
    TOGGLE_GROUP = 'ToggleGroup', // 切换组节点
    VIDEO_PLAYER = 'VideoPlayer', // 视频播放器节点
    WEB_VIEW = 'WebView', // 网页视图节点
    WIDGET = 'Widget', // 小部件节点

    DIRECTIONAL_LIGHT = 'Light-Directional', // 平行光
    SPHERE_LIGHT = 'Light-Sphere', // 球面光
    SPOT_LIGHT = 'Light-Spot', // 聚光灯
    PROBE_LIGHT = 'Light-Probe-Group', // 光照探针
    REFLECTION_LIGHT = 'Light-Reflection-Probe', // 反射探针
}

export enum MobilityMode {
    /**
    * @en Static node
    * @zh 静态节点
    */
    Static = 0,
    /**
     * @en Stationary node
     * @zh 固定节点
     */
    Stationary = 1,
    /**
     * @en Movable node
     * @zh 可移动节点
     */
    Movable = 2
}

export type PrefabCanvasHandling = 'add-root-ui-transform' | 'create-canvas';

export interface ICreateNodePreflightResult {
    action: 'create' | 'choose-prefab-canvas-handling';
    canvasRequired: boolean;
    canvasPath: string | null;
    uiTransformPath: string | null;
    /**
     * Opaque token for the matching create request. Passing it back prevents a
     * stale preflight result from silently skipping required Canvas handling.
     */
    preflightToken: string;
}

// generateNodeDump / encode / open 共用的选项
export interface INodeDumpOptions {
    includeChildren?: boolean; // true: children 以 INodeIdentifier[] 返回，false/undefined: undefined
    includeComponents?: boolean; // true: components 以 IComponentIdentifier[] 返回，false/undefined: undefined
}

// 节点查询参数接口
export interface IQueryNodeParams extends INodeDumpOptions {
    path: string; // 查询的节点路径
}

export interface IPrefab {
    uuid: string;
    fileId: string;
    rootUuid: string;
    sync: boolean;
    prefabStateInfo: IPrefabStateInfo;
    targetOverrides?: ITargetOverrideInfo[];
    instance?: IProperty;
}

export interface INode {
    path: string;
    active: IProperty;
    locked: IProperty;
    name: IProperty;
    position: IProperty;

    /**
     * 此为 dump 数据，非 node.rotation
     * 实际指向 node.eulerAngles
     * rotation 为了给用户更友好的文案
     */
    rotation: IProperty;
    mobility: IProperty;

    scale: IProperty;
    layer: IProperty;
    uuid: IProperty;

    children: IProperty[];
    parent: IProperty;

    __comps__: IComponent[];
    __type__: string;
    __prefab__?: IPrefab;
    _prefabInstance?: any;
    removedComponents?: IRemovedComponentInfo[];
    mountedRoot?: string;
}

// 节点删除参数接口
export interface IDeleteNodeParams {
    path: string; // 节点相对路径
    keepWorldTransform?: boolean; // 保持世界变换
}

// 节点删除后返回参数
export interface IDeleteNodeResult {
    path: string; // 节点相对根节点路径
}

export interface IClipboardState {
    type: 'cut' | 'copy' | 'none';
    paths: string[];
}

// 节点移动参数接口
export interface ISetParentParams {
    paths: string[];
    parentPath: string;
    keepWorldTransform?: boolean;
}

export interface IReorderParams {
    path: string;     // 父节点路径
    target: number;   // 当前索引
    offset: number;   // 偏移量
}

// 节点拷贝参数接口
export interface ICopyParams {
    paths: string[];
}

// 节点粘贴参数接口
export interface IPasteParams {
    parentPath?: string;
    keepWorldTransform?: boolean;
}

// 节点复制参数接口
export interface IDuplicateParams {
    paths: string[];
}

// 节点剪切参数接口
export interface ICutParams {
    paths: string[];
}

// 移动数组元素参数接口
export interface IMoveArrayElementParams {
    nodePath: string;   // 节点路径
    path: string;       // 数组属性路径，如 'children'、'__comps__'
    target: number;     // 当前索引
    offset: number;     // 偏移量
}

// 删除数组元素参数接口
export interface IRemoveArrayElementParams {
    nodePath: string;   // 节点路径
    path: string;       // 数组属性路径
    index: number;      // 要删除的元素索引
}

// 节点锁定参数接口
export interface IChangeNodeLockParams {
    paths: string[];    // 节点路径列表
    locked: boolean;    // 是否锁定
    loop?: boolean;     // 是否递归子节点
}

interface IBaseCreateNodeParams {
    /**
     * Parent path for append creation. When insertSide is set, this is instead
     * the sibling anchor path.
     */
    path: string;
    /**
     * Create beside the sibling named by path. Omitting this preserves append
     * creation under path.
     */
    insertSide?: 'before' | 'after';
    name?: string;
    workMode?: '2d' | '3d';
    position?: IVec3;
    keepWorldTransform?: boolean;
    canvasRequired?: boolean;
    prefabCanvasHandling?: PrefabCanvasHandling;
    /** Opaque token returned by preflightCreate for this creation request. */
    preflightToken?: string;
    unlinkPrefab?: boolean;
}

export interface ICreateByNodeTypeParams extends IBaseCreateNodeParams {
    nodeType: NodeType;
}

export interface ICreateByAssetParams extends IBaseCreateNodeParams {
    dbURL: string;
}

/**
 * 一项拖拽创建目标，由调用方完成资源分组、过滤和命名后传入
 * CLI 负责解析资源或内置目标，并确定模板、挂载父级及 Canvas/Prefab 处理方式
 */
export interface ICreateDragItem {
    /** 普通资源的 db:// 地址，或 BUILTIN_NODE_CREATE_TARGETS 中注册的内置创建地址 */
    dbURL: string;
    /** 覆盖新建根节点的名称，省略时沿用资源或内置目标的默认名称 */
    name?: string;
}

/**
 * 鼠标在 Scene 画布中的位置及对应的渲染区域
 * 调用方将 CSS 坐标换算为画布实际渲染像素，换算后无需再乘 DPR
 * CLI 根据相机计算世界落点，并转换为目标父节点的局部坐标
 */
export interface ICreateDragPointer {
    /** 距画布左边缘的水平距离，向右为正 */
    x: number;
    /** 距画布下边缘的垂直距离，向上为正 */
    y: number;
    /** 画布实际渲染宽度，对应 canvas.width */
    width: number;
    /** 画布实际渲染高度，对应 canvas.height */
    height: number;
    /** 相机在整个画布中的归一化区域，以左下角为原点，各分量按画布宽高归一化 */
    viewport: { x: number; y: number; width: number; height: number };
    /** 同一会话内单调递增的位置序号，CLI 忽略不晚于已接收位置的更新 */
    sequence: number;
}

/** 鼠标进入有效 Scene 画布且创建数据就绪时，开始一次拖拽创建会话 */
export interface IBeginCreateDragParams {
    /** 调用方每次进入 Scene 时生成的唯一 ID，重试复用，离开后重新进入需生成新 ID */
    sessionId: string;
    /** 按创建顺序排列；CLI 按资源 UUID 或内置目录键去重，保留首次出现的项 */
    items: ICreateDragItem[];
    /** 开始预览时的鼠标位置，资源加载期间可由 updateCreateDrag 更新 */
    pointer: ICreateDragPointer;
}

/** 更新未提交会话的预览位置，可在 beginCreateDrag 返回前发送 */
export interface IUpdateCreateDragParams {
    /** beginCreateDrag 使用的会话 ID */
    sessionId: string;
    /** 合并连续鼠标移动或画布布局变化后的最新位置 */
    pointer: ICreateDragPointer;
}

/** 在有效画布内松手后提交；需要用户确认时，携带选择再次提交同一会话 */
export interface ICommitCreateDragParams {
    /** beginCreateDrag 使用的会话 ID，重复提交及用户确认后均保持不变 */
    sessionId: string;
    /** 首次 drop 时固定的最终位置，停止后续 update，用户确认后仍传同一位置 */
    pointer: ICreateDragPointer;
    /** 首次提交省略；收到 needs-confirmation 后，回传对应确认 ID 和用户选择 */
    confirmation?: {
        /** CLI 返回的确认 ID，用于校验本次选择对应的会话及确认请求 */
        id: string;
        /** 用户从 confirmation.choices 中选择的 Canvas 处理方式 */
        choiceId: PrefabCanvasHandling;
    };
}

/**
 * 取消拖拽创建的原因，用于区分手势结束、目标失效和编辑器生命周期操作
 * Scene 接受 drop 后，拖拽源结束、替换、销毁及鼠标离开不再取消已接受的提交
 */
export type CreateDragCancelReason =
    /** 松手前离开目标 Scene 区域 */
    | 'leave'
    /** 用户按 Esc 取消拖拽 */
    | 'escape'
    /** 拖拽源结束，且目标尚未接受 drop */
    | 'source-ended'
    /** 新拖拽替换当前拖拽 */
    | 'replaced'
    /** 目标 runtime 或其绑定的场景会话失效 */
    | 'runtime-invalidated'
    /** 保存、Undo/Redo、切换编辑模式等场景操作需要先结束预览 */
    | 'scene-operation'
    /** 拖拽源或目标控制器被销毁 */
    | 'disposed'
    /** 用户取消 Canvas/Prefab 确认 */
    | 'user-cancelled'
    /** 发生异常，需要清理当前拖拽 */
    | 'error';

/** 结束未提交会话并清理其临时节点；已经提交的节点不受影响 */
export interface ICancelCreateDragParams {
    /** 需要取消的拖拽会话 ID，重复取消使用同一 ID */
    sessionId: string;
    /** 触发取消的具体原因 */
    reason: CreateDragCancelReason;
}

/**
 * CLI 在 drop 后返回的 Canvas 确认请求，由调用方展示选项
 * 等待确认期间保留预览，不修改正式父级，也不占用 Undo 组
 */
export interface ICreateDragConfirmation {
    /** 当前确认请求的唯一 ID，用户选择后通过 commitCreateDrag 原样回传 */
    id: string;
    /** Prefab 编辑环境缺少所需 Canvas 上下文，需要用户选择处理方式 */
    kind: 'prefab-canvas';
    /** 当前请求允许的处理方式，沿用普通节点创建的 PrefabCanvasHandling */
    choices: PrefabCanvasHandling[];
}

/**
 * 拖拽会话的当前状态，各状态均包含所属 sessionId
 * preparing 表示准备资源，previewing 表示可更新预览，committing 表示正在正式提交或恢复
 * committed 和 cancelled 为终态；调用方应忽略旧会话响应，不能用迟到响应重新打开已结束会话
 */
export type CreateDragSession =
    | { sessionId: string; state: 'preparing' | 'previewing' | 'committing' }
    /** 等待调用方展示 confirmation，并回传用户选择 */
    | { sessionId: string; state: 'needs-confirmation'; confirmation: ICreateDragConfirmation }
    /** nodePaths 为新建根节点的路径，调用方在原 runtime 有效时据此选中一次 */
    | { sessionId: string; state: 'committed'; nodePaths: string[] }
    /** 会话已经结束，其临时节点和辅助对象已清理 */
    | { sessionId: string; state: 'cancelled' };

/** 拖拽创建的业务错误码，调用方按 code 处理，不解析 message */
export type CreateDragErrorCode =
    /** 当前 CLI 不支持拖拽创建 */
    | 'UNSUPPORTED'
    /** 请求字段缺失、格式错误或数值超出有效范围 */
    | 'INVALID_REQUEST'
    /** 当前场景已有其他活跃拖拽，或相同会话 ID 对应不同的创建请求 */
    | 'SESSION_CONFLICT'
    /** 会话不存在或已结束，无法继续本次操作 */
    | 'SESSION_CLOSED'
    /** 会话绑定的场景或 editor session 已改变 */
    | 'STALE_SCENE'
    /** 当前场景状态不允许编辑 */
    | 'NOT_EDITABLE'
    /** 创建项解析后没有可创建的目标 */
    | 'NO_CREATABLE_ITEMS'
    /** 创建所需资源加载失败 */
    | 'ASSET_LOAD_FAILED'
    /** 画布尺寸或相机 viewport 变化，无法可靠恢复本次落点 */
    | 'VIEWPORT_CHANGED'
    /** 确认 ID 已失效，或选择不在允许的选项中 */
    | 'INVALID_CONFIRMATION'
    /** 无法计算有效的创建落点 */
    | 'NO_PLACEMENT'
    /** 正式提交失败，本次创建的改动已恢复 */
    | 'COMMIT_FAILED'
    /** 正式提交失败且未能完整恢复，需要保留现场交由人工处理 */
    | 'COMMIT_RECOVERY_FAILED';

/** 操作失败信息；恢复失败时额外提供可能受影响的节点路径 */
export type CreateDragError =
    | { code: Exclude<CreateDragErrorCode, 'COMMIT_RECOVERY_FAILED'>; message: string }
    | {
        code: 'COMMIT_RECOVERY_FAILED';
        message: string;
        /** 可能仍受本次提交影响的节点路径；调用方应暂停该 runtime 的修改并保留未保存场景 */
        affectedNodePaths: string[];
    };

/** 统一操作结果，ok 为 true 时读取 value，为 false 时读取 error */
export type CreateDragResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: CreateDragError };

/** 开始会话后的当前状态，也可能返回并发 commit 或 cancel 产生的状态 */
export type BeginCreateDragResult = CreateDragResult<CreateDragSession>;

/** 返回当前会话状态；ignored 仅表示本次位置更新未被采纳，不是会话状态 */
export type UpdateCreateDragResult = CreateDragResult<
    CreateDragSession | { sessionId: string; state: 'ignored' }
>;

/** 返回提交结果、用户确认请求，或并发取消产生的 cancelled 终态 */
export type CommitCreateDragResult = CreateDragResult<
    Extract<CreateDragSession, { state: 'committed' | 'needs-confirmation' | 'cancelled' }>
>;

/** 返回 cancelled；若已提交则返回原 committed 结果，不删除正式节点 */
export type CancelCreateDragResult = CreateDragResult<
    Extract<CreateDragSession, { state: 'committed' | 'cancelled' }>
>;

// TODO 目前先从 3x 迁移，后续在进行优化
export interface IChangeNodeOptions {
    // 产生的事件的来源: 'editor' 为 正常编辑器操作产生， 'undo' 为 undo 产生， 'engine' 为引擎发出
    source?: 'editor' | 'undo' | 'engine';
    type?: NodeEventType; // 引发变动的操作或事件类型
    propPath?: string; // 属性路径
    index?: number; // 数组变动可能会传 index
    record?: boolean;// 是否记录到 undo 堆栈上
    dumpImmediately?: boolean;// 是否马上记录 dump 数据，默认为 true， animation -> 其他模式 下为 false
}

/**
 * 节点事件类型
 */
export interface INodeEvents {
    'node:before-remove': [Node],
    'node:before-change': [Node];
    'node:change': [Node, IChangeNodeOptions];

    'node:before-add': [Node];
    'node:add': [Node];
    'node:added': [Node];

    'node:remove': [Node];
    'node:removed': [Node, IChangeNodeOptions];
}

export type IPublicNodeService = Omit<INodeService, keyof IServiceEvents |
    'previewSetProperty' |
    'cancelPreviewSetProperty' |
    'setProperty' |
    'reset' |
    'resetProperty' |
    'updatePropertyFromNull' |
    'setNodeAndChildrenLayer' |
    'setParent' | 
    'reorder' |
    'copy' |
    'paste' |
    'duplicate' |
    'cut' |
    'preflightCreate' |
    'beginCreateDrag' |
    'updateCreateDrag' |
    'commitCreateDrag' |
    'cancelCreateDrag' |
    'queryClipboardState' |
    'moveArrayElement' |
    'removeArrayElement' |
    'changeNodeLock' |
    'queryNodesByAssetUuid' |
    'queryNodesMissAsset'
>;

/**
 * 节点的相关处理接口
 */
export interface INodeService extends IServiceEvents {
    /** 序列化节点及其子树，不修改场景、复制缓存或撤销记录 */
    serialize(params: ISerializeNodesParams): Promise<SerializedNodeData>;

    /**
     * 整批创建节点并返回新建根节点的路径
     * 成功后记为一次撤销操作，失败时回滚本批改动
     */
    createBySerializedData(params: ICreateBySerializedDataParams): Promise<string[]>;

    /**
     * 创建节点
     * @param params
     */
    createByType(params: ICreateByNodeTypeParams): Promise<INode | null>;

    /**
     * 创建节点
     * @param params
     */
    createByAsset(params: ICreateByAssetParams): Promise<INode | null>;

    /**
     * Resolve Canvas handling for a node creation request without modifying the scene.
     */
    preflightCreate(params: ICreateByNodeTypeParams | ICreateByAssetParams): Promise<ICreateNodePreflightResult>;

    /**
     * 开始拖拽创建，准备临时节点并在鼠标位置预览
     * 在首次异步等待前登记 sessionId 并绑定当前 editor session，允许后续操作并发进入
     * 相同请求重试复用原会话；预览不进入 Hierarchy、保存、Dirty 或 Undo，也不改变选中项
     * @returns 当前会话状态或失败信息
     */
    beginCreateDrag(params: IBeginCreateDragParams): Promise<BeginCreateDragResult>;

    /**
     * 更新同一批临时节点的预览位置，无需等待 beginCreateDrag 返回
     * 加载期间记录最新位置，资源就绪后应用；旧序号及首次 drop 后的更新不覆盖最终落点
     * @returns 当前会话状态、ignored 或失败信息
     */
    updateCreateDrag(params: IUpdateCreateDragParams): Promise<UpdateCreateDragResult>;

    /**
     * 按首次 drop 固定的位置正式创建，必要时先返回 Canvas/Prefab 确认请求
     * 快速松手时复用尚在准备的节点；确认后重验场景和父级，重复提交返回同一结果
     * 成功后整批记录一次 Undo，任一创建项失败时恢复本批改动
     * @returns committed、needs-confirmation、cancelled 或失败信息
     */
    commitCreateDrag(params: ICommitCreateDragParams): Promise<CommitCreateDragResult>;

    /**
     * 取消未提交会话，清理本会话拥有的临时节点和辅助对象
     * 加载期间立即结束会话，迟到的加载结果只作清理；正式提交期间等待提交或恢复完成
     * 重复取消不产生额外副作用，已经提交的节点保留
     * @returns cancelled、已有的 committed 结果或失败信息
     */
    cancelCreateDrag(params: ICancelCreateDragParams): Promise<CancelCreateDragResult>;

    /**
     * 删除节点
     * @param params
     */
    delete(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null>;
    /**
     * 查询节点信息
     *
     * @param params - 查询选项
     * @returns 查询到的节点信息，未找到返回 null
     */
    query(params?: IQueryNodeParams): Promise<INode | IScene | null>;

    /**
     * 查询节点树（层级管理器格式）
     */
    queryNodeTree(params: IQueryNodeTreeParams): Promise<INodeTreeItem | null>;

    /**
     * 查询当前场景中使用指定资源的节点 uuid 列表
     */
    queryNodesByAssetUuid(uuid: string): string[];

    /**
     * 查询当前场景中资源丢失的节点 uuid 列表
     */
    queryNodesMissAsset(): Promise<string[]>;

    // ---- 编辑器相关接口 ----

    /**
     * 预览设置节点属性，临时应用属性变更但不记录到 undo 栈
     * 用于编辑器中拖拽滑块等实时预览场景，首次调用时会缓存原始值，
     * 可通过 cancelPreviewSetProperty 恢复
     *
     * @param options - 设置属性选项
     * @param options.nodePath - 节点路径
     * @param options.path - 属性路径，如 'position'、'scale'
     * @param options.dump - 属性的 dump 数据
     * @returns 设置成功返回 true，节点或属性路径无效返回 false
     *
     * @example
     * ```ts
     * // 预览修改节点位置
     * await previewSetProperty({
     *     nodePath: 'Canvas/MyNode',
     *     path: 'position',
     *     dump: { value: { x: 100, y: 200, z: 0 }, type: 'cc.Vec3' },
     * });
     * ```
     */
    previewSetProperty(options: ISetPropertyOptions): Promise<boolean>;

    /**
     * 取消预览设置，将节点属性恢复到 previewSetProperty 调用前的值
     * 仅使用 options.nodePath 和 options.path，options.dump 不会被使用
     *
     * @param options - 设置属性选项
     * @param options.nodePath - 节点路径
     * @param options.path - 属性路径
     * @returns 恢复成功返回 true，无缓存的预览数据或节点无效返回 false
     */
    cancelPreviewSetProperty(options: ISetPropertyOptions): Promise<boolean>;

    /**
     * 设置节点属性，会记录到 undo 栈
     *
     * @param options - 设置属性选项
     * @param options.nodePath - 节点路径
     * @param options.path - 属性路径，如 'position'、'rotation'、'layer'
     * @param options.dump - 属性的 dump 数据
     * @returns 设置成功返回 true，节点不存在返回 false
     *
     * @example
     * ```ts
     * await setProperty({
     *     nodePath: 'Canvas/MyNode',
     *     path: 'position',
     *     dump: { value: { x: 100, y: 200, z: 0 }, type: 'cc.Vec3' },
     * });
     * ```
     */
    setProperty(options: ISetPropertyOptions): Promise<boolean>;

    /**
     * 重置节点的变换属性（position、rotation、scale、mobility）到默认值
     *
     * @param path - 节点路径
     * @returns 重置成功返回 true，节点不存在返回 false
     */
    reset(path: string): Promise<boolean>;

    /**
     * 重置节点的单个属性到 CCClass 定义的默认值
     * 仅使用 options.nodePath 和 options.path，options.dump 不会被使用
     *
     * @param options - 设置属性选项
     * @param options.nodePath - 节点路径
     * @param options.path - 属性路径，如 'position'、'scale'
     * @returns 重置成功返回 true，节点不存在返回 false
     */
    resetProperty(options: ISetPropertyOptions): Promise<boolean>;

    /**
     * 将节点上值为 null 的属性初始化为默认实例
     * 当属性为 null 且有定义构造函数类型时，会创建该类型的新实例
     * 仅使用 options.nodePath 和 options.path，options.dump 不会被使用
     *
     * @param options - 设置属性选项
     * @param options.nodePath - 节点路径
     * @param options.path - 属性路径
     * @returns 初始化成功返回 true，节点不存在返回 false
     *
     * @example
     * ```ts
     * // 将节点上值为 null 的自定义属性初始化
     * await updatePropertyFromNull({
     *     nodePath: 'Canvas/MyNode',
     *     path: 'customProperty',
     *     dump: {} as IProperty,
     * });
     * ```
     */
    updatePropertyFromNull(options: ISetPropertyOptions): Promise<boolean>;

    /**
     * 设置节点及其所有子节点的 layer 属性
     * 递归将相同的 layer 值应用到整个节点子树
     * 仅使用 options.nodePath 和 options.dump，options.path 不会被使用（内部固定为 'layer'）
     *
     * @param options - 设置属性选项
     * @param options.nodePath - 节点路径
     * @param options.dump - layer 属性的 dump 数据
     *
     * @example
     * ```ts
     * await setNodeAndChildrenLayer({
     *     nodePath: 'Canvas/MyNode',
     *     path: 'layer',
     *     dump: { value: 1 << 25, type: 'Enum' },
     * });
     * ```
     */
    setNodeAndChildrenLayer(options: ISetPropertyOptions): Promise<void>;

    /**
     * 通过 uuid 获取节点的层级路径
     *
     * @param uuid - 节点的 uuid
     * @returns 节点路径，节点不存在时返回空字符串
     */
    getPathByUuid(uuid: string): string;

    // ---- 层级管理器操作 ----

    setParent(params: ISetParentParams): Promise<string[]>;
    reorder(params: IReorderParams): Promise<boolean>;
    copy(params: ICopyParams): Promise<string[]>;
    paste(params: IPasteParams): Promise<string[]>;
    duplicate(params: IDuplicateParams): Promise<string[]>;
    cut(params: ICutParams): Promise<string[]>;
    queryClipboardState(): Promise<IClipboardState>;

    /**
     * 移动数组元素位置
     * 通用操作，支持 children 排序、组件排序等
     */
    moveArrayElement(params: IMoveArrayElementParams): Promise<boolean>;

    /**
     * 删除数组元素
     * 支持删除组件等数组属性中的元素（不支持 children）
     */
    removeArrayElement(params: IRemoveArrayElementParams): Promise<boolean>;

    /**
     * 锁定/解锁节点
     */
    changeNodeLock(params: IChangeNodeLockParams): Promise<void>;
}

///

export enum NodeEventType {
    TRANSFORM_CHANGED = 'transform-changed', // 节点改变位置、旋转或缩放事件
    SIZE_CHANGED = 'size-changed', // 当节点尺寸改变时触发的事件
    ANCHOR_CHANGED = 'anchor-changed', // 当节点锚点改变时触发的事件
    CHILD_ADDED = 'child-added', // 节点子类添加
    CHILD_REMOVED = 'child-removed', // 节点子类移除
    PARENT_CHANGED = 'parent-changed', // 父节点改变时触发的事件
    CHILD_CHANGED = 'child-changed', // 子节点改变时触发的事件
    COMPONENT_CHANGED = 'component-changed', // 组件数据发生改变时
    ACTIVE_IN_HIERARCHY_CHANGE = 'active-in-hierarchy-changed', // 节点在hierarchy是否激活
    NOTIFY_NODE_CHANGED = 'notify-node-changed',
    PREFAB_INFO_CHANGED = 'prefab-info-changed', // prefab数据改变
    LIGHT_PROBE_CHANGED = 'light-probe-changed', // 光照探针数据改变
    LIGHT_PROBE_BAKING_CHANGED = 'light-probe-baking-changed', // 光照探针烘焙数据改变

    //
    SET_PROPERTY = 'set-property', // 设置节点上的属性
    MOVE_ARRAY_ELEMENT = 'move-array-element', // 调整一个数组类型的数据内某个 item 的位置
    REMOVE_ARRAY_ELEMENT = 'remove-array-element', // 删除一个数组元素
    CREATE_COMPONENT = 'create-component', // 创建一个组件
    RESET_COMPONENT = 'reset-component', // 重置一个组件
}

export enum EventSourceType {
    EDITOR = 'editor', // 由编辑器主动发出
    UNDO = 'undo', // undo产生的事件
    ENGINE = 'engine', // 由引擎发出
}
