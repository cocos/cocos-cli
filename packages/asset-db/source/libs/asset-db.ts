
'use strict';

import { Stats, stat, statSync, existsSync, readdir, remove, writeJSON, readJSON } from 'fs-extra';
import { join, normalize, dirname, sep, basename, extname, relative } from 'path';
import { EventEmitter } from 'events';
import { v4 } from 'node-uuid';

import { ImporterManager, DefaultImporter } from './importer';
import { Asset, VirtualAsset, AssetActionEnum } from './asset';
import { absolutePath, isSubPath, compareVersion } from './utils';
import { MetaManager } from './meta';
import { InfoManager, SimpleInfo } from './info';
import { TASK_MAP } from './task';
import { DependencyManager } from './dependency';
import { DataManager } from './data';
import { importAssociatedAssets, map } from './manager';

import { ParallelQueue } from 'workflow-extra';
import fg from 'fast-glob';
import { CustomConsole, LogLevel } from './console';
import { Migrate, Migrator } from './migrator';
import {
    assertNoPathIdentityConflicts,
    getMapStoredPathKey,
    isSamePath,
    PathCaseConflictError,
    PathMap,
    PathSet,
    resolveRealPathCase,
} from './path-identity';

export { map } from './manager';

function getAsset(uuid) {
    for (let name in map) {
        const db = map[name];
        const asset = db.uuid2asset.get(uuid);
        if (asset) {
            return asset;
        }
    }
    return undefined;
}

export interface AssetDBStartOptions {
    // 是否忽略自己，默认 false
    ignoreSelf?: boolean;
    globList?: string[];
    // 扫描成功后等待完成一些操作
    hooks?: {
        // 生成 资源 meta 之后
        afterGenerateMeta?(): void;
        // 扫描资源之后
        afterScan?(files: string[]): void;
        afterPreImport?(): void;
        // 在数据库启动之后
        afterStart?(): void;
    };
}

interface AssetDBRecordJSON {
    version: string;
    data: {
        paths: string[];
    }
}

export interface AssetDBRefreshOptions {
    // 是否忽略自己，默认 false
    ignoreSelf?: boolean;
    globList?: string[];
    useCache?: boolean;
    // 扫描成功后等待完成一些操作
    hooks?: {
        // 生成 资源 meta 之后
        afterGenerateMeta?(): void;
        // 扫描资源之后
        afterScan?(files: string[]): void;
        afterPreImport?(): void;
        // TODO 由于 refresh 过程中可能继续添加新的 refresh 任务，因而此钩子不准确
        afterRefresh?(): void;
    };
}

/**
 * 资源数据库启动参数
 */
export interface AssetDBOptions {
    // 资源数据库的名字
    name: string;
    // 资源数据库在硬盘上的绝对路径
    target: string;
    // 资源数据库导入后生成的文件路径
    library: string;
    // 资源数据库的临时目录
    temp: string;

    /**
     * 0: 忽略错误
     * 1: 仅仅打印错误
     * 2: 打印错误、警告
     * 3: 打印错误、警告、日志
     * 4: 打印错误、警告、日志、调试信息
     */
    level: LogLevel;

    // 忽略的文件列表
    ignoreFiles: string[],

    // 资源匹配范围的 glob 表达式
    globList?: string[];

    // 是否只读，默认是 false
    readonly: boolean;

    flags?: {
        reimportCheck?: boolean;
    },

    // 导入并发数，默认为 5
    importConcurrency?: number;
}

let deprecatedFlag = false;

export const version = '2.0.0';

const migrations: Migrate<any>[] = [{
    version: '1.0.0',
    migrate: async (json, db) => {
        return {
            version: '1.0.0',
            data: json,
        }
    },
}, {
    version: '1.0.1',
    migrate: async (json, db) => {
        return {
            version: '1.0.1',
            data: {
                paths: json.data.paths.map(path => relative(db.options.target, path)),
            }
        }
    },
}];

export class AssetDB extends EventEmitter {

    static readonly version = '1.0.1';

    // 传入的配置信息
    options: AssetDBOptions;

    // 标记
    flag = {
        // 是否正在启动
        starting: false,
        // 是否已经启动的标记
        started: false,
    };

    // path 对应 asset 的 map
    path2asset: Map<string, Asset> = new PathMap;

