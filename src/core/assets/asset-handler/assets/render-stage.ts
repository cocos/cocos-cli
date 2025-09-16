'use strict';

import { Asset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/protected';
import { readFile } from 'fs-extra';

import { getDependUUIDList } from '../utils';

export const RenderStageAssetHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'render-stage',

    // 引擎内对应的类型
    assetType: 'RenderStage',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.0',

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
            const serializeJSON = await readFile(asset.source, 'utf8');
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default RenderStageAssetHandler;
