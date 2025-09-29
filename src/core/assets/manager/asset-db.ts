'use strict';

import { AssetDBRegisterInfo, IAsset, IAssetDBInfo } from '../@types/private';

import * as assetdb from '@editor/asset-db';
import EventEmitter from 'events';
import { ensureDirSync, existsSync } from 'fs-extra';
import { extname, join, relative } from 'path';
import { newConsole } from '../../base/console';
import { decidePromiseState, getCurrentLocalTime, PROMISE_STATE } from '../utils';
import pluginManager from './plugin';
import assetHandlerManager from './asset-handler';
import i18n from '../../base/i18n';
import Utils from '../../base/utils';
import assetConfig from '../asset-config';
import { compileEffect, startAutoGenEffectBin } from '../asset-handler';
import { PackerDriver } from '../../scripting/packer-driver';

export interface IPhysicsConfig {
    gravity: IVec3Like; // （0，-10， 0）
    allowSleep: boolean; // true
    sleepThreshold: number; // 0.1，最小 0
    autoSimulation: boolean; // true
    fixedTimeStep: number; // 1 / 60 ，最小 0
    maxSubSteps: number; // 1，最小 0
    defaultMaterial?: string; // 物理材质 uuid
    useNodeChains: boolean; // true
    collisionMatrix: ICollisionMatrix;
    physicsEngine: string;
    physX?: {
        notPackPhysXLibs: boolean;
        multiThread: boolean;
        subThreadCount: number;
        epsilon: number;
    };
}
// 物理配置
export interface ICollisionMatrix {
    [x: string]: number;
}
export interface IVec3Like {
    x: number;
    y: number;
    z: number;
}

const AssetDBPriority: Record<string, number> = {
    internal: 99,
    assets: 98,
};

interface IStartupDatabaseHandleInfo {
    name: string;
    afterPreImportResolve: Function;
    finish?: Function;
}

type RefreshState = 'free' | 'busy' | 'wait';

interface IWaitingTask {
    func: Function;
    args: any[];
    resolve?: Function;
}

interface IWaitingTaskInfo {
    func: Function;
    args: any[];
    resolves?: Function[];
}

/**
 * 总管理器，管理整个资源进程的启动流程、以及一些子管理器的启动流程
 */
export class AssetDBManager extends EventEmitter {
    public assetDBMap: Record<string, assetdb.AssetDB> = {};
    public globalInternalLibrary = false;

    private hasPause = false;
    private startPause = false;
    public get isPause() {
        return this.hasPause || this.startPause;
    }
    public ready = false;
    private waitPauseHandle?: Function;
    private waitPausePromiseTask?: Promise<boolean>;
    private state: RefreshState = 'free';
    public assetDBInfo: Record<string, IAssetDBInfo> = {};
    private waitingTaskQueue: IWaitingTaskInfo[] = [];
    private waitingRefreshAsset: string[] = [];
    private autoRefreshTimer?: NodeJS.Timeout;
    private get assetBusy() {
        return this.assetBusyTask.size > 0;
    }
    private reimportCheck = false;
    private assetBusyTask = new Set();
    private pluginManager = pluginManager;
    private assetHandlerManager = assetHandlerManager;

    static useCache = false;
    static libraryRoot: string;
    static tempRoot: string;

    get free() {
        return this.ready && !this.isPause && this.state !== 'free' && !this.assetBusy;
    }

    /**
     * 初始化，需要优先调用
     * @param 资源配置信息 
     */
    async init() {
        const { assetDBList, flagReimportCheck, libraryRoot, tempRoot, restoreAssetDBFromCache } = assetConfig.data;
        if (!assetDBList.length) {
            throw new Error(i18n.t('asset-db.init.noAssetDBList'));
        }
        AssetDBManager.libraryRoot = libraryRoot;
        AssetDBManager.tempRoot = tempRoot;
        AssetDBManager.useCache = restoreAssetDBFromCache;
        assetDBList.forEach((info) => {
            this.assetDBInfo[info.name] = patchAssetDBInfo(info);
        });
        // TODO 版本升级资源应该只认自身记录的版本号
        // if (AssetDBManager.useCache && Project.info.version !== Project.info.lastVersion) {
        //     AssetDBManager.useCache = false;
        //     console.log(i18n.t('asset-db.restoreAssetDBFromCacheInValid.upgrade'));
        // }

        if (AssetDBManager.useCache && !existsSync(AssetDBManager.libraryRoot)) {
            AssetDBManager.useCache = false;
            console.log(i18n.t('asset-db.restoreAssetDBFromCacheInValid.noLibraryPath'));
        }
        await this.pluginManager.init();
        await this.assetHandlerManager.init();

        this.reimportCheck = flagReimportCheck;
    }

