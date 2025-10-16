import { Meta } from '@editor/asset-db/libs/meta';
import { IAsset, QueryAssetType } from '../@types/protected/asset';
import { IAssetInfo, QueryAssetsOption } from '../@types/public';

declare global {
    namespace Editor {
        interface AssetManager {
            // 查询方法
            queryUrl(uuidOrPath: string): string;
            queryUUID(urlOrPath: string): string | null;
            queryPath(urlOrUuid: string): string | null;
            queryAsset(uuidOrURLOrPath: string): IAsset | null;
            queryAssetInfo(urlOrUUIDOrPath: string, dataKeys?: (keyof IAssetInfo)[]): IAssetInfo | null;
            queryAssetInfoByUUID(uuid: string, dataKeys?: (keyof IAssetInfo)[]): IAssetInfo | null;
            queryAssetMeta(uuid: string): Meta | null;
            queryAssets(options?: QueryAssetsOption): IAsset[];
            queryAssetMtime(uuid: string): number | null;
            queryAssetUsers(uuidOrURL: string, type?: QueryAssetType): Promise<string[]>;
            queryAssetDependencies(uuidOrURL: string, type?: QueryAssetType): Promise<string[]>;
            queryAssetUserDataConfig(uuid: string): Promise<any>;
            queryCreateMenuList(uuid: string): Promise<any[]>;
            queryAssetProperty(asset: IAsset, property: (keyof IAssetInfo | 'depends' | 'dependScripts' | 'dependedScripts')): any;

            // 数据库相关
            queryDBInfo(name: string): IAssetInfo | null;
        }

        interface AssetDBManager {
            queryDBInfo(name: string): IAssetInfo | null;
        }
    }
}

export { };