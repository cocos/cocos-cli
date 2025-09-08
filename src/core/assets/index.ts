/**
 * 资源导入、构建的对外调度，后续可能移除
 */
import { join } from 'path';
import { newConsole } from './console';
import { assetDBManager } from './manager/asset-db-manager';
import { assetManager } from './manager/asset-manager';
import { getCurrentLocalTime } from './utils';
import Project from '../project';
import { AssetDBConfig } from './manager/config';

let hasWarningRequestAnimationFrame = false;

export async function startup(config: AssetDBConfig) {
    try {
        newConsole.init(join(Project.info.path, getCurrentLocalTime() + '.log'));
        newConsole.record();
        newConsole.trackMemoryStart('asset-db:worker-init');
        // HACK：构建进程大概率无图形界面需要重写此函数 （TODO 应该在 worker 进程重写或者在引擎侧做支持，避免其他类似 worker 进程发生同类问题）
        // @ts-ignore
        window.requestAnimationFrame = function (func: Function) {
            if (!hasWarningRequestAnimationFrame) {
                hasWarningRequestAnimationFrame = true;
                console.debug('requestAnimationFrame is disabled in editor worker process, will use setTimeout instead.');
            }
            setTimeout(func, 0);
        };
        // 添加对第三方模块的错误监听处理
        window.addEventListener('unhandledrejection', (event: any) => {
            console.error(event.reason);
            console.debug(event);
            if (assetDBManager.ready) {
                return;
            }
            initAssetWorkerFailed(event.reason || 'unhandledrejection');
        });
        await assetManager.init();
        await assetDBManager.init(config);
        newConsole.trackMemoryEnd('asset-db:worker-init');
        await assetDBManager.start();
    } catch (error: any) {
        console.error('Init asset worker failed!');
        console.error(error);
        initAssetWorkerFailed(error);
        throw error;
    }
}

async function initAssetWorkerFailed(error: Error) {
    console.error(error);
    // TODO
}