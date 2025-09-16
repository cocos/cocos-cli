'use strict';

declare const cc: any;
const EditorExtends: any = require('@base/electron-module').require('EditorExtends');

import { readJSON, existsSync, readJSONSync, outputJSON, removeSync, copy, outputFile, remove } from 'fs-extra';
import { basename, dirname, extname, join } from 'path';
import { CCON } from 'cc/editor/serialization';
import { transformCCON } from './cconb-utils';
import { deserialize, EffectAsset, Asset as CCAsset, SceneAsset, LightComponent, Node } from 'cc';
import { recursively } from '../utils';
import assert from 'assert';
import { getCCONFormatAssetInLibrary, outputCCONFormat } from '../utils/cconb';
import { IAssetInfo, IMetaMap, ISerializedOptions, IUuidDependMap, } from '../../../@types/protected';
import { assetManager } from '../../../../manager';
import { IAsset, QueryAssetsOption, IAssetInfo as IAssetInfoFromDB } from '../../../../@types/protected';
import { BuildGlobalInfo } from '../../../share/global';
import { assetDBManager } from '../../../../manager/asset-db';
import { transI18n } from '../../../share/utils';

// 版本号记录
const CACHE_VERSION = '1.0.1';

/**
 * 资源管理器，主要负责资源的缓存更新
 * TODO 需要迁移到 asset-db 里面
 */
class BuildAssetLibrary {
    // 资源索引缓存，只记录引用，不需要担心缓存数据内存，需要注意 reset 避免内存泄漏
    private assetMap: Record<string, IAsset> = {};

    public get assets() {
        const assets = Object.values(this.assetMap);
        if (!assets.length) {
            this.queryAllAssets();
            return Object.values(this.assetMap);
        }
        return assets;
    }

    // 资源依赖关系缓存, { uuid: 此资源依赖的资源 uuid 数组}
    private depend: IUuidDependMap = {};
    // 资源的被依赖关系缓存，{ uuid: 依赖此资源的资源 uuid 数组}
    private dependedMap: IUuidDependMap = {};

    private meta: IMetaMap = {};

    // 缓存地址
    private cacheTempDir: string = join(BuildGlobalInfo.projectTempDir, 'asset-db');
    private assetMtimeCache: Record<string, number> = {};
    private assetMtimeCacheFile: string = join(BuildGlobalInfo.projectTempDir, 'builder', 'assets-mtime.json');

    // 是否使用缓存开关
    public useCache = true;

    // 收集反序列化过程出现异常的资源 map （不缓存）
    private hasMissingClassUuids = new Set();
    private hasMissingAssetsUuids = new Set();
    // 存储 asset path 与 uuid 索引关系
    public pathToUuid: Record<string, string> = {};

    // 默认的序列化选项
    private defaultSerializedOptions = {
        compressUuid: true, // 是否是作为正式打包导出的序列化操作
        stringify: false, // 序列化出来的以 json 字符串形式还是 json 对象显示,这个要写死统一，否则对 json 做处理的时候都需要做类型判断
        dontStripDefault: false,
        useCCON: false,
        keepNodeUuid: false, // 序列化后是否保留节点组件的 uuid 数据
    };

    async initMtimeCache() {
        if (existsSync(this.assetMtimeCacheFile)) {
            try {
                this.assetMtimeCache = (await readJSON(this.assetMtimeCacheFile)) || {};
            } catch (error) { }
        }
    }

    async saveMtimeCache() {
        await outputJSON(this.assetMtimeCacheFile, this.assetMtimeCache);
    }

    /**
     * 资源管理器初始化
     */
    async init() {
        this.queryAllAssets();
        // TODO 允许外部修改
        this.defaultSerializedOptions.keepNodeUuid = false;
        this.useCache = true;
        console.debug(`init custom config: keepNodeUuid: ${this.defaultSerializedOptions.keepNodeUuid}, useCache: ${this.useCache}`);
        await this.initMtimeCache();
    }

