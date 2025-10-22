import { IProperty, IPropertyValueType } from '../@types/public';

export const globalComponentType = {
    Component: 'cc.Component',
    MissingScript: 'cc.MissingScript',
    PostProcess: 'cc.PostProcess',
    Camera: 'cc.Camera',
    Renderer: 'cc.Renderer',
    ModelRenderer: 'cc.ModelRenderer',
    PrefabLink: 'cc.PrefabLink',
    CameraComponent: 'cc.CameraComponent',
    RenderableComponent: 'cc.RenderableComponent',
    MeshRenderer: 'cc.MeshRenderer',
    ModelComponent: 'cc.ModelComponent',
    Light: 'cc.Light',
    DirectionalLight: 'cc.DirectionalLight',
    SphereLight: 'cc.SphereLight',
    SpotLight: 'cc.SpotLight',
    PointLight: 'cc.PointLight',
    RangedDirectionalLight: 'cc.RangedDirectionalLight',
    LightComponent: 'cc.LightComponent',
    DirectionalLightComponent: 'cc.DirectionalLightComponent',
    SphereLightComponent: 'cc.SphereLightComponent',
    SpotLightComponent: 'cc.SpotLightComponent',
    SkinnedMeshRenderer: 'cc.SkinnedMeshRenderer',
    SkinnedMeshBatchRenderer: 'cc.SkinnedMeshBatchRenderer',
    SkinningModelComponent: 'cc.SkinningModelComponent',
    BatchedSkinningModelComponent: 'cc.BatchedSkinningModelComponent',
    LODGroup: 'cc.LODGroup',
    ReflectionProbe: 'cc.ReflectionProbe',
    AnimationController: 'cc.animation.AnimationController',
    Animation: 'cc.Animation',
    AnimationComponent: 'cc.AnimationComponent',
    SkeletalAnimation: 'cc.SkeletalAnimation',
    SkeletalAnimationComponent: 'cc.SkeletalAnimationComponent',
    UITransform: 'cc.UITransform',
    UIRenderer: 'cc.UIRenderer',
    Label: 'cc.Label',
    Sprite: 'cc.Sprite',
    UIMeshRenderer: 'cc.UIMeshRenderer',
    LabelOutline: 'cc.LabelOutline',
    UIStaticBatch: 'cc.UIStaticBatch',
    LabelShadow: 'cc.LabelShadow',
    UIOpacity: 'cc.UIOpacity',
    Graphics: 'cc.Graphics',
    Mask: 'cc.Mask',
    RenderRoot2D: 'cc.RenderRoot2D',
    Canvas: 'cc.Canvas',
    UIComponent: 'cc.UIComponent',
    UITransformComponent: 'cc.UITransformComponent',
    RenderComponent: 'cc.RenderComponent',
    CanvasComponent: 'cc.CanvasComponent',
    Renderable2D: 'cc.Renderable2D',
    SpriteRenderer: 'cc.SpriteRenderer',
    RichText: 'cc.RichText',
    MaskComponent: 'cc.MaskComponent',
    LabelComponent: 'cc.LabelComponent',
    LabelOutlineComponent: 'cc.LabelOutlineComponent',
    RichTextComponent: 'cc.RichTextComponent',
    SpriteComponent: 'cc.SpriteComponent',
    UIModelComponent: 'cc.UIModelComponent',
    GraphicsComponent: 'cc.GraphicsComponent',
    UIStaticBatchComponent: 'cc.UIStaticBatchComponent',
    UIOpacityComponent: 'cc.UIOpacityComponent',
    Sorting: 'cc.Sorting',
    UISkew: 'cc.UISkew',
    Button: 'cc.Button',
    EditBox: 'cc.EditBox',
    Layout: 'cc.Layout',
    ProgressBar: 'cc.ProgressBar',
    ScrollBar: 'cc.ScrollBar',
    ViewGroup: 'cc.ViewGroup',
    ScrollView: 'cc.ScrollView',
    Slider: 'cc.Slider',
    Toggle: 'cc.Toggle',
    ToggleContainer: 'cc.ToggleContainer',
    Widget: 'cc.Widget',
    PageViewIndicator: 'cc.PageViewIndicator',
    PageView: 'cc.PageView',
    SafeArea: 'cc.SafeArea',
    UICoordinateTracker: 'cc.UICoordinateTracker',
    BlockInputEvents: 'cc.BlockInputEvents',
    SubContextView: 'cc.SubContextView',
    ButtonComponent: 'cc.ButtonComponent',
    EditBoxComponent: 'cc.EditBoxComponent',
    LayoutComponent: 'cc.LayoutComponent',
    ProgressBarComponent: 'cc.ProgressBarComponent',
    ScrollViewComponent: 'cc.ScrollViewComponent',
    ScrollBarComponent: 'cc.ScrollBarComponent',
    SliderComponent: 'cc.SliderComponent',
    ToggleComponent: 'cc.ToggleComponent',
    ToggleContainerComponent: 'cc.ToggleContainerComponent',
    WidgetComponent: 'cc.WidgetComponent',
    PageViewComponent: 'cc.PageViewComponent',
    PageViewIndicatorComponent: 'cc.PageViewIndicatorComponent',
    SafeAreaComponent: 'cc.SafeAreaComponent',
    UICoordinateTrackerComponent: 'cc.UICoordinateTrackerComponent',
    BlockInputEventsComponent: 'cc.BlockInputEventsComponent',
    Sorting2D: 'cc.Sorting2D',
    Billboard: 'cc.Billboard',
    Line: 'cc.Line',
    ParticleSystem: 'cc.ParticleSystem',
    ParticleSystemComponent: 'cc.ParticleSystemComponent',
    BillboardComponent: 'cc.BillboardComponent',
    LineComponent: 'cc.LineComponent',
    ParticleSystem2D: 'cc.ParticleSystem2D',
    MotionStreak: 'cc.MotionStreak',
    RigidBody: 'cc.RigidBody',
    Collider: 'cc.Collider',
    BoxCollider: 'cc.BoxCollider',
    SphereCollider: 'cc.SphereCollider',
    CapsuleCollider: 'cc.CapsuleCollider',
    CylinderCollider: 'cc.CylinderCollider',
    ConeCollider: 'cc.ConeCollider',
    MeshCollider: 'cc.MeshCollider',
    ConstantForce: 'cc.ConstantForce',
    TerrainCollider: 'cc.TerrainCollider',
    SimplexCollider: 'cc.SimplexCollider',
    PlaneCollider: 'cc.PlaneCollider',
    Constraint: 'cc.Constraint',
    HingeConstraint: 'cc.HingeConstraint',
    FixedConstraint: 'cc.FixedConstraint',
    ConfigurableConstraint: 'cc.ConfigurableConstraint',
    PointToPointConstraint: 'cc.PointToPointConstraint',
    CharacterController: 'cc.CharacterController',
    BoxCharacterController: 'cc.BoxCharacterController',
    CapsuleCharacterController: 'cc.CapsuleCharacterController',
    RigidBodyComponent: 'cc.RigidBodyComponent',
    ColliderComponent: 'cc.ColliderComponent',
    BoxColliderComponent: 'cc.BoxColliderComponent',
    SphereColliderComponent: 'cc.SphereColliderComponent',
    CapsuleColliderComponent: 'cc.CapsuleColliderComponent',
    MeshColliderComponent: 'cc.MeshColliderComponent',
    CylinderColliderComponent: 'cc.CylinderColliderComponent',
    RigidBody2D: 'cc.RigidBody2D',
    Collider2D: 'cc.Collider2D',
    BoxCollider2D: 'cc.BoxCollider2D',
    CircleCollider2D: 'cc.CircleCollider2D',
    PolygonCollider2D: 'cc.PolygonCollider2D',
    Joint2D: 'cc.Joint2D',
    DistanceJoint2D: 'cc.DistanceJoint2D',
    SpringJoint2D: 'cc.SpringJoint2D',
    MouseJoint2D: 'cc.MouseJoint2D',
    RelativeJoint2D: 'cc.RelativeJoint2D',
    SliderJoint2D: 'cc.SliderJoint2D',
    FixedJoint2D: 'cc.FixedJoint2D',
    WheelJoint2D: 'cc.WheelJoint2D',
    HingeJoint2D: 'cc.HingeJoint2D',
    AudioSource: 'cc.AudioSource',
    AudioSourceComponent: 'cc.AudioSourceComponent',
    VideoPlayer: 'cc.VideoPlayer',
    LightProbeGroup: 'cc.LightProbeGroup',
    Terrain: 'cc.Terrain',
    WebView: 'cc.WebView',
    TiledTile: 'cc.TiledTile',
    TiledUserNodeData: 'cc.TiledUserNodeData',
    TiledLayer: 'cc.TiledLayer',
    TiledObjectGroup: 'cc.TiledObjectGroup',
    TiledMap: 'cc.TiledMap',
    ArmatureDisplay: 'dragonBones.ArmatureDisplay',
    PostProcessSetting: 'cc.PostProcessSetting',
    TAA: 'cc.TAA',
    TAAMask: 'TAAMask',
    FSR: 'cc.FSR',
    BlitScreen: 'cc.BlitScreen',
    ColorGrading: 'cc.ColorGrading',
    Bloom: 'cc.Bloom',
    HBAO: 'cc.HBAO',
    DOF: 'cc.DOF',
    FXAA: 'cc.FXAA',
    Skeleton: 'sp.Skeleton',
    BuiltinPipelineSettings: 'BuiltinPipelineSettings',
    BuiltinPipelinePassBuilder: 'BuiltinPipelinePassBuilder',
    BuiltinDepthOfFieldPass: 'BuiltinDepthOfFieldPass',
    DebugViewRuntimeControl: 'internal.DebugViewRuntimeControl',
}