    // uuid 对应 asset 的 map
    uuid2asset: Map<string, Asset> = new Map;

    // importer 管理器
    importerManager;
    metaManager: MetaManager;
    console: CustomConsole;
    infoManager: InfoManager;
    dependencyManager: DependencyManager;
    taskManager: ParallelQueue<VirtualAsset, boolean>;
    dataManager: DataManager;
    _lock: boolean = false;
    _waitLockHandler: Function[] = [];
    cachePath: string;

    get assetProgressInfo() {
        return {
            // @ts-ignore TODO taskManager 是否可以提供此字段
            current: this.taskManager._execID - this.taskManager._execThread,
            total: this.taskManager.total(),
            // @ts-ignore TODO taskManager 是否可以提供此字段
            wait: this.taskManager._waitQueue.size,
        }
    }

    /**
     * 锁定资源
     */
    private async lock() {
        if (!this._lock) {
            return this._lock = true;
        }
        return await new Promise((resolve, reject) => {
            this._waitLockHandler.push(() => {
                resolve(null);
            });
        });
    }

    /**
     * 解锁资源
     */
    private unlock() {
        const handle = this._waitLockHandler.shift();
        // 如果有等待的任务，则执行下一个
        if (handle) {
            handle();
            return;
        }

        // 已经没有在等待的任务了，还原标记
        this._lock = false;
    }

    /**
     * 实例化过程
     * @param options
     */
    constructor(options: AssetDBOptions) {
        super();
        if (!options.target || !options.library) {
            console.error(`The database(${options.name}) cannot be created because there is no target or library definition`);
        } else {
            options.target = absolutePath(options.target);
            options.library = absolutePath(options.library);
            if (!options.temp) {
                options.temp = join(options.library, '.temp');
            }
            options.temp = absolutePath(options.temp);
        }

        // 设置输出等级
        if (!('level' in options) || options.level > 4 || options.level < 0) {
            options.level = 4;
        }

        if (!options.ignoreFiles || !Array.isArray(options.ignoreFiles)) {
            options.ignoreFiles = [];
        }

        this.options = options;

        // 启动数据库内置的各个管理器管理器
        this.taskManager = new ParallelQueue(async (asset) => {
            const importer = await this.importerManager.find(asset);
            if (
                !importer ||
                // 删除的时候很可能文件不存在，所以 importer 有一定概率是 *，这时候和原有的导入器肯定不匹配，所以不需要处理删除
                (asset.action !== AssetActionEnum.delete &&
                    (importer.name !== asset.meta.importer && asset.meta.importer !== '*') &&
                    asset.imported
                )
            ) {
                if (!asset.init) {
                    if (this.options.level >= 1) {
                        this.console.error(`Unable to import data, no suitable importer was found. {asset[${asset instanceof Asset ? asset.basename : ''}](${asset.uuid})}`);
                    }
                    asset.invalid = true;
                    asset.init = true;
                }
                return false;
            }

            switch (asset.action) {
                case AssetActionEnum.add: {
                    this.dataManager.empty(asset);
                    if (await TASK_MAP.import.exec(this, asset, importer, true)) {
                        await asset.save();
                    }

                    if (asset instanceof Asset) {
                        const assetStats = statSync(asset.source);
                        this.infoManager.add(asset.source, assetStats.mtimeMs, asset.uuid);
                    }
                    importAssociatedAssets(this, asset);
                    // this.emit('added', asset);
                    break;
                }
                case AssetActionEnum.change: {
                    this.dataManager.empty(asset);
                    // await TASK_MAP.destroy.exec(this, asset);
                    if (await TASK_MAP.import.exec(this, asset, importer, true)) {
                        await asset.save();
                    }

                    if (asset instanceof Asset) {
                        const assetStats = statSync(asset.source);
                        this.infoManager.add(asset.source, assetStats.mtimeMs, asset.uuid);
                    }
                    importAssociatedAssets(this, asset);
                    // this.emit('changed', asset);
                    break;
                }
                case AssetActionEnum.delete: {
                    this.dataManager.empty(asset);
                    await TASK_MAP.destroy.exec(this, asset);

                    if (asset instanceof Asset) {
                        const metaFile = asset.source + '.meta';
                        await this.metaManager.remove(metaFile);
                        this.infoManager.remove(asset.source);
                        this.infoManager.remove(metaFile);
                    }
                    importAssociatedAssets(this, asset);
                    // this.emit('deleted', asset);
                    break;
                }
                case AssetActionEnum.none: {
                    if (await TASK_MAP.import.exec(this, asset, importer, false)) {
                        await asset.save();
                    }
                    break;
                }
            }
            asset.init = true;
            if (asset.action !== AssetActionEnum.none) {
                this.dataManager.save();
            }
            asset.action = AssetActionEnum.none;
            return true;
        }, this.options.importConcurrency || 5);

        // 全局可用的系统相关的管理器
        this.console = new CustomConsole(options.level);
        this.metaManager = new MetaManager(this.console);
        this.infoManager = new InfoManager(this.console, this.options.target);
        this.dependencyManager = new DependencyManager(this.console, this.options.target);
        this.dataManager = new DataManager(this.console);
        this.importerManager = new ImporterManager(this.console);

        // 注册默认的解析器
        this.importerManager.add(DefaultImporter, ['*']);

        this.cachePath = join(this.options.library, `.${options.name}`);
    }

