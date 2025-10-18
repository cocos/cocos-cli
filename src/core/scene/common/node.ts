import { IComponent } from './component';
import { IVec3, IQuat, IMat4 } from './value-types';

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
    TILE_MAP = 'TileMap', // 瓦片地图节点

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

// 节点基础属性接口
export interface INodeProperties {
    position: IVec3; // 节点位置
    worldPosition: IVec3; // 节点世界位置
    rotation: IQuat; // 节点旋转, 四元数
    worldRotation: IQuat; // 节点世界旋转, 四元数
    eulerAngles: IVec3; // 节点旋转，欧拉角
    angle: number; // 本地坐标系下的旋转，用欧拉角表示，但是限定在 z 轴上
    scale: IVec3; // 节点缩放
    worldScale: IVec3; // 节点世界缩放
    worldMatrix: IMat4; // 节点的世界变换矩阵
    forward: IVec3; // 节点的前方向向量, 默认前方为 -z 方向
    up: IVec3; // 当前节点在世界空间中朝上的方向向量
    right: IVec3; // 当前节点在世界空间中朝右的方向向量
    mobility: MobilityMode; // 节点的移动性
    layer: number; // 节点所在的层级
    hasChangedFlags: number; // 这个节点的空间变换信息在当前帧内是否有变过？
    active: boolean; // 节点是否激活
    readonly activeInHierarchy: boolean; // 节点在场景中是否激活
}

// 节点标识符接口
export interface INodeIdentifier {
    nodeId: string; // 节点的 id
    path: string; // 节点在场景中的路径
    name: string; // 节点名称
}

// 节点查询参数接口
export interface IQueryNodeParams {
    path: string; // 查询的深度
    queryChildren: boolean; // 是否查询子节点信息
}

// 节点查询结果项接口
export interface INode extends INodeIdentifier {
    properties: INodeProperties; // 节点属性
    component?: IComponent[]; // 节点上的组件列表
    children?: INode[]; // 子节点列表
}

// 节点更新参数接口
export interface IUpdateNodeParams {
    path: string;
    name?: string;
    properties: Partial<INodeProperties>; // 节点属性
}

// 节点更新结果接口
export interface IUpdateNodeResult {
    path: string; // 节点相对根节点路径
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

// 节点创建参数接口
export interface ICreateNodeParams {
    assetPath?: string; // 预制体资源路径
    path: string; // 创建的节点相对路径
    name?: string; // 节点的名称
    workMode?: '2d' | '3d'; // 节点工作模式，2D 还是 3D
    nodeType: string; // 节点类型
    position?: IVec3;
    keepWorldTransform?: boolean; // 保持世界变换
}

/**
 * 节点的相关处理接口
 */
export interface INodeService {
    /**
     * 创建节点
     * @param params
     */
    createNode(params: ICreateNodeParams): Promise<INode | null>;
    /**
     * 删除节点
     * @param params 
     */
    deleteNode(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null>;
    /**
     * 更新节点
     * @param params
     */
    updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult | null>;
    /**
    * 查询节点
    */
    queryNode(params: IQueryNodeParams): Promise<INode | null>;
}
