import { queryUUID, AssetDB, queryAsset, refresh, reimport, queryUrl, Asset, forEach, VirtualAsset } from '@editor/asset-db';
import { basename, dirname, extname, isAbsolute, join, relative } from 'path';
import { assetDBManager } from './asset-db-manager';
import { ensureOutputData, getExtendsFromCCType, libArr2Obj, removeFile, serializeCompiled, url2path, url2uuid } from '../utils';
import { assetHandlerManager } from './asset-handler-manager';
import { minimatch } from 'minimatch';
import EventEmitter from 'events';
import { copy, existsSync, move, outputFile, remove, rename } from 'fs-extra';
import Utils from '../../base/utils';
import I18n from '../../base/i18n';
import Project from '../../project';
import Script from '../script';
import { AssetOperationOption, AssetManager as IAssetManager, CreateAssetOptions, IAsset, IAssetInfo, IExportData, IExportOptions, IMoveOptions, QueryAssetsOption, QueryAssetType } from '../@types/private';
import { Meta } from '@editor/asset-db/libs/meta';
import { newConsole } from '../console';


/**
 * 对外暴露一系列的资源查询、操作接口等
 * 对外暴露资源的一些变动广播消息、事件消息
 */
export class AssetManager extends EventEmitter implements IAssetManager {

    /**
     * 1. 资源/脚本 uuid, asset -> uuid 依赖的普通资源列表
     * 2. 资源 uuid, script -> uuid 依赖的脚本列表
     * 3. 脚本 uuid, script -> uuid 脚本依赖的脚本列表
     * @param uuidOrURL
     * @param type 
     * @returns 
     */
    async queryAssetDependencies(uuidOrURL: string, type: QueryAssetType = 'asset') {
        const asset = this.queryAsset(uuidOrURL);
        if (!asset) {
            return [];
        }
        let uuids: string[] = [];
        if (['asset', 'all'].includes(type)) {
            uuids = this.queryAssetProperty(asset, 'depends');
        }
        if (['script', 'all'].includes(type)) {
            const ccType = this.queryAssetProperty(asset, 'type');
            if (ccType === 'cc.Script') {
                // 返回依赖脚本的 db URL
                // const pathList: string[] = await Editor.Message.request('programming', 'packer-driver/query-script-deps', asset.source);
                // uuids.push(...pathList.map(path => queryUUID(path)));
            } else {
                uuids.push(...this.queryAssetProperty(asset, 'dependScripts'));
            }
        }
        return uuids;
    }

    /**
     * 1. 资源/脚本 uuid, asset -> 使用 uuid 的普通资源列表
     * 2. 资源 uuid, script -> 使用 uuid 的脚本列表
     * 3. 脚本 uuid，script -> 使用此 uuid 脚本的脚本列表
     * @param uuidOrURL 
     * @param type 
     * @returns 
     */
    async queryAssetUsers(uuidOrURL: string, type: QueryAssetType = 'asset'): Promise<string[]> {
        const asset = this.queryAsset(uuidOrURL);
        if (!asset) {
            return [];
        }
        const ccType = this.queryAssetProperty(asset, 'type');
        let usages: string[] = [];

        if (['asset', 'all'].includes(type)) {
            if (ccType === 'cc.Script') {
                usages = this.queryAssetProperty(asset, 'dependedScripts');
            } else {
                usages = this.queryAssetProperty(asset, 'dependeds');
            }
        }

        if (['script', 'all'].includes(type)) {
            if (ccType === 'cc.Script') {
                const pathList: string[] = await Script.queryScriptUser(asset.source);
                pathList.forEach(path => usages.push(queryUUID(path)));
            } else {
                // 查询依赖此资源的脚本，目前依赖信息都记录在场景上，所以实际上并没有脚本会依赖资源，代码写死是无法查询的
            }
        }

        return usages;
    }

    /**
     * 传入一个 uuid 或者 url 或者绝对路径，查询指向的资源
     * @param uuidOrURLOrPath
     */
    queryAsset(uuidOrURLOrPath: string): IAsset | null {
        const uuid = Utils.UUID.isUUID(uuidOrURLOrPath) ? uuidOrURLOrPath : this.queryAssetUUID(uuidOrURLOrPath);
        for (const name in assetDBManager.assetDBMap) {
            const database = assetDBManager.assetDBMap[name];
            if (!database) {
                continue;
            }

            // 查找的是数据库, 由于数据库的单条数据不在 database 里，所以需要这里单独返回
            if (uuid === `db://${name}`) {
                return {
                    displayName: '',
                    basename: name,
                    extname: '',
                    imported: true,
                    source: `db://${name}`,
                    subAssets: {},
                    library: '',
                    parent: null,
                    userData: {},
                    isDirectory() {
                        return false;
                    },
                    uuid: `db://${name}`,
                    meta: {
                        ver: '1.0.0',
                        uuid: `db://${name}`,
                        name: name,
                        id: name,
                        subMetas: {},
                        userData: {},
                        importer: 'database',
                        imported: true,
                        files: [],
                        displayName: '',
                    },
                } as unknown as IAsset;
            }

            const asset = database.getAsset(uuid || '');
            if (asset) {
                return asset as unknown as IAsset;
            }
        }
        return null;
    }