    /**
     * 启动数据库入口
     */
    async start() {
        newConsole.trackTimeStart('asset-db:start-database');

        if (AssetDBManager.useCache) {
            await this._startFromCache();
        } else {
            // await this._start();
            await this._startDirectly();
        }
        this.ready = true;
        newConsole.trackTimeEnd('asset-db:start-database', { output: true });
        // 性能测试: 资源冷导入
        newConsole.trackTimeEnd('asset-db:ready', { output: true });
        this.emit('asset-db:ready');
        // TODO 不是常驻模式，则无需开启，启动成功后，开始加载尚未注册的资源处理器
        // this.assetHandlerManager.activateRegisterAll();

        this.step();
        // TODO 启动成功后开始再去做一些日志缓存清理
    }

    /**
     * 首次启动数据库
     */
    private async _start() {
        newConsole.trackMemoryStart('asset-db:worker-init: preStart');
        const assetDBNames = Object.keys(this.assetDBInfo).sort((a, b) => (AssetDBPriority[b] || 0) - (AssetDBPriority[a] || 0));
        const startupDatabaseQueue: IStartupDatabaseHandleInfo[] = [];
        for (const assetDBName of assetDBNames) {
            const db = await this._createDB(this.assetDBInfo[assetDBName]);
            const waitingStartupDBInfo = await this._preStartDB(db);
            startupDatabaseQueue.push(waitingStartupDBInfo);
        }
        newConsole.trackMemoryEnd('asset-db:worker-init: preStart');

        await afterStartDB();
        newConsole.trackMemoryStart('asset-db:worker-init: startup');
        for (let i = 0; i < startupDatabaseQueue.length; i++) {
            const startupDatabase = startupDatabaseQueue[i];
            await this._startupDB(startupDatabase);
        }
        newConsole.trackMemoryEnd('asset-db:worker-init: startup');
    }

    /**
     * 直接启动数据库
     */
    private async _startDirectly() {
        const assetDBNames = Object.keys(this.assetDBInfo).sort((a, b) => (AssetDBPriority[b] || 0) - (AssetDBPriority[a] || 0));
        for (const assetDBName of assetDBNames) {
            await this.startDB(this.assetDBInfo[assetDBName]);
        }
    }

    /**
     * 从缓存启动数据库，如果恢复失败会回退到原始的启动流程
     */
    private async _startFromCache() {
        console.debug('try start all assetDB from cache...');
        const assetDBNames = Object.keys(this.assetDBInfo).sort((a, b) => (AssetDBPriority[b] || 0) - (AssetDBPriority[a] || 0));
        for (const assetDBName of assetDBNames) {
            const db = await this._createDB(this.assetDBInfo[assetDBName]);
            if (existsSync(db.cachePath)) {
                try {
                    await db.startWithCache();
                    this.assetDBInfo[assetDBName].state = 'startup';
                    this.emit('db-started', db);
                    console.debug(`start db ${assetDBName} with cache success`);
                    this.emit('asset-db:db-ready', assetDBName);
                    continue;
                } catch (error) {
                    console.error(error);
                    console.warn(`start db ${assetDBName} with cache failed, try to start db ${assetDBName} without cache`);
                }
            }

            // 没有正常走完缓存恢复，走普通的启动流程
            const waitingStartupDBInfo = await this._preStartDB(db);
            await this._startupDB(waitingStartupDBInfo);
        }
        await afterStartDB();
    }

    public isBusy() {
        for (const name in this.assetDBMap) {
            if (!this.assetDBMap[name]) {
                continue;
            }
            const db = this.assetDBMap[name];
            if (db.assetProgressInfo.wait > 0) {
                return true;
            }
        }
        return false;
    }

    public hasDB(name: string) {
        return !!this.assetDBMap[name];
    }

