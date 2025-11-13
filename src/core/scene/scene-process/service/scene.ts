import cc from 'cc';
import { register, BaseService } from './core';
import {
    ICloseSceneOptions,
    ICreateSceneOptions,
    IOpenSceneOptions,
    ISaveSceneOptions,
    IScene,
    ISceneEntry,
    ISceneEvents,
    ISceneIdentifier,
    ISceneService,
    ISoftReloadSceneOptions,
} from '../../common';
import { Rpc } from '../rpc';
import sceneUtil from './scene/utils';

/**
 * 场景进程处理器
 * 处理所有场景相关操作
 */
@register('Scene')
export class SceneService extends BaseService<ISceneEvents> implements ISceneService {
    private currentSceneAssetUuid: string = '';
    private sceneInstanceMap: Map<string, ISceneEntry> = new Map();

    async open(params: IOpenSceneOptions): Promise<IScene> {
        const { urlOrUUID } = params;
        console.log(`打开场景 [${urlOrUUID}]`);
        try {
            const identifier: ISceneIdentifier = await sceneUtil.getSceneIdentifier(urlOrUUID);
            if (!identifier.assetType.includes('SceneAsset')) {
                throw new Error(`打开 ${urlOrUUID} 场景失败，打开场景资源类型错误, ${identifier.assetType}`);
            }

            if (this.currentSceneAssetUuid === identifier.assetUuid) {
                const instance = cc.director.getScene();
                if (!instance) {
                    this.sceneInstanceMap.delete(this.currentSceneAssetUuid);
                    this.currentSceneAssetUuid = '';
                    throw new Error(`打开 ${urlOrUUID} 场景失败，当前场景没有实例，已清除数据，请重新打开场景`);
                }
                return await sceneUtil.generateScene(identifier);
            }

            try {
                await this.close();
            } catch (error) {
                console.error(error);
                throw new Error(`关闭当前场景失败`);
            }

            const sceneAsset = await new Promise<cc.SceneAsset>((resolve, reject) => {
                cc.assetManager.assets.remove(identifier.assetUuid);
                cc.assetManager.loadAny(identifier.assetUuid, (err: Error | null, asset: cc.SceneAsset) => {
                    if (err) {
                        console.error('加载场景资源失败:', err);
                        reject(err);
                        return;
                    }
                    resolve(asset);
                });
            });

            // 运行场景
            const sceneInstance = await sceneUtil.runScene(sceneAsset);
            this.currentSceneAssetUuid = identifier.assetUuid;
            const sceneInfo: ISceneEntry = { identifier: identifier, instance: sceneInstance };
            this.sceneInstanceMap.set(identifier.assetUuid, sceneInfo);
            const info: IScene = await sceneUtil.generateScene(identifier);

            this.emit('scene:open', info);

            return info;
        } catch (error) {
            console.error(`打开 ${urlOrUUID} 场景失败`, error);
            throw error;
        }
    }

    async close(params: ICloseSceneOptions = {}): Promise<boolean> {
        if (!this.currentSceneAssetUuid && !params.urlOrUUID) {
            // 无需关闭
            return true;
        }

        console.log(`关闭场景 [${params.urlOrUUID || '当前场景'}]`);

        try {
            const uuid = await sceneUtil.queryUUID(params.urlOrUUID) ?? this.currentSceneAssetUuid;
            const closedScene = this.sceneInstanceMap.get(uuid);
            if (!closedScene) {
                throw new Error(`通过 uuid: ${uuid}，查询不到场景，是否没有打开场景`);
            }

            // 资源没被删掉才走保存
            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
            if (assetInfo) {
                try {
                    await this.save({
                        urlOrUUID: uuid,
                    });
                } catch (error) {
                    console.error(error);
                    throw new Error(`保存当前场景失败`);
                }
            }

            // 如果是当前场景就跳到空场景
            if (this.currentSceneAssetUuid === uuid) {
                cc.director.runSceneImmediate(new cc.Scene(''));
                this.currentSceneAssetUuid = '';
            } else {
                closedScene.instance.destroy();
            }
            this.sceneInstanceMap.delete(uuid);

            this.emit('scene:close');

            return true;
        } catch (error) {
            console.error(`关闭 ${params.urlOrUUID || this.currentSceneAssetUuid} 场景失败: ${error}`);
            throw error;
        }
    }

