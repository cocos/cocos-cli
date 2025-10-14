// 这个文件用于记录导入器的各种类型定义，导出声明文件的时候将导出这个配置文件
export type ImageImportType = 'raw' | 'texture' | 'normal map' | 'sprite-frame' | 'texture cube';

/** 图片资源的 userData  */
export interface ImageAssetUserData {
    /** 图片类型 */
    type: ImageImportType;
    /** 垂直翻转 */
    flipVertical?: boolean;
    /** 消除透明伪影 */
    fixAlphaTransparencyArtifacts?: boolean;
    /** 是否为 RGBE */
    isRGBE?: boolean;
    /** 这个图片是不是拥有 alpha 通道 */
    hasAlpha?: boolean;
    /** 重定向的 uuid，ImageAsset 在编辑器内已隐藏，相关交互操作需要通过此参数重定向操作目标*/
    redirect?: string;
    visible?: boolean;
    /** 是否翻转绿通道 */
    flipGreenChannel?: boolean;

    /**
     * 部分资源导入后可能产生多张图像资源
     */
    sign?: string;
    alpha?: string;
}

export interface SpriteFrameAssetUserData extends SpriteFrameBaseAssetUserData {
    isUuid?: boolean;
    imageUuidOrDatabaseUri: string;
}

export interface SpriteFrameBaseAssetUserData {
    trimType?: string;
    trimThreshold: number;
    rotated: boolean;
    offsetX: number;
    offsetY: number;
    trimX: number;
    trimY: number;
    width: number;
    height: number;
    rawWidth: number;
    rawHeight: number;
    borderTop: number;
    borderBottom: number;
    borderLeft: number;
    borderRight: number;
    packable?: boolean;
    pixelsToUnit: number;
    pivotX: number;
    pivotY: number;
    meshType: number;
    vertices: SpriteFrameVertices;
}

export interface Texture2DAssetUserData extends TextureBaseAssetUserData {
    isUuid?: boolean;
    imageUuidOrDatabaseUri?: string;
}

export type WrapMode = 'repeat' | 'clamp-to-edge' | 'mirrored-repeat';

export type Filter = 'none' | 'nearest' | 'linear';

export interface TextureBaseAssetUserData {
    wrapModeS: WrapMode;
    wrapModeT: WrapMode;
    minfilter: Filter;
    magfilter: Filter;
    mipfilter: Filter;
    anisotropy: number;
}

export interface TextureCubeAssetUserData extends TextureBaseAssetUserData {
    imageDatabaseUri?: string;
    isRGBE: boolean;

    mipBakeMode: number;
    /**
     * `0` 意味着默认。见 https://github.com/cocos-creator/3d-tasks/issues/2253
     */
    faceSize?: number;
    // 符号资源 uuid
    sign?: string;
    
    // 六个面的 UUID
    front?: string;
    back?: string;
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
}

export interface SpriteFrameVertices {
    rawPosition: number[];
    indexes: number[];
    uv: number[];
    nuv: number[];
    triangles?: number[];
    minPos: number[];
    maxPos: number[];
}

import { GlTFUserData } from '../asset-handler/meta-schemas/glTF.meta';

/** 动画剪辑资源的 userData */
export interface AnimationClipAssetUserData {
    /** 动画名称 */
    name: string;
}

/** 自动图集资源的 userData */
export interface AutoAtlasAssetUserData {
    compressed: boolean;
    dest: any;
    /** 打包图像的尺寸 */
    maxWidth: number;
    maxHeight: number;
    /** 图像的边距 */
    padding: number;
    allowRotation: boolean;
    forceSquared: boolean;
    powerOfTwo: boolean;
    algorithm: string;
    format: string;
    quality: number;
    contourBleed: boolean;
    paddingBleed: boolean;
    filterUnused: boolean;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    platformSettings: any;
    textureSetting: any;
}

/** 标签图集资源的 userData */
export interface LabelAtlasAssetUserData {
    itemWidth: number;
    itemHeight: number;
    startChar: string;
    fontSize: number;
    spriteFrameUuid: string;
    _fntConfig: {};
}

/** 渲染纹理资源的 userData */
export interface RenderTextureAssetUserData extends TextureBaseAssetUserData {
    width: number;
    height: number;
}

/** 文件夹资源的 userData */
export interface DirectoryAssetUserData {
    /** 是否是资源包 */
    isBundle?: boolean;
    /** 资源包配置 ID */
    bundleConfigID?: string;
    /** 资源包名称 */
    bundleName?: string;
    /** 优先级 */
    priority?: number;
}

/** Spine 资源的 userData */
export interface SpineAssetUserData {
    /** 图集资源的 UUID */
    atlasUuid: string;
}

/** JavaScript 脚本模块的 userData */
export interface ScriptModuleUserData {
    isPlugin: false;
}

