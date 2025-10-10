/**
 * 资源导入、构建的对外调度，后续可能移除
 */
import { newConsole } from '../base/console';
import { assetDBManager } from './manager/asset-db';
import { assetManager } from './manager/asset';
import assetConfig, { AssetDBConfig } from './asset-config';

/**
 * 启动资源数据库，依赖于 project, engine 的初始化
 */
export async function startupAssetDB() {
    try {
        // @ts-ignore HACK 目前引擎有在一些资源序列化会调用的接口里使用这个变量，没有合理的传参之前需要临时设置兼容
        window.Build = true;
        await assetConfig.init();
        newConsole.trackMemoryStart('asset-db:worker-init');
        await assetManager.init();
        await assetDBManager.init();
        newConsole.trackMemoryEnd('asset-db:worker-init');
        await assetDBManager.start();
    } catch (error: any) {
        newConsole.error('Init asset worker failed!');
        newConsole.error(error);
        throw error;
    }
}