    /**
     * 查询全部资源，包括子资源
     * @returns 
     */
    queryAllAssets() {
        console.time('queryAllAssets');
        const assetMap: Record<string, IAsset> = {};
        const assetDBMap = assetDBManager.assetDBMap;
        // 循环每一个已经启动的 database
        for (const name in assetDBMap) {
            const database = assetDBMap[name];
            for (const asset of database.uuid2asset.values()) {
                recursively(asset, (asset: IAsset) => {
                    assetMap[asset.uuid] = asset;
                });
            }
        }
        this.assetMap = assetMap;
        console.timeEnd('queryAllAssets');
        return this.assets;
    }

    /**
     * 获取资源的缓存目录
     * @param uuid
     */
    public getAssetTempDirByUuid(uuid: string) {
        // 缓存目录需要根据 db 目录的不同发生变化
        const dbName = this.getAsset(uuid)._assetDB.options.name;
        return join(this.cacheTempDir, dbName, uuid.substr(0, 2), uuid, 'build' + CACHE_VERSION);
    }

    /**
     * 删除一个资源的缓存
     * @param uuid
     */
    public clearAsset(uuid: string) {
        // 移除缓存的序列化信息
        const cacheFile = this.getAssetTempDirByUuid(uuid);
        if (cacheFile && existsSync(cacheFile)) {
            removeSync(cacheFile);
        }
        delete this.depend[uuid];
        // 移除 depend 里面的引用的相关 uuid 数据
        Object.keys(this.depend).forEach((uuid) => {
            const uuids = this.depend[uuid];
            uuids.includes(uuid) && uuids.splice(0, uuids.indexOf(uuid));
        });
    }

    /**
     * 查询一个资源的 meta 数据
     * @param uuid
     */
    public getMeta(uuid: string) {
        if (this.meta[uuid] !== undefined) {
            return this.meta[uuid];
        }

        return this.meta[uuid] = assetManager.queryAssetMeta(uuid);
    }

    public addMeta(uuid: string, meta: any) {
        meta && (this.meta[uuid] = meta);
    }

    public getAsset(uuid: string): IAsset {
        return this.assetMap[uuid] || assetManager.queryAsset(uuid);
    }

    public queryAssetsByOptions(options: QueryAssetsOption): IAsset[] {
        return assetManager.queryAssets(options);
    }

    public async queryAssetUsers(uuid: string): Promise<string[]> {
        if (this.dependedMap[uuid]) {
            return this.dependedMap[uuid];
        }
        this.dependedMap[uuid] = await assetManager.queryAssetUsers(uuid) || [];
        return this.dependedMap[uuid];
    }

    /**
 * 获取一个资源的 asset info 数据
 * @param uuid
 */
    public getAssetInfo(uuid: string, dataKeys: (keyof IAssetInfoFromDB)[] = ['subAssets', 'mtime', 'meta', 'depends']) {
        return assetManager.queryAssetInfo(uuid, dataKeys) as unknown as IAssetInfo;
    }

    /**
     * 查询一个资源依赖的其他资源的方法
     * @param uuid
     */
    public async getDependUuids(uuid: string): Promise<string[]> {
        if (this.depend[uuid]) {
            return this.depend[uuid];
        }
        const asset = this.getAsset(uuid);
        if (!asset) {
            return [];
        }
        // cc.SceneAsset cc.Prefab 类型不可使用 db 缓存的依赖信息，因为存储了脚本信息，相关的更新机制目前有问题，获取的数据会有冗余
        if (!['cc.SceneAsset', 'cc.Prefab'].includes(assetManager.queryAssetProperty(asset, 'type'))) {
            this.depend[uuid] = await assetManager.queryAssetDependencies(uuid) || [];
            return this.depend[uuid];
        }
        await this.getRawInstance(asset);

        return this.depend[uuid] || [];
    }