    preImporterHandler?(file: string): boolean;

    private async prepareStart() {
        if (!this.options.target || !this.options.library || !this.options.temp) {
            if (this.options.level >= 1) {
                this.console.error(`Parameter error, unable to start asset-db(${this.options.name}) with option ${this.options}.`);
            }
            return;
        }

        if (this.flag.started && this.options.level >= 2) {
            this.console.warn(`The ${this.options.name} database is already started.`);
            return;
        }

        this.flag.started = true;
        this.flag.starting = true;

        await this.infoManager.setRecordJSON(join(this.options.library, `.${this.options.name}-info.json`));
        await this.dataManager.setRecordJSON(join(this.options.library, `.${this.options.name}-data.json`));
        await this.dependencyManager.setRecordJSON(join(this.options.library, `.${this.options.name}-dependency.json`));

        // 要在资源刷新前加入缓存
        map[this.options.name] = this;
    }

    /**
     * 启动资源数据库
     */
    async start(options: AssetDBStartOptions = {}) {
        await this.prepareStart();

        // 刷新资源数据库内的资源列表
        let num = await this.refresh(this.options.target, {
            ignoreSelf: true,
            hooks: options.hooks,
        });

        this.console.debug(`start asset-db(${this.options.name}) with asset: ${num}`)

        return new Promise((resolve) => {
            const step = () => {
                setTimeout(async () => {
                    if (!this.taskManager.busy()) {
                        this.flag.starting = false;
                        if (options.hooks && options.hooks.afterStart) {
                            try {
                                await options.hooks.afterStart();
                            } catch (error) {
                                this.console.error(error);
                            }
                        }
                        await this.save();
                        return resolve(num);
                    }
                    this.taskManager.waitQueue().then(() => {
                        step();
                    });
                }, 10);
            };
            step();
        });
    }

    /**
     * 直接从缓存中恢复数据库，可能会失败抛异常
     * @returns
     */
    async startWithCache() {
        await this.prepareStart();
        try {
            const managerCacheConflict = this.infoManager.cacheConflict || this.dependencyManager.cacheConflict;
            if (managerCacheConflict) {
                throw managerCacheConflict;
            }
            await this.restoreFromCache();
        } catch (error) {
            if (!(error instanceof PathCaseConflictError)) {
                throw error;
            }
            this.console.warn(error.message);
            this.console.warn(`Discard invalid cache for asset-db(${this.options.name}) and rebuild it from disk.`);
            this.uuid2asset.clear();
            this.path2asset.clear();
            // Dependency records can only be reconstructed by running importers.
            // Invalidating mtime information prevents the normal startup fast path
            // from treating every asset as unchanged.
            if (this.dependencyManager.cacheConflict) {
                this.infoManager.destroy();
            }
            await this.refresh(this.options.target, { ignoreSelf: true });
        }
    }

