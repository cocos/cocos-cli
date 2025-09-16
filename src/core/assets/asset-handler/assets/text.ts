'use strict';

import { Asset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/protected';
import { readFile } from 'fs-extra';
import { extname } from 'path';

import { getDependUUIDList } from '../utils';
declare const cc: any;

export const TextHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'text',

    // 引擎内对应的类型
    assetType: 'cc.TextAsset',

    /**
     * 判断是否允许使用当前的 Handler 进行导入
     * @param asset
     */
    async validate(asset: Asset) {
        if (await asset.isDirectory()) {
            return false;
        }
        if (asset.extname === '.ts') {
            // 只允许 .d 结尾的文件（xxx.d.ts）
            return extname(asset.basename) === '.d';
        }
        return true;
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.1',
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
            const text = await readFile(asset.source, 'utf8');

            const jsonAsset = new cc.TextAsset();
            jsonAsset.name = asset.basename;
            jsonAsset.text = text;

            const serializeJSON = EditorExtends.serialize(jsonAsset);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default TextHandler;