    private async startDB(info: IAssetDBInfo) {
        if (this.hasDB(info.name)) {
            return;
        }
        await this._createDB(info);
        await this._startDB(info.name);
        this.emit('asset-db:db-ready', info.name);
    }

    /**
     * 将一个绝对路径，转成 url 地址
     * @param path
     * @param dbName 可选
     */
    public path2url(path: string, dbName?: string): string {
        // 否则会出现返回 'db://internal/../../../../../db:/internal' 的情况
        if (path === `db://${dbName}`) {
            return path;
        }
        let database;
        if (!dbName) {
            database = Object.values(assetDBManager.assetDBMap).find((db) => Utils.Path.contains(db.options.target, path));
        } else {
            database = assetDBManager.assetDBMap[dbName];
        }
        if (!database) {
            console.error(`Can not find asset db with asset path: ${path}`);
            return path;
        }

        // 将 windows 上的 \ 转成 /，统一成 url 格式
        let _path = relative(database.options.target, path);
        _path = _path.replace(/\\/g, '/');

        return `db://${database.options.name}/${_path}`;
    }

    private async _createDB(info: IAssetDBInfo) {
        ensureDirSync(info.library);
        ensureDirSync(info.temp);
        // TODO 目标数据库地址为空的时候，其实无需走后续完整的启动流程，可以考虑优化
        ensureDirSync(info.target);
        info.flags = {
            reimportCheck: this.reimportCheck,
        };
        const db = assetdb.create(info);
        this.assetDBMap[info.name] = db;
        db.importerManager.find = async (asset: IAsset) => {
            let importer = await this.assetHandlerManager.findImporter(asset, true);
            if (importer) {
                return importer;
            }
            const newImporter = await this.assetHandlerManager.getDefaultImporter(asset);
            return newImporter || importer;
        };
        this.emit('db-created', db);
        return db;
    }

    /**
     * 预启动 db, 需要与 _startupDB 搭配使用，请勿单独调用
     * @param db 
     * @returns 
     */
    private async _preStartDB(db: assetdb.AssetDB) {
        const hooks: Record<string, Function> = {
            afterScan,
        };
        // HACK 目前因为一些特殊的导入需求，将 db 启动流程强制分成了两次
        return await new Promise<IStartupDatabaseHandleInfo>(async (resolve, reject) => {
            const handleInfo: IStartupDatabaseHandleInfo = {
                name: db.options.name,
                afterPreImportResolve: () => {
                    console.error(`Start database ${db.options.name} failed!`);
                    // 防止意外情况下，资源进程卡死无任何信息
                    handleInfo.finish && handleInfo.finish();
                },
            };
            // HACK 1/3 启动数据库时，不导入全部资源，先把预导入资源导入完成后进入等待状态
            hooks.afterPreImport = async () => {
                await afterPreImport(db);
                console.debug(`PreImport db ${db.options.name} success`);
                resolve(handleInfo);
                return new Promise((resolve) => {
                    handleInfo.afterPreImportResolve = resolve;
                });
            };
            hooks.afterStart = () => {
                handleInfo.finish && handleInfo.finish();
            };
            db.start({
                hooks,
            }).catch((error) => {
                reject(error);
            });
            this.assetDBInfo[db.options.name].state = 'start';
        });
    }

    /**
     * 完全启动之前预启动的 db ，请勿单独调用
     * @param startupDatabase 
     */
    private async _startupDB(startupDatabase: IStartupDatabaseHandleInfo) {
        console.debug(`Start up the '${startupDatabase.name}' database...`);
        newConsole.trackTimeStart(`asset-db: startup '${startupDatabase.name}' database...`);
        // 2/3 结束 afterPreImport 预留的等待状态，正常进入资源的导入流程,标记 finish 作为结束判断
        await new Promise(async (resolve) => {
            startupDatabase.finish = resolve;
            startupDatabase.afterPreImportResolve();
        });
        newConsole.trackTimeEnd(`asset-db:worker-startup-database[${startupDatabase.name}]`, { output: true });
        newConsole.trackMemoryEnd(`asset-db:worker-startup-database[${startupDatabase.name}]`);

        this.assetDBInfo[startupDatabase.name].state = 'startup';
        const db = this.assetDBMap[startupDatabase.name];
        this.emit('db-started', db);
        newConsole.trackTimeEnd(`asset-db: startup '${startupDatabase.name}' database...`);
    }

