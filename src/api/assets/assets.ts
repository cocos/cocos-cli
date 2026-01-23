import {
    SchemaDbDirResult,
    SchemaDirOrDbPath,
    TDbDirResult,
    TDirOrDbPath,
    SchemaUrlOrUUIDOrPath,
    SchemaDataKeys,
    SchemaQueryAssetsOption,
    SchemaSupportCreateType,
    SchemaTargetPath,
    SchemaAssetOperationOption,
    SchemaSourcePath,
    SchemaAssetData,
    TUrlOrUUIDOrPath,
    TDataKeys,
    TQueryAssetsOption,
    TSupportCreateType,
    TAssetOperationOption,
    TAssetData,
    SchemaAssetInfoResult,
    SchemaAssetMetaResult,
    SchemaCreateMapResult,
    SchemaAssetInfosResult,
    SchemaAssetDBInfosResult,
    SchemaCreatedAssetResult,
    SchemaImportedAssetResult,
    SchemaReimportResult,
    SchemaSaveAssetResult,
    TAssetInfoResult,
    TAssetMetaResult,
    TCreateMapResult,
    TAssetInfosResult,
    TAssetDBInfosResult,
    TCreatedAssetResult,
    TImportedAssetResult,
    TReimportResult,
    TSaveAssetResult,
    TRefreshDirResult,
    SchemaBaseName,
    TBaseName,
    SchemaRefreshDirResult,
    SchemaCreateAssetByTypeOptions,
    TCreateAssetByTypeOptions,
    SchemaCreateAssetOptions,
    TCreateAssetOptions,
    SchemaUUIDResult,
    SchemaPathResult,
    SchemaUrlResult,
    TUUIDResult,
    TPathResult,
    TUrlResult,
    SchemaQueryAssetType,
    SchemaFilterPluginOptions,
    SchemaPluginScriptInfo,
    SchemaAssetMoveOptions,
    SchemaAssetRenameOptions,
    SchemaUserDataHandler,
    TQueryAssetType,
    TFilterPluginOptions,
    TPluginScriptInfo,
    TAssetMoveOptions,
    TAssetRenameOptions,
    TUserDataHandler,
    SchemaUpdateAssetUserDataPath,
    SchemaUpdateAssetUserDataValue,
    SchemaUpdateAssetUserDataResult,
    TUpdateAssetUserDataPath,
    TUpdateAssetUserDataValue,
    TUpdateAssetUserDataResult,
    SchemaAssetConfigMapResult,
    TAssetConfigMapResult,
    TUUIDOrPath,
    TUrlOrUUID,
    TUrlOrPath,
} from './schema';
import { z } from 'zod';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/schema-base';
import { assetDBManager, assetManager } from '../../core/assets';
import { IAssetInfo } from '../../core/assets/@types/public';
import { SchemaUrlOrPath, SchemaUrlOrUUID, SchemaUUIDOrPath } from '../base/schema-identifier';

export class AssetsApi {

    /**
     * Delete Asset // 删除资源
     */
    @tool('assets-delete-asset')
    @title('Delete Project Asset') // 删除项目资源
    @description('Delete specified asset files from the Cocos Creator project. Supports deleting single files or entire directories. Deleted assets will be removed from the asset database, and corresponding .meta files will also be deleted. The deletion operation is irreversible, please use with caution.') // 从 Cocos Creator 项目中删除指定的资源文件。支持删除单个文件或整个目录。删除的资源会从资源数据库中移除，同时删除对应的 .meta 文件。删除操作不可逆，请谨慎使用。
    @result(SchemaDbDirResult)
    async deleteAsset(@param(SchemaDirOrDbPath) dbPath: TDirOrDbPath): Promise<CommonResultType<TDbDirResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TDbDirResult> = {
            code: code,
            data: { dbPath },
        };

