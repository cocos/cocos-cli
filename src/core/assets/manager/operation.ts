/**
 * 资源操作类，会调用 assetManager/assetDB/assetHandler 等模块
 */

import { refresh, reimport, queryUrl, Asset } from '@cocos/asset-db';
import { copy, move, remove, rename, existsSync } from 'fs-extra';
import { isAbsolute, dirname, basename, join, relative, extname } from 'path';
import { IMoveOptions } from '../@types/private';
import { IAsset, CreateAssetOptions, IExportOptions, IExportData, CreateAssetByTypeOptions, ICreateMenuInfo } from '../@types/protected';
import { AssetOperationOption, AssetUserDataMap, IAssetInfo, IAssetMeta, ISupportCreateType } from '../@types/public';
import assetConfig from '../asset-config';
import { url2path, ensureOutputData, url2uuid, removeFile } from '../utils';
import assetDBManager from './asset-db';
import assetHandlerManager from './asset-handler';
import i18n from '../../base/i18n';
import assetQuery from './query';
import utils from '../../base/utils';
import EventEmitter from 'events';
import { mergeMeta } from '../asset-handler/utils';
import * as lodash from 'lodash';

class AssetOperation extends EventEmitter {

    /**
     * 检查一个资源文件夹是否为只读
     */
    _checkReadonly(asset: IAsset) {
        if (asset._assetDB.options.readonly) {
            throw new Error(`${i18n.t('assets.operation.readonly')} \n  url: ${asset.url}`);
        }
    }

    _checkExists(path: string) {
        if (!existsSync(path)) {
            throw new Error(`file ${path} not exists`);
        }
    }
    /**
     * 检查是否存在文件，如果存在则根据选项决定是否覆盖或重命名
     * @param path 
     * @param option 
     * @returns 返回新的文件路径
     */
    _checkOverwrite(path: string, option?: AssetOperationOption) {
        if (existsSync(path) && !option?.overwrite) {
            if (option?.rename) {
                return utils.File.getName(path);
            }
            throw new Error(`file ${path} already exists, please use overwrite option to overwrite it or use rename option to auto rename it first.`);
        }
        return path;
    }

    async saveAssetMeta(uuid: string, meta: IAssetMeta, asset?: IAsset) {
        // 不能为数组
        if (
            typeof meta !== 'object'
            || Array.isArray(meta)
        ) {
            throw new Error(`Save meta failed(${uuid}): The meta must be an Object string`);
        }
        asset = asset || assetQuery.queryAsset(uuid)!;
        mergeMeta(asset.meta, meta);
        await asset.save(); // 这里才是将数据保存到 .meta 文件
        await asset._assetDB.reimport(asset.uuid);
    }

