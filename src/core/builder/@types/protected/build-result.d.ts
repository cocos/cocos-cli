import { IAsset } from '../../../asset-db/@types/private';
import { BundleCompressionType, IAssetPathInfo, IBuildPaths, IBuildTaskOption, IBundleConfig, IJsonPathInfo, ISettings, UUID, IBuildSceneItem, ITextureCompressType, ITextureCompressFormatType, ICustomConfig } from '../public';
import { BuilderAssetCache } from './asset-manager';
import { ImportMap, ImportMapWithImports } from './import-map';
import { IAssetInfo, IImportMapOptions, IInternalBuildOptions, IBuildSeparateEngineResult } from './options';
import { IPacInfo } from './texture-packer';

export class TextureCompress {
    _taskMap: Record<string, IImageTaskInfo>;
    platform: string;
    init(): Promise<void>;
    updateUserConfig(): Promise<void>;
    addTask(assetInfo: IAssetInfo): IImageTaskInfo;
    run(): Promise<void>;
}

/**
 * 构建内置的脚本编译模块，后续会开放更多的接口，供平台使用
 */
export declare class ScriptBuilder {
    static outputImportMap(importMap: ImportMap, options: IImportMapOptions): Promise<void>;
}

export interface IBundleManager {
    bundleMap: Record<string, IBundle>;
    bundles: IBundle[];
    destDir: string;
    scriptBuilder: ScriptBuilder;
    packResults: IPacInfo[];
    cache: BuilderAssetCache;
    hookMap: Record<string, string>;

    buildAsset(): Promise<void>;
    initBundle(): Promise<void>;
    initAsset(): Promise<void>;
    buildScript(): Promise<any>;
    outputBundle(): Promise<void>;
    bundleDataTask(): Promise<void>;

    runPluginTask(hookName: string): Promise<void>;

    break(reason: string): void;
}

export class IBuildTemplate {
    query(name: string): string | null;
    initUrl(relativeUrl: string, name?: string): string | undefined;
    copyTo(dest: string): Promise<void>;
    findFile(dest: string): string | undefined;
    isEnable: boolean;
}

export class InternalBuildResult {
    settings: ISettings;

    // 脚本资源包分组（子包/分包）
    scriptPackages: string[];
    // MD5 后缀 map
    pluginVers: Record<UUID, string>;
    pluginScripts: Array<{
        uuid: string;
        url: string;
        file: string;
    }>;
    compressImageResult: ICompressImageResult;
    importMap: ImportMapWithImports;
    // 传入构建的 options
    rawOptions: IBuildTaskOption;
    // 输出路径集合
    paths: IBuildPaths;
    // 允许的自定义编译选项
    compileOptions?: any;
    separateEngineResult?: IBuildSeparateEngineResult;
}

export interface ImageCompressTask {
    src: string;
    // 需要预生成的 mipmaps 源地址
    mipmapFiles?: string[];
    presetId: string;
    compressOptions: Record<string, any>;
    // suffixMap: Record<string, string>;

    dest?: string[]; // 纹理压缩生成后，会将地址输出在此
    suffix?: string[];
    mtime?: any;
}

export interface IImageTaskInfo {
    src: string;
    presetId: string;
    hasAlpha: boolean;
    mtime: string | number;
    hasMipmaps: boolean;
    compressOptions: Record<string, any>;

    // 不同纹理压缩类型的生成压缩地址
    dest: string[];
    suffix: string[];

    dirty?: boolean;
}

export interface ISuffixMap {
    native: Record<string, string[]>;
    import: Record<string, string[]>;
}

export interface IVersionMap {
    import: Record<UUID, string>;
    native: Record<UUID, string>;
}

export interface IMD5Map {
    'raw-assets': Record<UUID, string>;
    import: Record<UUID, string>;
    plugin?: Record<UUID, string>;
}
export interface IAtlasResult {
    assetsToImage: Record<string, string>;
    imageToAtlas: Record<string, string>;
    atlasToImages: Record<string, string[]>;
}

export class IBuilder {
    cache: BuilderAssetCache;
    result: InternalBuildResult;
    options: IInternalBuildOptions;
    bundleManager: IBundleManager;
    hooksInfo: IBuildHooksInfo;
    buildTemplate: IBuildTemplate;
    id: string;

    updateProcess(message: string, increment?: number): void;
    break(reason: string): void;
}