/** JavaScript 插件脚本的 userData */
export interface PluginScriptUserData {
    isPlugin: true;
    /** 界面没有开放给用户。默认开启 */
    experimentalHideCommonJs?: boolean;
    /** 界面没有开放给用户。默认开启 */
    experimentalHideAmd?: boolean;
    /** 仅当 executionScope 为 enclosed 时有效。指定了要模拟的全局变量 */
    simulateGlobals?: string[];
    /** 执行作用域 */
    executionScope?: 'enclosed' | 'global';
    /** 插件执行时机 */
    loadPluginInEditor?: boolean;
    loadPluginInWeb?: boolean;
    loadPluginInMiniGame?: boolean;
    loadPluginInNative?: boolean;
}

/** JavaScript 资源的 userData */
export type JavaScriptAssetUserData = ScriptModuleUserData | PluginScriptUserData;

/** glTF 动画资源的 userData */
export interface GltfAnimationAssetUserData {
    gltfIndex: number;
    events: Array<{
        frame: number;
        func: string;
        params: string[];
    }>;
    editorExtras?: unknown;
    embeddedPlayers?: Array<{
        editorExtras?: unknown;
        begin: number;
        end: number;
        reconciledSpeed: boolean;
        playable:
        | {
            type: 'animation-clip';
            path: string;
            clip: string;
        }
        | {
            type: 'particle-system';
            path: string;
        };
    }>;
    auxiliaryCurves?: Record<string, { curve: any }>;
    wrapMode: number;
    speed?: number;
    sample?: number;
    span?: {
        from: number;
        to: number;
    };
    additive?: any;
}

/** JSON 资源的 userData */
export interface JsonAssetUserData {
    /** 是否启用 JSON5 解析 */
    json5?: boolean;
}

/** 场景/预制体资源的 userData */
export interface PrefabAssetUserData {
    /** 是否为持久节点 */
    persistent?: boolean;
    /** 同步节点名称 */
    syncNodeName?: string;
}

/** Effect 着色器资源的 userData */
export interface EffectAssetUserData {
    /** 预编译组合 */
    combinations?: any;
    /** 编辑器相关数据 */
    editor?: any;
}

/** 音频资源的 userData */
export interface AudioClipAssetUserData {
    /** 下载模式：0-Web Audio, 1-DOM Audio */
    downloadMode: number;
}

/** 位图字体资源的 userData */
export interface BitmapFontAssetUserData {
    /** 字体配置 */
    _fntConfig: any;
    /** 字体大小 */
    fontSize: number;
    /** 纹理 UUID */
    textureUuid: string;
}

/** glTF Skeleton 子资源的 userData */
export interface GltfSkeletonAssetUserData extends IVirtualAssetUserData {
    /** 骨骼数量 */
    jointsLength?: number;
}

/** glTF 嵌入图片子资源的 userData */
export interface GltfEmbededImageAssetUserData extends IVirtualAssetUserData {
    /** 是否修复 Alpha 透明度瑕疵 */
    fixAlphaTransparencyArtifacts?: boolean;
}

/** glTF 虚拟子资源的通用 userData */
export interface IVirtualAssetUserData {
    /** 在 glTF 文件中的索引 */
    gltfIndex?: number;
    /** mesh 资源的面数 */
    triangleCount?: number;
    /** mesh 所在 lod 层级 */
    lodLevel?: number;
    /** 根据 lod 配置自动生成 */
    lodOptions?: {
        /** 自动生成的 mesh 占原 mesh 的百分比 */
        faceCount: number;
    };
    [index: string]: any;
}

/** 精灵图集资源的 userData */
export interface SpriteAtlasAssetUserData {
    /** 图集纹理名称 */
    atlasTextureName: string;
    /** 纹理 UUID */
    textureUuid: string | null;
    /** 精灵帧列表 */
    frames: SpriteFrameAssetUserData[];
    /** 资源 UUID */
    uuid: string;
    /** 格式版本 */
    format: number;
}

/** 渲染纹理精灵帧的 userData */
export interface RtSpriteFrameAssetUserData {
    /** 图片 UUID 或数据库 URI */
    imageUuidOrDatabaseUri: string;
    /** 宽度 */
    width?: number;
    /** 高度 */
    height?: number;
}

/** 粒子资源的 userData */
export interface ParticleAssetUserData {
    totalParticles: number;
    life: number;
    lifeVar: number;
    emissionRate: number;
    duration: number;
    srcBlendFactor: number;
    dstBlendFactor: number;
    startColor: any;
    startColorVar: any;
    endColor: any;
    endColorVar: any;
    startSize: number;
    startSizeVar: number;
    endSize: number;
    endSizeVar: number;
    positionType: number;
    sourcePos: any;
    posVar: any;
    angle: number;
    angleVar: number;
    startSpin: number;
    startSpinVar: number;
    endSpin: number;
    endSpinVar: number;
    emitterMode: number;
    gravity: any;
    speed: number;
    speedVar: number;
    radialAccel: number;
    radialAccelVar: number;
    tangentialAccel: number;
    tangentialAccelVar: number;
    rotationIsDir: boolean;
    startRadius: number;
    startRadiusVar: number;
    endRadius: number;
    endRadiusVar: number;
    rotatePerS: number;
    rotatePerSVar: number;
    spriteFrameUuid: string;
}
