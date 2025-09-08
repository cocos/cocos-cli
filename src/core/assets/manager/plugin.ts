'use strict';

import { join } from 'path';
import { AssetDB, Importer } from '@editor/asset-db';
import EventEmitter from 'events';
import { newConsole } from './../console';
import I18n from '../../base/i18n';
import { AssetDBHookType, AssetDBPluginInfo, AssetDBRegisterInfo, EditorMethodModule, ExecuteAssetDBScriptMethodOptions, PackageRegisterInfo } from '../@types/private';
import Utils from '../../base/utils';
type PackageEventType = 'register' | 'unregister' | 'enable' | 'disable';

interface packageTask {
    type: PackageEventType;
    pkgName: string;
    handler: Function;
    args: any[];
}

/**
 * 扩展管理器
 * 更新一些场景暴露的扩展数据
 */
class PluginManager extends EventEmitter {
    packageRegisterInfo: Record<string, PackageRegisterInfo> = {};
    hookOrder: string[] = [];
    assetDBProfileMap: Record<string, string> = {};

    _tasks: packageTask[] = [];
    _currentTask: packageTask | null = null;
    // 插件注册控制锁，同一个插件同时只能执行一种任务
    private pkgLock: Record<string, boolean> = {};
    private ready = false;

    async init() {
        newConsole.trackMemoryStart('asset-db:worker-init: initPlugin');
        this.ready = true;
        this.emit('ready');
    }

    async destroyed() {

    }

    /**
     * 处理插件广播消息任务，由于各个处理消息异步，需要使用队列管理否则可能出现时序问题
     * @param name 
     * @param handler 
     * @param args 
     */
    public addTask(type: PackageEventType, pkgName: string, handler: Function, ...args: any[]) {
        this._tasks.push({
            type,
            pkgName,
            handler,
            args,
        });
        // 正常情况下，当前任务执行完会自动 step，当前无任务正在进行时 才手动调用 step 
        this.step();
    }

    public async onPluginRegister(data: AssetDBPluginInfo) {

        const contribution = data.contribution;
        const registerInfo: PackageRegisterInfo = this.packageRegisterInfo[data.name] || {
            name: data.name,
            hooks: [],
            enable: false,
        };

        newConsole.trackMemoryStart(`asset-db-plugin-register: ${data.name}`);

        // 3.8.3 废弃此用法，目前暂时兼容
        if (contribution.importer && contribution.importer.script) {
            // TODO 补充警告日志以及升级指南链接
            console.warn(`[Register ${data.name}]` + I18n.t('asset-db.deprecatedTip', {
                oldName: 'contribution.importer',
                newName: 'contribution.asset-handler',
                version: '3.8.3',
            }));
            if (!contribution.importer.list) {
                return;
            }
            const script = join(data.path, contribution.importer.script);
            try {
                registerInfo.importerRegisterInfo = {
                    script,
                    list: contribution.importer.list,
                };
            } catch (error) {
                console.warn(`Failed to register the importer from ${data.name}: ${script}`);
                console.warn(error);
            }
        }

        newConsole.trackMemoryEnd(`asset-db-plugin-register: ${data.name}`);
        this.packageRegisterInfo[data.name] = registerInfo;
    }

    public async onPackageEnable(data: AssetDBPluginInfo) {
        const registerInfo = this.packageRegisterInfo[data.name];
        if (!registerInfo) {
            return;
        }
        registerInfo.enable = true;
        const contribution = data.contribution;
        if (contribution.script) {
            const registerScript = join(data.path, contribution.script);
            try {
                const mod = Utils.File.requireFile(registerScript);
                if (typeof mod.load === 'function') {
                    await mod.load();
                }
                // 注册钩子函数索引
                if (Array.isArray(contribution['global-hook'])) {
                    registerInfo.hooks.push(...contribution['global-hook']);
                }
                if (Array.isArray(contribution['mount-hook'])) {
                    registerInfo.hooks.push(...contribution['mount-hook']);
                }
                if (registerInfo.hooks.length) {
                    this.hookOrder.push(data.name);
                }

                // 预注册自定义资源处理器
                if (contribution['asset-handler']) {
                    registerInfo.assetHandlerInfos = contribution['asset-handler'];
                }
                registerInfo.script = registerScript;
                // 注册自定义资源处理器
            } catch (error) {
                delete registerInfo.script;
                console.warn(`Description Failed to register the Asset-DB script from ${data.name}: ${registerInfo.script}.`);
                console.warn(error);
            }

        }

        if (contribution.mount) {
            registerInfo.mount = {
                ...contribution.mount,
                path: contribution.mount.path ? join(data.path, contribution.mount.path) : contribution.mount.path,
            };

            // 配置了 db 开关
            if (contribution.mount.enable) {
                this.assetDBProfileMap[`packages/${data.name}.json(${contribution.mount.enable})`] = data.name;
            }
        }
        this.emit('enable', data.name, registerInfo);
    }

