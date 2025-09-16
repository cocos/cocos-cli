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
}
