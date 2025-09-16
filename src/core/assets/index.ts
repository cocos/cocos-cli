/**
 * 资源导入、构建的对外调度，后续可能移除
 */
import { join } from 'path';
import { newConsole } from '../base/console';
import { assetDBManager } from './manager/asset-db';
import { assetManager } from './manager';
import { getCurrentLocalTime } from './utils';
import assetConfig, { AssetDBConfig } from './asset-config';

export async function startupAssetDB(config: Partial<AssetDBConfig> = {}) {
    try {
        assetConfig.init(config);
        newConsole.init(join(assetConfig.data.root, getCurrentLocalTime() + '.log'));
        newConsole.record();
        newConsole.trackMemoryStart('asset-db:worker-init');
        await assetManager.init();
        await assetDBManager.init();
        newConsole.trackMemoryEnd('asset-db:worker-init');
        await assetDBManager.start();
    } catch (error: any) {
        console.error('Init asset worker failed!');
        console.error(error);
        throw error;
    }
}