    /**
     * 插件关闭后的一些卸载操作缓存清理，需要与 enable 里的处理互相呼应
     * @param data 
     * @returns 
     */
    public async onPackageDisable(data: AssetDBPluginInfo) {
        const registerInfo = this.packageRegisterInfo[data.name];
        if (!registerInfo) {
            return;
        }
        registerInfo.enable = false;
        if (registerInfo.script) {
            try {
                const mod = require(registerInfo.script);
                mod.unload && mod.unload();
            } catch (error) {
                console.warn(error);
            }
            delete registerInfo.assetHandlerInfos;
            delete registerInfo.script;
        }

        this.hookOrder.splice(this.hookOrder.indexOf(data.name), 1);
        // 3.8.3 已废弃，暂时兼容
        if (registerInfo.importerRegisterInfo) {
            try {
                const mod = require(registerInfo.importerRegisterInfo.script);
                mod.unload && mod.unload();
            } catch (error) {
                console.warn(error);
            }
            delete registerInfo.importerRegisterInfo;
        }

        if (registerInfo.mount) {
            delete this.assetDBProfileMap[`packages/${data.name}.json(${registerInfo.mount.enable})`];
            delete registerInfo.mount;
        }

        this.emit('disabled', data.name, registerInfo);
    }
    public async unRegisterDetach(data: AssetDBPluginInfo) {
        const registerInfo = this.packageRegisterInfo[data.name];
        if (!registerInfo) {
            return;
        }
        delete this.packageRegisterInfo[data.name];
    }

    private async step() {
        if (!this._tasks.length) {
            return;
        }
        const nextTaskIndex = this._tasks.findIndex((task) => !this.pkgLock[task.pkgName]);
        if (nextTaskIndex === -1) {
            return;
        }
        const task = this._tasks[nextTaskIndex];
        this.pkgLock[task.pkgName] = true;
        this._tasks.splice(nextTaskIndex, 1);
        const logTitle = `run package(${task.pkgName}) handler(${task.type})`;
        try {
            console.debug(logTitle + ' start');
            await task.handler.call(this, ...task.args);
            console.debug(logTitle + ` success!`);
        } catch (error) {
            console.error(error);
            console.error(logTitle + ` failed!`);
        }
        this.pkgLock[task.pkgName] = false;
        await this.step();
    }

    public getAssetDBInfos(): AssetDBRegisterInfo[] {
        const res: AssetDBRegisterInfo[] = [];
        for (const name of Object.keys(this.packageRegisterInfo)) {
            const dbInfo = this.getAssetDBInfo(name);
            dbInfo && (res.push(dbInfo));
        }
        return res;
    }

    public getAssetDBInfo(name: string): AssetDBRegisterInfo | null {
        const info = this.packageRegisterInfo[name];
        if (!info || !info.mount) {
            return null;
        }
        return {
            name,
            readonly: !!info.mount.readonly,
            visible: info.mount.visible === false ? false : true,
            target: info.mount.path,
        };
    }

    public async executeScriptSafe(options: ExecuteAssetDBScriptMethodOptions) {
        try {
            const script = this.packageRegisterInfo[options.name].script!;
            const mod = Utils.File.requireFile(script);
            if (mod.methods && mod.methods[options.method]) {
                return await mod.methods[options.method](...(options.args || []));
            }
        } catch (error) {
            console.debug(error);
        }
    }

    /**
     * 执行某个生命周期钩子函数
     * @param hookName 
     */
    public async runHook(hookName: AssetDBHookType, params: any[] = []) {
        const pkgNameOrder = this.hookOrder;
        for (const pkgName of pkgNameOrder) {
            const { script, hooks, enable } = this.packageRegisterInfo[pkgName];
            if (!enable && this.ready || !hooks.includes(hookName)) {
                continue;
            }
            newConsole.trackTimeStart(`asset-db-hook-${pkgName}-${hookName}`);
            console.debug(`Run asset db hook ${pkgName}:${hookName} ...`);
            await this.executeScriptSafe({
                name: pkgName,
                method: hookName,
                args: params,
            });
            console.debug(`Run asset db hook ${pkgName}:${hookName} success!`);
            newConsole.trackTimeEnd(`asset-db-hook-${pkgName}-${hookName}`, { output: true });
            // try {
            // } catch (error) {
            //     console.error(error);
            //     console.error(`Run asset-db hook ${pkgName}:${hookName} failed!`);
            // }
        }
    }

    public async registerImporterList(database: AssetDB) {
        // 兼容 3.9 之前版本使用旧的导入器注册方式的流程
        for (const name in pluginManager.packageRegisterInfo) {
            const item = pluginManager.packageRegisterInfo[name];

            if (item.importerRegisterInfo) {
                const mod = require(item.importerRegisterInfo.script) as EditorMethodModule;
                for (const name of item.importerRegisterInfo.list) {
                    if (mod.methods && mod.methods[name]) {
                        try {
                            const result: { importer: typeof Importer, extname: string[] } = await mod.methods[name]!();
                            database.importerManager.add(result.importer, result.extname);
                        } catch (error) {
                            console.warn(`Failed to register importer. Data is not compliant: ${database.options.name} ${name}`);
                            console.warn(error);
                        }
                    } else {
                        console.warn(`Failed to register importer. Data is not compliant: ${database.options.name} ${name}`);
                    }
                }
            }
        }
    }
}

const pluginManager = new PluginManager();

export default pluginManager;