    async updateInfoManager() {
        let infoDirty = false;
        // 删除已经不存在的资源
        // mtime 记录的都是之前存在的文件，所以循环 mtime 管理器里的数据进行校验
        await this.infoManager.forEach(async (path: string, info: SimpleInfo) => {
            if (!this.path2asset.has(path) && this.infoManager.get(path).uuid) {
                try {
                    const uuid = info.uuid as string;
                    if (getAsset(uuid)) {
                        return;
                    }
                    const dir = `${this.options.library}${sep}${uuid.substr(0, 2)}`;
                    if (existsSync(dir)) {
                        const list = await readdir(dir);
                        for (let name of list) {
                            if (name.startsWith(uuid)) {
                                await remove(join(dir, name));
                            }
                        }
                    }
                    this.infoManager.remove(path);
                    infoDirty = true;
                } catch (error) {
                    this.console.warn(error);
                }
            }
        })

        infoDirty && this.infoManager.save();
    }

    private _generateRecordInfo(): AssetDBRecordJSON {
        return {
            version: AssetDB.version,
            data: {
                paths: Array.from(this.path2asset.keys()).map((path) => relative(this.options.target, path)),
            },
        }
    }

    async save() {
        try {
            // 保存记录的缓存信息
            await writeJSON(join(this.cachePath), this._generateRecordInfo(), { spaces: 4 })
        } catch (error) {
            this.console.error(error);
            this.console.error(`Save cache for asset db ${this.options.name} failed.`)
        }
    }

    private async restoreFromCache() {
        // 此处兼容旧版本格式，临时处理，后续需要引入记录文件的版本管理机制
        const cacheJSON = await readJSON(this.cachePath);
        const version = cacheJSON.version ? cacheJSON.version : '0.0.0';
        const migrator = new Migrator<AssetDBRecordJSON>(migrations, AssetDB.version, {
            onError: (error, stage, data, ...args) => {
                this.console.warn(`Migrate error in asset-db ${this.options.name}`);
                this.console.warn(error);
            }
        });
        const recordInfo = await migrator.run(cacheJSON, version, [this]);

        const cachedPaths = recordInfo.data.paths.map((relativePath) => join(this.options.target, relativePath));
        assertNoPathIdentityConflicts(cachedPaths);

        await Promise.all(cachedPaths.map(async (path) => {
            try {
                const metaFile = join(path + '.meta');
                const metaInfo = await this.metaManager.get(metaFile);
                const asset = new Asset(path, metaInfo.json, this);
                this.uuid2asset.set(asset.uuid, asset);
                this.path2asset.set(asset.source, asset);
            } catch (error) {
                this.console.error(`Restore asset ${path} from cache failed.`);
                this.console.error(error);
            }
        }));
    }

    /**
     * 停止资源数据库
     */
    async stop() {
        this.uuid2asset.clear();
        this.path2asset.clear();
        this.flag.started = false;

        this.infoManager.saveImmediate();
        this.dependencyManager.saveImmediate();
        this.dataManager.saveImmediate();

        this.metaManager.destroy();
        this.infoManager.destroy();
        this.dependencyManager.destroy();

        if (map[this.options.name] === this) {
            delete map[this.options.name];
        }
    }

    /**
     * 传入 path，返回 asset-db 内对应的 uuid
     * 不存在则返回 null
     * @param path
     */
    pathToUuid(path: string) {
        let asset = this.path2asset.get(path);
        if (!asset) {
            return null;
        }
        return asset.uuid;
    }

    /**
     * 传入 uuid，返回对应的资源的 path
     * @param uuid
     */
    uuidToPath(uuid: string) {
        let asset = this.uuid2asset.get(uuid);
        if (!asset) {
            return null;
        }

        return asset.source;
    }

    /**
     * 查询资源实例
     * @param uuid
     */
    getAsset(uuid: string) {
        if (!uuid || typeof uuid !== 'string') {
            return null;
        }
        let search = uuid.split('@');
        let id = search.shift() || '';

        let asset: VirtualAsset | Asset | undefined = this.uuid2asset.get(id);
        if (!asset) {
            return null;
        }
        for (let i = 0; i < search.length; i++) {
            let idOrName = search[i];
            asset = asset.subAssets[idOrName];
            if (!asset) {
                return null;
            }
        }
        return asset || null;
    }

