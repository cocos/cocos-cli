'use strict';

import { Asset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/protected';
import { extname } from 'path';

import { getDependUUIDList } from '../utils';

export const BufferHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'buffer',

    // 对应的引擎内的类型
    assetType: 'cc.BufferAsset',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.3',

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            const ext = extname(asset.source);
            await asset.copyToLibrary(ext, asset.source);

            try {
                // 如果当前资源没有导入，则开始导入当前资源
                const bufferAsset = new cc.BufferAsset();
                bufferAsset.name = asset.basename || '';
                bufferAsset._setRawAsset('.bin');

                const serializeJSON = EditorExtends.serialize(bufferAsset);
                await asset.saveToLibrary('.json', serializeJSON);

                const depends = getDependUUIDList(serializeJSON);
                asset.setData('depends', depends);

                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        },
    },
};

export default BufferHandler;