    /**
     * 深度获取指定 uuid 资源的依赖资源 uuid 列表
     * @param uuid
     */
    public async getDependUuidsDeep(uuid: string): Promise<string[]> {
        let result: string[] = [];
        let temp: string[] = [];
        const depends = await this.getDependUuids(uuid);
        if (!depends) {
            return [];
        }
        temp = [...depends];
        result = [...depends];
        do {
            const res = [];
            for (const subUuid of temp) {
                const depend = await this.getDependUuids(subUuid);
                res.push(...depend);
            }
            // 剔除已存在的资源避免循环依赖时的死循环
            temp = res.filter((uuid) => !result.includes(uuid));
            result.push(...temp);
        } while (temp.length > 0);
        return Array.from(new Set(result));
    }

    /**
     * 获取某个资源的反序列化对象
     * @param uuid
     */
    async getInstance(asset: IAsset) {
        if (!asset) {
            return null;
        }
        const instanceResult = await this.getRawInstance(asset);
        return instanceResult.asset;
    }

    /**
     * 获取重新序列化后的即将输出的 JSON 数据
     * @param uuid
     * @param options
     * @returns
     */
    public async getSerializedJSON(uuid: string, options: ISerializedOptions): Promise<any | null> {
        const asset = this.getAsset(uuid);
        if (!asset || !asset.meta.files.includes('.json')) {
            return null;
        }
        // 构建缓存的文件夹
        const cacheFile = join(this.getAssetTempDirByUuid(uuid)!, `${options.debug ? 'debug' : 'release'}.json`);
        if (this.checkUseCache(asset) && existsSync(cacheFile)) {
            try {
                return await readJSON(cacheFile);
            } catch (error) {
                unExpectException(error);
            }
        }

        const result: any = await this.getRawInstance(asset);
        if (!result.asset) {
            console.error(transI18n('builder.error.get_asset_json_failed', {
                url: asset.url,
                type: assetManager.queryAssetProperty(asset, 'type'),
            }));
            return null;
        }

        const jsonObject = this.serialize(result.asset, options);
        try {
            // 如果上一步读取缓存有失败，后续不再保存缓存
            if (this.checkCanSaveCache(asset.uuid)) {
                await outputJSON(cacheFile, jsonObject, {
                    spaces: 4,
                });
                this.assetMtimeCache[asset.uuid] = assetManager.queryAssetProperty(asset, 'mtime');
            }
        } catch (error) {
            unExpectException(error);
        }
        return jsonObject;
    }

    /**
     * 直接生成某个资源的构建后数据
     * @param uuid
     * @param debug
     */
    public async outputAssets(uuid: string, dest: string, debug: boolean) {
        const cacheFile = join(this.getAssetTempDirByUuid(uuid)!, `${debug ? 'debug' : 'release'}.json`);
        try {
            if (this.checkCanSaveCache(uuid)) {
                await copy(cacheFile, dest);
                return;
            }
        } catch (error) {
            unExpectException(error);
        }
        const jsonObject = this.getSerializedJSON(uuid, {
            debug,
        });
        if (!jsonObject) {
            return;
        }
        try {
            await outputJSON(cacheFile, jsonObject);
            copy(cacheFile, dest);
        } catch (error) {
            unExpectException(error);
            await outputJSON(dest, jsonObject);
        }
    }

    public async outputCCONAsset(
        uuid: string,
        dest: string,
        options: ISerializedOptions,
    ) {
        const instanceRes = await this.getRawInstance(this.getAsset(uuid));
        if (!instanceRes || !instanceRes.asset) {
            console.error(`get instance (${uuid}) failed!`);
            return;
        }

        // 目前所有 CCON 资产在资产库里面的后缀都是 .bin
        // 后面如果调整了这里要对应调整。
        // 断言一下，确保没问题。
        const originalDest = dest;
        const originalExtname = extname(originalDest);
        assert(originalExtname === '.bin');
        const baseName = basename(originalDest, originalExtname);
        const fullBaseName = join(dirname(originalDest), baseName);

        const ccon: CCON = buildAssetLibrary.serialize(instanceRes.asset, {
            debug: options.debug,
            useCCONB: true,
            dontStripDefault: false,
            _exporting: true,
        });
        assert(ccon instanceof CCON);
        try {
            await outputCCONFormat(ccon, fullBaseName);
        } catch (error) {
            console.error(error);
            console.error(`outputCCONFormat with asset:(${uuid}) failed!`);
        }
    }

