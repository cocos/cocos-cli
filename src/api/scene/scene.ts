import { ApiBase } from '../base/api-base';
import {
    SchemeSceneUUID,
    SchemeOpenSceneResult,
    SchemeCloseSceneResult,
    SchemeSaveSceneResult,
    SchemeCreateSceneOptions,
    SchemeCreateSceneResult,
    SchemeCurrentOpenSceneResult,
    TSceneUUID,
    TOpenSceneResult,
    TCloseSceneResult,
    TSaveSceneResult,
    TCreateSceneOptions,
    TCreateSceneResult,
    TCurrentOpenSceneResult,
} from './scheme';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/scheme-base';
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
        await Scene.worker.start(this.enginePath, this.enginePath);
    }

    /**
     * 获取当前打开场景信息
     */
    @tool('scene-getCurrentOpenScene')
    @title('获取当前打开场景信息')
    @description('获取 Cocos Creator 项目中当前打开场景信息')
    @result(SchemeCurrentOpenSceneResult)
    async getCurrentOpenScene(): Promise<CommonResultType<TCurrentOpenSceneResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TCurrentOpenSceneResult> = {
            code: code,
            data: {
                name: 'unknown',
                url: 'unknown',
                path: 'unknown',
                uuid: 'unknown',
            },
        };

        try {
            const sceneInfo = await Scene.getCurrentScene();
            if (sceneInfo) {
                ret.data.name = sceneInfo.name;
                ret.data.url = sceneInfo.url;
                ret.data.path = sceneInfo.path;
                ret.data.uuid = sceneInfo.uuid;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('获取当前打开场景失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 打开场景
     */
    @tool('scene-openScene')
    @title('打开场景')
    @description('打开 Cocos Creator 项目中的指定场景文件。加载场景数据到内存中，使其成为当前活动场景。只需要提供场景名称即可。')
    @result(SchemeOpenSceneResult)
    async openScene(@param(SchemeSceneUUID) sceneUuid: TSceneUUID): Promise<CommonResultType<TOpenSceneResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TOpenSceneResult> = {
            code: code,
            data: {
                path: 'unknown',
                uuid: 'unknown',
            },
        };

        try {
            const sceneInfo = await Scene.openScene({ uuid: sceneUuid });
            if (sceneInfo) {
                ret.data.path = sceneInfo.path;
                ret.data.uuid = sceneInfo.uuid;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('打开场景失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 关闭场景
     */
    @tool('scene-closeScene')
    @title('关闭场景')
    @description('关闭当前活动的场景，清理场景相关的内存资源。关闭前会提示保存未保存的更改。')
    @result(SchemeCloseSceneResult)
    async closeScene(): Promise<CommonResultType<TCloseSceneResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TCloseSceneResult> = {
            code: code,
            data: {
                path: 'unknown',
            },
        };

        try {
            const closedScene = await Scene.closeScene();

            if (closedScene) {
                ret.data.path = closedScene.path;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('关闭场景失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 保存场景
     */
    @tool('scene-saveScene')
    @title('保存场景')
    @description('保存当前活动场景的所有更改到磁盘。包括场景节点结构、组件数据、资源引用等信息。保存后会更新场景的 .meta 文件。')
    @result(SchemeSaveSceneResult)
    async saveScene(@param(SchemeSceneUUID) sceneUuid?: TSceneUUID): Promise<CommonResultType<TSaveSceneResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TSaveSceneResult> = {
            code: code,
            data: {
                path: 'unknown',
                uuid: 'unknown',
            },
        };

        try {
            const sceneInfo = await Scene.saveScene({ uuid: sceneUuid });
            if (sceneInfo) {
                ret.data.path = sceneInfo.path;
                ret.data.uuid = sceneInfo.uuid;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('保存场景失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 创建场景
     */
    @tool('scene-createScene')
    @title('创建场景')
    @description('在 Cocos Creator 项目中创建新的场景文件。可以选择不同的场景模板（默认、2D、3D、高质量）。自动生成场景的 UUID 和 .meta 文件，并注册到资源数据库中。')
    @result(SchemeCreateSceneResult)
    async createScene(@param(SchemeCreateSceneOptions) options: TCreateSceneOptions): Promise<CommonResultType<TCreateSceneResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret:CommonResultType<TCreateSceneResult> = {
            code: code,
            data: {
                path: 'unknown',
                url: 'unknown',
                uuid: 'unknown',
            },
        }

        try {
            const sceneInfo = await Scene.createScene({
                targetPathOrURL: options.targetPathOrURL,
                templateType: options.templateType as TSceneTemplateType
            });
            if (sceneInfo) {
                ret.data.path = sceneInfo.path;
                ret.data.url = sceneInfo.url || '';
                ret.data.uuid = sceneInfo.uuid;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('创建场景失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
