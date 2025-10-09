import cc, { SceneAsset } from 'cc';
import { join } from 'path';
import assetOperation from '../../../assets/manager/operation';
import assetQueryManager from '../../../assets/manager/query';
import { assetManager } from '../../../assets/manager/asset';
import {
    ISceneManager,
    ISceneInfo,
    TSceneTemplateType,
    ICreateSceneOptions,
    IOpenSceneOptions,
    ISaveSceneOptions,
} from '../../interfaces';

/**
 * 子进程场景处理器
 * 在子进程中处理所有场景相关操作
 */
export class SceneManager implements ISceneManager {
    private currentScene: ISceneInfo | null = null;

    /**
     * 打开场景
     */
    async openScene(params: IOpenSceneOptions): Promise<ISceneInfo> {
        const { uuid } = params;
        return new Promise<ISceneInfo>(async (resolve, reject) => {
            // 查询场景资源信息
            const asset = assetQueryManager.queryAsset(uuid);
            if (!asset) {
                reject(`场景资源不存在: ${uuid}`);
                return;
            }

            const assetType = assetQueryManager.queryAssetProperty(asset, 'type');
            if (!assetType || !assetType.includes('SceneAsset')) {
                reject(`指定路径不是有效的场景资源: ${asset.url}`);
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
                    path: asset.source,
                    uuid: asset.uuid,
                    url: asset.url,
                    name: asset._name || ''
                };

                // 设置为当前场景
                this.currentScene = sceneInfo;
                resolve(sceneInfo);
                console.log(`子进程成功打开场景: ${sceneInfo.path}`);
            });
        });
    }

    /**
     * 关闭当前场景
     */
    async closeScene(): Promise<ISceneInfo | null> {
        const closedScene = this.currentScene;
        
        if (closedScene) {
            console.log(`子进程关闭场景: ${closedScene.path}`);
        } else {
            console.log('子进程当前没有打开的场景');
        }

        // 清理当前场景
        this.currentScene = null;
        
        return closedScene;
    }

    /**
     * 保存场景
     */
    async saveScene(params: ISaveSceneOptions): Promise<ISceneInfo> {
        const uuid = params.uuid ?? this.currentScene?.uuid;
        if (!uuid) {
            throw new Error('保存失败，当前没有打开的场景');
        }

        const asset = assetQueryManager.queryAsset(uuid);
        if (!asset) {
            throw new Error(`场景资源不存在: ${uuid}`);
        }

        const scene = cc.director.getScene();
        if (!scene) {
            throw new Error(`获取不到当前场景实例`);
        }

        const sceneAsset = new SceneAsset();
        sceneAsset.scene = scene;

        const json = EditorExtends.serialize(asset);

        let assetInfo;
        try {
            assetInfo = await assetManager.saveAsset(uuid, json);
        } catch (e) {
            throw e;
        }

        const sceneInfo: ISceneInfo = {
            path: assetInfo.source,
            url: assetInfo.url,
            uuid: assetInfo.uuid,
            name: assetInfo.name
        };

        console.log(`子进程成功保存场景: ${sceneInfo.path}`);
        return sceneInfo;
    }

    /**
     * 创建新场景
     */
    async createScene(params: ICreateSceneOptions): Promise<ISceneInfo> {
        // 获取场景模板 url
        const template = this.getSceneTemplateURL(params.templateType || 'default');

        // 确保文件名以 .scene 结尾
        const fileName = params.name.endsWith('.scene')
            ? params.name
            : `${params.name}.scene`;
        const fullPath = join(params.targetPath, fileName);

        // 创建场景资源
        const result = await assetOperation.createAsset({
            template: template,
            target: fullPath,
            overwrite: true
        });

        if (!result) {
            throw new Error('创建场景资源失败');
        }

        const assetResult = Array.isArray(result) ? result[0] : result;
        
        const sceneInfo: ISceneInfo = {
            path: assetResult!.source,
            uuid: assetResult!.uuid,
            url: assetResult!.url,
            name: params.name
        };

        console.log(`子进程成功创建场景: ${sceneInfo.path}`);
        return sceneInfo;
    }

    /**
     * 获取当前打开的场景
     */
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

export const sceneManager = new SceneManager();
