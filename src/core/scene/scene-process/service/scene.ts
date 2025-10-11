import cc from 'cc';
import { register, expose } from './decorator';
import {
    ISceneService,
    ISceneInfo,
    TSceneTemplateType,
    ICreateSceneOptions,
    IOpenSceneOptions,
    ISaveSceneOptions,
} from '../../common';
import { Rpc } from '../rpc';

/**
 * 场景进程处理器
 * 处理所有场景相关操作
 */
@register('Scene')
export class SceneService implements ISceneService {
    private currentScene: ISceneInfo | null = null;

    @expose()
    async openScene(params: IOpenSceneOptions): Promise<ISceneInfo> {
        const { uuid } = params;
        return new Promise<ISceneInfo>(async (resolve, reject) => {
            // 查询场景资源信息
            const assetInfo = await Rpc.request('assetManager', 'queryAssetInfo', [uuid]);
            if (!assetInfo) {
                reject(`场景资源不存在: ${uuid}`);
                return;
            }

            if (!assetInfo.type.includes('SceneAsset')) {
                reject(`指定路径不是有效的场景资源: ${assetInfo.url}`);
                return;
            }

            try {
                await this.closeScene();
            } catch (error) {
                reject(error);
                return;
            }

            cc.assetManager.loadAny(uuid, (err: Error | null, sceneAsset: cc.SceneAsset) => {
                if (err) {
                    reject(err);
                    return;
                }

                cc.director.runSceneImmediate(sceneAsset);

                // 创建场景信息
                const sceneInfo: ISceneInfo = {
                    path: assetInfo.source,
                    uuid: assetInfo.uuid,
                    url: assetInfo.url,
                    name: assetInfo.name || ''
                };

                // 设置为当前场景
                this.currentScene = sceneInfo;
                resolve(sceneInfo);
                console.log(`[Scene] 场景进程成功打开场景: ${sceneInfo.path}`);
            });
        });
    }

    @expose()
    async closeScene(): Promise<ISceneInfo | null> {
        const closedScene = this.currentScene;
        
        if (closedScene) {
            console.log(`[Scene] 关闭场景: ${closedScene.path}`);
        }

        // 清理当前场景
        this.currentScene = null;
        
        return closedScene;
    }

    @expose()
    async saveScene(params: ISaveSceneOptions): Promise<ISceneInfo> {
        const uuid = params.uuid ?? this.currentScene?.uuid;
        if (!uuid) {
            throw new Error('[Scene] 保存失败，当前没有打开的场景');
        }

        let assetInfo = await Rpc.request('assetManager', 'queryAssetInfo', [uuid]);
        if (!assetInfo) {
            throw new Error(`[Scene] 场景资源不存在: ${uuid}`);
        }

        const scene = cc.director.getScene();
        if (!scene) {
            throw new Error(`[Scene] 获取不到当前场景实例`);
        }

        const sceneAsset = new cc.SceneAsset();
        sceneAsset.scene = scene;

        const json = EditorExtends.serialize(assetInfo);

        try {
            assetInfo = await Rpc.request('assetManager', 'saveAsset', [uuid, json]);
        } catch (e) {
            throw e;
        }

        const sceneInfo: ISceneInfo = {
            path: assetInfo.source,
            url: assetInfo.url,
            uuid: assetInfo.uuid,
            name: assetInfo.name
        };

        console.log(`[Scene] 成功保存场景: ${sceneInfo.path}`);
        return sceneInfo;
    }

    @expose()
    async createScene(params: ICreateSceneOptions): Promise<ISceneInfo> {
        // 获取场景模板 url
        const template = this.getSceneTemplateURL(params.templateType || 'default');

        // 创建场景资源
        const result = await Rpc.request('assetManager', 'createAsset', [{
            template: template,
            target: params.targetPathOrURL,
            overwrite: true
        }]);

        const assetResult = Array.isArray(result) ? result[0] : result;
        if (!assetResult) {
            throw new Error(`创建场景资源失败\n${params}`);
        }


        const sceneInfo: ISceneInfo = {
            path: assetResult!.source,
            uuid: assetResult!.uuid,
            url: assetResult!.url,
            name: assetResult!.name
        };

        console.log(`成功创建场景: ${sceneInfo.path}`);
        return sceneInfo;
    }

    @expose()
    async getCurrentScene(): Promise<ISceneInfo | null> {
        return this.currentScene;
    }

    /**
     * 获取场景模板数据
     */
    private getSceneTemplateURL(templateType: TSceneTemplateType): string {
        // 根据模板类型确定模板路径
        const templateDir = 'db://internal/default_file_content/scene';
        let templatePath = `${templateDir}/default.scene`;
        
        switch (templateType) {
            case '2d':
                templatePath = `${templateDir}/scene-2d.scene`;
                break;
            case '3d':
                templatePath = `${templateDir}/default.scene`;
                break;
            case 'quality':
                templatePath = `${templateDir}/scene-quality.scene`;
                break;
            default:
                templatePath = `${templateDir}/default.scene`;
        }
        return templatePath;
    }
}