    /**
     * 获取某个资源的构建后序列化数据
     * @param uuid
     */
    public serialize(instance: any, options: ISerializedOptions) {
        if (!instance) {
            return null;
        }

        // 调用 effect 编译器来做 effect 多余数据剔除，不走数据缓存，每次重新剔除生成
        if (instance instanceof EffectAsset) {
            const { stripEditorSupport } = require(join(__dirname, '../../../../effect-compiler/utils.js'));
            instance = stripEditorSupport(instance, options['cc.EffectAsset']);
        }

        // TODO: 引擎 https://github.com/cocos/cocos-engine/issues/14613 该 issue 正式修复关闭后，这段代码可以移除
        // HACK 剔除勾选了 light.staticSettings.editorOnly 的灯光组件
        if (instance instanceof SceneAsset) {
            const nodes = instance.scene?.children || [];
            for (let i = 0; i < nodes.length; i++) {
                const node: Node = nodes[i];
                const comps = node.getComponentsInChildren(LightComponent);
                comps.forEach((comp: LightComponent) => {
                    if (comp.staticSettings?.editorOnly) {
                        comp._destroyImmediate();
                    }
                });
            }
        }

        // 重新反序列化并保存
        return (options.useCCONB ? EditorExtends.serialize : EditorExtends.serializeCompiled)(
            instance,
            Object.assign(this.defaultSerializedOptions, {
                compressUuid: !options.debug,
                useCCON: options.useCCONB,
                noNativeDep: !instance._native, // 表明该资源是否存在原生依赖，这个字段在运行时会影响 preload 相关接口的表现
            }),
        );
    }

    /**
     * 获取反序列化后的原始对象
     * @param uuid
     */
    private async getRawInstance(asset: IAsset) {
        const result = {
            asset: null,
            detail: null,
        };
        if (asset.invalid) {
            console.error(
                transI18n('builder.error.asset_import_failed', {
                    url: `{asset(${asset.url})}`,
                    type: assetManager.queryAssetProperty(asset, 'type'),
                }),
            );
            return result;
        }

        const jsonSrc = asset.meta.files.includes('.json') ? asset.library + '.json' : '';
        const cconbSrc = getCCONFormatAssetInLibrary(asset);
        if (!jsonSrc && !cconbSrc) {
            // TODO 由于目前无法确认，.json 不存在是由于资源本身如此还是因为导入器 bug，只能先 debug 打印
            console.debug(
                transI18n('builder.warn.no_serialized_json', {
                    url: `{asset(${asset.url})}`,
                    type: assetManager.queryAssetProperty(asset, 'type'),
                }),
            );
            return result;
        }

        const data = jsonSrc ? await readJSON(jsonSrc) : await transformCCON(cconbSrc);
        return this.getRawInstanceFromData(data, asset);
    }

