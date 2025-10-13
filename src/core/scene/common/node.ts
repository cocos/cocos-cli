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

    Directional_Light = 'DirectionalLight', // 平行光
    SPHERE_LIGHT = 'SphereLight', // 球面光
    SPOT_LIGHT = 'SpotLight', // 聚光灯
    PROBE_LIGHT = 'ProbeLight', // 光照探针
    REFLECTION_LIGHT = 'ReflectionLight', // 反射探针
}

export interface INodeIdentifier {
    path: string; // 节点在场景中的路径
    index: number; // 节点有存在重名时的索引
}
/**
 * 节点信息
 */
export interface INodeInfo extends INodeIdentifier {
    name: string;
    children?: Record<string, number>; // 子节点数组
}

export interface IDeleteNodeOptions extends INodeIdentifier {
    keepWorldTransform?: boolean; // 保持世界变换
}

/**
 * 更新节点参数
 */
export type UpdateNodeOptions = 'name' | 'path';

// 使用 Partial 使属性可选
export type UpdateNodeRecords = Partial<Record<UpdateNodeOptions, string>>;

export interface IUpdateNodeOptions extends INodeIdentifier {
    fields: UpdateNodeRecords;
}

/**
 * 场景模板类型
 */
export type TWorkMode = '2d' | '3d';

/**
 * 创建节点参数
 */
export interface ICreateNodeOptions {
    nodeType: NodeType; // 节点类型
    path: string; // 节点在场景中的路径
    workMode?: TWorkMode; // 工作模式，2D 还是 3D
    name?: string; // 节点名称
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
    createNode(params: ICreateNodeOptions): Promise<INodeInfo | null>;
    /**
     * 删除节点
     * @param params 
     */
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo | null>;
    /**
     * 更新节点
     * @param params
     */
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo | null>;
    /**
    * 查询节点
    */
    queryNode(identifier: INodeIdentifier): Promise<INodeInfo | null>;
}