    queryAssetInfo(urlOrUUIDOrPath: string, dataKeys?: (keyof IAssetInfo)[]): IAssetInfo | null {
        if (!urlOrUUIDOrPath || typeof urlOrUUIDOrPath !== 'string') {
            throw new Error('parameter error');
        }
        let uuid = '';

        if (urlOrUUIDOrPath.startsWith('db://')) {
            const name = urlOrUUIDOrPath.substr(5);
            if (assetDBManager.assetDBMap[name]) {
                return assetManager.queryDBAssetInfo(name);
            }
            uuid = url2uuid(urlOrUUIDOrPath);
        } else if (isAbsolute(urlOrUUIDOrPath)) {
            for (const name in assetDBManager.assetDBMap) {
                const database = assetDBManager.assetDBMap[name];
                if (!database) {
                    continue;
                }
                if (database.path2asset.has(urlOrUUIDOrPath)) {
                    uuid = database.path2asset.get(urlOrUUIDOrPath)!.uuid;
                    break;
                }
            }
        } else {
            uuid = urlOrUUIDOrPath;
        }

        if (!uuid) {
            return null;
        }

        return this.queryAssetInfoByUUID(uuid, dataKeys);
    }

    /**
     * 查询指定资源的信息
     * @param uuid 资源的唯一标识符
     * @param dataKeys 资源输出可选项
     */
    queryAssetInfoByUUID(uuid: string, dataKeys?: (keyof IAssetInfo)[]): IAssetInfo | null {
        if (!uuid) {
            return null;
        }
        // 查询资源
        const asset = queryAsset(uuid);
        if (!asset) {
            return null;
        }

        return this.encodeAsset(asset, dataKeys);
    }

    /**
     * 根据提供的 options 查询对应的资源数组(不包含数据库对象)
     * @param options 搜索配置
     * @param dataKeys 指定需要的资源信息字段
     */
    queryAssetInfos(options?: QueryAssetsOption, dataKeys?: (keyof IAssetInfo)[]): IAssetInfo[] {
        let allAssets: IAsset[] = [];
        const dbInfos: IAssetInfo[] = [];
        // 循环每一个已经启动的 database
        for (const name in assetDBManager.assetDBMap) {
            const database = assetDBManager.assetDBMap[name];
            allAssets = allAssets.concat(Array.from(database.uuid2asset.values()));
            dbInfos.push(this.queryDBAssetInfo(name)!);
        }
        let filterAssets: IAsset[] = allAssets;
        if (options) {
            if (options.isBundle) {
                // 兼容旧版本使用 isBundle 查询会默认带上 meta 的行为
                dataKeys = (dataKeys || []).concat(['meta']);
            }
            // 根据选项筛选过滤的函数信息
            const filterInfos = FilterHandlerInfos.filter(info => {
                info.value = options[info.name];
                if (info.resolve) {
                    info.value = info.resolve(info.value);
                }
                if (info.value === undefined) {
                    return false;
                }
                return true;
            });
            filterAssets = searchAssets(filterInfos, allAssets);
        }
        const result = filterAssets.map((asset) => this.encodeAsset(asset, dataKeys));
        if (!options || (allAssets.length && allAssets.length === result.length)) {
            // 无效过滤条件或者查询全部资源时需要包含默认 db 的资源，主要为了兼容旧版本的接口行为，正常资源查询应该不包含数据库对象
            return result.concat(dbInfos);
        } else if (options.pattern && Object.keys(options).length === 1) {
            // 存在 pattern 参数时，需要包含数据库对象，主要是兼容旧版本行为
            return dbInfos.filter((db) => {
                return minimatch(db.url, options.pattern!);
            }).concat(result);
        } else {
            return result;
        }
    }

    queryAssets(options: QueryAssetsOption = {}) {
        if (typeof options !== 'object' || Array.isArray(options)) {
            options = {};
        }

        let assets: IAsset[] = [];
        // 循环每一个已经启动的 database
        for (const name in assetDBManager.assetDBMap) {
            if (!(name in assetDBManager.assetDBMap)) {
                continue;
            }

            const database = assetDBManager.assetDBMap[name];
            assets = assets.concat(Array.from(database.uuid2asset.values()));
        }

        if (options) {
            // 根据选项筛选过滤的函数信息
            const filterInfos = FilterHandlerInfos.filter(info => {
                info.value = options[info.name];
                if (info.resolve) {
                    info.value = info.resolve(info.value);
                }
                if (info.value === undefined) {
                    return false;
                }
                return true;
            });
            assets = searchAssets(filterInfos, assets);
        }
        return assets;
    }

    async saveAssetMeta(uuid: string, meta: Meta, info?: IAsset) {
        // 不能为数组
        if (
            typeof meta !== 'object'
            || Array.isArray(meta)
        ) {
            throw new Error(`Save meta failed(${uuid}): The meta must be an Object string`);
        }
        info = info || this.queryAsset(uuid)!;
        mergeMeta(info.meta, meta);
        await info.save(); // 这里才是将数据保存到 .meta 文件
    }