    /**
     * 重新导入某个指定资源
     * @param fileOrUUID
     */
    async reimport(fileOrUUID: string) {
        const asset: Asset | VirtualAsset | null = this.path2asset.get(fileOrUUID) || this.getAsset(fileOrUUID);
        if (!asset) {
            return null;
        }

        // 暂时使用开关控制
        if (this.options.flags && this.options.flags.reimportCheck && !asset._lock && asset.action !== AssetActionEnum.none) {
            return asset;
        }
        // 需要先锁定，因为如果开始导入，init 还是 false，但资源已经被锁定，所以等待资源锁定状态结束，再开始导入
        await this.lock();

        // 强制重新触发查找 importer 的动作
        if (asset instanceof Asset) {
            this.metaManager.read(asset.source + '.meta');
            const oldImporter = asset.meta.importer;
            asset.meta.importer = '*';
            const importer = await this.importerManager.find(asset);
            if (!importer) {
                throw new Error(`Unable to import data, no suitable importer was found.\n  path: ${asset.source}\n  uuid: ${asset.uuid}`);
            } else if (oldImporter === importer.name) {
                asset.meta.importer = importer.name;
            }
        }
        try {
            if (!asset.init) {
                this.unlock();
                return null;
            }
            asset.init = false;
            asset.action = AssetActionEnum.change;
            asset.task = this.taskManager.addTask(asset);
        } catch (error: any) {
            if (this.flag.starting) {
                this.console.error(error);
            } else {
                throw new Error(error);
            }
        }
        this.unlock();
        await this.taskManager.waitQueue();
        return asset;
    }

