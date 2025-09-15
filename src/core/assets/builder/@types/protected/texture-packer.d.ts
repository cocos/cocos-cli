
export interface IPackOptions {
    // size of packed image.
    maxWidth: number;
    maxHeight: number;

    // padding of image.
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
    // TODO 平台压缩配置补全
    compressSettings: Record<string, any>,
    bleed: number;

    mode: 'preview' | 'build';
}

export interface IPacInfo {
    spriteFrames: any[];
    relativePath: string;
    relativeDir: string;
    uuid: string;
    path: string;
    packOptions: IPackOptions;
}
interface StoreInfo {
    uuid: string;
    mtime: number;
}

export interface PacStoreInfo {
    pac: StoreInfo;
    sprites: ISpriteFrameInfo[];
    atlas?: { sprits: string[], imagePath: string[]}[];
    options: IPackOptions;
}
export interface PreviewPackResult {
    atlasImagePaths: string[];
    unpackedImages: {imageUuid: string, libraryPath: string} [];
    dirty: boolean;
    storeInfo: PacStoreInfo;
    atlases: IAtlasInfo[];
}

export interface IInternalPackOptions {
    // size of packed image.
    maxWidth: number;
    maxHeight: number;

    // padding of image.
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
    // TODO 平台压缩配置补全
    compressSettings: Record<string, any>,
    bleed: number;

    mode: 'preview' | 'build';
    name: string;
    destDir: string;
}

export interface IAutoAtlasUserData {
    name: string;
    bleed: number | boolean;
    width: number;
    height: number;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    filterUnused: boolean;
}

export interface IAtlasInfo {
    spriteFrameInfos: ISpriteFrameInfo[];
    width: number;
    height: number;
    name: string;
    imagePath: string;
    imageUuid: string;
    textureUuid: string;
    // TODO 这个字段目前没有使用，后续考虑删除
    compressed: CompressedInfo;
}

export interface CompressedInfo {
    suffixs: string[];
    imagePathNoExt: string;
}
export interface ISpriteFrameInfo {
    name: string;
    uuid: string;
    imageUuid: string;
    textureUuid: string;
    file: string;
    trim: any;
    rawWidth: number;
    rawHeight: number;
    width: number;
    height: number;
    originalPath: string;
    rotated: boolean;
    spriteFrame: any;
}

export interface IPackResult {
    atlases: IAtlasInfo[];
    unpackedImages: {imageUuid: string, libraryPath: string} [];
    pacUuid: string;
}

export interface IStorePackInfo {
    sharpMd5: string;
    md5: string;
    versionDev: string;
    result?: IPackResult;
}

export interface ITrimInfo {
    width: number;
    height: number;
}
