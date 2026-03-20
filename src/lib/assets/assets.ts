import type { AssetOperationOption, CreateAssetByTypeOptions, IAssetInfo, IAssetMeta, ISupportCreateType, QueryAssetsOption } from '../../core/assets/@types/public';
import type { CreateAssetOptions, IAssetConfig, IAssetDBInfo, ICreateMenuInfo, IUerDataConfigItem, QueryAssetType } from '../../core/assets/@types/protected';
import type { FilterPluginOptions, IPluginScriptInfo } from '../../core/scripting/interface';
import { assetDBManager, assetManager } from '../../core/assets';

export type * from '../../core/assets/@types/public';
export type { CreateAssetOptions, IAssetConfig, IAssetDBInfo, ICreateMenuInfo, IUerDataConfigItem, QueryAssetType } from '../../core/assets/@types/protected';
export type { FilterPluginOptions, IPluginScriptInfo } from '../../core/scripting/interface';

export async function init(): Promise<void> {
    // 初始化资源数据库
    const { initAssetDB } = await import('../../core/assets');
    await initAssetDB();
}

/**
 * Start Asset DB // 启动资源数据库，开始扫描和导入资源
 */
export async function start(): Promise<void> {
    const { startAssetDB } = await import('../../core/assets');
    await startAssetDB();
}

/**
 * Register listener for when all asset databases are fully initialized.
 * 
 * 注册数据库初始化完全完成后的事件监听。
 * 
 * **注意事项 (Notice)**:
 * - 触发此事件代表**所有**注册的资源数据库都已经完全导入并初始化完成（启动阶段结束）。
 * - 收到此事件后，表示所有的资源查询、操作 API 都可以安全调用。
 * - 第一次 ready 后，将不再有 progress 进度消息。
 * 
 * @param listener 回调函数
 * @returns 移除监听的函数
 */
export function onReady(listener: () => void): () => void {
    return assetManager.onReady(listener);
}

/**
 * Register listener for when a specific database finishes starting.
 * 
 * 注册单个数据库启动完成后的事件监听。
 * 
 * **注意事项 (Notice)**:
 * - 这个事件可能会被触发多次（如果项目存在多个子数据库，如 `assets`, `internal`）。
 * - 主要用于需要做更精细化并行控制的上层逻辑，通常情况下普通的业务逻辑不需要关心此事件，直接监听 `onReady` 即可。
 * 
 * @param listener 回调函数，接收启动完成的 dbInfo
 * @returns 移除监听的函数
 */
export function onDBReady(listener: (dbInfo: IAssetDBInfo) => void): () => void {
    return assetManager.onDBReady(listener);
}

/**
 * Register listener for initialization progress.
 * 
 * 注册初始化过程中的进度监听。
 * 
 * **注意事项 (Notice)**:
 * - **仅在启动阶段有效**。一旦触发过一次 `ready` 事件（即启动阶段结束），将不再会有新的进度消息。
 * - 启动时的资源冷导入会抛出密集的进度信息，建议在 UI 层面进行适当的节流（throttle）渲染。
 * 
 * @param listener 回调函数，包含当前进度、总数、当前处理的资源 url 和导入状态
 * @returns 移除监听的函数
 */
export function onProgress(listener: (current: number, total: number, url: string, state: 'processing' | 'success' | 'failed') => void): () => void {
    return assetManager.onProgress(listener);
}

/**
 * Delete Asset // 删除资源
 */
export async function deleteAsset(dbPath: string): Promise<IAssetInfo | null> {
    return await assetManager.removeAsset(dbPath);
}

/**
 * Refresh Asset Directory // 刷新资源目录
 */
export async function refresh(dir: string): Promise<number> {
    return await assetManager.refreshAsset(dir);
}

/**
 * Query Asset Info // 查询资源信息
 */
export async function queryAssetInfo(
    urlOrUUIDOrPath: string,
    dataKeys?: string[] | undefined
): Promise<IAssetInfo | null> {
    return await assetManager.queryAssetInfo(urlOrUUIDOrPath, dataKeys as (keyof IAssetInfo)[] | undefined);
}

/**
 * Query Asset Metadata // 查询资源元数据
 */
export async function queryAssetMeta(urlOrUUIDOrPath: string): Promise<IAssetMeta<'unknown'> | null> {
    return await assetManager.queryAssetMeta(urlOrUUIDOrPath);
}

/**
 * Query Creatable Asset Map // 查询可创建资源映射表
 */
export async function queryCreateMap(): Promise<ICreateMenuInfo[]> {
    return await assetManager.getCreateMap();
}

/**
 * Batch Query Asset Info // 批量查询资源信息
 */
export async function queryAssetInfos(options?: QueryAssetsOption): Promise<IAssetInfo[]> {
    return await assetManager.queryAssetInfos(options);
}

