import {
    AnimationClipAssetUserData,
    AutoAtlasAssetUserData,
    LabelAtlasAssetUserData,
    RenderTextureAssetUserData,
    DirectoryAssetUserData,
    TextureCubeAssetUserData,
    ImageAssetUserData,
    SpriteFrameAssetUserData,
    Texture2DAssetUserData,
    SpineAssetUserData,
    JavaScriptAssetUserData,
    GltfAnimationAssetUserData,
    ParticleAssetUserData,
    JsonAssetUserData,
    PrefabAssetUserData,
    EffectAssetUserData,
    AudioClipAssetUserData,
    BitmapFontAssetUserData,
    GltfSkeletonAssetUserData,
    GltfEmbededImageAssetUserData,
    IVirtualAssetUserData,
    GlTFUserData,
    SpriteAtlasAssetUserData,
    RtSpriteFrameAssetUserData,
} from './userDatas';

/** 所有资源处理器类型的常量数组（用于 Zod enum 和 TypeScript type） */
export const ASSET_HANDLER_TYPES = [
    'directory',
    'unknown',
    'text',
    'json',
    'spine-data',
    'dragonbones',
    'dragonbones-atlas',
    'terrain',
    'javascript',
    'typescript',
    'scene',
    'prefab',
    'sprite-frame',
    'tiled-map',
    'buffer',
    'image',
    'sign-image',
    'alpha-image',
    'texture',
    'texture-cube',
    'erp-texture-cube',
    'render-texture',
    'texture-cube-face',
    'rt-sprite-frame',
    'gltf',
    'gltf-mesh',
    'gltf-animation',
    'gltf-skeleton',
    'gltf-material',
    'gltf-scene',
    'gltf-embeded-image',
    'fbx',
    'material',
    'physics-material',
    'effect',
    'effect-header',
    'audio-clip',
    'animation-clip',
    'animation-graph',
    'animation-graph-variant',
    'animation-mask',
    'ttf-font',
    'bitmap-font',
    'particle',
    'sprite-atlas',
    'auto-atlas',
    'label-atlas',
    'render-pipeline',
    'render-stage',
    'render-flow',
    'instantiation-material',
    'instantiation-mesh',
    'instantiation-skeleton',
    'instantiation-animation',
    'video-clip',
];

/** 支持创建的资源类型常量数组（用于 Zod enum 和 TypeScript type） */
export const SUPPORT_CREATE_TYPES = [
    'animation-clip',          // 动画剪辑
    'typescript',              // TypeScript 脚本
    'auto-atlas',              // 自动图集
    'effect',                  // 着色器效果
    'scene',                   // 场景
    'prefab',                  // 预制体
    'material',                // 材质
    // 'texture-cube',            // 立方体贴图
    'terrain',                 // 地形
    'physics-material',        // 物理材质
    'label-atlas',             // 标签图集
    'render-texture',          // 渲染纹理
    // 'animation-graph',         // 动画图
    // 'animation-mask',          // 动画遮罩
    // 'animation-graph-variant', // 动画图变体
    'directory',               // 文件夹
    'effect-header',           // 着色器头文件（chunk）
];
// 支持创建的资源类型（引擎类型）
export type ISupportCreateCCType = 
| 'cc.AnimationClip'        // 动画剪辑
| 'cc.Script'               // 脚本（TypeScript/JavaScript）
| 'cc.SpriteAtlas'          // 精灵图集（自动图集）
| 'cc.EffectAsset'          // 着色器效果
| 'cc.SceneAsset'           // 场景
| 'cc.Prefab'               // 预制体
| 'cc.Material'             // 材质
| 'cc.TextureCube'          // 立方体贴图
| 'cc.TerrainAsset'         // 地形
| 'cc.PhysicsMaterial'      // 物理材质
| 'cc.LabelAtlas'           // 标签图集
| 'cc.RenderTexture'        // 渲染纹理
| 'cc.AnimationGraph'       // 动画图
| 'cc.AnimationMask'        // 动画遮罩
| 'cc.AnimationGraphVariant'; // 动画图变体


/** 支持创建的资源类型（从常量数组派生） */
export type ISupportCreateType = typeof SUPPORT_CREATE_TYPES[number];


/** 资源处理器类型（从常量数组派生） */
export type AssetHandlerType = typeof ASSET_HANDLER_TYPES[number] | 'database';

export interface AssetUserDataMap {
    'animation-clip': AnimationClipAssetUserData;
    'auto-atlas': AutoAtlasAssetUserData;
    'label-atlas': LabelAtlasAssetUserData;
    'render-texture': RenderTextureAssetUserData;
    'directory': DirectoryAssetUserData;
    'texture-cube': TextureCubeAssetUserData;
    'erp-texture-cube': TextureCubeAssetUserData;
    'image': ImageAssetUserData;
    'sprite-frame': SpriteFrameAssetUserData;
    'texture': Texture2DAssetUserData;
    'spine-data': SpineAssetUserData;
    'javascript': JavaScriptAssetUserData;
    'gltf-animation': GltfAnimationAssetUserData;
    'particle': ParticleAssetUserData;
    'json': JsonAssetUserData;
    'prefab': PrefabAssetUserData;
    'scene': PrefabAssetUserData;
    'effect': EffectAssetUserData;
    'audio-clip': AudioClipAssetUserData;
    'bitmap-font': BitmapFontAssetUserData;
    'gltf-skeleton': GltfSkeletonAssetUserData;
    'gltf-embeded-image': GltfEmbededImageAssetUserData;
    'gltf-mesh': IVirtualAssetUserData;
    'gltf-material': IVirtualAssetUserData;
    'gltf-scene': IVirtualAssetUserData;
    'gltf': GlTFUserData;
    'fbx': GlTFUserData;
    'sprite-atlas': SpriteAtlasAssetUserData;
    'rt-sprite-frame': RtSpriteFrameAssetUserData;
    'sign-image': ImageAssetUserData;
    'alpha-image': ImageAssetUserData;
    
    // 无特定 userData 的资源类型（仅保留 unknown）
    'unknown': any;
}