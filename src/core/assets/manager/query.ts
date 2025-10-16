import { queryUUID, queryAsset, VirtualAsset, AssetDB, queryUrl, Asset, forEach, queryPath } from '@editor/asset-db';
import { Meta } from '@editor/asset-db/libs/meta';
import { isAbsolute, basename, extname } from 'path';
import { QueryAssetType, IAsset } from '../@types/protected';
import { AssetHandlerType, IAssetInfo, QueryAssetsOption } from '../@types/public';
import { FilterPluginOptions, IPluginScriptInfo } from '../../scripting/interface';
import { url2uuid, libArr2Obj, getExtendsFromCCType } from '../utils';
import assetDBManager from './asset-db';
import assetHandlerManager from './asset-handler';
import script from '../../scripting';
import i18n from '../../base/i18n';
import assetConfig from '../asset-config';
import minimatch from 'minimatch';
import utils from '../../base/utils';
import { existsSync } from 'fs-extra';

class AssetQueryManager {

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
                const pathList: string[] = await script.queryScriptUser(asset.source);
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
        const uuid = utils.UUID.isUUID(uuidOrURLOrPath) ? uuidOrURLOrPath : this.queryUUID(uuidOrURLOrPath);
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
                return this.queryDBAssetInfo(name);
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

    /**
     * 查询符合某个筛选规则的排序后的插件脚本列表
     * @param filterOptions 
     * @returns
     */
    querySortedPlugins(filterOptions: FilterPluginOptions = {}): IPluginScriptInfo[] {
        const plugins = this.queryAssetInfos({
            ccType: 'cc.Script',
            userData: {
                ...filterOptions,
                isPlugin: true,
            },
        }, ['name']);
        if (!plugins.length) {
            return [];
        }

        // 1. 先按照默认插件脚本的排序规则，取插件脚本名称排序
        plugins.sort((a, b) => a.name.localeCompare(b.name));

        // 2. 根据项目设置内配置好的脚本优先级顺序，调整原有的脚本排序
        const sorted: string[] = assetConfig.data.sortingPlugin;
        if (Array.isArray(sorted) && sorted.length) {
            // 过滤掉用户配置排序中不符合当前环境或者说不存在的插件脚本
            const filterSorted = sorted.filter((uuid) => plugins.find(info => info.uuid === uuid));
            // 倒序处理主要是为了兼容 383 之前的处理规则，保持一致的结果行为。顺序排结果有差异。
            filterSorted.reverse().reduce((preIndex, current) => {
                const currentIndex = plugins.findIndex((info) => info.uuid === current);
                if (currentIndex > preIndex) {
                    const scripts = plugins.splice(currentIndex, 1);
                    plugins.splice(preIndex, 0, scripts[0]);
                    return preIndex;
                }
                return currentIndex;
            }, plugins.length);
        }

        return plugins.map((asset) => {
            return {
                uuid: asset.uuid,
                file: asset.library + '.js',
                url: asset.url,
            };
        });
    }


    /**
     * 将一个 Asset 转成 info 对象
     * @param database
     * @param asset
     * @param invalid 是否是无效的资源，例如已被删除的资源
     */
    encodeAsset(asset: IAsset, dataKeys: (keyof IAssetInfo)[] = ['displayName', 'subAssets', 'visible', 'extends'], invalid = false) {
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
            importer: asset.meta.importer as AssetHandlerType,
            imported: asset.meta.imported, // 是否结束导入过程
            invalid: asset.invalid, // 是否导入成功
            type: this.queryAssetProperty(asset, 'type'),
            isDirectory,
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
            case 'readonly':
                return asset._assetDB.options.readonly;
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
     * @param uuidOrURLOrPath 资源的唯一标识符
     */
    queryAssetMeta(uuidOrURLOrPath: string): Meta | null {
        if (!uuidOrURLOrPath || typeof uuidOrURLOrPath !== 'string') {
            return null;
        }
        let uuid = uuidOrURLOrPath;
        if (uuidOrURLOrPath.startsWith('db://')) {
            const name = uuidOrURLOrPath.substr(5);
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
                    uuid: uuidOrURLOrPath,
                    ver: '1.0.0',
                };
            }
            uuid = url2uuid(uuidOrURLOrPath);
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

    queryUUID(urlOrPath: string): string | null {
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

        const info: IAssetInfo = {
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
            readonly: dbInfo.readonly,
        };

        return info;
    }

    queryUrl(uuidOrPath: string) {
        if (!uuidOrPath || typeof uuidOrPath !== 'string') {
            throw new Error('parameter error');
        }

        // 根路径 /assets, /internal 对应的 url 模拟数据
        const name = uuidOrPath.substr(assetConfig.data.root.length + 1);
        if (assetDBManager.assetDBMap[name]) {
            return `db://${name}`;
        }
        return queryUrl(uuidOrPath);
    }

    queryPath(urlOrUuid: string): string {
        if (!urlOrUuid || typeof urlOrUuid !== 'string') {
            return '';
        }
        if (urlOrUuid.startsWith('db://')) {
            const name = urlOrUuid.substr(5);
            if (assetDBManager.assetDBMap[name]) {
                return assetDBManager.assetDBMap[name].options.target;
            }
            const uuid = url2uuid(urlOrUuid);
            if (uuid) {
                return queryPath(uuid);
            }
        }
        return queryPath(urlOrUuid);
    }

    generateAvailableURL(url: string): string {
        if (!url || typeof url !== 'string') {
            return '';
        }
        const path = queryPath(url);
        if (!path) {
            return '';
        } else if (!existsSync(path)) {
            return url;
        }
        const newPath = utils.File.getName(path);
        return queryUrl(newPath);
    }
}

export const assetQuery = new AssetQueryManager();

export default assetQuery;

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
        return ccTypes.includes(assetQuery.queryAssetProperty(asset, 'type'));
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
        const path = assetQuery.queryAssetProperty(asset, 'path');
        const url = assetQuery.queryAssetProperty(asset, 'url');
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
        return (!!assetQuery.queryAssetProperty(asset, 'isBundle')) === value;
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
        console.warn(i18n.t('asset-db.deprecatedTip', {
            oldName: 'options.type',
            newName: 'options.ccType',
            version: '3.8.0',
        }));
        return types;
    },
}];