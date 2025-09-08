import { AssetDB } from '@editor/asset-db';
import { Meta } from '@editor/asset-db/libs/meta';
import { IAsset, QueryAssetType } from './asset';
import { IAssetInfo, QueryAssetsOption } from '../public';
import { EventEmitter } from 'events';

export declare class AssetManager extends EventEmitter {
    queryAssetUsers(uuid: string, type: QueryAssetType = 'asset'): string[] | PromiseLike<string[]>;
    queryAssetInfos: (options?: QueryAssetsOption, dataKeys?: (keyof IAssetInfo)[]) => IAssetInfo[];
    queryAssets: (options?: QueryAssetsOption) => IAsset[];
    queryAsset: (uuidOrURLOrPath: string) => IAsset | null;
    queryAssetProperty: (asset: IAsset, property: (keyof IAssetInfo | 'depends' | 'dependScripts' | 'dependedScripts')) => any;
    queryAssetProperty: (asset: IAsset, property: 'depends') => string[];
    queryAssetProperty: (asset: IAsset, property: 'library') => Record<string, string>;
    queryAssetInfo: (uuid: string, dataKeys?: (keyof IAssetInfo)[]) => IAssetInfo | null;
    queryAssetMeta: (uuid: string) => Meta | null;
    queryDBAssetInfo: (name: string) => IAssetInfo | null;
    queryAssetMtime: (uuid: string) => number | null;
    queryAssetDependencies: (uuid: string, type: QueryAssetType = 'asset') => Promise<string[]>;
    encodeAsset: (asset: IAsset) => IAssetInfo;
    saveAssetMeta: (uuid: string, meta: Meta) => Promise<void>;
    queryUrl: (uuidOrPath: string) => string;
}
export interface IAssetWorkerInfo {
    engine: string; // 引擎所在目录
    type: string; // 当前项目的类型 2d | 3d
    dist: string; // asset-db 目标目录（importer 等）
    utils: string; // 引擎的 utils 所在目录
}