'use strict';

import { Asset } from '@editor/asset-db';
import { AssetHandlerBase } from '../../../@types/protected';
import { createReadStream, createWriteStream, ensureDirSync, existsSync, readdirSync, removeSync } from 'fs-extra';
import { dirname, join, parse } from 'path';
import utils from '../../../../base/utils';
import { GlobalPaths } from '../../../../../global';

export const InstantiationAssetHandler: AssetHandlerBase = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'instantiation-asset',

    // 引擎内对应的类型
    assetType: 'cc.Asset',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.0',
        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         * @param asset
         */
        async import(asset: Asset) {
            const temp = join(asset._assetDB.options.temp, asset.uuid);

            const uzipTool = process.platform === 'darwin' ? 'unzip' : join(GlobalPaths.staticDir, 'tools/unzip.exe');

            await utils.Process.quickSpawn(uzipTool, [asset.source, '-d', temp]);

            const list = readdirSync(temp);

            for (let i = 0; i < list.length; i++) {
                const name: string = list[i];
                const file = join(temp, name);
                await asset.copyToLibrary('.' + name, file);
            }

            if (existsSync(temp)) {
                removeSync(temp);
            }

            return true;
        },
    },
};

export default InstantiationAssetHandler;

/**
 * 创建指定的实例化资源
 * @param target 生成到哪个位置
 * @param files 打包的文件数组
 */
export function zip(target: string, files: string[]) {
    const archiver = require('archiver');
    const output = createWriteStream(target);
    const archive = archiver('zip');

    archive.on('error', (error: Error) => {
        throw error;
    });

    archive.pipe(output);

    files.forEach((file: string) => {
        const nameItem = parse(file);
        archive.append(createReadStream(file), { name: nameItem.ext.substr(1) });
    });

    archive.finalize();
}