    /**
     * 启动某个指定数据库
     * @param name 
     */
    public async _startDB(name: string) {
        const db = this.assetDBMap[name];
        newConsole.trackTimeStart(`asset-db:worker-startup-database[${db.options.name}]`);
        newConsole.trackMemoryStart(`asset-db:worker-startup-database[${db.options.name}]`);
        this.assetDBInfo[name].state = 'start';

        const preImporterHandler = getPreImporterHandler(this.assetDBInfo[name].preImportExtList);
        if (preImporterHandler) {
            db.preImporterHandler = preImporterHandler;
        }
        const hooks: Record<string, Function> = {
            afterScan,
        };

        hooks.afterPreImport = async () => {
            await afterPreImport(db);
        };
        console.debug(`start asset-db(${name})...`);
        await db.start({
            hooks,
        });
        this.assetDBInfo[name].state = 'startup';
        this.emit('db-started', db);
        newConsole.trackTimeEnd(`asset-db:worker-startup-database[${db.options.name}]`, { output: true });
        newConsole.trackMemoryEnd(`asset-db:worker-startup-database[${db.options.name}]`);
        return;
    }

    /**
     * 添加某个 asset db
     */
    async addDB(info: AssetDBRegisterInfo) {
        this.assetDBInfo[info.name] = patchAssetDBInfo(info);
        await this.startDB(this.assetDBInfo[info.name]);
    }

    /**
     * 移除某个 asset-db
     * @param name 
     * @returns 
     */
    async removeDB(name: string) {
        if (this.isPause) {
            console.log(i18n.t('asset-db.assetDBPauseTips',
                { operate: 'removeDB' }
            ));
            return new Promise((resolve) => {
                this._addTaskToQueue({
                    func: this._removeDB.bind(this),
                    args: [name],
                    resolve,
                });
            });
        }
        return await this._removeDB(name);
    }

    private async _operate(name: string, ...args: any[]) {
        const taskId = name + Date.now();
        if (name.endsWith('Asset')) {
            this.assetBusyTask.add(taskId);
        }
        try {
            // @ts-ignore
            const res = await this[name](...args);
            this.assetBusyTask.delete(taskId);
            return res;
        } catch (error) {
            console.error(`${name} failed with args: ${args.toString()}`);
            console.error(error);
            this.assetBusyTask.delete(taskId);
        }
    }

    private async _removeDB(name: string) {
        const db = this.assetDBMap[name];
        if (!db) {
            return;
        }
        await db.stop();
        this.emit('db-removed', db);
        delete this.assetDBMap[name];
        delete this.assetDBInfo[name];
        this.emit('asset-db:db-close', name);
    }

    /**
     * 刷新所有数据库
     * @returns 
     */
    async refresh() {
        if (!this.ready) {
            return;
        }
        if (this.state !== 'free' || this.isPause || this.assetBusy) {
            if (this.isPause) {
                console.log(i18n.t('asset-db.assetDBPauseTips',
                    { operate: 'refresh' }
                ));
            }
            return new Promise((resolve) => {
                this._addTaskToQueue({
                    func: this._refresh.bind(this),
                    args: [],
                    resolve,
                });
            });
        }
        return await this._refresh();
    }

    private async _refresh() {
        this.state = 'busy';
        newConsole.trackTimeStart('asset-db:refresh-all-database');
        for (const name in this.assetDBMap) {
            if (!this.assetDBMap[name]) {
                console.debug(`Get assetDB ${name} form manager failed!`);
                continue;
            }
            const db = this.assetDBMap[name];
            await db.refresh(db.options.target, {
                ignoreSelf: true,
                // 只有 assets 资源库做 effect 编译处理
                hooks: name === 'assets' ? {
                    afterPreImport: async () => {
                        await afterPreImport(db);
                    },
                } : {},
            });
            console.debug(`refresh db ${name} success`);
        }
        newConsole.trackTimeEnd('asset-db:refresh-all-database', { output: true });
        this.emit('asset-db:refresh-finish');
        this.state = 'free';
        this.step();
    }

