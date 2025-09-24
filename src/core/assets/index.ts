/**
 * 资源导入、构建的对外调度，后续可能移除
 */
import { newConsole } from '../base/console';
import { assetDBManager } from './manager/asset-db';
import { assetManager } from './manager/asset';
import assetConfig, { AssetDBConfig } from './asset-config';
import { IBuildCommandOption } from './builder/@types/private';
import engine from '../engine';

export async function startupAssetDB(config: Partial<AssetDBConfig> = {}) {
    try {
        assetConfig.init(config);
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

// TODO 对外接口暴露

export async function build(options: IBuildCommandOption) {
    const { init } = await import('./builder/share/global');
    init(options.root);
    const { build } = await import('./builder');
    options.engineInfo = engine.getInfo();
    return await build(options);
}