    async saveAsset(uuidOrURLOrPath: string, content: string | Buffer) {
        const asset = this.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${I18n.t('asset-db.saveAsset.fail.asset')}`);
        }
        if (asset._assetDB.options.readonly) {
            throw new Error(`${I18n.t('asset-db.operation.readonly')} \n  url: ${asset.url}`);
        }
        if (content === undefined) {
            throw new Error(`${I18n.t('asset-db.saveAsset.fail.content')}`);
        }
        if (!asset.source) {
            // 不存在源文件的资源无法保存
            throw new Error(`${I18n.t('asset-db.saveAsset.fail.uuid')}`);
        }

        const res = await assetHandlerManager.saveAsset(asset, content);
        if (res) {
            this.reimportAsset(asset.uuid);
        }
        return assetManager.encodeAsset(asset);
    }

    /**
     * 将一个 Asset 转成 info 对象
     * @param database
     * @param asset
     * @param invalid 是否是无效的资源，例如已被删除的资源
     */
    encodeAsset(asset: IAsset, dataKeys: (keyof IAssetInfo)[] = ['displayName', 'subAssets', 'redirect', 'visible', 'extends'], invalid = false) {
        let name = '';
        let source = '';
        let file = '';
        const database = asset._assetDB;
        if (asset.uuid === asset.source || (asset instanceof Asset && asset.source)) {
            name = basename(asset.source);
            source = assetDBManager.path2url(asset.source, database.options.name);
            file = asset.source;
        } else {
            name = asset._name;
        }

        let path = name;
        let url = name;

        // 注：asset.uuid === asset.source 是 mac 上的 db://assets
        if (asset.uuid === asset.source || asset instanceof Asset) {
            url = path = source;
        } else {
            let parent: Asset | VirtualAsset | null = asset.parent;
            while (parent && !(parent instanceof Asset)) {
                path = `${parent._name}/${name}`;
                parent = parent.parent;
            }
            // @ts-ignore
            if (parent instanceof Asset) {
                const ext = extname(parent._source);
                const tempSource = assetDBManager.path2url(parent._source, database.options.name);
                url = tempSource + '/' + path;
                path = tempSource.substr(0, tempSource.length - ext.length) + '/' + path;
            }
        }
        let isDirectory = false;
        try {
            isDirectory = asset.isDirectory();
        } catch (error) {
            if (invalid) {
                // 被删除的资源此处抛异常不报错
                console.debug(error);
            } else {
                console.error(error);
            }
            isDirectory = extname(asset.source) === '';
        }
        if (!isDirectory) {
            path = path.replace(/\.[^./]+$/, '');
        }

        const info: IAssetInfo = {
            name,
            displayName: asset.displayName,
            source,
            path, // loader 加载使用的路径
            url, // 实际的带有扩展名的路径
            file, // 实际磁盘路径
            uuid: asset.uuid,
            importer: asset.meta.importer,
            imported: asset.meta.imported, // 是否结束导入过程
            invalid: asset.invalid, // 是否导入成功
            type: this.queryAssetProperty(asset, 'type'),
            isDirectory,
            instantiation: this.queryAssetProperty(asset, 'instantiation'),
            readonly: database.options.readonly,
            library: libArr2Obj(asset),
        };

        dataKeys.forEach((key) => {
            // @ts-ignore 2322
            info[key] = this.queryAssetProperty(asset, key) ?? info[key];
        });

        // 没有显示指定获取 isBundle 字段时，默认只有 bundle 文件夹才会加上标记
        if (!dataKeys.includes('isBundle')) {
            const value = this.queryAssetProperty(asset, 'isBundle');
            if (value) {
                info.isBundle = true;
            }
        }

        if (dataKeys.includes('fatherInfo') && asset.parent) {
            info.fatherInfo = {
                source: asset.parent.source,
                library: libArr2Obj(asset.parent),
                uuid: asset.parent.uuid,
            };
        }
        if (dataKeys.includes('subAssets')) {
            info.subAssets = {};
            for (const name in asset.subAssets) {
                if (!(name in asset.subAssets)) {
                    continue;
                }
                const childInfo: IAssetInfo = this.encodeAsset(asset.subAssets[name], dataKeys);
                info.subAssets[name] = childInfo;
            }
        }
        return info;
    }

    queryAssetProperty(asset: IAsset, property: (keyof IAssetInfo | 'depends' | 'dependScripts' | 'dependedScripts')): any {

        switch (property) {
            case 'path':
                {
                    const name = this.queryAssetProperty(asset, 'name') as string;
                    let path = name;
                    // 注：asset.uuid === asset.source 是 mac 上的 db://assets
                    if (asset instanceof Asset) {
                        path = assetDBManager.path2url(asset.source, asset._assetDB.options.name);
                    } else {
                        let parent: Asset | VirtualAsset | null = asset.parent;
                        while (parent && !(parent instanceof Asset)) {
                            path = `${parent._name}/${name}`;
                            parent = parent.parent;
                        }
                        // @ts-ignore
                        if (parent instanceof Asset) {
                            const ext = extname(parent._source);
                            const tempSource = assetDBManager.path2url(parent._source, asset._assetDB.options.name);
                            path = tempSource.substr(0, tempSource.length - ext.length) + '/' + path;
                        }
                    }

                    const isDirectory = asset.isDirectory();
                    if (!isDirectory) {
                        path = path.replace(/\.[^./]+$/, '');
                    }
                    return path;
                }
            case 'name':
                if (asset.uuid === asset.source || (asset instanceof Asset && asset.source)) {
                    return basename(asset.source);
                } else {
                    return asset._name;
                }
            case 'url':
                {
                    const name = this.queryAssetProperty(asset, 'name') as string;
                    if (asset.uuid === asset.source || asset instanceof Asset) {
                        return assetDBManager.path2url(asset.source, asset._assetDB.options.name);
                    } else {
                        let path = name;
                        let parent: Asset | VirtualAsset | null = asset.parent;
                        while (parent && !(parent instanceof Asset)) {
                            path = `${parent._name}/${name}`;
                            parent = parent.parent;
                        }
                        // @ts-ignore
                        if (parent instanceof Asset) {
                            const tempSource = assetDBManager.path2url(parent._source, asset._assetDB.options.name);
                            return tempSource + '/' + path;
                        } else {
                            return path;
                        }
                    }
                }
            case 'type':
                {
                    const handler = assetHandlerManager.name2handler[asset.meta.importer] || asset._assetDB.importerManager.name2importer[asset.meta.importer] || null;
                    return handler ? handler.assetType || 'cc.Asset' : 'cc.Asset';
                }
            case 'isBundle':
                return asset.meta.userData && asset.meta.userData.isBundle;
            case 'instantiation':
                {
                    const handler = assetHandlerManager.name2handler[asset.meta.importer] || asset._assetDB.importerManager.name2importer[asset.meta.importer] || null;
                    return handler ? handler.instantiation : undefined;
                }
            case 'library':
                return libArr2Obj(asset);
            case 'displayName':
                return asset.displayName;
            case 'redirect':
                // 整理跳转数据
                if (asset.meta.userData && asset.meta.userData.redirect) {
                    const redirectInfo = this.queryAsset(asset.meta.userData.redirect);
                    if (redirectInfo) {
                        const redirectHandler = assetHandlerManager.name2handler[redirectInfo.meta.importer] || null;
                        return {
                            uuid: redirectInfo.uuid,
                            type: redirectHandler ? redirectHandler.assetType || 'cc.Asset' : 'cc.Asset',
                        };
                    }
                }
                return;
            case 'extends':
                {
                    // 此处兼容了旧的资源导入器
                    const CCType = this.queryAssetProperty(asset, 'type');
                    return getExtendsFromCCType(CCType);
                }
            case 'visible':
                {
                    // @ts-ignore TODO 底层 options 并无此字段
                    let visible = asset._assetDB.options.visible;
                    if (visible && asset.userData.visible === false) {
                        visible = false;
                    }
                    return visible === false ? false : true;
                }
            case 'mtime':
                {
                    const info = asset._assetDB.infoManager.get(asset.source);
                    return info ? info.time : null;
                }
            case 'meta':
                return asset.meta;
            case 'depends':
                {
                    return Array.from(asset.getData('depends') || []);
                }
            case 'dependeds':
                {
                    const usedList: string[] = [];
                    // 包含子资源时，子资源的使用也算使用父资源
                    const uuids = Object.values(asset.subAssets).map((subAsset) => subAsset.uuid);
                    let collectUuid: Function;
                    if (uuids.length) {
                        uuids.push(asset.uuid);
                        collectUuid = (depends: string[], uuid: string) => {
                            uuids.forEach((item) => {
                                // 需要剔除资源自身的重复依赖信息
                                if (depends.includes(item) && !uuids.includes(uuid)) {
                                    usedList.push(uuid);
                                }
                            });
                        };
                    } else {
                        collectUuid = (depends: string[], uuid: string) => {
                            if (depends.includes(asset.uuid)) {
                                usedList.push(uuid);
                            }
                        };
                    }
                    forEach((db: AssetDB) => {
                        const map = db.dataManager.dataMap;
                        for (const id in map) {
                            const item = map[id];
                            if (item.value && item.value.depends && item.value.depends.length) {
                                collectUuid(item.value.depends, id);
                            }
                        }
                    });
                    return usedList;
                }
            case 'dependScripts':
                {
                    const data = asset._assetDB.dataManager.dataMap[asset.uuid];
                    return Array.from(data && data.value && data.value['dependScripts'] || []);
                }
            case 'dependedScripts':
                {
                    const usedList: string[] = [];
                    forEach((db: AssetDB) => {
                        const map = db.dataManager.dataMap;
                        for (const id in map) {
                            const item = map[id];
                            if (item.value && item.value.dependScripts && item.value.dependScripts.includes(asset.uuid)) {
                                usedList.push(id);
                            }
                        }
                    });
                    return usedList;
                }
        }
    }

    /**
     * 查询指定的资源的 meta
     * @param uuid 资源的唯一标识符
     */
    queryAssetMeta(uuid: string): Meta | null {
        if (!uuid || typeof uuid !== 'string') {
            return null;
        }
        if (uuid.startsWith('db://')) {
            const name = uuid.substr(5);
            if (assetDBManager.assetDBMap[name]) {
                // @ts-ignore DB 数据库并不存在 meta 理论上并不需要返回，但旧版本已支持
                return {
                    // displayName: name,
                    files: [],
                    // id: '',
                    imported: true,
                    importer: 'database',
                    // name: '',
                    subMetas: {},
                    userData: {},
                    uuid: uuid,
                    ver: '1.0.0',
                };
            }
            uuid = url2uuid(uuid);
        }
        const asset = queryAsset(uuid);
        if (!asset) {
            return null;
        }

        return asset.meta;
    }

    /**
     * 查询指定的资源以及对应 meta 的 mtime
     * @param uuid 资源的唯一标识符
     */
    queryAssetMtime(uuid: string) {
        if (!uuid || typeof uuid !== 'string') {
            return null;
        }

        for (const name in assetDBManager.assetDBMap) {
            if (!(name in assetDBManager.assetDBMap)) {
                continue;
            }
            const database: AssetDB = assetDBManager.assetDBMap[name];
            if (!database) {
                continue;
            }
            const asset = database.getAsset(uuid);
            if (asset) {
                const info = database.infoManager.get(asset.source);
                return info ? info.time : null;
            }
        }
        return null;
    }

    queryAssetUUID(urlOrPath: string): string | null {
        if (!urlOrPath || typeof urlOrPath !== 'string') {
            return null;
        }

        if (urlOrPath.startsWith('db://')) {
            const name = urlOrPath.substr(5);
            if (assetDBManager.assetDBMap[name]) {
                return `db://${name}`;
            }
            const uuid = url2uuid(urlOrPath);
            if (uuid) {
                return uuid;
            }
        }

        try {
            return queryUUID(urlOrPath);
        } catch (error) {
            return null;
        }
    }

    /**
     * db 根节点不是有效的 asset 类型资源
     * 这里伪造一份它的数据信息
     * @param name db name
     */
    queryDBAssetInfo(name: string): IAssetInfo | null {
        const dbInfo = assetDBManager.assetDBInfo[name];
        if (!dbInfo) {
            return null;
        }

        const info = {
            name,
            displayName: name || '',
            source: `db://${name}`,
            path: `db://${name}`,
            url: `db://${name}`,
            file: dbInfo.target, // 实际磁盘路径
            uuid: `db://${name}`,
            importer: 'database',
            imported: true,
            invalid: false,
            type: 'database',
            isDirectory: false,
            library: {},
            subAssets: {},
            visible: dbInfo.visible,
            instantiation: undefined,
            readonly: dbInfo.readonly,
        };

        return info;
    }

    queryUrl(uuidOrPath: string) {
        if (!uuidOrPath || typeof uuidOrPath !== 'string') {
            throw new Error('parameter error');
        }

        // 根路径 /assets, /internal 对应的 url 模拟数据
        const name = uuidOrPath.substr(Project.info.path.length + 1);
        if (assetDBManager.assetDBMap[name]) {
            return `db://${name}`;
        }
        return queryUrl(uuidOrPath);
    }

    checkValidUrl(urlOrPath: string) {
        if (!urlOrPath.startsWith('db://')) {
            urlOrPath = this.queryUrl(urlOrPath);
            if (!urlOrPath) {
                throw new Error(`${I18n.t('asset-db.operation.invalid_url')} \n  url: ${urlOrPath}`);
            }
        }

        const dbName = urlOrPath.split('/').filter(Boolean)[1];
        const dbInfo = assetDBManager.assetDBInfo[dbName];

        if (dbInfo.readonly) {
            throw new Error(`${I18n.t('asset-db.operation.readonly')} \n  url: ${urlOrPath}`);
        }

        return true;
    }

    async createAsset(options: CreateAssetOptions) {
        if (!options.target || typeof options.target !== 'string') {
            throw new Error(`Cannot create asset because options.target is required.`);
        }
        // 判断目标路径是否为只读
        this.checkValidUrl(options.target);
        if (!isAbsolute(options.target)) {
            options.target = url2path(options.target);
        }

        const assetPath = await assetHandlerManager.createAsset(options);
        if (!assetPath || !assetPath.length) {
            return null;
        }
        let paths: string[] = [];
        if (typeof assetPath === 'string') {
            paths = [assetPath];
        } else {
            paths = assetPath;
        }
        const result = await Promise.all(paths.map(async (path) => {
            await this.refreshAsset(path);
            return this.queryAssetInfo(queryUUID(path));
        }));
        return result.length === 1 ? result[0] : result;
    }

    /**
     * 生成导出数据接口，主要用于：预览、构建阶段
     * @param asset 
     * @param options 
     * @returns 
     */
    async generateExportData(asset: Asset, options?: IExportOptions): Promise<IExportData | null> {
        // 3.8.3 以上版本，资源导入后的数据将会记录在 asset.outputData 字段内部
        let outputData: IExportData = asset.getData('output');
        if (outputData && !options) {
            return outputData;
        }
        // 1.优先调用资源处理器内的导出逻辑
        // 需要注意，由于有类似的用法，因而 assetManager 只能在构建阶段使用，无法在给资源处理器内调用
        const data = await assetHandlerManager.generateExportData(asset, options);
        if (data) {
            return data;
        }

        // 2. 默认的导出流程
        // 2.1 无序列化数据的，视为引擎运行时无法支持的资源，不导出
        if (!asset.meta.files.includes('.json') && !asset.meta.files.includes('.cconb')) {
            return null;
        }
        outputData = ensureOutputData(asset);

        // 2.2 无具体的导出选项或者导出信息内不包含序列化数据，则使用默认的导出信息即可
        if (!options || !outputData.native) {
            return outputData;
        }

        // 2.3 TODO 根据不同的 options 条件生成不同的序列化结果
        // const cachePath = assetOutputPathCache.query(asset.uuid, options);
        // if (!cachePath) {
        //     const assetData = await serializeCompiled(asset, options);
        //     await outputFile(outputData.import.path, assetData);
        //     await assetOutputPathCache.add(asset, options, outputData.import.path);
        // } else {
        //     outputData.import.path = cachePath;
        // }

        // asset.setData('output', outputData);
        return outputData;
    }

    /**
     * 拷贝生成导入文件到最终目标地址，主要用于：构建阶段
     * @param handler
     * @param src
     * @param dest
     * @returns
     */
    async outputExportData(handler: string, src: IExportData, dest: IExportData) {
        const res = await assetHandlerManager.outputExportData(handler, src, dest);
        if (!res) {
            await copy(src.import.path, dest.import.path);
            if (src.native && dest.native) {
                const nativeSrc: string[] = Object.values(src.native);
                const nativeDest: string[] = Object.values(dest.native);
                await Promise.all(nativeSrc.map((path, i) => copy(path, nativeDest[i])));
            }
        }
    }

    /**
     * 刷新某个资源或是资源目录
     * @param pathOrUrlOrUUID 
     * @returns boolean
     */
    async refreshAsset(pathOrUrlOrUUID: string): Promise<void> {
        // 将实际的刷新任务塞到 db 管理器的队列内等待执行
        return await assetDBManager.addTask(this._refreshAsset.bind(this), [pathOrUrlOrUUID]);
    }

    private async _refreshAsset(pathOrUrlOrUUID: string, autoRefreshDir = true): Promise<void> {
        console.debug(`start refresh asset from ${pathOrUrlOrUUID}...`);
        const result = await refresh(pathOrUrlOrUUID);
        if (autoRefreshDir) {
            // HACK 某些情况下导入原始资源后，文件夹的 mtime 会发生变化，导致资源量大的情况下下次获得焦点自动刷新时会有第二次的文件夹大批量刷新
            // 用进入队列的方式才能保障 pause 等机制不会被影响
            assetDBManager.addTask(assetDBManager.autoRefreshAssetLazy.bind(assetDBManager), [dirname(pathOrUrlOrUUID)]);
        }
        // this.autoRefreshAssetLazy(dirname(pathOrUrlOrUUID));
        console.debug(`refresh asset ${dirname(pathOrUrlOrUUID)} success`);
        return result;
    }

    /**
     * 重新导入某个资源
     * @param pathOrUrlOrUUID 
     * @returns 
     */
    async reimportAsset(pathOrUrlOrUUID: string): Promise<void> {
        return await assetDBManager.addTask(this._reimportAsset.bind(this), [pathOrUrlOrUUID]);
    }

    private async _reimportAsset(pathOrUrlOrUUID: string): Promise<void> {
        // 底层的 reimport 不支持子资源的 url 改为使用 uuid 重新导入
        if (pathOrUrlOrUUID.startsWith('db://')) {
            pathOrUrlOrUUID = url2uuid(pathOrUrlOrUUID);
        }
        newConsole.trackTimeStart('asset-db:reimport-asset' + pathOrUrlOrUUID);
        await reimport(pathOrUrlOrUUID);
        newConsole.trackTimeEnd('asset-db:reimport-asset' + pathOrUrlOrUUID, { output: true });
    }

    /**
     * 移动资源
     * @param source 源文件的 url db://assets/abc.txt
     * @param target 目标 url db://assets/a.txt
     * @param option 导入资源的参数 { overwrite, xxx, rename }
     * @returns {Promise<IAssetInfo | null>}
     */
    async moveAsset(source: string, target: string, option?: AssetOperationOption) {
        return await assetDBManager.addTask(this._moveAsset.bind(this), [source, target, option]);
    }

    private async _moveAsset(source: string, target: string, option?: AssetOperationOption) {
        console.debug(`start move asset from ${source} -> ${target}...`);
        const overwrite = existsSync(target) && option?.overwrite;
        if (overwrite) {
            // 要覆盖目标文件时，需要先删除目标文件
            await this._removeAsset(target);
        }
        await moveFile(source, target, option);

        const url = queryUrl(target);
        const reg = /db:\/\/[^/]+/.exec(url);
        // 常规的资源移动：期望只有 change 消息
        if (reg && reg[0] && url.startsWith(reg[0])) {
            await this.refreshAsset(target);
            // 因为文件被移走之后，文件夹的 mtime 会变化，所以要主动刷新一次被移走文件的文件夹
            // 必须在目标位置文件刷新完成后再刷新，如果放到前面，会导致先识别到文件被删除，触发 delete 后再发送 add
            await this.refreshAsset(dirname(source));
        } else {
            // 跨数据库移动资源或者覆盖操作时需要先刷目标文件，触发 delete 后再发送 add
            await this.refreshAsset(source);
            await this.refreshAsset(target);
        }
        console.debug(`move asset from ${source} -> ${target} success`);
    }

    /**
     * 重命名某个资源
     * @param source 
     * @param target 
     */
    async renameAsset(source: string, target: string, option?: AssetOperationOption) {
        return await assetDBManager.addTask(this._renameAsset.bind(this), [source, target, option]);
    }

    private async _renameAsset(source: string, target: string, option?: AssetOperationOption) {
        console.debug(`start rename asset from ${source} -> ${target}...`);
        const uri = {
            basename: basename(target),
            dirname: dirname(target),
        };
        const temp = join(uri.dirname, '.rename_temp');

        // 改到临时路径，然后刷新，删除原来的缓存
        await rename(source + '.meta', temp + '.meta');
        await rename(source, temp);
        await this._refreshAsset(source, false);

        // 改为真正的路径，然后刷新，用新名字重新导入
        await rename(temp + '.meta', target + '.meta');
        await rename(temp, target);
        await this._refreshAsset(target);
        // TODO 返回资源信息
        console.debug(`rename asset from ${source} -> ${target} success`);
    }

    /**
     * 移除资源
     * @param path 
     * @returns 
     */
    async removeAsset(uuidOrURLOrPath: string): Promise<IAssetInfo | null> {
        const asset = this.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${I18n.t('asset-db.deleteAsset.fail.unexist')} \nsource: ${uuidOrURLOrPath}`);
        }
        if (asset._assetDB.options.readonly) {
            throw new Error(`${I18n.t('asset-db.operation.readonly')} \n  url: ${asset.url}`);
        }
        const path = asset.source;
        const res = await assetDBManager.addTask(this._removeAsset.bind(this), [path]);
        return res ? this.encodeAsset(asset) : null;
    }

    private async _removeAsset(path: string): Promise<boolean> {
        console.debug(`start remove asset ${path}...`);
        let res = false;
        try {
            await removeFile(path);
            await this.refreshAsset(path);
            res = true;
            console.debug(`remove asset ${path} success`);
        } catch (error) {
            console.warn(`${I18n.t('asset-db.deleteAsset.fail.unknown')}`);
            console.warn(error);
        }
        return res;
    }

    url2uuid(url: string) {
        return url2uuid(url);
    }
    url2path(url: string) {
        return url2path(url);
    }
    path2url(url: string, dbName?: string) {
        return assetDBManager.path2url(url, dbName);
    }

    // ------------- 实例化方法 ------------
    init() {
        assetDBManager.on('db-created', this._onAssetDBCreated);
        assetDBManager.on('db-removed', this._onAssetDBRemoved);
    }

    destroyed() {
        assetDBManager.removeListener('db-created', this._onAssetDBCreated);
        assetDBManager.removeListener('db-removed', this._onAssetDBRemoved);
    }

    _onAssetDBCreated(db: AssetDB) {
        db.on('unresponsive', onUnResponsive);
        // db.on('added', assetManager._onAssetAdded);
        // db.on('changed', assetManager._onAssetChanged);
        // db.on('deleted', assetManager._onAssetDeleted);

        // db.on('add', assetAdd);
        // db.on('delete', assetChange);
        // db.on('change', assetDeleted);
    }

    // _onAssetDBStarted(db: AssetDB) {
    //     // 移除一些仅进度条使用的监听
    //     db.removeListener('add', assetAdd);
    //     db.removeListener('change', assetChange);
    //     db.removeListener('delete', assetDeleted);
    // }
    _onAssetDBRemoved(db: AssetDB) {
        db.removeListener('unresponsive', onUnResponsive);
        // db.removeListener('added', assetManager._onAssetAdded);
        // db.removeListener('changed', assetManager._onAssetChanged);
        // db.removeListener('deleted', assetManager._onAssetDeleted);
    }
}

export const assetManager = new AssetManager();

// --------------- event handler -------------------

async function onUnResponsive(asset: VirtualAsset) {
    if (assetDBManager.ready) {
        // 当打开项目后，导入超时的时候，弹出弹窗
        console.error(`Resource import Timeout.\n  uuid: ${asset.uuid}\n  url: ${asset.url}`);
    } else {
        console.debug('import asset unresponsive');
        // 正在打开项目的时候，超时了，需要在窗口上显示超时
        // const current = asset._taskManager._execID - asset._taskManager._execThread;
        // Task.updateSyncTask(
        //     'import-asset',
        //     i18n.translation('asset-db.mask.loading'),
        //     `${queryUrl(asset.source)}\n(${current}/${asset._taskManager.total()})`
        // );
    }
}

/**
 * 将两个 meta 合并
 * 因为 meta 的可能被其他 asset 直接引用，所以不能直接覆盖
 * subMetas 里的数据是另一个 asset 的 meta，所以也需要拷贝
 * @param a 
 * @param b 
 */
function mergeMeta(a: Meta, b: Meta) {
    Object.keys(b).map((key) => {
        if (key === 'subMetas') {
            Object.keys(b.subMetas).forEach((id) => {
                if (!a.subMetas[id]) {
                    a.subMetas[id] = {} as Meta;
                }
                mergeMeta(a.subMetas[id], b.subMetas[id]);
            });
            if (a.subMetas) {
                Object.keys(a.subMetas).forEach((id) => {
                    if (!(id in b.subMetas)) {
                        delete a.subMetas[id];
                    }
                });
            }
        } else {
            // @ts-ignore
            a[key] = b[key];
        }
    });
}

// 根据资源类型筛选
const TYPES: Record<string, string[]> = {
    scripts: ['.js', '.ts'],
    scene: ['.scene'],
    effect: ['.effect'],
    image: ['.jpg', '.png', '.jpeg', '.webp', '.tga'],
};

export function searchAssets(filterHandlerInfos: FilterHandlerInfo[], assets: IAsset[], resultAssets: IAsset[] = []) {
    if (!filterHandlerInfos.length) {
        return assets;
    }
    assets.forEach((asset: Asset | VirtualAsset) => {
        if (asset.subAssets && Object.keys(asset.subAssets).length > 0) {
            searchAssets(
                filterHandlerInfos,
                Object.values(asset.subAssets),
                resultAssets,
            );
        }
        const unMatch = filterHandlerInfos.some((filterHandlerInfo) => {
            if (filterHandlerInfo.value === undefined) {
                return false;
            }
            return !filterHandlerInfo.handler(filterHandlerInfo.value, asset);
        });
        if (!unMatch) {
            resultAssets.push(asset);
        }
    });

    return resultAssets;
}

function filterUserDataInfo(userDataFilters: Record<string, any>, asset: IAsset) {
    return !Object.keys(userDataFilters).some((key) => userDataFilters[key] !== asset.meta.userData[key]);
}

interface FilterHandlerInfo {
    name: keyof QueryAssetsOption;
    // 实际的处理方法
    handler: (value: any, assets: IAsset) => boolean;
    // 对过滤数据进行转换检查，返回 null 表示当前数据无效
    resolve?: (value: any) => any | undefined;
    value?: any;
}

const FilterHandlerInfos: FilterHandlerInfo[] = [{
    name: 'ccType',
    handler: (ccTypes: string[], asset: IAsset) => {
        return ccTypes.includes(assetManager.queryAssetProperty(asset, 'type'));
    },
    resolve: (value: string | string[]) => {
        if (typeof value === 'string') {
            if (typeof value === 'string') {
                return [value.trim()];
            } else if (Array.isArray(value)) {
                return value;
            } else {
                return undefined;
            }
        }
        return value;
    },
}, {
    name: 'pattern',
    handler: (value: string, asset) => {
        const path = assetManager.queryAssetProperty(asset, 'path');
        const url = assetManager.queryAssetProperty(asset, 'url');
        return minimatch(path, value) || minimatch(url, value);
    },
    resolve: (value: string | string[]) => {
        return typeof value === 'string' ? value : undefined;
    },
}, {
    name: 'importer',
    handler: (importers: string[], asset) => {
        return importers.includes(asset.meta.importer);
    },
    resolve: (value: string | string[]) => {
        if (typeof value === 'string') {
            if (typeof value === 'string') {
                return [value.trim()];
            } else if (Array.isArray(value)) {
                return value;
            } else {
                return;
            }
        }
    },
}, {
    name: 'isBundle',
    handler: (value: boolean, asset) => {
        return (!!assetManager.queryAssetProperty(asset, 'isBundle')) === value;
    },
}, {
    name: 'extname',
    handler: (extensionNames: string[], asset) => {
        const extension = extname(asset.source).toLowerCase();
        if (extensionNames.includes(extension) && !/\.d\.ts$/.test(asset.source)) {
            return true;
        }
        return false;
    },
    resolve(value: string | string[]) {
        if (typeof value === 'string') {
            return [value.trim().toLocaleLowerCase()];
        } else if (Array.isArray(value)) {
            return value.map(name => name.trim().toLocaleLowerCase());
        } else {
            return;
        }
    },
}, {
    name: 'userData',
    handler: (value: Record<string, any>, asset) => {
        return filterUserDataInfo(value, asset);
    },
}, {
    name: 'type',
    handler: (types: string[], asset) => {
        return types.includes(extname(asset.source)) && !/\.d\.ts$/.test(asset.source);
    },
    resolve: (value: string) => {
        const types = TYPES[value];
        if (!types) {
            return;
        }
        console.warn(I18n.t('asset-db.deprecatedTip', {
            oldName: 'options.type',
            newName: 'options.ccType',
            version: '3.8.0',
        }));
        return types;
    },
}];


/**
 * 移动文件
 * @param file
 */
export async function moveFile(source: string, target: string, options?: IMoveOptions) {
    if (!existsSync(source) || !existsSync(source + '.meta')) {
        return;
    }

    if (!options) {
        if (existsSync(target) || existsSync(target + '.meta')) {
            return;
        }

        options = { overwrite: false }; // fs move 要求实参 options 要有值
    }
    const tempDir = join(Project.info.tmpDir, 'asset-db', 'move-temp');
    const relativePath = relative(Project.info.path, target);
    try {
        if (!Utils.Path.contains(source, target)) {
            await move(source + '.meta', target + '.meta', { overwrite: true }); // meta 先移动
            await move(source, target, options);
            return;
        }
        // assets/scripts/scripts -> assets/scripts 直接操作会报错，需要分次执行
        // 清空临时目录
        await remove(join(tempDir, relativePath));
        await remove(join(tempDir, relativePath) + '.meta');

        // 先移动到临时目录
        await move(source + '.meta', join(tempDir, relativePath) + '.meta', { overwrite: true }); // meta 先移动
        await move(source, join(tempDir, relativePath), { overwrite: true });

        // 再移动到目标目录
        await move(join(tempDir, relativePath) + '.meta', target + '.meta', { overwrite: true }); // meta 先移动
        await move(join(tempDir, relativePath), target, options);
    } catch (error) {
        console.error(`asset db moveFile from ${source} -> ${target} fail!`);
        console.error(error);
    }
}