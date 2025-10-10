import { join } from 'path';
import { EngineLoader } from './loader';
import * as fs from 'fs-extra';

let hasPreload = false;

/**
 * 初始化引擎加载器。预先引擎模块，并将其映射为在编辑器内可用的 CommonJS 模块。
 * @param options 选项。
 */
async function preload(options: {
    /**
     * 引擎根目录
     */
    engineRoot: string;
    /**
     * 引擎分发目录（引擎编译后的目录）
     */
    engineDev: string;
    /**
     * 引擎可写目录
     */
    writablePath: string;
    /**
     * 需要预加载的模块。
     */
    requiredModules: string[];
}) {
    try {
        if (hasPreload) {
            throw new Error('You can only preload engine once.');
        }
        hasPreload = true;

        // @ts-ignore
        globalThis.CC_EDITOR = false;
        // @ts-ignore
        globalThis.window = globalThis.global;
        var LocalStorage = require('node-localstorage').LocalStorage;
        (globalThis as any).nodeEnv = {
            enginePath: options.engineRoot,
            require: require,
            userDataPath: options.writablePath,
            process: process,
            systemLanguage: Intl.DateTimeFormat().resolvedOptions().locale,
            XMLHttpRequest: require('xhr2'),
            SocketIO: require('socket.io-client'),
            WebSocket: WebSocket,
            localStorage: new LocalStorage(join(options.writablePath, 'node.localStorage')), 
            fetch: fetch,
            Headers: Headers,
            Request: Request,
            Response: Response
        };
        
        // loader web adapter
        require(join(options.engineRoot, 'bin/adapter/nodejs/web-adapter.js'));
        // init EngineLoader
        await EngineLoader.init(options.engineDev, options.requiredModules);

        if (options.requiredModules.includes('cc')) {
            // ---- 加载引擎主体 ----
            // @ts-ignore
            const ccm = window.ccm = require('cc');

            await import(join(options.engineRoot, 'bin/adapter/nodejs/engine-adapter.js'));
            // ---- hack creator 使用的一些 engine 参数
            require('./polyfill/engine');
            // overwrite
            const handle = require('./overwrite');
            handle(ccm);
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
    return await EngineLoader.importModule(id);
}

