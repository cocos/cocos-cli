'use strict';

import { Asset, queryUrl, VirtualAsset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/protected';
import { ensureDirSync } from 'fs-extra';

const InternalBundleName = ['internal', 'resources', 'main'];

const DirectoryHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'directory',
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.2.0',
        // 数据迁移
        // migrations: [
        //     {
        //         version: '1.1.0',
        //         migrate: migrateSubpackageSettings,
        //     },
        //     {
        //         version: '1.2.0',
        //         migrate: migrateBundleConfig,
        //     },
        // ],
        /**
         * 实际导入流程
         * @param asset
         */
        async import(asset: Asset | VirtualAsset) {
            const url = queryUrl(asset.uuid);
            if (url === 'db://assets/resources') {
                asset.userData.isBundle = true;
                asset.userData.bundleConfigID = asset.userData.bundleConfigID ?? 'default';
                asset.userData.bundleName = 'resources';
                asset.userData.priority = 8;
            }
            return true;
        },
    },

    iconInfo: {
        default: {
            value: 'directory',
            type: 'icon',
        },
        generateThumbnail(asset) {
            if (asset.userData.isBundle) {
                return {
                    value: 'bundle-folder',
                    type: 'icon',
                };
            }
            return {
                value: 'directory',
                type: 'icon',
            };
        },
    },

    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newFolder',
                    fullFileName: 'folder',
                },
            ];
        },

        async create(option) {
            ensureDirSync(option.target);
            return option.target;
        },
    },

    async validate(asset: Asset) {
        return asset.isDirectory();
    },
};
export default DirectoryHandler;
