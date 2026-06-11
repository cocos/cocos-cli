import type { Node } from 'cc';
import { IRemovedComponentInfo, ISetPropertyOptions, IComponent } from './component';
import { IVec3 } from './value-types';
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

// 节点查询参数接口
export interface IQueryNodeParams {
    path: string; // 查询的节点路径
    queryChildren: boolean; // 是否查询子节点信息
    queryComponent: boolean; // 是否查询component的详细信息
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
    path: string;
    name?: string;
    workMode?: '2d' | '3d';
    position?: IVec3;
    keepWorldTransform?: boolean;
    canvasRequired?: boolean;
    unlinkPrefab?: boolean;
}

export interface ICreateByNodeTypeParams extends IBaseCreateNodeParams {
    nodeType: NodeType;
}

export interface ICreateByAssetParams extends IBaseCreateNodeParams {
    dbURL: string;
}

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
