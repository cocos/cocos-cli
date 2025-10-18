import { CCEModuleMap } from '../engine/@types/config';
import { IPluginScriptInfo, SharedSettings } from './interface';
import { PackerDriver } from './packer-driver';
import { Executor } from '@editor/lib-programming/dist/executor';
import { QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack/lib/loader';
import { CustomEvent, EventType, eventEmitter } from './event-emitter';

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

    private _executor!: Executor;

    /**
     * @param path 
     * @returns 
     */
    async queryScriptUser(path: string): Promise<string[]> {
        return PackerDriver.getInstance().queryScriptUsers(path);
    }

    /**
     * @returns 
     */
    async querySharedSettings(): Promise<SharedSettings> {
        return PackerDriver.getInstance().querySharedSettings();
    }

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
                executor.addPolyfillFile(require.resolve('@editor/build-polyfills/prebuilt/editor/bundle'));
            }

            if (!executor) {
                console.error('Failed to init executor');
                return;
            }
            executor.setPluginScripts(pluginScripts);
            await executor.reload();
        });
    }

    queryCCEModuleMap(): CCEModuleMap {
        return PackerDriver.queryCCEModuleMap();
    }

    getPackerDriverLoaderContext(targetName: string) {
        return PackerDriver.getInstance().getQuickPackLoaderContext(targetName)?.serialize();
    }

}

export default new ScriptManager();