    async save(params: ISaveSceneOptions): Promise<boolean> {
        console.log(`保存场景 [${params.urlOrUUID || '当前场景'}]`);
        const uuid = params.urlOrUUID ?? this.currentSceneAssetUuid;
        try {
            if (!uuid) {
                throw new Error('保存失败，当前没有打开的场景');
            }

            let assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
            if (!assetInfo) {
                throw new Error(`场景资源不存在: ${uuid}`);
            }

            const scene = this.sceneInstanceMap.get(assetInfo.uuid);
            if (!scene) {
                throw new Error(`没有打开过 ${assetInfo.name} 场景`);
            }

            let json;
            try {
                json = sceneUtil.serialize(scene.instance);
            } catch (err) {
                console.error(err);
                throw new Error('序列化场景失败');
            }

            try {
                assetInfo = await Rpc.getInstance().request('assetManager', 'saveAsset', [assetInfo.uuid, json]);
            } catch (e) {
                console.error(e);
                throw new Error('保存场景资源失败');
            }

            // 更新数据
            scene.identifier.assetName = assetInfo.name;
            scene.identifier.assetUrl = assetInfo.url;
            scene.identifier.assetUuid = assetInfo.uuid;
            scene.identifier.assetType = assetInfo.type;
            this.sceneInstanceMap.set(uuid, scene);

            this.emit('scene:save');

            return true;
        } catch (error) {
            console.error(`场景保存失败:`, error);
            throw error;
        }
    }

    async create(params: ICreateSceneOptions): Promise<ISceneIdentifier> {
        console.log(`使用模版：${params.templateType}，创建场景 ${params.baseName} 到 ${params.targetDirectory} 目录下`);
        try {
            const result = await Rpc.getInstance().request('assetManager', 'createAssetByType', ['scene', params.targetDirectory, params.baseName, {
                templateName: params.templateType,
                overwrite: true,
            }]);

            const assetInfo = Array.isArray(result) ? result[0] : result;
            if (!assetInfo) {
                console.error('createAsset 返回值无效', result, params);
                throw new Error(`创建场景资源失败`);
            }

            return await sceneUtil.getSceneIdentifier(assetInfo);
        } catch (error) {
            console.error(`创建场景失败:`, error);
            throw error;
        }
    }

    async queryCurrentScene(): Promise<IScene | null> {
        console.log('请求当前场景数据');
        if (!this.currentSceneAssetUuid) {
            return null;
        }
        const sceneInfo = this.sceneInstanceMap.get(this.currentSceneAssetUuid);
        if (!sceneInfo) return null;

        console.time('generateScene');
        const scene = await sceneUtil.generateScene(sceneInfo.identifier);
        console.timeEnd('generateScene');
        return scene;
    }

    async queryScenes(): Promise<IScene[]> {
        console.log('请求所有打开场景数据');
        return (
            await Promise.all(
                Array.from(this.sceneInstanceMap.values()).map(async (sceneInfo) => {
                    if (!sceneInfo) return null;
                    return await sceneUtil.generateScene(sceneInfo.identifier);
                })
            )
        ).filter((s): s is IScene => s !== null);
    }

    async reload(): Promise<boolean> {
        console.log('重新打开当前场景');
        const uuid = this.currentSceneAssetUuid;
        try {
            await this.close();
            await this.open({
                urlOrUUID: uuid
            });
            return true;
        } catch (error) {
            console.error('重新打开场景失败', error);
            throw error;
        }
    }

    async softReload(params: ISoftReloadSceneOptions): Promise<IScene> {
        const { urlOrUUID } = params;
        try {
            const scene = await this.getOpenScene(urlOrUUID);
            const serializeJSON = sceneUtil.serialize(scene.instance);
            scene.instance = await sceneUtil.runSceneImmediateByJson(serializeJSON);
            const newScene = await sceneUtil.generateScene(scene.identifier.assetUrl);
            const sceneInfo = {
                identifier: scene.identifier,
                instance: scene.instance
            };
            this.sceneInstanceMap.set(newScene.assetUuid, sceneInfo);

            this.emit('scene:soft-reload');
            this.broadcast('scene:soft-reload');
            return newScene;
        } catch (error) {
            console.error('重新加载场景失败');
            throw error;
        }
    }

    /**
     * 获取打开场景数据，如果没有 urlOrUuid 传，默认当前场景
     * @param urlOrUuid
     * @private
     */
    private async getOpenScene(urlOrUuid?: string) {
        const uuid = (await sceneUtil.queryUUID(urlOrUuid)) ?? this.currentSceneAssetUuid;
        const scene = this.sceneInstanceMap.get(uuid);
        if (!scene) {
            throw new Error(`获取场景失败 ${urlOrUuid}`);
        }
        return scene;
    }
}

export const Scene = new SceneService();
