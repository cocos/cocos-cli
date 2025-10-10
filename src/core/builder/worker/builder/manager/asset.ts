'use strict';

import { outputJSON, readJSON } from 'fs-extra';
import { join } from 'path';
import { recursively } from '../utils/index';
import { buildAssetLibrary } from './asset-library';
import { hasCCONFormatAssetInLibrary } from '../utils/cconb';
import { IAsset } from '../../../../assets/@types/protected';
import { IBuildSceneItem } from '../../../@types';
import { IInstanceMap, IBuilder, ISerializedOptions, IInternalBuildOptions, BuilderAssetCache as IBuilderAssetCache } from '../../../@types/protected';
import { assetManager } from '../../../../assets/manager/asset';
import { BuildGlobalInfo } from '../../../share/builder-config';

/**
 * 资源管理器，主要负责资源的缓存查询缓存等
 * 所有 __ 开头的属性方法都不对外公开
 */
export class BuilderAssetCache implements IBuilderAssetCache {

    // 场景资源信息
    public readonly scenes: Array<IBuildSceneItem> = [];

    // 脚本资源信息缓存
    public readonly scriptUuids: Array<string> = [];

    // 其他资源信息缓存，不包含场景和脚本
    public assetUuids: Array<string> = [];

    // 资源反序列化之后的结果
    private readonly instanceMap: IInstanceMap = {};

    private readonly _task?: IBuilder;

    constructor(task?: IBuilder) {
        this._task = task;
    }

    /**
     * 初始化
     */
    async init() {
        await buildAssetLibrary.init();
    }

    /**
     * 查询某个 uuid 是否存在
     * @param uuid 
     * @returns 
     */
    async hasAsset(uuid: string) {
        return !!(this.assetUuids.includes(uuid) || this.scriptUuids.includes(uuid) || this.scenes.find(item => item.uuid === uuid));
    }

    /**
     * 添加一个资源到缓存
     * @param asset
     */
    public addAsset(asset: IAsset, type?: string) {
        // @ts-ignore
        if (asset.invalid || asset.url.startsWith('db://internal/default_file_content')) {
            return;
        }
        // HACK 3.9.0 此接口入参接收参数格式有变动，暂时先兼容
        if (!asset._assetDB) {
            console.warn('The addAsset method no longer supports the AssetInfo type, so please pass parameters that conform to the IAsset interface definition.');
            asset = buildAssetLibrary.getAsset(asset.uuid);
        }
        const ccType = type || assetManager.queryAssetProperty(asset, 'type');
        // 分类到指定的位置
        switch (ccType) {
            case 'cc.SceneAsset':
                this.scenes.push({
                    uuid: asset.uuid,
                    url: asset.url,
                });
                break;
            case 'cc.Script':
                // hack 过滤特殊的声明文件，过滤资源模板内的脚本
                if (asset.url.toLowerCase().endsWith('.d.ts')) {
                    break;
                }
                this.scriptUuids.push(asset.uuid);
                break;
            default:
                if (asset.meta.files.includes('.json') || hasCCONFormatAssetInLibrary(asset)) {
                    this.assetUuids.push(asset.uuid);
                }
        }
    }

    /**
     * 删除一个资源的缓存
     */
    public removeAsset(uuid: string, type?: string) {
        const asset = buildAssetLibrary.getAsset(uuid);
        if (!asset) {
            return;
        }
        const assetType = type || assetManager.queryAssetProperty(asset, 'type');
        switch (assetType) {
            case 'cc.SceneAsset':
                for (let i = 0; i < this.scenes.length; i++) {
                    if (this.scenes[i].uuid === uuid) {
                        this.scenes.splice(i, 1);
                        return;
                    }
                }
                break;
            case 'cc.Script':
                for (let i = 0; i < this.scriptUuids.length; i++) {
                    if (this.scriptUuids[i] === uuid) {
                        this.scriptUuids.splice(i, 1);
                        return;
                    }
                }
                break;
            default:
                recursively(asset, (asset: IAsset) => {
                    if (asset.meta.files.includes('.json') || hasCCONFormatAssetInLibrary(asset)) {
                        for (let i = 0; i < this.assetUuids.length; i++) {
                            if (this.assetUuids[i] === asset.uuid) {
                                this.assetUuids.splice(i, 1);
                                return;
                            }
                        }
                    }
                });
        }
    }

