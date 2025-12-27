import {
    SchemaCloseResult,
    SchemaCreateOptions,
    SchemaCreateResult,
    SchemaCurrentResult,
    SchemaOpenResult,
    SchemaReload,
    SchemaSaveResult,
    TAssetUrlOrUUID,
    TCloseResult,
    TCreateOptions,
    TCreateResult,
    TCurrentResult,
    TOpenResult,
    TReload,
    TSaveResult,
} from './schema';
import { SchemaAssetUrlOrUUID } from '../base/schema-identifier';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { Scene, TSceneTemplateType } from '../../core/scene';
import { ComponentApi } from './component';
import { NodeApi } from './node';
import { PrefabApi } from './prefab';

export class SceneApi {
    public component: ComponentApi;
    public node: NodeApi;
    public prefab: PrefabApi;

    constructor() {
        this.component = new ComponentApi();
        this.node = new NodeApi();
        this.prefab = new PrefabApi();
    }

    @tool('scene-query-current')
    @title('Get current opened scene/prefab info') // 获取当前打开的场景/预制体信息
    @description('Get current opened scene/prefab info, return null if none opened') // 获取当前打开场景/预制体信息，如果没有打开，返回 null
    @result(SchemaCurrentResult)
    async queryCurrent(): Promise<CommonResultType<TCurrentResult>> {
        try {
            const data = await Scene.queryCurrent();
            return {
                data: data as TCurrentResult,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) { 
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-open')
    @title('Open scene/prefab') // 打开场景/预制体
    @description('Open specified scene/prefab asset.') // 打开指定场景/预制体资源。
    @result(SchemaOpenResult)
    async open(@param(SchemaAssetUrlOrUUID) dbURLOrUUID: TAssetUrlOrUUID): Promise<CommonResultType<TOpenResult>> {
        try {
            const data = await Scene.open({ urlOrUUID: dbURLOrUUID });
            return {
                data: data as TOpenResult,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-close')
    @title('Close scene/prefab') // 关闭场景/预制体
    @description('Close current opened scene/prefab.') // 关闭当前打开的场景/预制体。
    @result(SchemaCloseResult)
    async close(): Promise<CommonResultType<TCloseResult>> {
        try {
            const data = await Scene.close({});
            return {
                data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-save')
    @title('Save scene/prefab') // 保存场景/预制体
    @description('Save current opened scene/prefab to asset, including scene node structure, component data, asset references etc. Will update .meta file after save.') // 保存当前打开的场景/预制体到资源，包括场景节点结构、组件数据、资源引用等信息。保存后会更新场景的 .meta 文件。
    @result(SchemaSaveResult)
    async save(): Promise<CommonResultType<TSaveResult>> {
        try {
            const data = await Scene.save({});
            return {
                data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-create')
    @title('Create scene') // 创建场景
    @description('Create new scene asset in project') // 在项目中创建新的场景资源
    @result(SchemaCreateResult)
    async createScene(@param(SchemaCreateOptions) options: TCreateOptions): Promise<CommonResultType<TCreateResult>> {
        try {
            const data = await Scene.create({
                type: 'scene',
                baseName: options.baseName,
                targetDirectory: options.dbURL,
                templateType: options.templateType as TSceneTemplateType,
            });
            
            return {
                code: COMMON_STATUS.SUCCESS,
                data: data as TCreateResult,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-reload')
    @title('Reload scene/prefab') // 重新加载场景/预制体
    @description('Reload scene/prefab') // 重新加载场景/预制体
    @result(SchemaReload)
    async reloadScene(): Promise<CommonResultType<TReload>> {
        try {
            const data = await Scene.reload({});
            return {
                code: COMMON_STATUS.SUCCESS,
                data: data as TReload,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }
}
