import { join } from "path";
import { CCEModuleMap } from "../../engine/@types/config";
import { SharedSettings } from "./interface";
import { PackerDriver } from "../../scripting/packer-driver";


import { Executor } from '@editor/lib-programming/dist/executor';
import { QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack/lib/loader';
import { scriptConfig } from "../../scripting/shared/query-shared-settings";


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

    async loadScript(scriptUuids: string[]) {
        if (!scriptUuids.length) {
            console.debug('No script need reload.');
            return;
        }
        console.debug('reload all scripts.');
        await globalEnv.record(async () => {
            // TODO 进程合并后构建内的加载脚本流程理论上是不需要了
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
                globalThis.self = window;
                executor.addPolyfillFile(require.resolve('@editor/build-polyfills/prebuilt/editor/bundle'));
            }

            if (!executor) {
                console.error('Failed to init executor');
                return;
            }
            const pluginScripts = (globalThis as any).assetManager.querySortedPlugins({
                loadPluginInEditor: false,
            });
            executor.setPluginScripts(pluginScripts);
            await executor.reload();
        });
    }

    /**
     * TODO
     * @returns 
     */
    queryCCEModuleMap(): CCEModuleMap {
        // return PackerDriver.queryCCEModuleMap();
        const cceModuleMapLocation = join(__dirname, '../../cce-module.jsonc');
        // const cceModuleMap = JSON5.parse(readFileSync(cceModuleMapLocation, 'utf8')) as CCEModuleMap;
        // cceModuleMap.mapLocation = cceModuleMapLocation;
        return {} as CCEModuleMap;
    }

}

export default new ScriptManager();