    /**
     * 刷新资源
     * 传入某一个文件或者文件夹，进行数据库刷新操作
     * 会优先同步扫描所有资源，然后等待其他 refresh 队列
     * 默认 refresh 是有队列的，多个 refresh 同时执行需要进入队列等待
     * @param path
     * @returns {number} 刷新的资源个数
     */
    async refresh(path: string, options: AssetDBRefreshOptions = {}): Promise<number> {
        // 如果不是绝对路径，不刷新
        if (!absolutePath(path)) {
            throw new Error(`invalid path ${path}, asset-db.refresh only support absolute path`);
        }
        path = normalize(path);

        // 如果是数据库文件夹，默认就忽略自己
        if (isSamePath(path, this.options.target)) {
            options.ignoreSelf = true;
            path = this.options.target;
        }

        path = resolveRealPathCase(path, this.options.target);

        // 向上递归查询，查询自己的父级文件夹是否存在
        // 如果父文件夹不在 db 里，则自动加入
        let parentDir = dirname(path);
        while (isSubPath(parentDir, this.options.target) && !this.path2asset.has(parentDir)) {
            path = parentDir;
            parentDir = dirname(parentDir);
        }

        // 检查是不是配置的 root 路径的子目录，如果不是子路径，则返回刷新 0 个资源
        if (!isSubPath(path, this.options.target) && !isSamePath(path, this.options.target)) {
            throw new Error(`asset(${path}) is not in asset-db(${this.options.name})`);
        }
        let files: string[] = [];
        // 刷新路径不存在时可能是已被删除的资源需要更新数据库信息，不报错
        if (existsSync(path)) {
            try {
                const fileStat = statSync(path);
                if (fileStat.isFile()) {
                    files = [path];
                } else {
                    const globPath = process.platform === 'win32' ? path.replace(/\\/g, '/') : path;
                    const scanBasePath = path;
                    // ! 要写绝对路径，否则可能在某些 win 机器上无法忽略文件
                    const search = options.globList || [
                        `**/*`,
                        `!**/*.meta`,
                    ];
                    if (this.options.globList) {
                        search.push(...this.options.globList);
                    }
                    files = fg.sync(search, {
                        onlyFiles: false,
                        // 如果将 path 传入 search 数组，卢经理带有 () 就无法正确识别了，所以需要使用 cwd
                        cwd: globPath,
                        // dot: true,
                    });

                    files.forEach((file, index) => {
                        files[index] = join(scanBasePath, file);
                    });

                    // 当扫描的路径不是根目录的时候，把被扫描的路径也检查一次
                    if (!isSamePath(path, this.options.target)) {
                        files.splice(0, 0, scanBasePath);
                    }
                }
            } catch (error) {
                this.console.error(error);
                files = [];
            }
        }
        assertNoPathIdentityConflicts(files);
        // 文件分组，如果有多个组，会在上一个组导入完成后，才开始下一个组的导入流程
        if (options.hooks && options.hooks.afterScan) {
            try {
                await options.hooks.afterScan(files);
            } catch (error) {
                this.console.error(error);
            }
        }

        // 扫描文件到的文件记录
        const fileSet: Set<string> = new PathSet();
        const deleteSet: Set<string> = new PathSet();
        const addSet: Set<string> = new PathSet();
        const caseChangedSet: Set<string> = new PathSet();
        const caseChangedAssets: Asset[] = [];
        const afterError = (error: unknown) => {
            this.taskManager.clear();
            this.unlock();
            throw error;
        }
        try {
            const preAddFiles: string[] = [];
            const addFiles: string[] = [];
            const deleteFiles: string[] = [];
            if (this.preImporterHandler) {
                for (let file of files) {
                    const storedPath = getMapStoredPathKey(this.path2asset, file);
                    if (storedPath !== undefined && storedPath !== file && normalize(storedPath) !== normalize(file)) {
                        const asset = this.path2asset.get(storedPath);
                        if (asset) {
                            this._updateAssetPathCase(asset, file);
                            caseChangedAssets.push(asset);
                            caseChangedSet.add(file);
                        }
                    }
                    if (!this.path2asset.has(file)) {
                        if (this.preImporterHandler(file)) {
                            preAddFiles.push(file);
                        } else {
                            addFiles.push(file);
                        }
                        addSet.add(file);
                    }
                    fileSet.add(file);
                }
            } else {
                for (let file of files) {
                    const storedPath = getMapStoredPathKey(this.path2asset, file);
                    if (storedPath !== undefined && storedPath !== file && normalize(storedPath) !== normalize(file)) {
                        const asset = this.path2asset.get(storedPath);
                        if (asset) {
                            this._updateAssetPathCase(asset, file);
                            caseChangedAssets.push(asset);
                            caseChangedSet.add(file);
                        }
                    }
                    if (!this.path2asset.has(file)) {
                        addFiles.push(file);
                        addSet.add(file);
                    }
                    fileSet.add(file);
                }
            }

            this.path2asset.forEach((asset, file) => {
                if (files.length === 0 || !fileSet.has(file)) {
                    if (isSamePath(file, path) || isSubPath(file, path)) {
                        deleteFiles.push(file);
                        deleteSet.add(file);
                    }
                }
            });

            this.taskManager.stop();

            for (const asset of caseChangedAssets) {
                asset.action = AssetActionEnum.change;
                asset.task = this.taskManager.addTask(asset);
            }

            // 判断添加的资源和移动、删除的资源
            await this._checkAssetsStatSync(preAddFiles, deleteFiles, deleteSet);
            if (options.hooks && options.hooks.afterPreImport) {
                try {
                    await options.hooks.afterPreImport();
                } catch (error) {
                    this.console.error(error);
                }
            }
            await this._checkAssetsStatSync(addFiles, deleteFiles, deleteSet);

            this.emit('refresh-uuid-ready', path);

            // 锁定任务栈
            await this.lock();

            // 没有改动的数据
            const tasks: Promise<any>[] = [];
            for (let file of files) {
                if (!addSet.has(file) && !deleteSet.has(file) && !caseChangedSet.has(file)) {
                    const asset = this.path2asset.get(file);
                    if (asset) {
                        tasks.push(this._checkAssetStat(asset));
                    }
                }
            }
            // 使用 Promise.all 会导致部分资源问题导致全部资源都无法刷新
            const result = await Promise.allSettled(tasks);
            result.forEach((res) => {
                // 失败的任务需要报错
                if (res.status === 'rejected') {
                    console.error(res.reason);
                }
            })
        } catch (error: any) {
            afterError(error);
        }

        if (options.hooks && options.hooks.afterGenerateMeta) {
            try {
                await options.hooks.afterGenerateMeta();
            } catch (error) {
                this.console.error(error);
            }
        }

        this.taskManager.start();

        try {
            await this.taskManager.waitQueue();
        } catch (error) {
            afterError(error);
        }

        this.unlock();

        // 返回所有文件的个数
        const num = this.taskManager.total();
        this.taskManager.clear();

        if (options.hooks && options.hooks.afterRefresh) {
            try {
                await options.hooks.afterRefresh();
            } catch (error) {
                this.console.error(error);
            }
        }

        await this.updateInfoManager();
        await this.save();
        return num;
    }

