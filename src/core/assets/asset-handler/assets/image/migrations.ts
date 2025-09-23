import { Asset, queryUrl } from '@editor/asset-db';
import * as migratesNameToId from '../migrates/name2id';
import { MigrateStep } from '../../utils';
import { configurationManager } from '../../../../configuration';
import utils from '../../../../base/utils';
import { ImageAssetUserData } from '../../../@types/userDatas';
import { UserCompressConfig } from '../../../builder/@types';

const lodash = require('lodash');

// HACK migratePlatformSettings 需要在资源一个一个导入时才能正常使用
const migrateStep = new MigrateStep();

export const migrations = [
    {
        // 这个版本之前的 image 资源都会进行迁移
        version: '1.0.13',
        async migrate(asset: Asset) {
            const keys = Object.keys(asset.meta.subMetas);
            if (keys.length === 1) {
                let type;
                switch (asset.meta.userData.type) {
                    case 'raw':
                        break;
                    case 'texture':
                        type = 'texture';
                        break;
                    case 'normal map':
                        type = 'normalMap';
                        break;
                    case 'texture cube':
                        type = 'textureCube';
                        break;
                    case 'sprite-frame':
                        type = 'spriteFrame';
                        break;
                }
                if (type && keys[0] !== type) {
                    const childMeta = (asset.meta.subMetas[type] = asset.meta.subMetas[keys[0]]);
                    const childAsset = (asset.subAssets[type] = asset.subAssets[keys[0]]);

                    childMeta.uuid = childMeta.uuid.replace(`@${keys[0]}`, `@${type}`);
                    childAsset.meta.uuid = childAsset.uuid.replace(`@${keys[0]}`, `@${type}`);

                    delete asset.meta.subMetas[keys[0]];
                    delete asset.subAssets[keys[0]];
                }
            }
        },
    },
    {
        version: '1.0.15',
        migrate: migratesNameToId.migrate,
    },
    {
        version: '1.0.21',
        migrate: migratePlatformSettings,
    },
    {
        version: '1.0.23',
        migrate: migrateFixAlphaTransparencyArtifacts,
    },
    {
        version: '1.0.27',
        migrate: migrateRedirect,
    },
];

export function migrateRedirect(asset: Asset) {
    if (asset.userData.type === 'texture') {
        return;
    }
    if (asset.userData.type === 'sprite-frame') {
        if (!asset.meta.subMetas[utils.UUID.nameToSubId('texture')]) {
            return;
        }
        asset.userData.redirect = asset.meta.subMetas[utils.UUID.nameToSubId('texture')].uuid;
        return;
    }

    delete asset.userData.redirect;
}

/** 默认设置迁移上来的图片不消除透明伪影 */
export function migrateFixAlphaTransparencyArtifacts(asset: Asset) {
    const userData = asset.userData as ImageAssetUserData;
    userData.fixAlphaTransparencyArtifacts = false;
}

export async function migratePlatformSettings(asset: Asset) {
    const platformSettings = asset.userData.platformSettings;
    if (!platformSettings || Object.keys(platformSettings).length === 0) {
        return;
    }

    await migrateStep.hold();
    const result = {
        useCompressTexture: true,
        presetId: '',
    };
    if (platformSettings.default && Object.keys(platformSettings).length === 1) {
        // 只有默认配置需要全部平台都配一遍
        ['miniGame', 'web', 'android', 'ios', 'pc'].forEach((platformType) => {
            platformSettings[platformType] = platformSettings.default;
        });
    } else {
        Object.keys(platformSettings).forEach((platformType) => {
            if (platformType === 'default') {
                return;
            }
            if (platformType !== 'default' && platformSettings.default) {
                const defaultConfig = JSON.parse(JSON.stringify(platformSettings.default));
                platformSettings[platformType] = Object.assign(defaultConfig, platformSettings[platformType]);
            }

            migrateCompressTextureType(platformSettings[platformType]);

            if (platformType === 'wechat') {
                platformSettings.miniGame = platformSettings.wechat;
                delete platformSettings.wechat;
                return;
            }

            if (platformType === 'html5') {
                platformSettings.web = platformSettings.html5;
                delete platformSettings.html5;
                return;
            }
        });
    }

    delete platformSettings.default;
    if (Object.keys(platformSettings).length === 0) {
        migrateStep.step();
        return;
    }

    result.presetId = await getPresetId(platformSettings);
    delete asset.userData.platformSettings;
    asset.userData.compressSettings = result;
    migrateStep.step();
}

function migrateCompressTextureType(config: any) {
    if (!config) {
        return;
    }
    const migrateMap: Record<string, string> = {
        pvrtc_4bits: 'pvrtc_4bits_rgba',
        pvrtc_2bits: 'pvrtc_2bits_rgba',
        etc1: 'etc1_rgb',
    };
    Object.keys(config).forEach((name: string) => {
        if (!migrateMap[name]) {
            return;
        }
        config[migrateMap[name]] = config[name];
        delete config[name];
    });
}

async function getPresetId(platformSettings: any) {
    const presetId = 'presetId' + Date.now();
    let userPreset = await configurationManager.getValue('builder.textureCompressConfig.userPreset') as UserCompressConfig['userPreset'];
    if (!userPreset) {
        userPreset = {
            [presetId]: {
                name: presetId,
                options: platformSettings,
            },
        };
        await configurationManager.updateValue('builder.textureCompressConfig.userPreset', userPreset);
        return presetId;
    }

    for (const Id of Object.keys(userPreset)) {
        if (lodash.isEqual(userPreset[Id].options, platformSettings)) {
            return Id;
        }
    }

    await configurationManager.updateValue(`builder.textureCompressConfig.userPreset.${presetId}`, {
        name: presetId,
        options: platformSettings,
    });
    return presetId;
}