/**
 * 代表一个组件
 */
export interface IComponentIdentifier {
    cid: string;
    path: string; // 返回创建组件的路径，包含节点路径
    uuid: string;
    name: string;
    type: string;
    enabled: boolean;
}

/**
 * 代表组件属性信息
 */
export interface IComponent extends IComponentIdentifier {
    properties: { [key: string]: IPropertyValueType };
}

/**
 * 创建组件
 */
export interface IAddComponentOptions {
    nodePath: string;// 组件路径
    component: string;// 组件注册到ccclass里的类名
}

/**
 * 删除组件
 */
export interface IRemoveComponentOptions {
    path: string;// 组件的路径，不包含节点路径
}

/**
 * 查询组件
 */
export interface IQueryComponentOptions {
    path: string;// 组件的路径，不包含节点路径
}

/**
 * 查询组件
 */
export interface ISetPropertyOptions {
    componentPath: string; // 修改属性的对象的 uuid
    mountPath: string;     // 属性挂载对象的搜索路径
    // key: string; // 属性的 key
    properties: IProperty; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}

/**
 * 节点的相关处理接口
 */
export interface IComponentService {
    /**
     * 创建组件
     * @param params
     */
    addComponent(params: IAddComponentOptions): Promise<IComponent>;
    /**
     * 删除组件
     * @param params 
     */
    removeComponent(params: IRemoveComponentOptions): Promise<boolean>;
    /**
     * 设置组件属性
     * @param params
     */
    setProperty(params: ISetPropertyOptions): Promise<boolean>;
    /**
     * 查询组件
     */
    queryComponent(params: IQueryComponentOptions): Promise<IComponent | null>;
    /**
     * 获取所有组件名，包含内置与自定义组件
     */
    queryAllComponent(): Promise<string[]>
}
