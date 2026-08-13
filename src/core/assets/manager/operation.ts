/**
 * 资源操作类，会调用 assetManager/assetDB/assetHandler 等模块
 */

import { refresh, reimport, queryUrl, Asset } from '@cocos/asset-db';
import { copy as fsCopy, move, remove, existsSync } from 'fs-extra';
import { isAbsolute, dirname, join, relative, extname } from 'path';
import { IMoveOptions } from '../@types/private';
import { IAsset, CreateAssetOptions, IExportOptions, IExportData, CreateAssetByTypeOptions, ICreateMenuInfo } from '../@types/protected';
import { AssetOperationOption, AssetUserDataMap, DeleteAssetOptions, IAssetInfo, IAssetMeta, ISupportCreateType } from '../@types/public';
import assetConfig from '../asset-config';
import { url2path, ensureOutputData, url2uuid, pathToDbUrlIfAssetDBPath, dirnameForDbUrlOrPath } from '../utils';
import assetDBManager from './asset-db';
import assetHandlerManager from './asset-handler';
import { copyAssetSource } from './asset-copy';
import { copyPath, moveAssetSource, removeAssetSource, renamePath } from './filesystem';
import i18n from '../../base/i18n';
import assetQuery, { ASSET_TREE_INFO_DATA_KEYS } from './query';
import utils from '../../base/utils';
import EventEmitter from 'events';
import { mergeMeta } from '../asset-handler/utils';
import * as lodash from 'lodash';

const REIMPORT_BUSY_TIMEOUT_MS = 10_000;

function waitForAssetInit(asset: IAsset, timeoutMs: number, pathOrUrlOrUUID: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Reimport asset ${pathOrUrlOrUUID} timed out waiting for the current import to finish`));
        }, timeoutMs);

        asset.waitInit().then(() => {
            clearTimeout(timer);
            resolve();
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

function isScriptAsset(asset: IAsset) {
    const importer = asset.meta?.importer;
    return importer === 'typescript'
        || importer === 'javascript'
        || /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i.test(asset.source || '');
}

function getSceneOrPrefabAssetKind(asset: IAsset): 'scene' | 'prefab' | null {
    const importer = asset.meta?.importer;
    const source = asset.source || '';
    if (importer === 'scene' || /\.scene$/i.test(source)) {
        return 'scene';
    }
    if (importer === 'prefab' || /\.prefab$/i.test(source)) {
        return 'prefab';
    }
    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTypeScriptSyntaxError(fileName: string, content: string): string | null {
    let ts: typeof import('typescript') | null = null;
    try {
        ts = require('typescript') as typeof import('typescript');
    } catch {
        return null;
    }

    const result = ts.transpileModule(content, {
        fileName,
        reportDiagnostics: true,
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            experimentalDecorators: true,
        },
    });
    const diagnostic = result.diagnostics?.find((item) => item.category === ts.DiagnosticCategory.Error);
    if (!diagnostic) {
        return null;
    }

    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (diagnostic.file && typeof diagnostic.start === 'number') {
        const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        return `${message} (${position.line + 1}:${position.character + 1})`;
    }
    return message;
}

function getScriptStructureError(content: string): string | null {
    const stack: { char: string; line: number; column: number }[] = [];
    let line = 1;
    let column = 0;
    let state: 'normal' | 'singleQuote' | 'doubleQuote' | 'template' | 'lineComment' | 'blockComment' = 'normal';
    let escaped = false;
    const opening = new Set(['(', '[', '{']);
    const closing: Record<string, string> = {
        ')': '(',
        ']': '[',
        '}': '{',
    };

    for (let index = 0; index < content.length; index++) {
        const char = content[index];
        const next = content[index + 1];
        column++;

        if (state === 'lineComment') {
            if (char === '\n') {
                state = 'normal';
            }
        } else if (state === 'blockComment') {
            if (char === '*' && next === '/') {
                state = 'normal';
                index++;
                column++;
            }
        } else if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
            const quote = state === 'singleQuote' ? '\'' : state === 'doubleQuote' ? '"' : '`';
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === quote) {
                state = 'normal';
            }
        } else {
            if (char === '/' && next === '/') {
                state = 'lineComment';
                index++;
                column++;
            } else if (char === '/' && next === '*') {
                state = 'blockComment';
                index++;
                column++;
            } else if (char === '\'') {
                state = 'singleQuote';
            } else if (char === '"') {
                state = 'doubleQuote';
            } else if (char === '`') {
                state = 'template';
            } else if (opening.has(char)) {
                stack.push({ char, line, column });
            } else if (closing[char]) {
                const last = stack.pop();
                if (!last || last.char !== closing[char]) {
                    return `unexpected "${char}" at ${line}:${column}`;
                }
            }
        }

        if (char === '\n') {
            line++;
            column = 0;
            if (state === 'lineComment') {
                state = 'normal';
            }
        }
    }

    if (state === 'singleQuote' || state === 'doubleQuote' || state === 'template') {
        return `unterminated ${state === 'template' ? 'template string' : 'string literal'}`;
    }
    if (state === 'blockComment') {
        return 'unterminated block comment';
    }
    const last = stack.pop();
    if (last) {
        return `unclosed "${last.char}" at ${last.line}:${last.column}`;
    }
    return null;
}

