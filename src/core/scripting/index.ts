import { CCEModuleMap } from '../engine/@types/config';
import { IPluginScriptInfo, SharedSettings } from './interface';
import { PackerDriver } from './packer-driver';
import { Executor } from '@cocos/lib-programming/dist/executor';
import { QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack/lib/loader';
import { CustomEvent, EventType, eventEmitter } from './event-emitter';
import { AssetChangeInfo, DBChangeType } from './packer-driver/asset-db-interop';
import { v4 as uuid } from 'node-uuid';
import { DBInfo } from './@types/config-export';

export const title = 'i18n:builder.tasks.load_script';

let executor: Executor | null = null;

class GlobalEnv {
    public async record(fn: () => Promise<void>) {
        this.clear();
        this._queue.push(async () => {
            const beforeKeys = Object.keys(globalThis);
            await fn();
            const afterKeys = Object.keys(globalThis);
            for (const afterKey of afterKeys) {
                if (!beforeKeys.includes(afterKey)) {
                    this._incrementalKeys.add(afterKey);
                }
            }
            console.debug(`Incremental keys: ${Array.from(this._incrementalKeys)}`);
        });
        await this.processQueue(); // 处理队列
    }

    private clear() {
        this._queue.push(async () => {
            for (const incrementalKey of this._incrementalKeys) {
                delete (globalThis as any)[incrementalKey];
            }
            this._incrementalKeys.clear();
        });
    }

    private async processQueue() {
        while (this._queue.length > 0) {
            const next = this._queue.shift();
            if (next) await next(); // 执行队列中的下一个任务
        }
    }

    private _incrementalKeys = new Set<string>();
    private _queue: (() => Promise<void>)[] = [];
}

const globalEnv = new GlobalEnv();

class ScriptManager {

    on(type: EventType, listener: (arg: any) => void): CustomEvent { return eventEmitter.on(type, listener); }
    off(type: EventType, listener: (arg: any) => void): CustomEvent { return eventEmitter.off(type, listener); }
    once(type: EventType, listener: (arg: any) => void): CustomEvent { return eventEmitter.once(type, listener); }

    private _initialized = false;
    private _pendingCompileTimer: NodeJS.Timeout | null = null;
    private _pendingCompileTaskId: string | null = null;

    /**
     * 初始化Scripting模块
     * @param projectPath 项目路径
     * @param enginePath 引擎路径
     * @param features 引擎功能特性列表
     */
    async initialize(projectPath: string, enginePath: string, features: string[]): Promise<void> {
        if (this._initialized) {
            return;
        }
        const packerDriver = await PackerDriver.create(projectPath, enginePath);
        await packerDriver.init(features);
        this._initialized = true;
    }

    /**
     * 查询文件的依赖者（谁使用了这个文件）
     * @param path 文件路径
     * @returns 使用该文件的其他文件路径列表
     */
    async queryScriptUsers(path: string): Promise<string[]> {
        return PackerDriver.getInstance().queryScriptUsers(path);
    }

    /**
     * 查询文件的依赖（这个文件使用了哪些文件）
     * @param path 文件路径
     * @returns 该文件依赖的其他文件路径列表
     */
    async queryScriptDependencies(path: string): Promise<string[]> {
        return PackerDriver.getInstance().queryScriptDeps(path);
    }

    /**
     * 查询共享配置
     * @returns 共享配置对象
     */
    async querySharedSettings(): Promise<SharedSettings> {
        return PackerDriver.getInstance().querySharedSettings();
    }

    /**
     * 生成类型声明文件
     */
    async generateDeclarations() {
        return PackerDriver.getInstance().generateDeclarations();
    }

    /**
     * @param type 变更类型
     * @param uuid 资源UUID
     * @param assetInfo 资源信息
     * @param meta 元数据
     */
    dispatchAssetChange(assetChange: AssetChangeInfo): void {
        PackerDriver.getInstance().dispatchAssetChanges(assetChange);
    }

    /**
     * 调用方需要捕获异常，无异常则编译成功
     * 编译脚本文件
     * @param assetChanges 资源变更列表，如果未提供，则编译上一次缓存的资源变更列表
     */
    async compileScripts(assetChanges?: AssetChangeInfo[]): Promise<void> {
        await PackerDriver.getInstance().build(assetChanges);
    }

    /**
     * 
     * @param delay 延迟时间，单位为毫秒, 同一时间只能有一个延迟编译任务，如果存在则返回已有的任务ID
     * @returns 延迟编译任务的ID，如果存在则返回已有的任务ID
     */
    postCompileScripts(delay: number): string {
        // 如果已经有待执行的延迟任务，取消它
        if (this._pendingCompileTimer) {
            clearTimeout(this._pendingCompileTimer);
        }
        
        // 如果已有任务ID，继续使用它；否则生成新的
        const taskId = this._pendingCompileTaskId || uuid();
        this._pendingCompileTaskId = taskId;
        
        // 创建新的延迟任务
        this._pendingCompileTimer = setTimeout(async () => {
            if (this.isCompiling()) {
                this.postCompileScripts(delay);
                return taskId;
            }

            this._pendingCompileTimer = null;
            const currentTaskId = this._pendingCompileTaskId;
            this._pendingCompileTaskId = null;
            PackerDriver.getInstance().build(undefined, currentTaskId || undefined);
        }, delay);
        
        return taskId;
    }

    /**
     * 检查编译是否忙碌
     * @returns 是否正在编译
     */
    isCompiling(): boolean {
        return PackerDriver.getInstance().busy();
    }

    /**
     * 获取当前正在执行的编译任务ID
     * @returns 任务ID，如果没有正在执行的任务则返回null
     */
    getCurrentTaskId(): string | null {
        return PackerDriver.getInstance().getCurrentTaskId();
    }

    /**
     * 检查目标是否就绪
     * @param targetName 目标名称，如 'editor' 或 'preview'
     * @returns 是否就绪
     */
    isTargetReady(targetName: string): boolean {
        return PackerDriver.getInstance().isReady(targetName) ?? false;
    }

    /**
     * 加载脚本并执行
     * @param scriptUuids 脚本UUID列表
     * @param pluginScripts 插件脚本信息列表
     */
    async loadScript(scriptUuids: string[], pluginScripts: IPluginScriptInfo[] = []) {
        if (!scriptUuids.length) {
            console.debug('No script need reload.');
            return;
        }
        console.debug('reload all scripts.');
        // TODO 需要支持按入参按需加载脚本
        await globalEnv.record(async () => {
            if (!executor) {
                console.log(`creating executor ...`);
                const packerDriver = PackerDriver.getInstance();
                const serializedPackLoaderContext = packerDriver.getQuickPackLoaderContext('editor')!.serialize();
                const quickPackLoaderContext = QuickPackLoaderContext.deserialize(serializedPackLoaderContext);
                const { loadDynamic } = await import('cc/preload');

                const cceModuleMap = PackerDriver.queryCCEModuleMap();
                executor = await Executor.create({
                    // @ts-ignore
                    importEngineMod: async (id) => {
                        return await loadDynamic(id) as Record<string, unknown>;
                    },
                    quickPackLoaderContext,
                    cceModuleMap,
                });
                // eslint-disable-next-line no-undef
                globalThis.self = window;
                executor.addPolyfillFile(require.resolve('@cocos/build-polyfills/prebuilt/editor/bundle'));
            }

            if (!executor) {
                console.error('Failed to init executor');
                return;
            }
            executor.setPluginScripts(pluginScripts);
            await executor.reload();
        });
    }

    /**
     * 查询CCE模块映射
     * @returns CCE模块映射对象
     */
    queryCCEModuleMap(): CCEModuleMap {
        return PackerDriver.queryCCEModuleMap();
    }

    /**
     * 获取指定目标的Loader上下文
     * @param targetName 目标名称
     * @returns 序列化后的Loader上下文
     */
    getPackerDriverLoaderContext(targetName: string) {
        return PackerDriver.getInstance().getQuickPackLoaderContext(targetName)?.serialize();
    }

    /**
     * 清除缓存并重新编译
     */
    async clearCacheAndRebuild(): Promise<void> {
        await PackerDriver.getInstance().clearCache();
    }

    /**
     * 更新数据库信息
     * @param dbInfos 数据库信息列表
     */
    async updateDatabases(dbInfo: DBInfo, dbChangeType: DBChangeType): Promise<void> {
        await PackerDriver.getInstance().updateDbInfos(dbInfo, dbChangeType);
    }

}

export default new ScriptManager();

// 导出类型供外部使用
export { AssetChangeInfo, AssetChangeType } from './packer-driver/asset-db-interop';
export type { SharedSettings, IPluginScriptInfo } from './interface';
export type { CCEModuleMap } from '../engine/@types/config';
export type { EventType } from './event-emitter';
export type { TypeScriptAssetInfoCache } from './shared/cache';
