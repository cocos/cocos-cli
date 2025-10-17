import lodash from 'lodash';
import path from 'path';
import cc, { SceneAsset } from 'cc';
import { expose, register } from './decorator';
import {
    ICloseSceneOptions,
    ICreateSceneOptions,
    IOpenSceneOptions,
    ISoftReloadSceneOptions,
    ISaveSceneOptions,
    IScene,
    ISceneService,
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

    private currentSceneUUID: string = '';
    private sceneMap: Map<string, { info: IScene, instance: cc.Scene, }> = new Map();

    @expose()
    async open(params: IOpenSceneOptions): Promise<IScene> {
        const { urlOrUUIDOrPath } = params;

        console.log(`打开场景 [${urlOrUUIDOrPath}]`);
        try {
            console.log('场景信息验证');
            const info: IScene = await this.createSceneInfo(urlOrUUIDOrPath);

            if (!info.uuid) {
                console.error('场景资源不存在');
                throw new Error(`场景资源不存在，${urlOrUUIDOrPath}`);
            }

            if (!info.type.includes('SceneAsset')) {
                console.error('无效的场景资源类型');
                throw new Error(`指定路径不是有效的场景资源，urlOrUUIDOrPath: ${urlOrUUIDOrPath}, ${info.type}`);
            }
            console.log('场景信息验证通过');

            try {
                await this.close();
            } catch (error) {
                console.warn('关闭当前场景时发生错误:', error);
            }

            // 加载场景分组
            console.log('加载场景资源');
            const sceneAsset = await new Promise<cc.SceneAsset>((resolve, reject) => {
                cc.assetManager.loadAny(urlOrUUIDOrPath, (err: Error | null, asset: cc.SceneAsset) => {
                    if (err) {
                        console.error('加载场景资源失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('场景资源加载完成');
                    resolve(asset);
                });
            });

            // 运行场景分组
            console.log('运行场景');
            const sceneInstance = await new Promise<cc.Scene>((resolve, reject) => {
                cc.director.runSceneImmediate(sceneAsset,
                    () => {},
                    (err, instance: cc.Scene | undefined) => {
                        if (!instance) {
                            console.error('场景实例化失败', err);
                            reject(`打开场景失败，urlOrUUIDOrPath：${urlOrUUIDOrPath}`);
                            return;
                        }
                        console.log('场景运行成功');
                        resolve(instance);
                    }
                );
            });

            // 更新场景状态
            this.currentSceneUUID = info.uuid;
            this.sceneMap.set(info.uuid, { info, instance: sceneInstance });
            this.emit('open', sceneInstance, info.uuid);

            console.log(`场景打开成功`);
            return info;
        } catch (error) {
            console.error(`打开场景失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async close(params: ICloseSceneOptions = {}): Promise<boolean> {
        if (!this.currentSceneUUID && !params.urlOrUUIDOrPath) {
            // 无需关闭
            return true;
        }
        console.log(`关闭场景 [${params.urlOrUUIDOrPath || '当前场景'}]`);
        try {
            console.log('场景是否存在');
            const uuid = await sceneUtil.queryUUID(params.urlOrUUIDOrPath) ?? this.currentSceneUUID;
            const closedScene = this.sceneMap.get(uuid);
            if (!closedScene) {
                console.error(`场景不存在于场景映射表中`);
                throw new Error(`关闭场景失败，uuid: ${uuid}`);
            }
            console.log(`找到场景: ${closedScene.info.name}`);

            if (this.currentSceneUUID === uuid) {
                cc.director.runSceneImmediate(new cc.Scene(''));
                this.currentSceneUUID = '';
            } else {
                closedScene.instance.destroy();
            }
            console.log('关闭当前打开场景');

            this.sceneMap.delete(uuid);
            console.log(`场景映射表移除: ${uuid}`);
            this.emit('close', closedScene.instance);
            console.log('发出关闭事件');

            console.log(`场景关闭成功: ${closedScene.info.path}`);
            return true;
        } catch (error) {
            console.error(`关闭场景失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async save(params: ISaveSceneOptions): Promise<boolean> {
        console.log(`保存场景 [${params.urlOrUUIDOrPath || '当前场景'}]`);

        try {
            const uuid = params.urlOrUUIDOrPath ?? this.currentSceneUUID;
            if (!uuid) {
                throw new Error('保存失败，当前没有打开的场景');
            }

            let assetInfo = await Rpc.request('assetManager', 'queryAssetInfo', [uuid]);
            if (!assetInfo) {
                throw new Error(`场景资源不存在: ${uuid}`);
            }

            const scene = this.sceneMap.get(uuid);
            if (!scene) {
                console.error('获取不到当前场景实例');
                throw new Error(`获取不到当前场景实例`);
            }

            const json = this.serialize(scene.instance);

            try {
                assetInfo = await Rpc.request('assetManager', 'saveAsset', [uuid, json]);
            } catch (e) {
                console.error('保存场景失败:', e);
                throw e;
            }

            // 更新数据
            scene.info = {
                name: assetInfo.name,
                path: assetInfo.source,
                url: assetInfo.url,
                uuid: assetInfo.uuid,
                type: assetInfo.type,
            };
            this.sceneMap.set(uuid, scene);
            return true;
        } catch (error) {
            console.error(`场景保存失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async create(params: ICreateSceneOptions): Promise<IScene> {
        console.log(`创建场景 [${path.basename(params.targetPathOrURL) || '默认模板'}]`);

        try {
            let assetInfo;
            try {
                const result = await Rpc.request('assetManager', 'createAssetByType', ['scene', params.targetPathOrURL, {
                    templateName: params.templateType,
                    overwrite: true
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

            return await this.createSceneInfo(assetInfo);
        } catch (error) {
            console.error(`创建场景失败: ${error}`);
            throw error;
        }
    }

    @expose()
    async queryCurrentScene(): Promise<IScene | null> {
        if (!this.currentSceneUUID) {
            return null;
        }
        const scene = this.sceneMap.get(this.currentSceneUUID);
        return scene ? scene.info : null;
    }

    @expose()
    async queryScenes(): Promise<IScene[]> {
        const scene: IScene[] = [];
        for (const item of this.sceneMap.values()) {
            scene.push(item.info);
        }
        return scene;
    }

    @expose()
    async reload(): Promise<boolean> {
        const uuid = this.currentSceneUUID;
        await this.close();
        await this.open({
            urlOrUUIDOrPath: uuid
        });
        return true;
    }

    @expose()
    async softReload(params: ISoftReloadSceneOptions): Promise<boolean> {
        const { urlOrUUIDOrPath } = params;
        const scene = await this.getScene(urlOrUUIDOrPath);
        const serializeJSON = this.serialize(scene.instance);
        scene.instance = await sceneUtil.runSceneImmediateByJson(serializeJSON);
        this.sceneMap.set(scene.info.uuid, scene);
        this.emit('soft-reload', scene);
        return true;
    }

    /**
     * 创建场景信息
     * @param source
     * @private
     */
    private async createSceneInfo(source?: string | IAssetInfo): Promise<IScene> {
        const defaultSceneInfo: IScene = {
            type: 'unknown',
            name: 'unknown',
            path: 'unknown',
            uuid: 'unknown',
            url: 'unknown',
        };

        if (!source) return defaultSceneInfo;

        const isString = typeof source === 'string';
        const assetInfo: IAssetInfo | null = isString ? await Rpc.request('assetManager', 'queryAssetInfo', [source]) : source;
        if (!assetInfo) {
            console.error('无法请求场景资源');
            return defaultSceneInfo;
        }

        // 只合并有效字段
        const validUpdates = lodash.pick(assetInfo, Object.keys(defaultSceneInfo));
        return { ...defaultSceneInfo, ...validUpdates };
    }

    /**
     * 获取场景数据，如果没有 urlOrUUIDOrPath 传，默认当前场景
     * @param urlOrUUIDOrPath
     * @private
     */
    private async getScene(urlOrUUIDOrPath?: string) {
        const uuid = (await sceneUtil.queryUUID(urlOrUUIDOrPath)) ?? this.currentSceneUUID;
        const scene = this.sceneMap.get(uuid);
        if (!scene) {
            throw new Error('获取场景失败');
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