export class IBuildStageTask {
    options: IBuildTaskOption;
    buildTaskOptions?: IBuildTaskOption;

    run(): Promise<boolean>;
    saveOptions(): Promise<void>;
}

export interface IBuildHooksInfo {
    pkgNameOrder: string[];
    infos: Record<string, { path: string; internal: boolean }>;
}

export class IBundle {
    readonly scenes: IBuildSceneItem[]; // 该 bundle 中的所有场景，包含重定向的
    readonly assets: UUID[]; // 该 bundle 中的所有资源，包含重定向的
    readonly assetsWithoutRedirect: UUID[]; // 该 bundle 中的未重定向的资源
    readonly scripts: UUID[]; // 该 bundle 中的所有参与编译的脚本（不包含插件脚本）
    readonly rootAssets: UUID[]; // 该 bundle 中的根资源，即直接放在 bundle 目录下的资源，包含重定向的资源
    readonly isSubpackage: boolean; // 该 bundle 是否是子包
    root: string; // bundle 的根目录, 开发者勾选的目录，如果是 main 包，这个字段为 ''
    dest: string; // bundle 的输出目录
    importBase: string;
    nativeBase: string;
    scriptDest: string; // 脚本的输出地址
    name: string; // bundle 的名称
    priority: number; // bundle 的优先级
    compressionType: BundleCompressionType; // bundle 的压缩类型
    assetVer: IVersionMap; // bundle 内的资源版本
    version: string; // bundle 本身的版本信息
    readonly isRemote: boolean; // bundle 是否是远程包
    redirect: Record<UUID, string>; // bundle 中的重定向资源
    deps: Set<string>; // bundle 的依赖 bundle
    groups: IGroup[]; // 该 bundle 中的资源分组
    configOutPutName: string;
    config: IBundleConfig; // 该 bundle 的资源清单
    readonly isZip: boolean; // 该 bundle 是否是 zip 模式
    zipVer: string; // Zip 压缩模式，压缩包的版本
    // 存储纹理压缩 image uuid 与对应的纹理资源地址
    public compressRes: Record<string, string[]>;
    atlasRes: IAtlasResult;
    compressTask: Record<UUID, IImageTaskInfo>;
    _rootAssets: Set<UUID>; // 该 bundle 直接包含的资源
    _scenes: Record<string, IBuildSceneItem>;
    _scripts: Set<UUID>; // 所有脚本，包含插件脚本
    _assets: Set<UUID>;
    output: boolean;
    md5Cache: boolean;
    debug: boolean;
    public paths: Record<string, string[]>;

    // addScene(scene: UUID): void;
    build(): void;
    initConfig(): void;
    initAssetPaths(): Promise<void>;
    /**
     * 添加根资源，此方法会递归添加子资源的数据支持普通资源与脚本资源
     * @param asset 
     * @returns 
     */
    addRootAsset(asset: IAsset): void;
    addAsset(asset: IAsset): void;
    /**
     * 添加参与 Bundle 打包的脚本资源，最终输出到 index.js 内
     * 需要提前判断脚本资源类型
     * @param asset 
     * @returns 
     */
    addScript(asset: IAsset): void;
    removeAsset(asset: UUID): void;
    addRedirect(asset: UUID, redirect: string): void;
    addAssetWithUuid(asset: UUID): void;
    getRedirect(uuid: UUID): string | undefined;
    addGroup(type: IJSONGroupType, uuids: UUID[], name?: string): void;
    addToGroup(type: IJSONGroupType, uuid: UUID): void;
    removeFromGroups(uuid: UUID): void;
    containsAsset(uuid: string, deep?: boolean): boolean;
}

export type ICompressImageResult = Record<UUID, {
    formats: string[],
    files: string[],
}>;

export interface IGroup {
    // 分组名字
    name: string;
    // 分组类型
    type: IJSONGroupType;
    // 该组中的资源 uuid 列表
    uuids: UUID[];
}

export type IJSONGroupType = 'NORMAL' | 'TEXTURE' | 'IMAGE' | 'BIN';

export interface IDefaultGroup {
    assetUuids: UUID[];
    scriptUuids: UUID[];
    jsonUuids: UUID[];
}


export interface IPreviewSettingsResult {
    settings: ISettings;
    script2library: Record<string, string>;
    bundleConfigs: IBundleConfig[];
}