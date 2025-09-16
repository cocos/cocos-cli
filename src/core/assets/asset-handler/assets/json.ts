'use strict';

import { Asset } from '@editor/asset-db';
import { readFile, readJSON } from 'fs-extra';
import * as JSON5 from 'json5';

import { getDependUUIDList } from '../utils';
import { JsonAsset } from 'cc';
import { AssetHandler } from '../../@types/protected';

export const JsonHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'json',
    // 引擎内对应的类型
    assetType: 'cc.JsonAsset',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '2.0.1',
        migrations: [
            {
                version: '1.0.0',
                migrate: (asset: Asset) => {
                    asset.userData.json5 = false;
                },
            },
        ],

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
            const json5Enabled = asset.userData.json5 ?? true;

            let json: unknown;
            if (json5Enabled) {
                const text = await readFile(asset.source, 'utf8');
                json = JSON5.parse(text);
            } else {
                json = await readJSON(asset.source);
            }

            const jsonAsset = new JsonAsset();
            jsonAsset.name = asset.basename;
            jsonAsset.json = json as any;

            const serializeJSON = EditorExtends.serialize(jsonAsset);
            await asset.saveToLibrary('.json', serializeJSON);

            // 旧版本可能记录了错误的依赖数据，需要清空
            asset.setData('depends', []);

            return true;
        },
    },
};

export default JsonHandler;
