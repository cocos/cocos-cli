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
    SchemaSaveAssetPath,
    SchemaAssetData,
    SchemaSerializedAssetPatch,
    SchemaSerializedAssetResult,
    SchemaMaterialEffectNameOrUuid,
    SchemaMaterialDump,
    SchemaMaterialEffectsResult,
    SchemaMaterialEffectResult,
    SchemaMaterialResult,
    TUrlOrUUIDOrPath,
    TSaveAssetPath,
    TDataKeys,
    TQueryAssetsOption,
    TSupportCreateType,
    TAssetOperationOption,
    TAssetData,
    TSerializedAssetPatch,
    TSerializedAssetResult,
    TMaterialEffectNameOrUuid,
    TMaterialDump,
    TMaterialEffectsResult,
    TMaterialEffectResult,
    TMaterialResult,
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
    SchemaAssetNewName,
    TBaseName,
    TAssetNewName,
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
    SchemaUpdateAssetUserData,
    SchemaUpdateAssetUserDataPath,
    SchemaUpdateAssetUserDataValue,
    SchemaUpdateAssetUserDataResult,
    TUpdateAssetUserData,
    TUpdateAssetUserDataPath,
    TUpdateAssetUserDataValue,
    TUpdateAssetUserDataResult,
    SchemaAssetConfigMapResult,
    TAssetConfigMapResult,
    SchemaAssetPropertySchemaResult,
    TAssetPropertySchemaResult,
    TUUIDOrPath,
    TUrlOrUUID,
    TUrlOrPath,
    SchemaAnimationGraphVariantDump,
    SchemaAnimationGraphVariantResult,
    SchemaAnimationGraphVariantSaveResult,
    TAnimationGraphVariantDump,
    TAnimationGraphVariantResult,
    TAnimationGraphVariantSaveResult,
    SchemaAnimationMaskDump,
    SchemaAnimationMaskChanges,
    SchemaVoidResult,
    TAnimationMaskDump,
    TAnimationMaskChanges,
    TVoidResult,
} from './schema';
import { z } from 'zod';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, getCommonErrorStatus, HttpStatusCode } from '../base/schema-base';
import { assetDBManager, assetManager } from '../../core/assets';
import { IAssetInfo } from '../../core/assets/@types/public';
import { SchemaUrlOrPath, SchemaUrlOrUUID, SchemaUUIDOrPath } from '../base/schema-identifier';
import {
    changeAnimationMaskDump as changeAnimationMaskDumpCore,
    clearAnimationMaskNodes as clearAnimationMaskNodesCore,
    importAnimationMaskSkeleton as importAnimationMaskSkeletonCore,
    queryAnimationMask as queryAnimationMaskCore,
    saveAnimationMask as saveAnimationMaskCore,
} from '../../core/assets/animation-mask';

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
            ret.code = getCommonErrorStatus(e);
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
    @description('Query detailed asset information by URL, UUID, or file path. By default the result includes subAssets; use each sub-asset type (for example type === "cc.SpriteFrame") to select the UUID required by a component property. Specify dataKeys, including "subAssets" and "extends", when an explicit field list is needed.') // 根据 URL、UUID 或文件路径查询资源详情；默认包含子资源，可按 type 选择组件属性所需的子资源 UUID
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
                ret.code = COMMON_STATUS.NOT_FOUND;
                ret.reason = `❌Asset can not be found: ${urlOrUUIDOrPath}. Please refresh asset db and try again.`;
            }
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
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
            if (!ret.data) {
                ret.code = COMMON_STATUS.NOT_FOUND;
                ret.reason = `Asset not found: ${urlOrUUIDOrPath}`;
            }
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
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
    // @tool('assets-query-asset-infos')
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
            ret.code = getCommonErrorStatus(e);
            console.error(e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-create-asset')
    @title('Create Asset') // 创建资源
    @description('Create a Cocos asset from file content or a template. Set options.target to an asset-db URL such as db://assets/scripts/GameManager.ts, or to an absolute file path inside an asset database root. Do not pass a web URL or a plain relative path as target.') // 根据文件内容或模板创建 Cocos 资源。options.target 使用 db://assets/scripts/GameManager.ts 这类 asset-db URL，或位于资源数据库根目录内的绝对路径；不要传 Web URL 或普通相对路径。
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
            ret.code = getCommonErrorStatus(e);
            console.error(e);
            ret.reason = e instanceof Error ? e.message : String(e);
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
            ret.code = getCommonErrorStatus(e);
            console.error('import asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Copy Asset // 复制资源
     */
    @tool('assets-copy-asset')
    @title('Copy Asset') // 复制资源
    @description('Copy an existing main asset to a new location together with its complete metadata. The copied asset receives new UUIDs while preserving importer settings, userData, subMetas, and internal references. Supports overwrite or automatic rename on conflicts.') // 将现有主资源及其完整元数据复制到新位置。副本会获得新 UUID，同时保留导入设置、userData、subMetas 和内部引用。支持冲突时覆盖或自动重命名。
    @result(SchemaAssetInfoResult)
    async copyAsset(
        @param(SchemaUrlOrUUIDOrPath) source: TUrlOrUUIDOrPath,
        @param(SchemaTargetPath) target: TDirOrDbPath,
        @param(SchemaAssetOperationOption) options?: TAssetOperationOption
    ): Promise<CommonResultType<TAssetInfoResult>> {
        const ret: CommonResultType<TAssetInfoResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            ret.data = await assetManager.copyAsset(source, target, options);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('copy asset fail:', e instanceof Error ? e.message : String(e));
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
            ret.code = getCommonErrorStatus(e);
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
    @description('Save complete content to an existing asset file. Required arguments: pathOrUrlOrUUID (existing asset URL, UUID, or file path) and data (complete file content). Do not call this tool with empty arguments. This tool does not create new assets or temporary files; create the asset first with assets-create-asset-by-type or assets-create-asset, then call save. For scripts, pass complete syntactically valid content. For scene and prefab assets, pass complete valid Cocos serialized JSON; prefer scene-* tools and scene-save for scene graph edits.')
    @result(SchemaSaveAssetResult)
    async saveAsset(
        @param(SchemaSaveAssetPath) pathOrUrlOrUUID: TSaveAssetPath,
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
            ret.code = getCommonErrorStatus(e);
            console.error('save asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-animation-mask-query')
    @title('Query Animation Mask')
    @description('Query a .animask AnimationMask asset and return a stable DTO containing joint paths, enabled states, and tree structure. This tool does not expose Creator inspector reflection dump.')
    @result(SchemaAnimationMaskDump)
    async queryAnimationMask(@param(SchemaUrlOrUUIDOrPath) uuid: TUrlOrUUIDOrPath): Promise<CommonResultType<TAnimationMaskDump | null>> {
        const ret: CommonResultType<TAnimationMaskDump | null> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            ret.data = await queryAnimationMaskCore(uuid);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('query animation mask fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-animation-mask-import-skeleton')
    @title('Import Animation Mask Skeleton')
    @description('Import joint paths from a Prefab or glTF-scene asset into an AnimationMask. Existing joint states are preserved and missing paths are appended as enabled. Pass the glTF-scene sub-asset UUID when possible.')
    @result(SchemaAnimationMaskDump)
    async importAnimationMaskSkeleton(
        @param(SchemaUrlOrUUIDOrPath) uuid: TUrlOrUUIDOrPath,
        @param(SchemaUrlOrUUIDOrPath) skeletonSourceUuid: TUrlOrUUIDOrPath
    ): Promise<CommonResultType<TAnimationMaskDump | null>> {
        const ret: CommonResultType<TAnimationMaskDump | null> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            ret.data = await importAnimationMaskSkeletonCore(uuid, skeletonSourceUuid);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('import animation mask skeleton fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-animation-mask-clear-nodes')
    @title('Clear Animation Mask Nodes')
    @description('Clear all joint paths from an AnimationMask asset and return the updated stable DTO.')
    @result(SchemaAnimationMaskDump)
    async clearAnimationMaskNodes(@param(SchemaUrlOrUUIDOrPath) uuid: TUrlOrUUIDOrPath): Promise<CommonResultType<TAnimationMaskDump | null>> {
        const ret: CommonResultType<TAnimationMaskDump | null> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            ret.data = await clearAnimationMaskNodesCore(uuid);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('clear animation mask nodes fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-animation-mask-change-dump')
    @title('Change Animation Mask Dump')
    @description('Apply path-based changes to an AnimationMask stable DTO. recursive defaults to false; pass recursive=true to update descendant paths.')
    @result(SchemaAnimationMaskDump)
    async changeAnimationMaskDump(
        @param(SchemaUrlOrUUIDOrPath) uuid: TUrlOrUUIDOrPath,
        @param(SchemaAnimationMaskChanges) changes: TAnimationMaskChanges
    ): Promise<CommonResultType<TAnimationMaskDump | null>> {
        const ret: CommonResultType<TAnimationMaskDump | null> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            ret.data = await changeAnimationMaskDumpCore(uuid, changes);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('change animation mask dump fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-animation-mask-save')
    @title('Save Animation Mask')
    @description('Normalize and save the current AnimationMask asset content, then reimport the asset.')
    @result(SchemaVoidResult)
    async saveAnimationMask(@param(SchemaUrlOrUUIDOrPath) uuid: TUrlOrUUIDOrPath): Promise<CommonResultType<TVoidResult>> {
        const ret: CommonResultType<TVoidResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            await saveAnimationMaskCore(uuid);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('save animation mask fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query All Material Effects // 查询所有材质 Effect
     */
    @tool('assets-material-query-all-effects')
    @title('Query Material Effects')
    @description('Query all available cc.EffectAsset entries for assets.material.queryAllEffects. Returns effect UUID, name, hideInEditor flag, and asset path. Use UUID as the stable key when building material effect selectors.')
    @result(SchemaMaterialEffectsResult)
    async queryMaterialAllEffects(): Promise<CommonResultType<TMaterialEffectsResult>> {
        const ret: CommonResultType<TMaterialEffectsResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: {},
        };

        try {
            ret.data = await assetManager.queryMaterialAllEffects();
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('query material effects fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Material Effect // 查询单个材质 Effect
     */
    @tool('assets-material-query-effect')
    @title('Query Material Effect')
    @description('Query one material Effect by UUID, asset URL/path, or effect name. Returns Creator-compatible technique/pass/property dump data for generating the material inspector UI.')
    @result(SchemaMaterialEffectResult)
    async queryMaterialEffect(
        @param(SchemaMaterialEffectNameOrUuid) effectNameOrUuid: TMaterialEffectNameOrUuid
    ): Promise<CommonResultType<TMaterialEffectResult>> {
        const ret: CommonResultType<TMaterialEffectResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: [],
        };

        try {
            ret.data = await assetManager.queryMaterialEffect(effectNameOrUuid);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('query material effect fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Material // 查询材质
     */
    @tool('assets-material-query')
    @title('Query Material')
    @description('Query a cc.Material asset and return Creator-compatible material dump data. The dump merges effect defaults with values saved in the .mtl file and can be used as the input for assets-material-save.')
    @result(SchemaMaterialResult)
    async queryMaterial(
        @param(SchemaUrlOrUUIDOrPath) uuidOrUrlOrPath: TUrlOrUUIDOrPath
    ): Promise<CommonResultType<TMaterialResult | null>> {
        const ret: CommonResultType<TMaterialResult | null> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            ret.data = await assetManager.queryMaterial(uuidOrUrlOrPath);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('query material fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Save Material // 保存材质
     */
    @tool('assets-material-save')
    @title('Save Material')
    @description('Save Creator-compatible material dump data to a cc.Material asset. The implementation writes only modified values, then reimports through AssetDB to keep the database state consistent.')
    @result(SchemaVoidResult)
    async saveMaterial(
        @param(SchemaUrlOrUUIDOrPath) uuidOrUrlOrPath: TUrlOrUUIDOrPath,
        @param(SchemaMaterialDump) dump: TMaterialDump
    ): Promise<CommonResultType<TVoidResult>> {
        const ret: CommonResultType<TVoidResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            await assetManager.saveMaterial(uuidOrUrlOrPath, dump as any);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('save material fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Serialized Asset Data // 查询序列化资源属性数据
     */
    @tool('assets-query-serialized-data')
    @title('Query Serialized Asset Data')
    @description('Query Creator-compatible serialized asset dump data through assets.serializedData.query. Supports only cc.PhysicsMaterial and cc.RenderPipeline in the first batch. The returned dump is the raw IProperty structure consumed by ui-prop type="dump": PhysicsMaterial returns a property map, while RenderPipeline returns one top-level IProperty.')
    @result(SchemaSerializedAssetResult)
    async querySerializedData(
        @param(SchemaUrlOrUUIDOrPath) uuidOrUrlOrPath: TUrlOrUUIDOrPath
    ): Promise<CommonResultType<TSerializedAssetResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TSerializedAssetResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.querySerializedData(uuidOrUrlOrPath);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('query serialized asset data fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Save Serialized Asset Data // 保存序列化资源属性数据
     */
    @tool('assets-save-serialized-data')
    @title('Save Serialized Asset Data')
    @description('Save Creator-compatible serialized asset dump data through assets.serializedData.save. Supports only cc.PhysicsMaterial and cc.RenderPipeline in the first batch. Prefer passing an IProperty or full dump patch returned by assets-query-serialized-data; unknown fields are rejected, and hidden or readonly fields can only pass through unchanged.')
    @result(SchemaSerializedAssetResult)
    async saveSerializedData(
        @param(SchemaUrlOrUUIDOrPath) uuidOrUrlOrPath: TUrlOrUUIDOrPath,
        @param(SchemaSerializedAssetPatch) patch: TSerializedAssetPatch
    ): Promise<CommonResultType<TSerializedAssetResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TSerializedAssetResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.saveSerializedData(uuidOrUrlOrPath, patch);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('save serialized asset data fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Animation Graph Variant
     */
    @tool('assets-animation-graph-variant-query')
    @title('Query Animation Graph Variant')
    @description('Load an AnimationGraphVariant asset and return its referenced graph UUID, valid clip override rows, and invalid saved override entries.')
    @result(SchemaAnimationGraphVariantResult)
    async queryAnimationGraphVariant(
        @param(SchemaUrlOrUUID) uuid: TUrlOrUUID
    ): Promise<CommonResultType<TAnimationGraphVariantResult>> {
        const ret: CommonResultType<TAnimationGraphVariantResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };

        try {
            ret.data = await assetManager.queryAnimationGraphVariant(uuid);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('query animation graph variant fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-animation-graph-variant-change')
    @title('Change Animation Graph Variant')
    @description('Update the pending AnimationGraphVariant edit. Changing graphUuid rebuilds the original clip list from the new graph; otherwise clips updates override mappings.')
    @result(SchemaAnimationGraphVariantResult)
    async changeAnimationGraphVariant(
        @param(SchemaUrlOrUUID) uuid: TUrlOrUUID,
        @param(SchemaAnimationGraphVariantDump) dump: TAnimationGraphVariantDump
    ): Promise<CommonResultType<TAnimationGraphVariantResult>> {
        const ret: CommonResultType<TAnimationGraphVariantResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };

        try {
            ret.data = await assetManager.changeAnimationGraphVariant(uuid, dump);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('change animation graph variant fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-animation-graph-variant-save')
    @title('Save Animation Graph Variant')
    @description('Save the pending AnimationGraphVariant edit created by query/change. This method takes only the asset UUID and writes the cached pending dump.')
    @result(SchemaAnimationGraphVariantSaveResult)
    async saveAnimationGraphVariant(
        @param(SchemaUrlOrUUID) uuid: TUrlOrUUID
    ): Promise<CommonResultType<TAnimationGraphVariantSaveResult>> {
        const ret: CommonResultType<TAnimationGraphVariantSaveResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: null,
        };

        try {
            await assetManager.saveAnimationGraphVariant(uuid);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('save animation graph variant fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Query Asset UUID // 查询资源 UUID
     */
    @tool('assets-query-uuid')
    @title('Query Asset UUID') // 查询资源 UUID
    @description('Query the UUID of the exact asset addressed by a URL or file path. This does not automatically choose a typed sub-asset: querying an image URL returns its parent ImageAsset UUID. Use assets-query-asset-info and inspect subAssets when a component requires cc.SpriteFrame or another specific Asset type.') // 查询 URL 或路径直接指向资源的 UUID；不会自动选择 SpriteFrame 等子资源
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
    @description('Query the actual path of an asset in the file system based on its URL, UUID, or asset-db relative path such as assets/resources/Image/a.png. Returns an absolute path string.') // 根据资源的 URL、UUID 或 asset-db 相对路径查询资源在文件系统中的实际路径。返回绝对路径字符串。
    @result(SchemaPathResult)
    async queryPath(@param(SchemaUrlOrUUIDOrPath) urlOrUuid: TUrlOrUUIDOrPath): Promise<CommonResultType<TPathResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TPathResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = assetManager.queryPath(urlOrUuid);
            if (!ret.data) {
                ret.code = COMMON_STATUS.NOT_FOUND;
                ret.data = null;
                ret.reason = `Asset path can not be found: ${urlOrUuid}. Please refresh asset db and try again.`;
            }
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
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
            if (!ret.data) {
                ret.code = COMMON_STATUS.NOT_FOUND;
                ret.data = null;
                ret.reason = `Asset URL can not be found: ${uuidOrPath}. Please refresh asset db and try again.`;
            }
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
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
    @description('Rename the specified asset in its current directory. The source can be a URL, UUID, or path. The newName parameter only changes the asset name and does not move it across directories; use moveAsset for moving. For file assets, include the extension in newName. Supports overwrite or automatic rename on conflicts.') // 在资源当前目录内重命名指定资源。source 支持 URL、UUID 或路径。newName 仅修改名称，不负责跨目录移动；如需移动请使用 moveAsset。文件资源请在 newName 中包含后缀名。支持冲突时覆盖或自动重命名。
    @result(SchemaAssetInfoResult)
    async renameAsset(
        @param(SchemaUrlOrUUIDOrPath) source: TUrlOrUUIDOrPath,
        @param(SchemaAssetNewName) newName: TAssetNewName,
        @param(SchemaAssetRenameOptions) options: TAssetRenameOptions = {}
    ): Promise<CommonResultType<TAssetInfoResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetInfoResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.renameAsset(source, newName, options);
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
                ret.code = COMMON_STATUS.NOT_FOUND;
                ret.reason = `❌Asset can not be found: ${urlOrUuidOrPath}`;
            }
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
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
    @description('Replace the complete userData object of the specified asset in one save. urlOrUuidOrPath accepts an asset URL, UUID, file path, or sub asset UUID in parentUuid@subMetaId format.') // 一次性整体替换指定资源的 userData，支持父资源与 parentUuid@subMetaId 子资源 UUID。
    @result(SchemaUpdateAssetUserDataResult)
    async updateAssetUserData(
        @param(SchemaUrlOrUUIDOrPath) urlOrUuidOrPath: TUrlOrUUIDOrPath,
        @param(SchemaUpdateAssetUserData) userData: TUpdateAssetUserData
    ): Promise<CommonResultType<TUpdateAssetUserDataResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TUpdateAssetUserDataResult> = {
            code: code,
            data: null,
        };

        try {
            ret.data = await assetManager.updateUserData(urlOrUuidOrPath, userData);
            if (!ret.data) {
                ret.code = COMMON_STATUS.NOT_FOUND;
                ret.reason = `❌Asset can not be found: ${urlOrUuidOrPath}. Please refresh asset db and try again.`;
            }
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('update asset user data fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * Update Asset User Data By Path // 按路径更新资源用户数据
     */
    @tool('assets-update-asset-user-data-by-path')
    @title('Update Asset User Data By Path') // 按路径更新资源用户数据
    @description('Update a single path in the userData of the specified asset. urlOrUuidOrPath accepts an asset URL, UUID, file path, or sub asset UUID in parentUuid@subMetaId format.') // 通过路径和值精确更新指定资源 userData 的单个字段，支持父资源与 parentUuid@subMetaId 子资源 UUID。
    @result(SchemaUpdateAssetUserDataResult)
    async updateAssetUserDataByPath(
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
            ret.data = await assetManager.updateUserDataByPath(urlOrUuidOrPath, path, value);
            if (!ret.data) {
                ret.code = COMMON_STATUS.NOT_FOUND;
                ret.reason = `❌Asset can not be found: ${urlOrUuidOrPath}. Please refresh asset db and try again.`;
            }
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('update asset user data by path fail:', e instanceof Error ? e.message : String(e));
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

    /**
     * Query Asset Property Schema // 查询资源导入属性 schema
     */
    @tool('assets-query-property-schema')
    @title('Query Asset Import Property Schema') // 查询资源导入属性 schema
    @description('Query the import property schema map for a specific asset importer. The result value follows ICocosConfigurationPropertySchema, using fields such as title, type, default, enum, enumDescriptions, minimum, maximum, step, properties, and items.') // 查询指定资源导入器的标准化导入属性 schema，用于面板自动渲染导入设置。
    @result(SchemaAssetPropertySchemaResult)
    async queryPropertySchema(
        @param(SchemaUserDataHandler) importer: TUserDataHandler
    ): Promise<CommonResultType<TAssetPropertySchemaResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TAssetPropertySchemaResult> = {
            code: code,
            data: {},
        };

        try {
            ret.data = await assetManager.queryPropertySchema(importer);
        } catch (e) {
            ret.code = getCommonErrorStatus(e);
            console.error('query asset property schema fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
