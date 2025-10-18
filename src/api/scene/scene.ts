import { ApiBase } from '../base/api-base';
import {
    SchemaScenePathOrURL,
    SchemaOpenSceneResult,
    SchemaCloseSceneResult,
    SchemaSaveSceneResult,
    SchemaCreateSceneOptions,
    SchemaCreateSceneResult,
    SchemaCurrentSceneResult,
    TUrlOrUUIDOrPath,
    TOpenSceneResult,
    TCloseSceneResult,
    TSaveSceneResult,
    TCreateSceneOptions,
    TCreateSceneResult,
    TCurrentSceneResult,
    TSoftReloadScene,
} from './schema';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { Scene, TSceneTemplateType } from '../../core/scene';

export class SceneApi extends ApiBase {

    constructor(
        private projectPath: string,
        private enginePath: string
    ) {
        super();
    }

    async init(): Promise<void> {
        // 场景 API 依赖资源数据库，确保在 AssetsApi 初始化后调用
        console.log('初始化场景 API，项目路径:', this.projectPath);
        await Scene.worker.start(this.enginePath, this.projectPath);
    }

    /**
     * 获取当前打开场景信息
     */
    @tool('scene-query-current-scene')
    @title('获取当前打开场景信息')
    @description('获取 Cocos Creator 项目中当前打开场景信息')
    @result(SchemaCurrentSceneResult)
    async queryCurrentScene(): Promise<CommonResultType<TCurrentSceneResult>> {
        try {
            const data = await Scene.queryCurrentScene();
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

    @tool('scene-open-scene')
    @title('打开场景')
    @description('打开 Cocos Creator 项目中的指定场景文件。加载场景数据到内存中，使其成为当前活动场景。只需要提供场景名称即可。')
    @result(SchemaOpenSceneResult)
    async openScene(@param(SchemaScenePathOrURL) urlOrUUIDOrPath: TUrlOrUUIDOrPath): Promise<CommonResultType<TOpenSceneResult>> {
        try {
            const data = await Scene.open({ urlOrUUIDOrPath });
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

    @tool('scene-close-scene')
    @title('关闭场景')
    @description('关闭当前活动的场景，清理场景相关的内存资源。关闭前会提示保存未保存的更改。')
    @result(SchemaCloseSceneResult)
    async closeScene(@param(SchemaScenePathOrURL) urlOrUUIDOrPath?: TUrlOrUUIDOrPath): Promise<CommonResultType<TCloseSceneResult>> {
        try {
            const data = await Scene.close({ urlOrUUIDOrPath });
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

    @tool('scene-save-scene')
    @title('保存场景')
    @description('保存当前活动场景的所有更改到磁盘。包括场景节点结构、组件数据、资源引用等信息。保存后会更新场景的 .meta 文件。')
    @result(SchemaSaveSceneResult)
    async saveScene(@param(SchemaScenePathOrURL) urlOrUUIDOrPath?: TUrlOrUUIDOrPath): Promise<CommonResultType<TSaveSceneResult>> {
        try {
            const data = await Scene.save({ urlOrUUIDOrPath });
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

    @tool('scene-create-scene')
    @title('创建场景')
    @description('在 Cocos Creator 项目中创建新的场景文件。可以选择不同的场景模板（2D、3D、高质量）。自动生成场景的 UUID 和 .meta 文件，并注册到资源数据库中。')
    @result(SchemaCreateSceneResult)
    async createScene(@param(SchemaCreateSceneOptions) options: TCreateSceneOptions): Promise<CommonResultType<TCreateSceneResult>> {
        try {
            const data = await Scene.create({
                targetPathOrURL: options.targetPathOrURL,
                templateType: options.templateType as TSceneTemplateType
            });
            return {
                code: COMMON_STATUS.SUCCESS,
                data: data,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-soft-reload-scene')
    @title('重新加载场景')
    @description('在 Cocos Creator 项目中重新加载场景')
    @result(SchemaCreateSceneResult)
    async reloadScene(@param(SchemaScenePathOrURL) urlOrUUIDOrPath: TUrlOrUUIDOrPath): Promise<CommonResultType<TSoftReloadScene>> {
        try {
            const data = await Scene.softReload({
                urlOrUUIDOrPath: urlOrUUIDOrPath,
            });
            return {
                code: COMMON_STATUS.SUCCESS,
                data: data,
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
