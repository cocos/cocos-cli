
import vm from 'vm';
import { asserts } from '../../utils/asserts';
import fs from 'fs-extra';
import { ChunkTimestamp, ChunkId, QuickPackLoader } from '@cocos/creator-programming-quick-pack/lib/loader';
import type { ExecutorSystem } from '../editor-systemjs';
import { i18nTranslate } from '../../../assets/asset-handler/utils';
import { pathToFileURL } from 'url';

export interface PackModuleEvaluator {
    evaluate(file: string): void | Promise<void>;
}

const defaultPackModuleEvaluator: PackModuleEvaluator = {
    async evaluate(file: string) {
        let moduleFileResolved: string;
        try {
            moduleFileResolved = require.resolve(file);
        } catch (err) {
            throw new Error(i18nTranslate(
                'executor_pack_mod_instantiation_error_host_resolve_error',
                { url: file, reason: err },
            ));
        }

        try {
            const source = await fs.readFile(moduleFileResolved, 'utf8');

            // This is how Node.js implement require
            const fn = vm.compileFunction(source, ['System'], {
                filename: pathToFileURL(moduleFileResolved).href,
            });

            Reflect.apply(fn, undefined, [System]);
        } catch (err) {
            throw new Error(i18nTranslate(
                'executor_pack_mod_instantiation_error_host_execute_error',
                { url: file, reason: err },
            ));
        }

        if (!(moduleFileResolved in require.cache)) {
            console.debug(`${file} resolved to ${moduleFileResolved} is not in module cache!`);
        } else {
            const mod = require.cache[moduleFileResolved];
            delete require.cache[moduleFileResolved];
            if (mod && mod.parent) {
                const index = mod.parent.children.indexOf(mod);
                if (index !== -1) {
                    mod.parent.children.splice(index, 1);
                }
            }
        }
    },
};

export class PackModInstantiation {
    constructor(quickPackLoader: QuickPackLoader, system: ExecutorSystem, evaluator?: PackModuleEvaluator) {
        this._quickPackLoader = quickPackLoader;
        // const system = {
        //     register: (...moduleRegister: ModuleRegister) => {
        //         if (this._lastRegister) {
        //             throw new Error(`Unknown register. Did you have more than one System.register() in your code?`);
        //         }
        //         this._lastRegister = [...moduleRegister];
        //     },
        // };
        // this._registerContext = vm.createContext({
        //     System: system,
        // });
        this._system = system;
        this._evaluator = evaluator ?? defaultPackModuleEvaluator;
    }

    public async instantiate(chunkURL: string) {
        const chunkId = this._quickPackLoader.getChunkId(chunkURL);

        let cached = this._cachedRegisters[chunkId];
        if (!cached) {
            this._cachedRegisters[chunkId] = undefined;

            const mTimestamp = this._quickPackLoader.queryTimestamp(chunkId);
            const resource = await this._quickPackLoader.loadChunkFromId(chunkId);

            asserts(mTimestamp >= 0, `Chunk '${chunkId}' has a bad timestamp.`);
            asserts(resource.type === 'file');

            const file = resource.path;
            // const code = await fs.readFile(file, 'utf8');
            const register = await this._evalCode2(file);
            cached = {
                register,
                mTimestamp,
            };
            this._cachedRegisters[chunkId] = cached;
        }

        return cached.register;
    }

    public async lock(maxRetryTime?: number): Promise<() => Promise<void>> {
        return this._quickPackLoader.lock(maxRetryTime);
    }

    public async unlock (): Promise<void> {
        return this._quickPackLoader.unlock();
    }

    /**
     * 重新加载底层的 Pack Loader 并且移除所有失效的缓存。
     */
    public async reload() {
        await this._quickPackLoader.reload();
        const cachedChunks = Object.keys(this._cachedRegisters) as ChunkId[];
        const mTimestamps = this._quickPackLoader.queryTimestamps(cachedChunks);
        cachedChunks.forEach((chunkId, iChunk) => {
            const cache = this._cachedRegisters[chunkId];
            if (!cache || cache.mTimestamp !== mTimestamps[iChunk]) {
                delete this._cachedRegisters[chunkId];
            }
        });
    }

    public async getImportMap() {
        return await this._quickPackLoader.loadImportMap();
    }

    private _quickPackLoader: QuickPackLoader;

    private _cachedRegisters: Record<ChunkId, {
        mTimestamp: ChunkTimestamp;
        register: ModuleRegister;
    } | undefined> = {};

    // private _registerContext: vm.Context;

    // private _lastRegister: ModuleRegister | null = null;

    // private _evalCode(code: string, fileName?: string): ModuleRegister | null {
    //     asserts(this._lastRegister === null);
    //     let lastRegister: ModuleRegister | null;
    //     try {
    //         vm.runInContext(code, this._registerContext, {
    //             filename: fileName,
    //             displayErrors: true,
    //         });
    //         lastRegister = this._lastRegister;
    //     } finally {
    //         this._lastRegister = null;
    //     }
    //     return lastRegister;
    // }

    private _system: ExecutorSystem;

    private _evaluator: PackModuleEvaluator;

    private async _evalCode2(file: string) {
        await this._evaluator.evaluate(file);

        const register = this._system.getRegister();
        if (!register) {
            throw new Error(i18nTranslate(
                'executor_system_js_no_module_registered',
                { url: file },
            ));
        }

        return register;
    }
}