    async updateUserData<T extends keyof AssetUserDataMap = 'unknown'>(uuidOrURLOrPath: string, path: string, value: any): Promise<AssetUserDataMap[T]> {
        const asset = assetQuery.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            console.error(`can not find asset ${uuidOrURLOrPath}`);
            return;
        }
        lodash.set(asset?.meta.userData, path, value);
        await asset.save();
        return asset?.meta.userData;
    }

    async saveAsset(uuidOrURLOrPath: string, content: string | Buffer) {
        const asset = assetQuery.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${i18n.t('assets.save_asset.fail.asset')}`);
        }
        if (asset._assetDB.options.readonly) {
            throw new Error(`${i18n.t('assets.operation.readonly')} \n  url: ${asset.url}`);
        }
        if (content === undefined) {
            throw new Error(`${i18n.t('assets.save_asset.fail.content')}`);
        }
        if (!asset.source) {
            // 不存在源文件的资源无法保存
            throw new Error(`${i18n.t('assets.save_asset.fail.uuid')}`);
        }

        const res = await assetHandlerManager.saveAsset(asset, content);
        if (res) {
            await asset._assetDB.reimport(asset.uuid);
        }
        if (asset && (!asset.imported || asset.invalid)) {
            throw asset.importError || new Error(`Save asset ${asset.source} failed`);
        }
        return assetQuery.encodeAsset(asset);
    }

    checkValidUrl(urlOrPath: string) {
        if (!urlOrPath.startsWith('db://')) {
            urlOrPath = assetQuery.queryUrl(urlOrPath);
            if (!urlOrPath) {
                throw new Error(`${i18n.t('assets.operation.invalid_url')} \n  url: ${urlOrPath}`);
            }
        }

        const dbName = urlOrPath.split('/').filter(Boolean)[1];
        const dbInfo = assetDBManager.assetDBInfo[dbName];

        if (!dbInfo || dbInfo.readonly) {
            throw new Error(`${i18n.t('assets.operation.readonly')} \n  url: ${urlOrPath}`);
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
        options.target = this._checkOverwrite(options.target, options);
        const assetPath = await assetHandlerManager.createAsset(options);
        await this.refreshAsset(assetPath);
        const asset = assetQuery.queryAsset(assetPath);
        if (!asset) {
            throw new Error(`Create asset in ${options.target} failed`);
        }
        if (asset && (!asset.imported || asset.invalid)) {
            throw asset.importError || new Error(`Create asset in ${options.target} failed`);
        }
        return assetQuery.encodeAsset(asset);
    }

    /**
     * 根据类型创建资源
     * @param type 
     * @param dirOrUrl 目标目录
     * @param baseName 基础名称
     * @param options 
     * @returns 
     */
    async createAssetByType(type: ISupportCreateType, dirOrUrl: string, baseName: string, options?: CreateAssetByTypeOptions) {
        const createMenus = await assetHandlerManager.getCreateMenuByName(type);
        if (!createMenus.length) {
            throw new Error(`Can not support create type: ${type}`);
        }
        let dir = dirOrUrl;
        if (dirOrUrl.startsWith('db://')) {
            dir = url2path(dirOrUrl);
        }
        let createInfo: undefined | ICreateMenuInfo = createMenus[0];
        if (createMenus.length > 1 && options?.templateName) {
            createInfo = createMenus.find((menu) => menu.name === options.templateName);
            if (!createInfo) {
                throw new Error(`Can not find template: ${options.templateName}`);
            }
        }
        const extName = extname(createInfo.fullFileName);
        const target = join(dir, baseName + extName);

        return await this.createAsset({
            handler: createInfo.handler,
            target,
            overwrite: options?.overwrite ?? false,
            template: createInfo.template,
            content: options?.content,
        });
    }

    /**
     * 从项目外拷贝导入资源进来
     * @param source 
     * @param target 
     * @param options 
     */
    async importAsset(source: string, target: string, options?: AssetOperationOption): Promise<IAssetInfo[]> {
        if (target.startsWith('db://')) {
            target = url2path(target);
        }
        await copy(source, target, options);
        await this.refreshAsset(target);
        const assetInfo = assetQuery.queryAssetInfo(target);
        if (!assetInfo) {
            return [];
        }
        if (!assetInfo.isDirectory) {
            return [assetInfo];
        }
        return assetQuery.queryAssetInfos({
            pattern: `${assetInfo.url}/**/*`
        });
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
    async refreshAsset(pathOrUrlOrUUID: string): Promise<number> {
        // 将实际的刷新任务塞到 db 管理器的队列内等待执行
        return await assetDBManager.addTask(this._refreshAsset.bind(this), [pathOrUrlOrUUID]);
    }

    private async _refreshAsset(pathOrUrlOrUUID: string, autoRefreshDir = true): Promise<number> {
        const result = await refresh(pathOrUrlOrUUID);
        if (result === undefined) {
            throw new Error(`can not find asset ${pathOrUrlOrUUID}`);
        }
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
    async reimportAsset(pathOrUrlOrUUID: string): Promise<IAssetInfo> {
        return await assetDBManager.addTask(this._reimportAsset.bind(this), [pathOrUrlOrUUID]);
    }

    private async _reimportAsset(pathOrUrlOrUUID: string): Promise<IAssetInfo> {
        // 底层的 reimport 不支持子资源的 url 改为使用 uuid 重新导入
        if (pathOrUrlOrUUID.startsWith('db://')) {
            pathOrUrlOrUUID = url2uuid(pathOrUrlOrUUID);
        }
        const asset = await reimport(pathOrUrlOrUUID);
        if (!asset) {
            throw new Error(`无法找到资源 ${pathOrUrlOrUUID}, 请检查参数是否正确`);
        }
        if (asset && (!asset.imported || asset.invalid)) {
            throw asset.importError || new Error(`Reimport asset ${asset.source} failed`);
        }
        return assetQuery.encodeAsset(asset);
    }

    /**
     * 移动资源
     * @param source 源文件的 url 或者绝对路径 db://assets/abc.txt
     * @param target 目标 url 或者绝对路径 db://assets/a.txt
     * @param option 导入资源的参数 { overwrite, xxx, rename }
     * @returns {Promise<IAssetInfo | null>}
     */
    async moveAsset(source: string, target: string, option?: AssetOperationOption) {
        return await assetDBManager.addTask(this._moveAsset.bind(this), [source, target, option]);
    }

    private async _moveAsset(source: string, target: string, option?: AssetOperationOption) {
        console.debug(`start move asset from ${source} -> ${target}...`);
        if (target.startsWith('db://')) {
            target = url2path(target);
        }
        const asset = assetQuery.queryAsset(source);
        if (!asset) {
            throw new Error(`asset in source file ${source} not exists`);
        }
        this._checkReadonly(asset);
        source = asset.source;
        target = this._checkOverwrite(target, option);
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
        const asset = assetQuery.queryAsset(source);
        if (!asset) {
            throw new Error(`asset in source file ${source} not exists`);
        }
        this._checkReadonly(asset);
        source = asset.source;
        this._checkExists(source);
        if (target.startsWith('db://')) {
            target = url2path(target);
        }
        target = this._checkOverwrite(target, option);
        // 源地址不能被目标地址包含，也不能相等
        if (target.startsWith(join(source, '/'))) {
            throw new Error(`${i18n.t('assets.rename_asset.fail.parent')} \nsource: ${source}\ntarget: ${target}`);
        }

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
        const asset = assetQuery.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${i18n.t('assets.delete_asset.fail.unexist')} \nsource: ${uuidOrURLOrPath}`);
        }
        this._checkReadonly(asset);

        if (asset._parent) {
            throw new Error(`子资源无法单独删除，请传递父资源的 URL 地址`);
        }
        const path = asset.source;
        const res = await assetDBManager.addTask(this._removeAsset.bind(this), [path]);
        return res ? assetQuery.encodeAsset(asset) : null;
    }

    private async _removeAsset(path: string): Promise<boolean> {
        let res = false;
        await removeFile(path);
        await this.refreshAsset(path);
        res = true;
        console.debug(`remove asset ${path} success`);
        return res;
    }
}

export const assetOperation = new AssetOperation();
export default assetOperation;

/**
 * 移动文件
 * @param file
 */
export async function moveFile(source: string, target: string, options?: IMoveOptions) {

    if (!options || !options.overwrite) {
        options = { overwrite: false }; // fs move 要求实参 options 要有值
    }
    const tempDir = join(assetConfig.data.tempRoot, 'asset-db', 'move-temp');
    const relativePath = relative(assetConfig.data.root, target);
    try {
        if (!utils.Path.contains(source, target)) {
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