    private _replaceUUID(asset: Asset, oAsset: Asset) {
        if (oAsset !== asset) {
            if (isSamePath(asset.source, oAsset.source)) {
                console.trace(`_replaceUUID invalid in asset ${asset.source}`);
                return;
            }
            const newUUID = v4();
            // 提示两个文件 uuid 冲突
            if (this.options.level >= 2) {
                let info = JSON.stringify([
                    asset.source,
                    oAsset.source,
                ], null, 2);
                this.console.warn(`The uuid is already pointing to another asset .\n${info}\nThe file uuid has been updated: ${asset.source}\n    ${asset.uuid} -> ${newUUID}`);
            }
            asset.meta.uuid = newUUID;
        }
    }

    private _updateAssetPathCase(asset: Asset, source: string) {
        const previousSource = asset.source;
        const previousUrl = asset.url;
        if (previousSource === source) {
            return;
        }

        this.path2asset.set(source, asset);
        asset._source = source;
        const sourceExtname = extname(source);
        asset.extname = sourceExtname.toLowerCase();
        asset.basename = basename(source, sourceExtname);
        asset.updateUrl();

        this.infoManager.updatePathCase(previousSource, source);
        this.infoManager.updatePathCase(previousSource + '.meta', source + '.meta');
        this.metaManager.updatePathCase(previousSource + '.meta', source + '.meta');
        this.dependencyManager.updatePathCase(previousSource, source);
        this.dependencyManager.updatePathCase(previousUrl, asset.url);
    }

    /**
     * 检查资源状态
     * 识别是新增、修改还是删除了资源
     * @param addFiles
     * @param deleteFiles
     */
    private async _checkAssetsStatSync(addFiles: string[], deleteFiles: string[], deleteSet: Set<string>) {
        for (let file of deleteFiles) {
            // 毋庸置疑的删除文件
            const asset = this.path2asset.get(file);
            if (asset) {
                asset.action = AssetActionEnum.delete;
                asset.task = this.taskManager.addTask(asset);
                this.uuid2asset.delete(asset.uuid);
                this.path2asset.delete(asset.source);

                const metaFile = asset.source + '.meta';
                await this.metaManager.remove(metaFile);
                this.infoManager.remove(asset.source);
                this.infoManager.remove(metaFile);
            }
        }
        for (let file of addFiles) {
            // 获取 meta，没有的话直接生成
            const metaFile = file + '.meta';
            const metaInfo = await this.metaManager.get(metaFile);
            const uuidCacheAsset = getAsset(metaInfo.json.uuid);
            // uuid 指向的文件被删除了，就是移动文件
            if (uuidCacheAsset) {
                if (
                    deleteSet.has(uuidCacheAsset.source) ||
                    (
                        !isSamePath(uuidCacheAsset.source, file) &&
                        !existsSync(uuidCacheAsset.source)
                    )
                ) {
                    const asset = uuidCacheAsset;
                    this.path2asset.delete(asset.source);
                    this.infoManager.remove(asset.source);
                    await this.metaManager.remove(asset.source + '.meta');
                    this.infoManager.remove(asset.source + '.meta');
                    asset._source = file;
                    asset.extname = extname(file).toLowerCase();
                    asset.basename = basename(file, asset.extname);
                    asset.updateUrl();
                    asset.meta = metaInfo.json;
                    this.path2asset.set(asset.source, asset);
                    asset.action = AssetActionEnum.change;
                    asset.task = this.taskManager.addTask(asset);
                }
                // uuid 指向的文件没删除，识别为新建，但是 uuid 冲突了
                else {
                    const asset = new Asset(file, metaInfo.json, this);
                    this._replaceUUID(asset, uuidCacheAsset);
                    await asset.save();
                    asset.action = AssetActionEnum.add;
                    asset.task = this.taskManager.addTask(asset);
                    this.uuid2asset.set(asset.uuid, asset);
                    this.path2asset.set(asset.source, asset);
                }
            }
            // 启动数据库，还原以前的资源
            else if (this.flag.starting) {
                const fileStat = statSync(file);
                const asset = new Asset(file, metaInfo.json, this);

                if (this.infoManager.compare(file, fileStat.mtimeMs)) {
                    const metaStat = statSync(metaFile);
                    if (this.infoManager.compare(metaFile, metaStat.mtimeMs)) {
                        if (this.dataManager.has(asset)) {
                            asset.action = AssetActionEnum.none;
                            asset.task = this.taskManager.addTask(asset);
                        } else {
                            asset.action = AssetActionEnum.change;
                            asset.task = this.taskManager.addTask(asset);
                        }
                    } else {
                        // meta 被修改，就识别为先删后新增
                        this.emit('delete', asset);
                        this.emit('deleted', asset);
                        asset.action = AssetActionEnum.add;
                        const uuid = asset.uuid;
                        this.metaManager.read(metaFile);
                        if (asset.uuid !== uuid) {
                            this.uuid2asset.delete(uuid);
                            if (this.uuid2asset.has(asset.uuid)) {
                                this._replaceUUID(asset, getAsset(asset.uuid)!)
                            }
                            this.uuid2asset.set(asset.uuid, asset);
                        }
                        this.infoManager.add(metaFile, metaStat.mtimeMs);
                        asset.task = this.taskManager.addTask(asset);
                    }
                } else {
                    asset.action = AssetActionEnum.add;
                    this.infoManager.add(file, fileStat.mtimeMs);
                    asset.task = this.taskManager.addTask(asset);
                }
                this.uuid2asset.set(asset.uuid, asset);
                this.path2asset.set(asset.source, asset);

            }
            // 普通新增
            else {
                const oAsset = getAsset(metaInfo.json.uuid);
                const asset = new Asset(file, metaInfo.json, this);
                if (oAsset) {
                    this._replaceUUID(asset, oAsset);
                    await asset.save();
                }
                const metaStat = statSync(metaFile);

                // 如果 metaFile 的缓存不存在，则添加进缓存
                if (!this.infoManager.get(metaFile)) {
                    this.infoManager.add(metaFile, metaStat.mtimeMs);
                }

                // 如果 metaFile 的缓存不一致，则判断为被修改
                if (this.infoManager.compare(metaFile, metaStat.mtimeMs)) {
                    asset.action = AssetActionEnum.add;
                    asset.task = this.taskManager.addTask(asset);
                    this.uuid2asset.set(asset.uuid, asset);
                    this.path2asset.set(asset.source, asset);
                } else {
                    // 这种情况下，meta 被修改，都识别为先删除后新增
                    this.emit('delete', asset);
                    this.emit('deleted', asset);
                    asset.action = AssetActionEnum.add;
                    const uuid = asset.uuid;
                    this.metaManager.read(metaFile);
                    if (asset.uuid !== uuid) {
                        this.uuid2asset.delete(uuid);
                    }
                    this.infoManager.add(metaFile, metaStat.mtimeMs);
                    asset.task = this.taskManager.addTask(asset);
                    this.uuid2asset.set(asset.uuid, asset);
                    this.path2asset.set(asset.source, asset);
                }
            }
        }
    }

