'use strict';

import { Asset, queryUrl, VirtualAsset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/protected';
import { DirectoryAssetUserData } from '../../@types/userDatas';
import { ensureDirSync } from 'fs-extra';

const InternalBundleName = ['internal', 'resources', 'main'];

const DirectoryHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'directory',
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.2.0',
        /**
         * 实际导入流程
         * @param asset
         */
        async import(asset: Asset | VirtualAsset) {
            const userData = asset.userData as DirectoryAssetUserData;
            const url = queryUrl(asset.uuid);
            if (url === 'db://assets/resources') {
                userData.isBundle = true;
                userData.bundleConfigID = userData.bundleConfigID ?? 'default';
                userData.bundleName = 'resources';
                userData.priority = 8;
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
            const userData = asset.userData as DirectoryAssetUserData;
            if (userData.isBundle) {
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
                    name: 'default',
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