    /**
     * 懒刷新资源，请勿使用，目前的逻辑是针对重刷文件夹定制的
     * @param file 
     */
    public async autoRefreshAssetLazy(pathOrUrlOrUUID: string) {
        if (!this.waitingRefreshAsset.includes(pathOrUrlOrUUID)) {
            this.waitingRefreshAsset.push(pathOrUrlOrUUID);
        }

        this.autoRefreshTimer && clearTimeout(this.autoRefreshTimer);
        return new Promise((resolve) => {
            this.autoRefreshTimer = setTimeout(async () => {
                const taskId = 'autoRefreshAssetLazy' + Date.now();
                this.assetBusyTask.add(taskId);
                const files = JSON.parse(JSON.stringify(this.waitingRefreshAsset));
                this.waitingRefreshAsset.length = 0;
                await Promise.all(files.map((file: string) => assetdb.refresh(file)));
                this.assetBusyTask.delete(taskId);
                this.step();
                resolve(true);
            }, 100);
        });
    }

    /**
     * 恢复被暂停的数据库
     * @returns 
     */
    async resume(): Promise<boolean> {
        if (!this.hasPause && !this.startPause) {
            return true;
        }
        this.hasPause = false;
        this.startPause = false;
        this.emit('asset-db:resume');
        await this.step();
        return true;
    }

    async addTask(func: Function, args: any[]): Promise<any> {
        if (this.isPause || this.state === 'busy') {
            console.log(i18n.t('asset-db.assetDBPauseTips',
                { operate: func.name }
            ));
            return new Promise((resolve) => {
                this._addTaskToQueue({
                    func,
                    args: args,
                    resolve,
                });
            });
        }
        return await func(...args);
    }

    private _addTaskToQueue(task: IWaitingTask) {
        const last = this.waitingTaskQueue[this.waitingTaskQueue.length - 1];
        const curTask: IWaitingTaskInfo = {
            func: task.func,
            args: task.args,
        };
        if (task.resolve) {
            curTask.resolves = [task.resolve];
        }
        if (!last) {
            this.waitingTaskQueue.push(curTask);
            this.step();
            return;
        }

        // 不一样的任务添加进队列
        if (last.func.name !== curTask.func.name || curTask.args.toString() !== last.args.toString()) {
            this.waitingTaskQueue.push(curTask);
            this.step();
            return;
        }
        // 将一样的任务合并
        if (!task.resolve) {
            return;
        }

        if (last.resolves) {
            last.resolves.push(task.resolve);
        } else {
            last.resolves = curTask.resolves;
        }
        this.step();
    }

    async step() {
        // 存在等待的 handle 先处理回调
        if (this.startPause && this.waitPauseHandle) {
            this.waitPauseHandle(true);
            this.waitPauseHandle = undefined;
        }
        // db 暂停时，不处理等待任务
        if (this.isPause || !this.waitingTaskQueue.length || this.state === 'busy') {
            return;
        }
        // 深拷贝以避免在处理的过程中持续收到任务
        let waitingTaskQueue = Array.from(this.waitingTaskQueue);
        const lastWaitingQueue: IWaitingTaskInfo[] = [];
        // 当同时有资源操作与整体的检查刷新任务时，优先执行资源操作任务
        waitingTaskQueue = waitingTaskQueue.filter((task) => {
            if (!this.assetBusy || (this.assetBusy && task.func.name !== '_refresh')) {
                return true;
            }
            lastWaitingQueue.push(task);
            return false;
        });
        this.waitingTaskQueue = lastWaitingQueue;
        for (let index = 0; index < waitingTaskQueue.length; index++) {
            const task = waitingTaskQueue[index];
            try {
                if (task.func.name === '_refresh' && this.assetBusy) {
                    // 没有执行的任务塞回队列
                    this.waitingTaskQueue.push(task);
                    continue;
                }
                const res = await task.func(...task.args);
                if (!task.resolves) {
                    return;
                }
                task.resolves.forEach((resolve) => resolve(res));
            } catch (error) {
                console.warn(error);
            }
        }

        // 当前 step 的处理任务完成即可结束，剩余任务会在下一次 step 中处理
    }