    private async _checkAssetStat(asset: Asset) {

        const file = asset.source;
        const metaFile = file + '.meta';
        if (!existsSync(metaFile)) {
            console.error(`${metaFile} is not exist! will use cache meta.`);
            await asset.save();
        }
        const metaStat = await stat(metaFile);

        if (!await this.infoManager.compare(metaFile, metaStat.mtimeMs)) {
            this.emit('delete', asset);
            this.emit('deleted', asset);
            asset.action = AssetActionEnum.add;
            const uuid = asset.uuid;
            this.metaManager.read(metaFile);
            if (asset.uuid !== uuid) {
                this.uuid2asset.delete(uuid);
                if (this.uuid2asset.has(asset.uuid)) {
                    this._replaceUUID(asset, getAsset(asset.uuid)!)
                }
                this.uuid2asset.set(asset.uuid, asset);
            }
            this.infoManager.add(metaFile, metaStat.mtimeMs);
            asset.task = this.taskManager.addTask(asset);
        } else {
            const fileStat = await stat(file);
            if (this.infoManager.compare(file, fileStat.mtimeMs)) {
                if (this.dataManager.has(asset)) {
                    asset.action = AssetActionEnum.none;
                    asset.task = this.taskManager.addTask(asset);
                } else {
                    asset.action = AssetActionEnum.change;
                    asset.task = this.taskManager.addTask(asset);
                }
            } else {
                // 更新 mtime 记录
                this.infoManager.add(file, fileStat.mtimeMs, asset.uuid);
                asset.action = AssetActionEnum.change;
                asset.task = this.taskManager.addTask(asset);
            }
        }
    }
}
