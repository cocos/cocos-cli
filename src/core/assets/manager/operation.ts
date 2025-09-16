/**
 * 资源操作类，会调用 assetManager/assetDB/assetHandler 等模块
 */

import { queryUUID, refresh, reimport, queryUrl, Utils, Asset } from '@editor/asset-db';
import { Meta } from '@editor/asset-db/libs/meta';
import { copy, move, remove, rename, existsSync } from 'fs-extra';
import { isAbsolute, dirname, basename, join, relative } from 'path';
import { newConsole } from '../../base/console';
import { IMoveOptions } from '../@types/private';
import { IAsset, CreateAssetOptions, IExportOptions, IExportData } from '../@types/protected';
import { AssetOperationOption, IAssetInfo } from '../@types/public';
import assetConfig from '../asset-config';
import { url2path, ensureOutputData, url2uuid, removeFile } from '../utils';
import { assetDBManager } from './asset-db';
import assetHandlerManager from './asset-handler';
import i18n from '../../base/i18n';
import assetQueryManager from './query';
import utils from '../../base/utils';
import EventEmitter from 'events';
import { mergeMeta } from '../asset-handler/utils';

class AssetOperation extends EventEmitter {

    async saveAssetMeta(uuid: string, meta: Meta, info?: IAsset) {
        // 不能为数组
        if (
            typeof meta !== 'object'
            || Array.isArray(meta)
        ) {
            throw new Error(`Save meta failed(${uuid}): The meta must be an Object string`);
        }
        info = info || assetQueryManager.queryAsset(uuid)!;
        mergeMeta(info.meta, meta);
        await info.save(); // 这里才是将数据保存到 .meta 文件
    }

    async saveAsset(uuidOrURLOrPath: string, content: string | Buffer) {
        const asset = assetQueryManager.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${i18n.t('asset-db.saveAsset.fail.asset')}`);
        }
        if (asset._assetDB.options.readonly) {
            throw new Error(`${i18n.t('asset-db.operation.readonly')} \n  url: ${asset.url}`);
        }
        if (content === undefined) {
            throw new Error(`${i18n.t('asset-db.saveAsset.fail.content')}`);
        }
        if (!asset.source) {
            // 不存在源文件的资源无法保存
            throw new Error(`${i18n.t('asset-db.saveAsset.fail.uuid')}`);
        }

        const res = await assetHandlerManager.saveAsset(asset, content);
        if (res) {
            this.reimportAsset(asset.uuid);
        }
        return assetQueryManager.encodeAsset(asset);
    }

    checkValidUrl(urlOrPath: string) {
        if (!urlOrPath.startsWith('db://')) {
            urlOrPath = assetQueryManager.queryUrl(urlOrPath);
            if (!urlOrPath) {
                throw new Error(`${i18n.t('asset-db.operation.invalid_url')} \n  url: ${urlOrPath}`);
            }
        }

        const dbName = urlOrPath.split('/').filter(Boolean)[1];
        const dbInfo = assetDBManager.assetDBInfo[dbName];

        if (dbInfo.readonly) {
            throw new Error(`${i18n.t('asset-db.operation.readonly')} \n  url: ${urlOrPath}`);
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
            return assetQueryManager.queryAssetInfo(queryUUID(path));
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
        const asset = assetQueryManager.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${i18n.t('asset-db.deleteAsset.fail.unexist')} \nsource: ${uuidOrURLOrPath}`);
        }
        if (asset._assetDB.options.readonly) {
            throw new Error(`${i18n.t('asset-db.operation.readonly')} \n  url: ${asset.url}`);
        }
        const path = asset.source;
        const res = await assetDBManager.addTask(this._removeAsset.bind(this), [path]);
        return res ? assetQueryManager.encodeAsset(asset) : null;
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
            console.warn(`${i18n.t('asset-db.deleteAsset.fail.unknown')}`);
            console.warn(error);
        }
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
    if (!existsSync(source) || !existsSync(source + '.meta')) {
        return;
    }

    if (!options) {
        if (existsSync(target) || existsSync(target + '.meta')) {
            return;
        }

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
