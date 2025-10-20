import cc, { SceneAsset } from 'cc';
import { expose, register } from './decorator';
import {
    ICloseSceneOptions,
    ICreateSceneOptions,
    IOpenSceneOptions,
    ISaveSceneOptions,
    IScene,
    ISceneIdentifier,
    ISceneService,
    ISoftReloadSceneOptions,
} from '../../common';
import { Rpc } from '../rpc';
import { EventEmitter } from 'events';
import sceneUtil from './scene/utils';
import type { IAssetInfo } from '../../../assets/@types/public';

/**
 * 场景事件类型
 */
type EventType = 'create' | 'open' | 'close' | 'save' | 'soft-reload';

/**
 * 场景进程处理器
 * 处理所有场景相关操作
 */
@register('Scene')
export class SceneService extends EventEmitter implements ISceneService {
    // 限制消息类型
    on(type: EventType, listener: (arg: any) => void): this { return super.on(type, listener); }
    off(type: EventType, listener: (arg: any) => void): this { return super.off(type, listener); }
    once(type: EventType, listener: (arg: any) => void): this { return super.once(type, listener); }
    emit(type: EventType, ...args: any[]): boolean { return super.emit(type, ...args); }

    private currentSceneAssetUuid: string = '';
    private sceneMap: Map<string, {
        identifier: ISceneIdentifier,
        instance: cc.Scene,
    }> = new Map();