/**
 * Query All Asset Database Info // 查询所有资源数据库信息
 */
export async function queryAssetDBInfos(): Promise<Record<string, IAssetDBInfo>> {
    return assetDBManager.assetDBInfo;
}

/**
 * Create Asset By Type // 按类型创建资源
 */
export async function createAssetByType(
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
export async function createAsset(
    options: CreateAssetOptions
): Promise<IAssetInfo> {
    return await assetManager.createAsset(options);
}

/**
 * Import Asset // 导入资源
 */
export async function importAsset(
    source: string,
    target: string,
    options?: AssetOperationOption
): Promise<IAssetInfo[]> {
    return await assetManager.importAsset(source, target, options);
}

/**
 * Reimport Asset // 重新导入资源
 */
export async function reimportAsset(pathOrUrlOrUUID: string): Promise<IAssetInfo> {
    return await assetManager.reimportAsset(pathOrUrlOrUUID);
}

/**
 * Save Asset // 保存资源
 */
export async function saveAsset(
    pathOrUrlOrUUID: string,
    data: string | Buffer
): Promise<IAssetInfo> {
    return await assetManager.saveAsset(pathOrUrlOrUUID, data);
}

/**
 * Query Asset UUID // 查询资源 UUID
 */
export async function queryUUID(urlOrPath: string): Promise<string | null> {
    return assetManager.queryUUID(urlOrPath);
}

/**
 * Query Asset Path // 查询资源路径
 */
export async function queryPath(urlOrUuid: string): Promise<string> {
    return assetManager.queryPath(urlOrUuid);
}

/**
 * Query Asset URL // 查询资源 URL
 */
export async function queryUrl(uuidOrPath: string): Promise<string> {
    return assetManager.queryUrl(uuidOrPath);
}

/**
 * Query Asset Dependencies // 查询资源依赖
 */
export async function queryAssetDependencies(
    uuidOrUrl: string,
    type: QueryAssetType = 'asset'
): Promise<string[]> {
    return await assetManager.queryAssetDependencies(uuidOrUrl, type);
}

/**
 * Query Asset Users // 查询资源使用者
 */
export async function queryAssetUsers(
    uuidOrUrl: string,
    type: QueryAssetType = 'asset'
): Promise<string[]> {
    return await assetManager.queryAssetUsers(uuidOrUrl, type);
}

/**
 * Query Sorted Plugin Scripts // 查询排序后的插件脚本
 */
export async function querySortedPlugins(
    filterOptions: FilterPluginOptions = {}
): Promise<IPluginScriptInfo[]> {
    return assetManager.querySortedPlugins(filterOptions);
}

/**
 * Rename Asset // 重命名资源
 */
export async function renameAsset(
    source: string,
    target: string,
    options: AssetOperationOption = {}
): Promise<any> {
    return await assetManager.renameAsset(source, target, options);
}

/**
 * Move Asset // 移动资源
 */
export async function moveAsset(
    source: string,
    target: string,
    options: AssetOperationOption = {}
): Promise<any> {
    return await assetManager.moveAsset(source, target, options);
}

/**
 * Update Default User Data // 更新默认用户数据
 */
export async function updateDefaultUserData(
    handler: string,
    path: string,
    value: any
): Promise<void> {
    return await assetManager.updateDefaultUserData(handler, path, value);
}

/**
 * Query Asset User Data Config // 查询资源用户数据配置
 */
export async function queryAssetUserDataConfig(
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
export async function updateAssetUserData(
    urlOrUuidOrPath: string,
    path: string,
    value: any
): Promise<any> {
    return await assetManager.updateUserData(urlOrUuidOrPath, path, value);
}

/**
 * Query Asset Config Map // 查询资源配置映射表
 */
export async function queryAssetConfigMap(): Promise<Record<string, IAssetConfig>> {
    return await assetManager.queryAssetConfigMap();
}

/**
 * Listen to Asset Added Event // 监听资源添加事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 * 
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetAdded((info) => {
 *     console.log(`资源已添加: ${info.name}`);
 *     console.log(`  逻辑路径: ${info.url}`);
 *     console.log(`  物理路径: ${info.file}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export function onAssetAdded(listener: (info: IAssetInfo) => void): () => void {
    return assetManager.onAssetAdded(listener);
}

/**
 * Listen to Asset Changed Event // 监听资源变更事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 * 
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetChanged((info) => {
 *     console.log(`资源已变更: ${info.name}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export function onAssetChanged(listener: (info: IAssetInfo) => void): () => void {
    return assetManager.onAssetChanged(listener);
}

/**
 * Listen to Asset Removed Event // 监听资源删除事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 * 
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetRemoved((info) => {
 *     console.log(`资源已删除: ${info.name}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export function onAssetRemoved(listener: (info: IAssetInfo) => void): () => void {
    return assetManager.onAssetRemoved(listener);
}

