/**
 * 资源导入、构建的对外调度，后续可能移除
 */
import { newConsole } from '../base/console';
import assetDBManager from './manager/asset-db';
import assetManager from './manager/asset';
import assetConfig from './asset-config';

/**
 * 初始化资源数据库相关配置与管理器
 */
export async function initAssetDB() {
    assetManager.resetMovePreflights();
    // @ts-ignore HACK 目前引擎有在一些资源序列化会调用的接口里使用这个变量，没有合理的传参之前需要临时设置兼容
    globalThis.Build = true;
    const { scriptConfig } = await import('../scripting/shared/query-shared-settings');
    await scriptConfig.init();
    await assetConfig.init();
    newConsole.trackMemoryStart('assets:worker-init');
    await assetManager.init();
    await assetDBManager.init();
    newConsole.trackMemoryEnd('asset-db:worker-init');
}

/**
 * 启动资源数据库，开始扫描和导入资源
 */
export async function startAssetDB() {
    await assetDBManager.start();
}

/**
 * 停止资源数据库
 */
export async function stopAssetDB() {
    assetManager.resetMovePreflights();
    for (const name in assetDBManager.assetDBMap) {
        const db = assetDBManager.assetDBMap[name];
        if (db) {
            await db.stop();
        }
    }
}

export { default as assetManager } from './manager/asset';
export { default as assetDBManager } from './manager/asset-db';
