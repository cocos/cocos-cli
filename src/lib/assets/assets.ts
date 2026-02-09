import type { AssetOperationOption, CreateAssetByTypeOptions, IAssetInfo, IAssetMeta, ISupportCreateType, QueryAssetsOption } from '../../core/assets/@types/public';
import type { CreateAssetOptions, IAssetConfig, IAssetDBInfo, ICreateMenuInfo, IUerDataConfigItem, QueryAssetType } from '../../core/assets/@types/protected';
import type { FilterPluginOptions, IPluginScriptInfo } from '../../core/scripting/interface';
import { assetDBManager, assetManager } from '../../core/assets';

export * from '../../core/assets/@types/public';
export { CreateAssetOptions, IAssetConfig, IAssetDBInfo, ICreateMenuInfo, IUerDataConfigItem, QueryAssetType } from '../../core/assets/@types/protected';

export class Assets {
    static async init(): Promise<void> {
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('../../core/assets');
        await startupAssetDB();
    }
    /**
     * Delete Asset // 删除资源
     */
    static async deleteAsset(dbPath: string): Promise<IAssetInfo | null> {
        return await assetManager.removeAsset(dbPath);
    }

    /**
     * Refresh Asset Directory // 刷新资源目录
     */
    static async refresh(dir: string): Promise<number> {
        return await assetManager.refreshAsset(dir);
    }

    /**
     * Query Asset Info // 查询资源信息
     */
    static async queryAssetInfo(
        urlOrUUIDOrPath: string,
        dataKeys?: string[] | undefined
    ): Promise<IAssetInfo | null> {
        return await assetManager.queryAssetInfo(urlOrUUIDOrPath, dataKeys as (keyof IAssetInfo)[] | undefined);
    }

    /**
     * Query Asset Metadata // 查询资源元数据
     */
    static async queryAssetMeta(urlOrUUIDOrPath: string): Promise<IAssetMeta<'unknown'> | null> {
        return await assetManager.queryAssetMeta(urlOrUUIDOrPath);
    }

    /**
     * Query Creatable Asset Map // 查询可创建资源映射表
     */
    static async queryCreateMap(): Promise<ICreateMenuInfo[]> {
        return await assetManager.getCreateMap();
    }

    /**
     * Batch Query Asset Info // 批量查询资源信息
     */
    static async queryAssetInfos(options?: QueryAssetsOption): Promise<IAssetInfo[]> {
        return await assetManager.queryAssetInfos(options);
    }

    /**
     * Query All Asset Database Info // 查询所有资源数据库信息
     */
    static async queryAssetDBInfos(): Promise<Record<string, IAssetDBInfo>> {
        return assetDBManager.assetDBInfo;
    }

    /**
     * Create Asset By Type // 按类型创建资源
     */
    static async createAssetByType(
        ccType: ISupportCreateType,
        dirOrUrl: string,
        baseName: string,
        options?: CreateAssetByTypeOptions
    ): Promise<IAssetInfo> {
        return await assetManager.createAssetByType(ccType, dirOrUrl, baseName, options);
    }

    /**
     * Create Asset // 创建资源
     */
    static async createAsset(
        options: CreateAssetOptions
    ): Promise<IAssetInfo> {
        return await assetManager.createAsset(options);
    }

    /**
     * Import Asset // 导入资源
     */
    static async importAsset(
        source: string,
        target: string,
        options?: AssetOperationOption
    ): Promise<IAssetInfo[]> {
        return await assetManager.importAsset(source, target, options);
    }

    /**
     * Reimport Asset // 重新导入资源
     */
    static async reimportAsset(pathOrUrlOrUUID: string): Promise<IAssetInfo> {
        return await assetManager.reimportAsset(pathOrUrlOrUUID);
    }

    /**
     * Save Asset // 保存资源
     */
    static async saveAsset(
        pathOrUrlOrUUID: string,
        data: string | Buffer
    ): Promise<IAssetInfo> {
        return await assetManager.saveAsset(pathOrUrlOrUUID, data);
    }

    /**
     * Query Asset UUID // 查询资源 UUID
     */
    static async queryUUID(urlOrPath: string): Promise<string | null> {
        return assetManager.queryUUID(urlOrPath);
    }

    /**
     * Query Asset Path // 查询资源路径
     */
    static async queryPath(urlOrUuid: string): Promise<string> {
        return assetManager.queryPath(urlOrUuid);
    }

    /**
     * Query Asset URL // 查询资源 URL
     */
    static async queryUrl(uuidOrPath: string): Promise<string> {
        return assetManager.queryUrl(uuidOrPath);
    }

    /**
     * Query Asset Dependencies // 查询资源依赖
     */
    static async queryAssetDependencies(
        uuidOrUrl: string,
        type: QueryAssetType = 'asset'
    ): Promise<string[]> {
        return await assetManager.queryAssetDependencies(uuidOrUrl, type);
    }

    /**
     * Query Asset Users // 查询资源使用者
     */
    static async queryAssetUsers(
        uuidOrUrl: string,
        type: QueryAssetType = 'asset'
    ): Promise<string[]> {
        return await assetManager.queryAssetUsers(uuidOrUrl, type);
    }

    /**
     * Query Sorted Plugin Scripts // 查询排序后的插件脚本
     */
    static async querySortedPlugins(
        filterOptions: FilterPluginOptions = {}
    ): Promise<IPluginScriptInfo[]> {
        return assetManager.querySortedPlugins(filterOptions);
    }

    /**
     * Rename Asset // 重命名资源
     */
    static async renameAsset(
        source: string,
        target: string,
        options: AssetOperationOption = {}
    ): Promise<any> {
        return await assetManager.renameAsset(source, target, options);
    }

    /**
     * Move Asset // 移动资源
     */
    static async moveAsset(
        source: string,
        target: string,
        options: AssetOperationOption = {}
    ): Promise<any> {
        return await assetManager.moveAsset(source, target, options);
    }

    /**
     * Update Default User Data // 更新默认用户数据
     */
    static async updateDefaultUserData(
        handler: string,
        path: string,
        value: any
    ): Promise<void> {
        return await assetManager.updateDefaultUserData(handler, path, value);
    }

    /**
     * Query Asset User Data Config // 查询资源用户数据配置
     */
    static async queryAssetUserDataConfig(
        urlOrUuidOrPath: string
    ): Promise<false | Record<string, IUerDataConfigItem> | undefined> {
        const asset = assetManager.queryAsset(urlOrUuidOrPath);
        if (asset) {
            return await assetManager.queryAssetUserDataConfig(asset);
        } else {
            return false;
        }
    }

    /**
     * Update Asset User Data // 更新资源用户数据
     */
    static async updateAssetUserData(
        urlOrUuidOrPath: string,
        path: string,
        value: any
    ): Promise<any> {
        return await assetManager.updateUserData(urlOrUuidOrPath, path, value);
    }

    /**
     * Query Asset Config Map // 查询资源配置映射表
     */
    static async queryAssetConfigMap(): Promise<Record<string, IAssetConfig>> {
        return await assetManager.queryAssetConfigMap();
    }
}
