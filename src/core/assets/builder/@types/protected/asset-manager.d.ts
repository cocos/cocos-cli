import { IAsset } from '@cocos/creator-types/editor/packages/asset-db/@types/protected';
import { IBuildSceneItem, UUID } from '../public';
import { IInternalBuildOptions, IAssetInfo } from './options';

// ********************************* asset-manager *********************************

export class BuilderAssetCache {
    // 场景资源的 assets 信息缓存
    public readonly scenes: Array<IBuildSceneItem>;

    // 脚本资源的 assets 信息缓存
    public readonly scriptUuids: Array<string>;

    // 除场景、脚本资源外的资源 assets uuid 缓存
    public readonly assetUuids: Array<string>;

    init: () => Promise<void>;
    hasAsset: (uuid: string) => Promise<boolean>;
    addAsset: (asset: IAsset) => void;
    addInstance: (instance: any) => void;
    clearAsset: (uuid: string) => void;
    removeAsset: (uuid: string) => void;
    getMeta: (uuid: string) => Promise<any>;
    getAssetInfo: (uuid: string) => IAssetInfo;
    addMeta: (uuid: string, meta: any) => void;
    getDependUuids: (uuid: string) => Promise<readonly string[]>;
    getDependUuidsDeep: (uuid: string) => Promise<readonly string[]>;

    /**
     * 获取序列化文件
     */
    getLibraryJSON: (uuid: string) => Promise<any>;
    getSerializedJSON: (uuid: string, options: IInternalBuildOptions) => Promise<any>;
    forEach: (type: string, handle: Function) => Promise<void>;
    getInstance: (uuid: string) => Promise<any>;
    outputAssetJson: (uuid: string, destDir: string, options: IInternalBuildOptions) => Promise<void>;
}

export type IUrl = string; // 需要的是符合 url 标准的字符串，例如 asset/script/text.ts
export type IAssetInfoMap = Record<UUID, IAssetInfo>;
export type IUuidDependMap = Record<UUID, UUID[]>;
export type IJsonGroupMap = Record<UUID, IJSONGroupItem>;
export type IAssetGroupMap = Record<UUID, IAssetGroupItem>;

// TODO meta 的类型定义
export type IMetaMap = Record<UUID, any>;
export type IJsonMap = Record<UUID, any>;
export type IInstanceMap = Record<UUID, any>;

export type ICompressOptions = Record<string, number>;
export interface IAssetGroupItem {
    // 分组名字
    // name: string;
    // 分组的根 url
    baseUrls: string[];
    // 脚本编译后的实际地址
    scriptDest: string;
    // 脚本 uuid 列表
    scriptUuids: UUID[];
    // raw 资源 uuid 列表
    assetUuids: UUID[];
}

export interface IJSONGroupItem {
    // 分组名字
    name?: string;
    // 分组名字
    type: string;
    // json 资源 uuid 列表
    uuids: UUID[];
}

export interface IAssetGroupOptions {
    // 脚本打包后的输出路径
    scriptUrl: string;
    baseUrl: string;
}

export type IGroupType = 'json' | 'script' | 'asset';

export type IUpdateType = 'asset-change' | 'asset-add' | 'asset-delete';
export interface IUpdateInfo {
    type: IUpdateType;
    uuid: string;
}