        try {
            await assetManager.removeAsset(dbPath);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('remove asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Refresh Asset Directory // 刷新资源目录
     */
    @tool('assets-refresh')
    @title('Refresh Asset Directory') // 刷新资源目录
    @description('Refresh the specified asset directory in the Cocos Creator project, rescan all asset files in the directory, and update the asset database index. This method needs to be called to synchronize the asset status when asset files are modified externally or new files are added.') // 刷新 Cocos Creator 项目中的指定资源目录，重新扫描目录下的所有资源文件，更新资源数据库索引。当外部修改了资源文件或添加了新文件时，需要调用此方法同步资源状态。
    @result(SchemaRefreshDirResult)
    async refresh(@param(SchemaDirOrDbPath) dir: TDirOrDbPath): Promise<CommonResultType<TRefreshDirResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TRefreshDirResult> = {
            code: code,
            data: null,
        };

        try {
            await assetManager.refreshAsset(dir);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('refresh dir fail:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset Info // 查询资源信息
     */
    @tool('assets-query-asset-info')
    @title('Query Detailed Asset Info') // 查询资源详细信息
    @description('Query detailed information of an asset based on its URL, UUID, or file path. You can specify the fields to query via the dataKeys parameter to optimize performance. Returned information includes asset name, type, path, UUID, import status, etc.') // 根据资源的 URL、UUID 或文件路径查询资源的详细信息。可以通过 dataKeys 参数指定需要查询的字段，以优化性能。返回的信息包括资源名称、类型、路径、UUID、导入状态等。
    @result(SchemaAssetInfoResult)
    async queryAssetInfo(
        @param(SchemaUrlOrUUIDOrPath) urlOrUUIDOrPath: TUrlOrUUIDOrPath,
        @param(SchemaDataKeys) dataKeys?: TDataKeys
    ): Promise<CommonResultType<TAssetInfoResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetInfoResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.queryAssetInfo(urlOrUUIDOrPath, dataKeys as (keyof IAssetInfo)[] | undefined);
            if (!ret.data) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = `❌Asset can not be found: ${urlOrUUIDOrPath}`;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset info fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset Metadata // 查询资源元数据
     */
    @tool('assets-query-asset-meta')
    @title('Query Asset Metadata') // 查询资源元数据
    @description('Query the content of the .meta file of an asset based on its URL, UUID, or file path. Metadata includes asset import configuration, user-defined data, version information, etc.') // 根据资源的 URL、UUID 或文件路径查询资源的 .meta 文件内容。元数据包含资源的导入配置、用户自定义数据、版本信息等。
    @result(SchemaAssetMetaResult)
    async queryAssetMeta(@param(SchemaUrlOrUUIDOrPath) urlOrUUIDOrPath: TUrlOrUUIDOrPath): Promise<CommonResultType<TAssetMetaResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetMetaResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.queryAssetMeta(urlOrUUIDOrPath);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset meta fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Creatable Asset Map // 查询可创建资源映射表
     */
    @tool('assets-query-create-map')
    @title('Query Creatable Asset Map') // 查询可创建资源映射表
    @description('Get the mapping table of all supported creatable asset types. The returned mapping table contains asset handler names, corresponding engine types, creation menu information, etc., used to understand which types of assets the system supports creating.') // 获取所有支持创建的资源类型映射表。返回的映射表包含资源处理器名称、对应的引擎类型、创建菜单信息等，用于了解系统支持创建哪些类型的资源。
    @result(SchemaCreateMapResult)
    async queryCreateMap(): Promise<CommonResultType<TCreateMapResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TCreateMapResult> = {
            code: code,
            data: [],
        };

        try {
            ret.data = await assetManager.getCreateMap();
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query create map fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Batch Query Asset Info // 批量查询资源信息
     */
    @tool('assets-query-asset-infos')
    @title('Batch Query Asset Info') // 批量查询资源信息
    @description('Batch retrieve asset information based on query conditions. Supports filtering by asset type, importer, path pattern, extension, userData, etc. Can be used for asset list display, batch processing, and other scenarios.') // 根据查询条件批量获取资源信息。支持按资源类型、导入器、路径模式、扩展名、userData 等条件筛选。可用于资源列表展示、批量处理等场景。
    @result(SchemaAssetInfosResult)
    async queryAssetInfos(@param(SchemaQueryAssetsOption) options?: TQueryAssetsOption): Promise<CommonResultType<TAssetInfosResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetInfosResult> = {
            code: code,
            data: [],
        };

        try {
            ret.data = await assetManager.queryAssetInfos(options);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset infos fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query All Asset Database Info // 查询所有资源数据库信息
     */
    // @tool('assets-query-asset-db-infos')
    @title('Query All Asset Database Info') // 查询所有资源数据库信息
    @description('Get information about all asset databases in the project, including the built-in database (internal), asset database (assets), etc. Returns database configuration, path, options, and other information.') // 获取项目中所有资源数据库的信息，包括内置数据库（internal）、资源数据库（assets）等。返回数据库的配置、路径、选项等信息。
    @result(SchemaAssetDBInfosResult)
    async queryAssetDBInfos(): Promise<CommonResultType<TAssetDBInfosResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetDBInfosResult> = {
            code: code,
            data: [],
        };

        try {
            ret.data = Object.values(assetDBManager.assetDBInfo);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset db infos fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Create Asset By Type // 按类型创建资源
     */
    @tool('assets-create-asset-by-type')
    @title('Create Asset By Type') // 按类型创建资源
    @description('Create a new asset at the target path based on the specified asset handler type. Supports creating various resources such as animations, scripts, materials, scenes, prefabs, etc. You can customize file content, template name, or control whether to overwrite or automatically rename via the options parameter. If file content is not specified, the built-in default template for the corresponding type will be used.') // 根据指定的资源处理器类型在目标路径创建新资源。支持创建动画、脚本、材质、场景、预制体等各类资源。可通过 options 参数自定义文件内容、模板名称或者控制是否覆盖、自动重命名，未指定文件内容时将使用对应类型的内置默认模板创建。
    @result(SchemaCreatedAssetResult)
    async createAssetByType(
        @param(SchemaSupportCreateType) ccType: TSupportCreateType,
        @param(SchemaDirOrDbPath) dirOrUrl: TDirOrDbPath,
        @param(SchemaBaseName) baseName: TBaseName,
        @param(SchemaCreateAssetByTypeOptions) options?: TCreateAssetByTypeOptions
    ): Promise<CommonResultType<TCreatedAssetResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TCreatedAssetResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.createAssetByType(ccType, dirOrUrl, baseName, options);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error(e);
            ret.reason = e instanceof Error ? e.message + e.stack : String(e);
        }

        return ret;
    }

    @tool('assets-create-asset')
    @title('Create Asset') // 创建资源
    @description('Create asset based on actual address and file content') // 根据实际地址和文件内容创建资源
    @result(SchemaCreatedAssetResult)
    async createAsset(
        @param(SchemaCreateAssetOptions) options: TCreateAssetOptions
    ): Promise<CommonResultType<TCreatedAssetResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TCreatedAssetResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.createAsset(options);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error(e);
            ret.reason = e instanceof Error ? e.message + e.stack : String(e);
        }
        return ret;
    }

    /**
     * Import Asset // 导入资源
     */
    @tool('assets-import-asset')
    @title('Import External Asset') // 导入外部资源
    @description('Import external asset files into the project. Copy files from the source path to the target path, and automatically execute the asset import process to generate .meta files and library files. Suitable for introducing images, audio, models, and other resources from outside.') // 将外部资源文件导入到项目中。从源路径复制文件到目标路径，并自动执行资源导入流程，生成 .meta 文件和库文件。适用于从外部引入图片、音频、模型等资源。
    @result(SchemaImportedAssetResult)
    async importAsset(
        @param(SchemaSourcePath) source: TDirOrDbPath,
        @param(SchemaTargetPath) target: TDirOrDbPath,
        @param(SchemaAssetOperationOption) options?: TAssetOperationOption
    ): Promise<CommonResultType<TImportedAssetResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TImportedAssetResult> = {
            code: code,
            data: [],
        };

        try {
            ret.data = await assetManager.importAsset(source, target, options);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('import asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Reimport Asset // 重新导入资源
     */
    @tool('assets-reimport-asset')
    @title('Reimport Asset') // 重新导入资源
    @description('Force reimport of specified assets. When asset files or import configurations change, call this method to re-execute the import process and update library files and asset information. Commonly used for asset repair or refresh after configuration updates.') // 强制重新导入指定资源。当资源文件或导入配置发生变化时，调用此方法重新执行导入流程，更新库文件和资源信息。常用于资源修复或配置更新后的刷新。
    @result(SchemaReimportResult)
    async reimportAsset(@param(SchemaUrlOrUUIDOrPath) pathOrUrlOrUUID: TUrlOrUUIDOrPath): Promise<CommonResultType<TReimportResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TReimportResult> = {
            code: code,
            data: null,
        };

        try {
            const assetInfo = await assetManager.reimportAsset(pathOrUrlOrUUID);
            ret.data = assetInfo;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error(e);
            ret.reason = e instanceof Error ? e.message + e.stack : String(e);
        }

        return ret;
    }

    /**
     * Save Asset // 保存资源
     */
    @tool('assets-save-asset')
    @title('Save Asset Data') // 保存资源数据
    @description('Save the content of asset files. Used to modify the content of text-based assets (such as scripts, configuration files, scenes, etc.) and write to disk. Supports both string and Buffer data formats.') // 保存资源文件的内容。用于修改文本类资源（如脚本、配置文件、场景等）的内容并写入磁盘。支持字符串和 Buffer 两种数据格式。
    @result(SchemaSaveAssetResult)
    async saveAsset(
        @param(SchemaUrlOrUUIDOrPath) pathOrUrlOrUUID: TUrlOrUUIDOrPath,
        @param(SchemaAssetData) data: TAssetData
    ): Promise<CommonResultType<TSaveAssetResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TSaveAssetResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.saveAsset(pathOrUrlOrUUID, data);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('save asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset UUID // 查询资源 UUID
     */
    @tool('assets-query-uuid')
    @title('Query Asset UUID') // 查询资源 UUID
    @description('Query the unique identifier UUID of an asset based on its URL or file path. Supports db:// protocol paths and file system paths.') // 根据资源的 URL 或文件路径查询资源的唯一标识符 UUID。支持 db:// 协议路径和文件系统路径。
    @result(SchemaUUIDResult)
    async queryUUID(@param(SchemaUrlOrPath) urlOrPath: TUrlOrPath): Promise<CommonResultType<TUUIDResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TUUIDResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = assetManager.queryUUID(urlOrPath);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query UUID fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset Path // 查询资源路径
     */
    @tool('assets-query-path')
    @title('Query Asset File Path') // 查询资源文件路径
    @description('Query the actual path of an asset in the file system based on its URL or UUID. Returns an absolute path string.') // 根据资源的 URL 或 UUID 查询资源在文件系统中的实际路径。返回绝对路径字符串。
    @result(SchemaPathResult)
    async queryPath(@param(SchemaUrlOrUUID) urlOrUuid: TUrlOrUUID): Promise<CommonResultType<TPathResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TPathResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = assetManager.queryPath(urlOrUuid);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query path fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset URL // 查询资源 URL
     */
    @tool('assets-query-url')
    @title('Query Asset URL') // 查询资源 URL
    @description('Query the URL address of an asset in the database based on its file path or UUID. Returns a URL in db:// protocol format.') // 根据资源的文件路径或 UUID 查询资源在数据库中的 URL 地址。返回 db:// 协议格式的 URL。
    @result(SchemaUrlResult)
    async queryUrl(@param(SchemaUUIDOrPath) uuidOrPath: TUUIDOrPath): Promise<CommonResultType<TUrlResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TUrlResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = assetManager.queryUrl(uuidOrPath);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query URL fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset Dependencies // 查询资源依赖
     */
    // @tool('assets-query-asset-dependencies')
    @title('Query Asset Dependencies') // 查询资源依赖
    @description('Query the list of other assets that the specified asset depends on. Supports querying normal asset dependencies, script dependencies, or all dependencies.') // 查询指定资源所依赖的其他资源列表。支持查询普通资源依赖、脚本依赖或全部依赖。
    @result(z.array(z.string()).describe('List of dependent asset UUIDs')) // 依赖资源的 UUID 列表
    async queryAssetDependencies(
        @param(SchemaUrlOrUUID) uuidOrUrl: TUrlOrUUID,
        @param(SchemaQueryAssetType) type: TQueryAssetType = 'asset'
    ): Promise<CommonResultType<string[]>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<string[]> = {
            code: code,
            data: [],
        };

        try {
            ret.data = await assetManager.queryAssetDependencies(uuidOrUrl, type);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset dependencies fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset Users // 查询资源使用者
     */
    // @tool('assets-query-asset-users')
    @title('Query Asset Users') // 查询资源使用者
    @description('Query the list of other assets that use the specified asset. Supports querying normal asset users, script users, or all users.') // 查询使用指定资源的其他资源列表。支持查询普通资源使用者、脚本使用者或全部使用者。
    @result(z.array(z.string()).describe('List of asset UUIDs using this asset')) // 使用该资源的资源 UUID 列表
    async queryAssetUsers(
        @param(SchemaUrlOrUUID) uuidOrUrl: TUrlOrUUID,
        @param(SchemaQueryAssetType) type: TQueryAssetType = 'asset'
    ): Promise<CommonResultType<string[]>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<string[]> = {
            code: code,
            data: [],
        };

        try {
            ret.data = await assetManager.queryAssetUsers(uuidOrUrl, type);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset users fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Sorted Plugin Scripts // 查询排序后的插件脚本
     */
    // @tool('assets-query-sorted-plugins')
    @title('Query Sorted Plugin Scripts') // 查询排序后的插件脚本
    @description('Query the sorted list of all plugin scripts in the project. Supports filtering plugin scripts by platform.') // 查询项目中所有插件脚本的排序列表。支持按平台筛选插件脚本。
    @result(z.array(SchemaPluginScriptInfo).describe('List of plugin script information')) // 插件脚本信息列表
    async querySortedPlugins(
        @param(SchemaFilterPluginOptions) filterOptions: TFilterPluginOptions = {}
    ): Promise<CommonResultType<TPluginScriptInfo[]>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TPluginScriptInfo[]> = {
            code: code,
            data: [],
        };

        try {
            ret.data = assetManager.querySortedPlugins(filterOptions);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query sorted plugins fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Rename Asset // 重命名资源
     */
    @tool('assets-rename-asset')
    @title('Rename Asset') // 重命名资源
    @description('Rename the specified asset file. Supports renaming files and folders, with options to overwrite or automatically rename.') // 重命名指定的资源文件。支持重命名文件和文件夹，可选择是否覆盖或自动重命名。
    @result(SchemaAssetInfoResult)
    async renameAsset(
        @param(SchemaUrlOrUUIDOrPath) source: TDirOrDbPath,
        @param(SchemaUrlOrUUIDOrPath) target: TDirOrDbPath,
        @param(SchemaAssetRenameOptions) options: TAssetRenameOptions = {}
    ): Promise<CommonResultType<TAssetInfoResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetInfoResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.renameAsset(source, target, options);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('rename asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Move Asset // 移动资源
     */
    @tool('assets-move-asset')
    @title('Move Asset') // 移动资源
    @description('Move assets from the source location to the target location. Supports moving files and folders, with options to overwrite or automatically rename.') // 将资源从源位置移动到目标位置。支持移动文件和文件夹，可选择是否覆盖或自动重命名。
    @result(SchemaAssetInfoResult)
    async moveAsset(
        @param(SchemaUrlOrUUIDOrPath) source: TDirOrDbPath,
        @param(SchemaUrlOrUUIDOrPath) target: TDirOrDbPath,
        @param(SchemaAssetMoveOptions) options: TAssetMoveOptions = {}
    ): Promise<CommonResultType<TAssetInfoResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetInfoResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.moveAsset(source, target, options);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('move asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Update Default User Data // 更新默认用户数据
     */
    @tool('assets-update-default-user-data')
    @title('Update Default User Data') // 更新默认用户数据
    @description('Update the default user data configuration for the specified asset handler. Used to modify the default import settings for assets.') // 更新指定资源处理器的默认用户数据配置。用于修改资源的默认导入设置。
    @result(z.null().describe('Update operation result (no return value)')) // 更新操作结果（无返回值）
    async updateDefaultUserData(
        @param(SchemaUserDataHandler) handler: TUserDataHandler,
        @param(SchemaUpdateAssetUserDataPath) path: TUpdateAssetUserDataPath,
        @param(SchemaUpdateAssetUserDataValue) value: TUpdateAssetUserDataValue
    ): Promise<CommonResultType<null>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<null> = {
            code: code,
            data: null,
        };

        try {
            await assetManager.updateDefaultUserData(handler, path, value);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('update default user data fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset User Data Config // 查询资源用户数据配置
     */
    @tool('assets-query-asset-user-data-config')
    @title('Query Asset User Data Config') // 查询资源用户数据配置
    @description('Query the user data configuration information of the specified asset. Returns the asset\'s import configuration and user-defined data.') // 查询指定资源的用户数据配置信息。返回资源的导入配置和用户自定义数据。
    @result(z.any().nullable().describe('Asset user data configuration object')) // 资源用户数据配置对象
    async queryAssetUserDataConfig(
        @param(SchemaUrlOrUUIDOrPath) urlOrUuidOrPath: TUrlOrUUIDOrPath
    ): Promise<CommonResultType<any>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<any> = {
            code: code,
            data: null,
        };

        try {
            const asset = assetManager.queryAsset(urlOrUuidOrPath);
            if (asset) {
                ret.data = await assetManager.queryAssetUserDataConfig(asset);
            } else {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = `❌Asset can not be found: ${urlOrUuidOrPath}`;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset user data config fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Update Asset User Data // 更新资源用户数据
     */
    @tool('assets-update-asset-user-data')
    @title('Update Asset User Data') // 更新资源用户数据
    @description('Update the user data configuration of the specified asset. Precisely update the asset\'s user data via path and value, supporting nested path access.') // 更新指定资源的用户数据配置。通过路径和值来精确更新资源的用户数据，支持嵌套路径访问。
    @result(SchemaUpdateAssetUserDataResult)
    async updateAssetUserData(
        @param(SchemaUrlOrUUIDOrPath) urlOrUuidOrPath: TUrlOrUUIDOrPath,
        @param(SchemaUpdateAssetUserDataPath) path: TUpdateAssetUserDataPath,
        @param(SchemaUpdateAssetUserDataValue) value: TUpdateAssetUserDataValue
    ): Promise<CommonResultType<TUpdateAssetUserDataResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TUpdateAssetUserDataResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.updateUserData(urlOrUuidOrPath, path, value);
            if (!ret.data) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = `❌Asset can not be found: ${urlOrUuidOrPath}`;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('update asset user data fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset Config Map // 查询资源配置映射表
     */
    // @tool('assets-query-asset-config-map')
    @title('Query Asset Config Map') // 查询资源配置映射表
    @description('Query the basic configuration mapping table for each asset handler. Returns a mapping table containing configuration information such as asset display name, description, documentation URL, user data configuration, icon information, etc.') // 查询各个资源处理器的基本配置映射表。返回包含资源显示名称、描述、文档URL、用户数据配置、图标信息等配置信息的映射表。
    @result(SchemaAssetConfigMapResult)
    async queryAssetConfigMap(): Promise<CommonResultType<TAssetConfigMapResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetConfigMapResult> = {
            code: code,
            data: {},
        };

        try {
            ret.data = await assetManager.queryAssetConfigMap();
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query asset config map fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