    /**
     * 暂停数据库
     * @param source 来源标识
     * @returns 
     */
    async pause(source = 'unkown') {
        this.startPause = true;
        // 只要当前底层没有正在处理的资源都视为资源进入可暂停状态
        if (!this.isBusy()) {
            this.hasPause = true;
            this.emit('asset-db:pause', source);
            console.log(`Asset DB is paused with ${source}!`);
            return true;
        }
        if (!this.hasPause) {
            return this.waitPausePromiseTask;
        }
        this.waitPausePromiseTask = new Promise((resolve) => {
            this.waitPauseHandle = () => {
                this.waitPausePromiseTask = undefined;
                this.emit('asset-db:pause', source);
                console.log(`Asset DB is paused with ${source}!`);
                this.hasPause = true;
                resolve(true);
            };
        });
        // 2 分钟的超时时间，超过自动返回回调
        setTimeout(() => {
            this.waitPausePromiseTask && decidePromiseState(this.waitPausePromiseTask).then(state => {
                if (state === PROMISE_STATE.PENDING) {
                    this.hasPause = true;
                    this.emit('asset-db:pause', source);
                    this.waitPauseHandle!();
                    console.debug('Pause asset db time out');
                }
            });
        }, 2000 * 60);
        return this.waitPausePromiseTask;
    }
}

export const assetDBManager = new AssetDBManager();

function patchAssetDBInfo(config: AssetDBRegisterInfo): IAssetDBInfo {
    return {
        name: config.name,
        target: Utils.Path.normalize(config.target),
        readonly: !!config.readonly,

        temp: config.temp || Utils.Path.normalize(join(AssetDBManager.tempRoot, 'asset-db', config.name)),
        library: config.library || AssetDBManager.libraryRoot,

        level: 4,
        globList: assetConfig.data.globList,
        ignoreFiles: ['.DS_Store', '.rename_temp'],
        visible: config.visible,
        state: 'none',
        preImportExtList: config.preImportExtList || [],
    };
}

// TODO 排队队列做合并
// class AutoMergeQueue extends Array {
//     add(item: IWaitingTask) {
//         const lastTask = this[this.length - 1];
//         // 自动合并和上一个任务一样的
//         if (!lastTask || !lodash.isEqual({name: item.name, args: item.args}, {name: lastTask.name, args: lastTask.args})) {
//             return this.push(item);
//         }
//         if (!item.resolve) {
//             return this.length - 1;
//         }
//         lastTask.resolves = lastTask.resolves ? [] : lastTask.resolves;
//         lastTask.resolve && lastTask.resolves.push(lastTask.resolve);
//         lastTask.resolves.push(item.resolve);
//     }
// }

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}

const defaultPreImportExtList = ['.ts', '.chunk', '.effect'];

function getPreImporterHandler(preImportExtList?: string[]) {
    if (!preImportExtList || !preImportExtList.length) {
        preImportExtList = defaultPreImportExtList;
    } else {
        preImportExtList = Array.from(new Set(preImportExtList.concat(defaultPreImportExtList)));
    }

    return function (file: string) {
        // HACK 用于指定部分资源优先导入
        const ext = extname(file);
        if (!ext) {
            return true;
        } else {
            return preImportExtList.includes(ext);
        }
    };
}

const afterScan = async function (files: string[]) {
    let dirIndex = 0;
    let chunkIndex = 0;
    let effectIndex = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = extname(file);
        if (!ext) {
            files.splice(i, 1);
            files.splice(dirIndex, 0, file);
            dirIndex += 1;
        } else if (ext === '.chunk') {
            files.splice(i, 1);
            files.splice(dirIndex + chunkIndex, 0, file);
            chunkIndex += 1;
        } else if (ext === '.effect') {
            files.splice(i, 1);
            files.splice(dirIndex + chunkIndex + effectIndex, 0, file);
            effectIndex += 1;
        }
    }
};

async function afterPreImport(db: assetdb.AssetDB) {
    // 先把已收集的任务队列（preImporterHandler 过滤出来的那部分资源类型）内容优先导入执行完毕
    db.taskManager.start();
    await db.taskManager.waitQueue();
    db.taskManager.stop();
}

async function afterStartDB() {
    await compileEffect();
    // 启动数据库后，打开 effect 导入后的自动重新生成 effect.bin 开关
    await startAutoGenEffectBin();

    PackerDriver.getInstance().build();
}