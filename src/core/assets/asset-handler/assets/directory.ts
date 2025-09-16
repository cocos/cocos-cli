'use strict';

import { Asset, queryUrl, VirtualAsset } from '@editor/asset-db';
import { AssetHandler } from '../../@types/protected';
import { ensureDirSync } from 'fs-extra';
import { basename } from 'path';
import { mergeBundleConfig } from './migrates/migrate-bundle-config';
import utils from '../../../base/utils';
import { i18nTranslate } from '../utils';
import profile from '../../../profile';

const InternalBundleName = ['internal', 'resources', 'main'];

const DirectoryHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'directory',
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.2.0',
        // 数据迁移
        migrations: [
            {
                version: '1.1.0',
                migrate: migrateSubpackageSettings,
            },
            {
                version: '1.2.0',
                migrate: migrateBundleConfig,
            },
        ],
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

function migrateSubpackageSettings(asset: Asset | VirtualAsset) {
    asset.userData.isBundle = false;
    asset.userData.priority = 1;
    asset.userData.bundleName = '';
    asset.userData.compressionType = {};
    asset.userData.isRemoteBundle = {};
    if (asset.userData.isSubpackage) {
        asset.userData.isBundle = asset.userData.isSubpackage;
        asset.userData.bundleName = asset.userData.subpackageName || '';
        asset.userData.priority = 5;
    }
    asset.userData.isSubpackage = undefined;
    asset.userData.subpackageName = undefined;
}

async function migrateBundleConfig(asset: Asset | VirtualAsset) {
    if (!asset.userData.isBundle || asset.userData.bundleConfigID) {
        return;
    }

    console.debug(`migrateBundleConfig for asset with config ${asset.userData}`);
    const { compressionType, isRemoteBundle, bundleName } = asset.userData;
    const key = 'auto_' + utils.UUID.generate();
    let name = bundleName || basename(asset.source).replace(/[^a-zA-Z0-9_-]/g, '_');
    // 项目目录下，仅允许 assets 下的 resources 一个保留字 Bundle
    if (InternalBundleName.includes(name) && asset.url !== 'db://assets/resources') {
        name = name + '_' + key;
        console.warn(
            `Bundle {asset(${asset.url})} ${i18nTranslate('builder.asset_bundle.duplicate_reserved_keyword_message', {
                name,
            })}`,
        );
    }
    const bundleConfig = mergeBundleConfig(compressionType, isRemoteBundle, name);
    profile.setProject('builder', `bundleConfig.custom.${key}`, bundleConfig);

    asset.userData.bundleConfigID = key;
    delete asset.userData.compressionType;
    delete asset.userData.isRemoteBundle;
}