    /**
     * 查询指定 uuid 的资源信息
     * @param uuid
     */
    public getAssetInfo(uuid: string) {
        return buildAssetLibrary.getAssetInfo(uuid);
    }

    /**
     * 添加或修改一个实例化对象到缓存
     * @param instance
     */
    public addInstance(instance: any) {
        if (!instance || !instance._uuid) {
            return;
        }
        this.instanceMap[instance._uuid] = instance;
    }

    /**
     * 删除一个资源的缓存
     * @param uuid
     */
    public clearAsset(uuid: string) {
        this.scenes.length = 0;
        this.scriptUuids.length = 0;
        this.assetUuids.length = 0;
        delete this.instanceMap[uuid];
    }

    /**
     * 查询一个资源的 meta 数据
     * @param uuid
     */
    public getMeta(uuid: string): Promise<any> {
        return buildAssetLibrary.getMeta(uuid);
    }

    public async addMeta(uuid: string, meta: any) {
        buildAssetLibrary.addMeta(uuid, meta);
    }

    /**
     * 获取指定 uuid 资源的依赖资源 uuid 列表
     * @param uuid
     */
    public async getDependUuids(uuid: string): Promise<readonly string[]> {
        return await buildAssetLibrary.getDependUuids(uuid);
    }

    /**
     * 深度获取指定 uuid 资源的依赖资源 uuid 列表
     * @param uuid
     */
    public async getDependUuidsDeep(uuid: string): Promise<string[]> {
        return await buildAssetLibrary.getDependUuidsDeep(uuid);
    }

    /**
     *
     * 获取指定 uuid 资源在 library 内的序列化 JSON 内容
     * @param uuid
     */
    public async getLibraryJSON(uuid: string): Promise<any> {
        const asset = buildAssetLibrary.getAsset(uuid);
        if (!asset || !asset.meta.files.includes('.json')) {
            return null;
        }
        // 不需要缓存 json 数据
        return await readJSON(asset.library + '.json');
    }

    /**
     * 获取指定 uuid 资源的重新序列化后的 JSON 内容（最终输出）
     * @param uuid
     * @param options
     */
    public async getSerializedJSON(uuid: string, options: ISerializedOptions): Promise<any> {
        const instance = this.instanceMap[uuid];
        let jsonObject;
        // 优先使用 cache 中的缓存数据生成序列化文件
        if (instance) {
            jsonObject = buildAssetLibrary.serialize(instance, options);
        } else {
            jsonObject = await buildAssetLibrary.getSerializedJSON(uuid, options);
        }
        return jsonObject ? jsonObject : null;

    }

    /**
     * 直接输出某个资源序列化 JSON 到指定包内
     * @param uuid
     * @param destDir
     * @param options
     */
    public async outputAssetJson(uuid: string, destDir: string, options: IInternalBuildOptions) {
        const asset = buildAssetLibrary.getAsset(uuid);
        const instance = this.instanceMap[uuid];
        if (!instance && !asset) {
            return;
        }
        if (!instance) {
            const dest = join(destDir, uuid.substr(0, 2), uuid + '.json');
            await buildAssetLibrary.outputAssets(uuid, dest, options.debug);
        } else {
            // 正常资源的输出路径需要以 library 内的输出路径为准，不可直接拼接，比如 ttf 字体类的生成路径
            const dest = join(destDir, asset.library.replace(join(BuildGlobalInfo.projectRoot, 'library'), '') + '.json');
            const jsonObject = buildAssetLibrary.serialize(instance, {
                debug: options.debug,
            });
            await outputJSON(dest, jsonObject);
        }
    }

    /**
     * 循环一种数据
     * @param type
     * @param handle
     */
    public async forEach(type: string, handle: Function): Promise<undefined> {
        // @ts-ignore
        if (!this[type]) {
            return;
        }
        // @ts-ignore
        const uuids = Object.keys(this[type]);
        if (!uuids) {
            return;
        }
        for (let i = 0; i < uuids.length; i++) {
            const uuid = uuids[i];
            handle && (await handle(uuid, i));
        }
    }

    /**
     * 查询一个资源反序列化后的实例
     * @param uuid
     */
    public async getInstance(uuid: string) {
        if (this.instanceMap[uuid]) {
            return this.instanceMap[uuid];
        }
        const asset = await buildAssetLibrary.getAsset(uuid);
        return buildAssetLibrary.getInstance(asset);
    }
}