function getSceneOrPrefabJsonError(asset: IAsset, content: string | Buffer): string | null {
    const kind = getSceneOrPrefabAssetKind(asset);
    if (!kind) {
        return null;
    }

    const text = typeof content === 'string'
        ? content
        : Buffer.isBuffer(content)
            ? content.toString('utf8')
            : null;
    if (text === null) {
        return 'content must be JSON text';
    }

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (error) {
        return `invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (!Array.isArray(data)) {
        return `expected ${kind} JSON array`;
    }
    if (data.length < 2) {
        return `expected ${kind} JSON array with asset and root entries`;
    }

    const assetEntry = data[0];
    const rootEntry = data[1];
    if (!isRecord(assetEntry) || !isRecord(rootEntry)) {
        return `expected ${kind} asset and root entries to be objects`;
    }

    if (kind === 'scene') {
        if (assetEntry.__type__ !== 'cc.SceneAsset') {
            return 'expected first entry __type__ to be cc.SceneAsset';
        }
        if (rootEntry.__type__ !== 'cc.Scene') {
            return 'expected second entry __type__ to be cc.Scene';
        }
        return null;
    }

    if (assetEntry.__type__ !== 'cc.Prefab') {
        return 'expected first entry __type__ to be cc.Prefab';
    }
    if (rootEntry.__type__ !== 'cc.Node') {
        return 'expected second entry __type__ to be cc.Node';
    }
    return null;
}

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

    _checkRenameNewName(asset: IAsset, newName: string) {
        if (!newName || newName === '.' || newName === '..') {
            throw new Error('newName must be a single file or directory name');
        }

        if (
            newName.startsWith('db://')
            || isAbsolute(newName)
            || /[\\/]/.test(newName)
        ) {
            throw new Error('newName must be a single file or directory name');
        }

        if (!asset.isDirectory() && !extname(newName)) {
            throw new Error('newName must include file extension');
        }
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

    async updateUserData<T extends keyof AssetUserDataMap = 'unknown'>(uuidOrURLOrPath: string, userData: AssetUserDataMap[T]): Promise<AssetUserDataMap[T] | undefined> {
        if (!isRecord(userData)) {
            throw new Error('userData must be an object');
        }

        const asset = assetQuery.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            console.error(`can not find asset ${uuidOrURLOrPath}`);
            return;
        }

        if (!isRecord(asset.meta.userData)) {
            asset.meta.userData = {} as AssetUserDataMap[T];
        }
        const currentUserData = asset.meta.userData as Record<string, unknown>;
        for (const key of Object.keys(currentUserData)) {
            delete currentUserData[key];
        }
        Object.assign(currentUserData, lodash.cloneDeep(userData));
        asset.meta.userData = currentUserData as AssetUserDataMap[T];
        await asset.save();
        await asset._assetDB.reimport(asset.uuid);
        return asset?.meta.userData as AssetUserDataMap[T];
    }

    async updateUserDataByPath<T extends keyof AssetUserDataMap = 'unknown'>(uuidOrURLOrPath: string, path: string, value: any): Promise<AssetUserDataMap[T] | undefined> {
        if (!path) {
            throw new Error('path must not be empty. Use updateUserData to replace the complete userData object');
        }

        const asset = assetQuery.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            console.error(`can not find asset ${uuidOrURLOrPath}`);
            return;
        }
        if (!isRecord(asset.meta.userData)) {
            asset.meta.userData = {} as AssetUserDataMap[T];
        }
        lodash.set(asset?.meta.userData, path, value);
        await asset.save();
        await asset._assetDB.reimport(asset.uuid);
        return asset?.meta.userData as AssetUserDataMap[T];
    }

    async saveAsset(uuidOrURLOrPath: string, content: string | Buffer) {
        const asset = assetQuery.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${i18n.t('assets.save_asset.fail.asset', { asset: uuidOrURLOrPath })}`);
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

        this._validateAssetContentBeforeSave(asset, content);
        const res = await assetHandlerManager.saveAsset(asset, content);
        if (res) {
            await asset._assetDB.reimport(asset.uuid);
        }
        if (asset && (!asset.imported || asset.invalid)) {
            throw asset.importError || new Error(`Save asset ${asset.source} failed`);
        }
        return assetQuery.encodeAsset(asset);
    }

    private _validateAssetContentBeforeSave(asset: IAsset, content: string | Buffer) {
        this._validateScriptContentBeforeSave(asset, content);
        this._validateSceneOrPrefabContentBeforeSave(asset, content);
    }

    private _validateScriptContentBeforeSave(asset: IAsset, content: string | Buffer) {
        if (!isScriptAsset(asset) || typeof content !== 'string') {
            return;
        }
        const structureError = getScriptStructureError(content);
        const syntaxError = getTypeScriptSyntaxError(asset.source, content);
        const error = syntaxError || structureError;
        if (error) {
            throw new Error(`Invalid script content: ${error}`);
        }
    }

    private _validateSceneOrPrefabContentBeforeSave(asset: IAsset, content: string | Buffer) {
        const error = getSceneOrPrefabJsonError(asset, content);
        if (error) {
            throw new Error(`Invalid scene/prefab asset content: ${error}`);
        }
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
        const dir = this._resolveCreateAssetDir(dirOrUrl);
        let createInfo: undefined | ICreateMenuInfo = createMenus[0];
        if (createMenus.length > 1 && options?.templateName) {
            createInfo = createMenus.find((menu) => menu.name === options.templateName);
            if (!createInfo) {
                throw new Error(`Can not find template: ${options.templateName}`);
            }
        }
        const extName = extname(createInfo.fullFileName);
        const fileName = extName && baseName.endsWith(extName) ? baseName : baseName + extName;
        const target = join(dir, fileName);

        return await this.createAsset({
            handler: createInfo.handler,
            target,
            overwrite: options?.overwrite ?? false,
            rename: options?.rename ?? false,
            template: createInfo.template,
            content: options?.content,
        });
    }

    private _resolveCreateAssetDir(dirOrUrl: string) {
        const normalizedDirOrUrl = this._pathToDbUrlIfInsideAssetDB(dirOrUrl);
        if (normalizedDirOrUrl.startsWith('db://')) {
            return url2path(normalizedDirOrUrl);
        }
        return normalizedDirOrUrl;
    }

    /**
     * 从项目外拷贝导入资源进来
     * @param source 
     * @param target 
     * @param options 
     */
    async importAsset(source: string, target: string, options?: AssetOperationOption): Promise<IAssetInfo[]> {
        const targetPath = target.startsWith('db://') ? url2path(target) : target;
        const assetTarget = this._pathToDbUrlIfInsideAssetDB(target);

        if (!this._isSameFilesystemPath(source, targetPath)) {
            await copyPath(source, targetPath, options);
        }
        await this.refreshAsset(assetTarget);
        const assetInfo = assetQuery.queryAssetInfo(assetTarget);
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
     * Copy an existing main asset together with its complete meta information.
     */
    async copyAsset(source: string, target: string, options?: AssetOperationOption): Promise<IAssetInfo> {
        return await assetDBManager.addTask(this._copyAsset.bind(this), [source, target, options]);
    }

    private async _copyAsset(source: string, target: string, options?: AssetOperationOption): Promise<IAssetInfo> {
        const asset = assetQuery.queryAsset(source);
        if (!asset) {
            throw new Error(`asset in source file ${source} not exists`);
        }
        if (asset._parent) {
            throw new Error('Sub-assets cannot be copied independently; copy their main asset instead.');
        }

        this.checkValidUrl(target);
        source = asset.source;
        this._checkExists(source);
        if (target.startsWith('db://')) {
            target = url2path(target);
        }
        target = this._checkOverwrite(target, options);

        const targetIsAssetDBRoot = Object.values(assetDBManager.assetDBInfo).some((info) => (
            utils.Path.contains(info.target, target) && utils.Path.contains(target, info.target)
        ));
        if (targetIsAssetDBRoot) {
            throw new Error(`Cannot copy an asset over an AssetDB root.\ntarget: ${target}`);
        }
        if (utils.Path.contains(source, target) || utils.Path.contains(target, source)) {
            throw new Error(`Cannot copy an asset into or over itself.\nsource: ${source}\ntarget: ${target}`);
        }

        const transaction = await copyAssetSource(source, target, options);
        let copiedAsset: IAsset | null = null;
        try {
            await this._refreshAsset(target);
            copiedAsset = assetQuery.queryAsset(target);
            if (!copiedAsset || !copiedAsset.imported || copiedAsset.invalid) {
                throw copiedAsset?.importError || new Error(`Copy asset from ${source} to ${target} failed`);
            }
        } catch (error) {
            try {
                await transaction.rollback();
                await this._refreshAsset(dirname(target), false);
            } catch (rollbackError) {
                const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
                throw new Error(`Copy asset from ${source} to ${target} failed and rollback also failed: ${rollbackMessage}`, { cause: error });
            }
            throw error;
        }

        await transaction.finalize();
        return assetQuery.encodeAsset(copiedAsset);
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
            await fsCopy(src.import.path, dest.import.path);
            if (src.native && dest.native) {
                const nativeSrc: string[] = Object.values(src.native);
                const nativeDest: string[] = Object.values(dest.native);
                await Promise.all(nativeSrc.map((path, i) => fsCopy(path, nativeDest[i])));
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
        const refreshTarget = this._pathToDbUrlIfInsideAssetDB(pathOrUrlOrUUID);
        const refreshDir = this._dirnameForRefresh(refreshTarget);
        const result = await refresh(refreshTarget);
        if (result === undefined) {
            throw new Error(`can not find asset ${pathOrUrlOrUUID}`);
        }
        if (autoRefreshDir) {
            // HACK 某些情况下导入原始资源后，文件夹的 mtime 会发生变化，导致资源量大的情况下下次获得焦点自动刷新时会有第二次的文件夹大批量刷新
            // 用进入队列的方式才能保障 pause 等机制不会被影响
            await assetDBManager.addTask(assetDBManager.autoRefreshAssetLazy.bind(assetDBManager), [refreshDir]);
        }
        // this.autoRefreshAssetLazy(dirname(pathOrUrlOrUUID));
        console.debug(`refresh asset ${refreshDir} success`);
        return result;
    }

    private _pathToDbUrlIfInsideAssetDB(pathOrUrlOrUUID: string) {
        return pathToDbUrlIfAssetDBPath(pathOrUrlOrUUID, assetDBManager.assetDBInfo);
    }

    private _isSameFilesystemPath(source: string, target: string) {
        if (!isAbsolute(source) || !isAbsolute(target)) {
            return source === target;
        }

        let normalizedSource = utils.Path.normalize(source);
        let normalizedTarget = utils.Path.normalize(target);
        if (process.platform === 'win32') {
            normalizedSource = normalizedSource.toLowerCase();
            normalizedTarget = normalizedTarget.toLowerCase();
        }

        return normalizedSource === normalizedTarget;
    }

    private _dirnameForRefresh(pathOrUrlOrUUID: string) {
        return dirnameForDbUrlOrPath(pathOrUrlOrUUID);
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
        let asset = await reimport(pathOrUrlOrUUID);
        let busyDeadline = 0;
        while (!asset) {
            const existingAsset = assetQuery.queryAsset(pathOrUrlOrUUID);
            if (!existingAsset) {
                throw new Error(`无法找到资源 ${pathOrUrlOrUUID}, 请检查参数是否正确`);
            }
            busyDeadline ||= Date.now() + REIMPORT_BUSY_TIMEOUT_MS;
            const remainingTime = busyDeadline - Date.now();
            if (remainingTime <= 0) {
                throw new Error(`Reimport asset ${pathOrUrlOrUUID} timed out waiting for the current import to finish`);
            }
            if (!existingAsset.init) {
                await waitForAssetInit(existingAsset, remainingTime, pathOrUrlOrUUID);
            }
            if (Date.now() >= busyDeadline) {
                throw new Error(`Reimport asset ${pathOrUrlOrUUID} timed out waiting for the current import to finish`);
            }
            asset = await reimport(pathOrUrlOrUUID);
        }
        if (!asset.imported || asset.invalid) {
            throw asset.importError || new Error(`Reimport asset ${asset.source} failed`);
        }
        return assetQuery.encodeAsset(asset, ASSET_TREE_INFO_DATA_KEYS);
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
        await moveAssetSource(source, target, option);

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
     * @param newName
     */
    async renameAsset(source: string, newName: string, option?: AssetOperationOption) {
        return await assetDBManager.addTask(this._renameAsset.bind(this), [source, newName, option]);
    }

    private async _renameAsset(source: string, newName: string, option?: AssetOperationOption) {
        console.debug(`start rename asset from ${source} -> ${newName}...`);
        const asset = assetQuery.queryAsset(source);
        if (!asset) {
            throw new Error(`asset in source file ${source} not exists`);
        }
        this._checkReadonly(asset);
        source = asset.source;
        this._checkExists(source);
        this._checkRenameNewName(asset, newName);

        let target = join(dirname(source), newName);
        target = this._checkOverwrite(target, option);
        // 源地址不能被目标地址包含，也不能相等
        if (target.startsWith(join(source, '/'))) {
            throw new Error(`${i18n.t('assets.rename_asset.fail.parent')} \nsource: ${source}\ntarget: ${target}`);
        }

        const temp = join(dirname(target), '.rename_temp');

        // 改到临时路径，然后刷新，删除原来的缓存
        await renamePath(source + '.meta', temp + '.meta');
        await renamePath(source, temp);
        await this._refreshAsset(source, false);

        // 改为真正的路径，然后刷新，用新名字重新导入
        await renamePath(temp + '.meta', target + '.meta');
        await renamePath(temp, target);
        await this._refreshAsset(target);
        // TODO 返回资源信息
        console.debug(`rename asset from ${source} -> ${target} success`);
    }

    /**
     * 移除资源
     * @param path 
     * @returns 
     */
    async removeAsset(uuidOrURLOrPath: string, options: DeleteAssetOptions = { useTrash: true }): Promise<IAssetInfo | null> {
        const asset = assetQuery.queryAsset(uuidOrURLOrPath);
        if (!asset) {
            throw new Error(`${i18n.t('assets.delete_asset.fail.unexist')} \nsource: ${uuidOrURLOrPath}`);
        }
        this._checkReadonly(asset);

        if (asset._parent) {
            throw new Error(`子资源无法单独删除，请传递父资源的 URL 地址`);
        }
        const path = asset.source;
        const res = await assetDBManager.addTask(this._removeAsset.bind(this), [path, options]);
        return res ? assetQuery.encodeAsset(asset) : null;
    }

    private async _removeAsset(path: string, options: DeleteAssetOptions = { useTrash: true }): Promise<boolean> {
        let res = false;
        await removeAssetSource(path, { useTrash: options.useTrash !== false });
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
    const tempDir = join(assetConfig.data.tempRoot, 'move-temp');
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
