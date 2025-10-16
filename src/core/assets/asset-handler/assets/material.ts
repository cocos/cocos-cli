'use strict';

import { Asset, queryAsset, queryPath, VirtualAsset } from '@editor/asset-db';
import { outputJSON, outputJSONSync, readJSON, readJSONSync, writeJSONSync } from 'fs-extra';
import { upgradeProperties } from './utils/material-upgrader';

import { getDependUUIDList } from '../utils';
import { AssetHandler, IAsset, ICreateMenuInfo } from '../../@types/protected';

export const MaterialHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'material',

    // 引擎内对应的类型
    assetType: 'cc.Material',

    async validate(asset: Asset) {
        try {
            const json = readJSONSync(asset.source);
            return json.__type__ === 'cc.Material';
        } catch (error) {
            return false;
        }
    },

    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newMaterial',
                    fullFileName: 'material.mtl',
                    template: `db://internal/default_file_content/${MaterialHandler.name}/default.mtl`,
                    group: 'material',
                    name: 'default',
                },
            ];
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.21',

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
            try {
                const material = readJSONSync(asset.source);

                // uuid dependency
                const uuid = material._effectAsset && material._effectAsset.__uuid__;
                asset.depend(uuid);

                // upgrade properties
                if (await upgradeProperties(material, asset)) {
                    writeJSONSync(asset.source, material, { spaces: 2 });
                }
                material._name = asset.basename || '';
                const serializeJSON = JSON.stringify(material, undefined, 2);
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

export default MaterialHandler;
