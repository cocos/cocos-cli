// @ts-check

import Module from 'module';
import ps from 'path';
import type { IEngine } from '../../index';

// declare module "module" {
//     namespace Module {
//         export function _resolveFilename(request: string): void;
//     }
// }

interface EngineLoader {
    import(id: string): Promise<unknown>;
}

let hasPreload = false;

let loader: EngineLoader | null = null;

/**
 * 初始化引擎加载器。预先引擎模块，并将其映射为在编辑器内可用的 CommonJS 模块。
 * @param options 选项。
 */
async function preload(options: {
    /**
     * 引擎根目录
     */
    root?: string;

    /**
     * 引擎分发目录（引擎编译后的目录）。
     */
    dist?: string;

    /**
     * 需要预加载的模块。
     */
    requiredModules: string[];
}) {
    function isEngineModule(request: string) {
        return request === 'cc' || (request.startsWith('cc/') && !request.startsWith('cc/preload')) || request.startsWith('cce:/internal/');
    }

    try {
        if (hasPreload) {
            throw new Error('You can only preload engine once.');
        }
        hasPreload = true;

        const { requiredModules } = options;

        const Engine: { readonly default: IEngine } = await import('../../../engine');
        const dist = options.dist ?? ps.join(Engine.default.getInfo().path, 'bin', '.cache', 'dev', 'editor');

        // 设置 CC_EDITOR 标记，引擎加载的时候会使用标记进行部分判断
        // @ts-ignore
        globalThis.CC_EDITOR = true;

        const engineModules: Record<string, unknown> = {};

        const loaderModule = require(ps.resolve(dist, 'loader')) as {
            default: EngineLoader;
        };

        loader = loaderModule.default;

        for (const requiredModule of requiredModules) {
            engineModules[requiredModule] = await loader.import(requiredModule);
        }

        const ModuleInternal = Module as typeof Module & {
            _resolveFilename(this: Module, request: string): void;
            _load(this: Module, request: string): void;
        };

        const vendorResolveFilename = ModuleInternal._resolveFilename;
        ModuleInternal._resolveFilename = function (request: string) {
            if (isEngineModule(request)) {
                return request;
            } else {
                // @ts-ignore
                // eslint-disable-next-line prefer-rest-params
                return vendorResolveFilename.apply(this, arguments);
            }
        };

        const vendorLoad = ModuleInternal._load;
        ModuleInternal._load = function (request: string) {
            if (isEngineModule(request)) {
                const module = engineModules[request];
                if (module) {
                    return module;
                } else {
                    throw new Error(
                        `Can not load engine module: ${request}. Valid engine modules are: ${Object.keys(engineModules).join(',')}`,
                    );
                }
            } else {
                // @ts-ignore
                // eslint-disable-next-line prefer-rest-params
                return vendorLoad.apply(this, arguments);
            }
        };

        if (requiredModules.includes('cc')) {
            postProcess();
        }
    } catch (error) {
        let msg = 'preload engine failed!';
        console.error(msg);
        console.error(error);
        if (error instanceof Error) {
            msg += '\n' + error.stack ? error.stack : error.toString();
        }
        throw error;
    }
}

export default preload;

/**
 * 动态加载指定模块。应确保引擎加载器已经初始化过。
 * @param id 引擎模块 ID。
 * @returns 引擎模块。
 */
export async function loadDynamic(id: string) {
    if (!loader) {
        throw new Error(`Failed to load engine module ${id}. ` + 'Loader has not been initialized. You should call preload() first.');
    }
    return await loader.import(id);
}

async function postProcess() {

    const timeLabel = 'Import engine';
    console.time(timeLabel);

    let ccm;
    try {
        ccm = require('cc');
    } catch (error) {
        let msg = 'require cc failed!';
        if (error instanceof Error) {
            msg += '\n' + error.stack ? error.stack : error.toString();
        }
        throw error;
    }

    console.timeEnd(timeLabel);

    // ---- 加载引擎主体 ----
    // @ts-ignore
    window.ccm = ccm;

    // ---- hack creator 使用的一些 engine 参数
    require('./polyfill/engine');
}