    @expose()
    async open(params: IOpenSceneOptions): Promise<IScene> {
        const { urlOrUUID } = params;

        console.log(`打开场景 [${urlOrUUID}]`);
        try {
            console.log('场景信息验证');
            const identifier: ISceneIdentifier = await this.createSceneIdentifier(urlOrUUID);

            if (!identifier.assetUuid) {
                console.error('场景资源不存在');
                throw new Error(`场景资源不存在，${urlOrUUID}`);
            }

            if (!identifier.assetType.includes('SceneAsset')) {
                console.error('无效的场景资源类型');
                throw new Error(`指定路径不是有效的场景资源，urlOrUUID: ${urlOrUUID}, ${identifier.assetType}`);
            }
            console.log('场景信息验证通过');

            if (this.currentSceneAssetUuid === identifier.assetUuid) {
                const instance = cc.director.getScene();
                if (!instance) {
                    this.sceneMap.delete(this.currentSceneAssetUuid);
                    this.currentSceneAssetUuid = '';
                    throw new Error('打开场景失败，当前场景没有实例，请重新打开场景');
                }
                console.log('场景已打开');
                return await this.getSceneDump(identifier);
            }

            try {
                await this.close();
            } catch (error) {
                console.warn('关闭当前场景时发生错误:', error);
            }

            console.log('加载场景资源');
            const sceneAsset = await new Promise<cc.SceneAsset>((resolve, reject) => {
                cc.assetManager.assets.remove(identifier.assetUuid);
                cc.assetManager.loadAny(identifier.assetUuid, (err: Error | null, asset: cc.SceneAsset) => {
                    if (err) {
                        console.error('加载场景资源失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('场景资源加载完成');
                    resolve(asset);
                });
            });

            // 清空节点 path 缓存（重要，否则会出现数据重复的问题）
            EditorExtends.Node.clear();

            console.log('运行场景');
            const sceneInstance = await new Promise<cc.Scene>((resolve, reject) => {
                cc.director.runSceneImmediate(sceneAsset,
                    () => { },
                    (err, instance: cc.Scene | undefined) => {
                        if (!instance) {
                            console.error('场景实例化失败', err);
                            reject(`打开场景失败，urlOrUuid：${urlOrUUID}`);
                            return;
                        }
                        console.log('场景运行成功');
                        resolve(instance);
                    }
                );
            });

            this.currentSceneAssetUuid = identifier.assetUuid;
            const sceneInfo = { identifier: identifier, instance: sceneInstance };
            this.sceneMap.set(identifier.assetUuid, sceneInfo);
            const info: IScene = await this.getSceneDump(identifier);
            // 发送打开消息
            this.emit('open', sceneInfo);

            console.log(`场景打开成功`);
            return info;
        } catch (error) {
            console.error(`打开场景失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async close(params: ICloseSceneOptions = {}): Promise<boolean> {
        if (!this.currentSceneAssetUuid && !params.urlOrUUID) {
            // 无需关闭
            return true;
        }
        console.log(`关闭场景 [${params.urlOrUUID || '当前场景'}]`);
        try {
            console.log('场景是否存在');
            const uuid = await sceneUtil.queryUUID(params.urlOrUUID) ?? this.currentSceneAssetUuid;
            const closedScene = this.sceneMap.get(uuid);
            if (!closedScene) {
                console.error(`场景不存在于场景映射表中`);
                throw new Error(`关闭场景失败，uuid: ${uuid}`);
            }
            console.log(`找到场景: ${closedScene.identifier.assetName}`);

            if (this.currentSceneAssetUuid === uuid) {
                cc.director.runSceneImmediate(new cc.Scene(''));
                this.currentSceneAssetUuid = '';
            } else {
                closedScene.instance.destroy();
            }
            console.log('关闭当前打开场景');

            this.sceneMap.delete(uuid);
            console.log(`场景映射表移除: ${uuid}`);
            this.emit('close', closedScene.instance);
            console.log('发出关闭事件');

            console.log(`场景关闭成功: ${closedScene.identifier.assetUrl}`);
            return true;
        } catch (error) {
            console.error(`关闭场景失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async save(params: ISaveSceneOptions): Promise<boolean> {
        console.log(`保存场景 [${params.urlOrUUID || '当前场景'}]`);

        try {
            const uuid = params.urlOrUUID ?? this.currentSceneAssetUuid;
            if (!uuid) {
                throw new Error('保存失败，当前没有打开的场景');
            }

            let assetInfo = await Rpc.request('assetManager', 'queryAssetInfo', [uuid]);
            if (!assetInfo) {
                throw new Error(`场景资源不存在: ${uuid}`);
            }

            const scene = this.sceneMap.get(assetInfo.uuid);
            if (!scene) {
                console.error(`获取不到当前场景实例 uuid: ${assetInfo.uuid}`);
                throw new Error(`获取不到当前场景实例`);
            }

            const json = this.serialize(scene.instance);

            try {
                assetInfo = await Rpc.request('assetManager', 'saveAsset', [assetInfo.uuid, json]);
            } catch (e) {
                console.error('保存场景失败:', e);
                throw e;
            }

            // 更新数据
            scene.identifier.assetName = assetInfo.name;
            scene.identifier.assetUrl = assetInfo.url;
            scene.identifier.assetUuid = assetInfo.uuid;
            scene.identifier.assetType = assetInfo.type;
            this.sceneMap.set(uuid, scene);
            return true;
        } catch (error) {
            console.error(`场景保存失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async create(params: ICreateSceneOptions): Promise<ISceneIdentifier> {
        console.log(`创建场景 ${params.baseName} 到 ${params.targetDirectory} 目录下，使用模版：${params.templateType}`);
        try {
            let assetInfo;
            try {
                const result = await Rpc.request('assetManager', 'createAssetByType', ['scene', params.targetDirectory, params.baseName, {
                    templateName: params.templateType,
                    overwrite: true,
                }]);

                assetInfo = Array.isArray(result) ? result[0] : result;
                if (!assetInfo) {
                    console.error('创建场景资源失败 createAsset 返回值无效', result);
                    throw new Error(`创建场景资源失败\n${JSON.stringify(params, null, 2)}`);
                }
                console.log('场景资源创建成功');
            } catch (e) {
                console.error(e);
                throw e;
            }

            return await this.createSceneIdentifier(assetInfo);
        } catch (error) {
            console.error(`创建场景失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async queryCurrentScene(): Promise<IScene | null> {
        console.time('SceneService.queryCurrentScene');
        if (!this.currentSceneAssetUuid) {
            return null;
        }
        const sceneInfo = this.sceneMap.get(this.currentSceneAssetUuid);
        if (!sceneInfo) return null;

        return await this.getSceneDump(sceneInfo.identifier);
    }

    @expose()
    async queryScenes(): Promise<IScene[]> {
        const scenes = (
            await Promise.all(
                Array.from(this.sceneMap.values()).map(async (sceneInfo) => {
                    if (!sceneInfo) return null;
                    return await this.getSceneDump(sceneInfo.identifier);
                })
            )
        ).filter((s): s is IScene => s !== null);
        return scenes;
    }

    @expose()
    async reload(): Promise<boolean> {
        const uuid = this.currentSceneAssetUuid;
        await this.close();
        await this.open({
            urlOrUUID: uuid
        });
        return true;
    }

    @expose()
    async softReload(params: ISoftReloadSceneOptions): Promise<IScene> {
        const { urlOrUUID } = params;
        const scene = await this.getScene(urlOrUUID);
        const serializeJSON = this.serialize(scene.instance);
        scene.instance = await sceneUtil.runSceneImmediateByJson(serializeJSON);
        const newScene = await this.getSceneDump(scene.identifier.assetUrl);
        const sceneInfo = {
            identifier: scene.identifier,
            instance: scene.instance
        };
        this.sceneMap.set(newScene.assetUuid, sceneInfo);
        this.emit('soft-reload', sceneInfo);
        return newScene;
    }

    /**
     * 创建场景标识信息
     * @param source
     * @private
     */
    private async createSceneIdentifier(source?: string | IAssetInfo): Promise<ISceneIdentifier> {
        const identifier: ISceneIdentifier = {
            assetType: 'unknown',
            assetName: 'unknown',
            assetUuid: 'unknown',
            assetUrl: 'unknown',
        };

        if (!source) return identifier;

        const isString = typeof source === 'string';
        const assetInfo: IAssetInfo | null = isString ? await Rpc.request('assetManager', 'queryAssetInfo', [source]) : source;
        if (!assetInfo) {
            console.error('无法请求场景资源');
            return identifier;
        }
        return {
            assetType: assetInfo.type,
            assetName: assetInfo.name,
            assetUuid: assetInfo.uuid,
            assetUrl: assetInfo.url,
        };
    }

    /**
     * 更新场景信息
     * @param identifier 标识
     * @private
     */
    private async getSceneDump(identifier: ISceneIdentifier | string): Promise<IScene> {
        if (typeof identifier === 'string') {
            identifier = await this.createSceneIdentifier(identifier);
        }
        const scene = sceneUtil.getSceneDump(identifier);
        if (!scene) {
            throw new Error('更新场景信息失败，当前没有场景');
        }
        return scene;
    }

    /**
     * 获取场景数据，如果没有 urlOrUuid 传，默认当前场景
     * @param urlOrUuid
     * @private
     */
    private async getScene(urlOrUuid?: string) {
        const uuid = (await sceneUtil.queryUUID(urlOrUuid)) ?? this.currentSceneAssetUuid;
        const scene = this.sceneMap.get(uuid);
        if (!scene) {
            throw new Error(`获取场景失败 ${urlOrUuid}`);
        }
        return scene;
    }

    /**
     * 序列化场景
     * @private
     */
    private serialize(scene: cc.Scene) {
        const asset = new SceneAsset();
        asset.scene = scene;
        return EditorExtends.serialize(asset);
    }
}

export const Scene = new SceneService();