    getRawInstanceFromData(data: CCON | Object, asset: IAsset) {
        const result: {
            asset: CCAsset | null;
            detail: string | null;
        } = {
            asset: null,
            detail: null,
        };
        const deserializeDetails = new cc.deserialize.Details();
        // detail 里面的数组分别一一对应，并且指向 asset 依赖资源的对象，不可随意更改 / 排序
        deserializeDetails.reset();
        const MissingClass = EditorExtends.MissingReporter.classInstance;
        MissingClass.hasMissingClass = false;
        const deserializedAsset = deserialize(data, deserializeDetails, {
            createAssetRefs: true,
            ignoreEditorOnly: true,
            classFinder: MissingClass.classFinder,
        }) as CCAsset;
        if (!deserializedAsset) {
            console.error(
                transI18n('builder.error.deserialize_failed', {
                    url: `{asset(${asset.url})}`,
                }),
            );
            return result;
        }
        // reportMissingClass 会根据 _uuid 来做判断，需要在调用 reportMissingClass 之前赋值
        deserializedAsset._uuid = asset.uuid;

        if (MissingClass.hasMissingClass && !this.hasMissingClassUuids.has(asset.uuid)) {
            MissingClass.reportMissingClass(deserializedAsset);
            this.hasMissingClassUuids.add(asset.uuid);
        }
        // 清空缓存，防止内存泄漏
        MissingClass.reset();
        // 预览时只需找出依赖的资源，无需缓存 asset
        // 检查以及查找对应资源，并返回给对应 asset 数据
        // const missingAssets: string[] = [];
        // 根据这个方法分配假的资源对象, 确保序列化时资源能被重新序列化成 uuid
        const test = this;
        let missingAssetReporter: any = null;
        deserializeDetails.assignAssetsBy(function (uuid: string, options: { owner: object; prop: string; type: Function }) {
            const asset = test.getAsset(uuid);
            if (asset) {
                return EditorExtends.serialize.asAsset(uuid);
            } else {
                // if (!missingAssets.includes(uuid)) {
                //     missingAssets.push(uuid);
                test.hasMissingAssetsUuids.add(uuid);
                if (options && options.owner) {
                    missingAssetReporter = missingAssetReporter || new EditorExtends.MissingReporter.object(deserializedAsset);
                    missingAssetReporter.outputLevel = 'warn';
                    missingAssetReporter.stashByOwner(options.owner, options.prop, EditorExtends.serialize.asAsset(uuid, options.type));
                }
                // }
                // remove deleted asset reference
                return null;
            }
        });
        if (missingAssetReporter) {
            missingAssetReporter.reportByOwner();
        }
        // if (missingAssets.length > 0) {
        //     console.warn(
        //         transI18n('builder.error.required_asset_missing', {
        //             url: `{asset(${asset.url})}`,
        //             uuid: missingAssets.join('\n '),
        //         }),
        //     );
        // }

        // https://github.com/cocos-creator/3d-tasks/issues/6042 处理 prefab 与 scene 名称同步问题
        if (['cc.SceneAsset', 'cc.Prefab'].includes(assetManager.queryAssetProperty(asset, 'type'))) {
            deserializedAsset.name = basename(asset.source, extname(asset.source));
        }

        result.asset = deserializedAsset;
        result.detail = deserializeDetails;
        this.depend[asset.uuid] = [...new Set(deserializeDetails.uuidList)] as string[];
        return result;
    }

    /**
     * 重置
     */
    reset() {
        this.assetMap = {};
        this.meta = {};
        this.depend = {};
        this.dependedMap = {};
        this.hasMissingClassUuids.clear();
        this.hasMissingAssetsUuids.clear();
    }

    private checkUseCache(asset: IAsset): boolean {
        // 场景、prefab 资源的缓存，在发生脚本变化后就需要失效, effect 目前有构建剔除机制暂时不缓存结果
        if (!this.useCache || (['cc.SceneAsset', 'cc.Prefab', 'cc.EffectAsset'].includes(assetManager.queryAssetProperty(asset, 'type')))) {
            return false;
        }
        return true;
    }

    private checkCanSaveCache(uuid: string): boolean {
        // 场景、prefab 资源的缓存，在发生脚本变化后就需要失效
        if (this.hasMissingClassUuids.has(uuid) || this.hasMissingClassUuids.has(uuid)) {
            return false;
        }
        return true;
    }

    public getAssetProperty = assetManager.queryAssetProperty;
    public url2uuid = assetManager.url2uuid;
}
export const buildAssetLibrary = new BuildAssetLibrary();

function unExpectException(error: any) {
    console.debug(error);
}
