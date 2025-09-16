interface ConfigItem {
    config: {
        isRemote: boolean;
        compressionType: string;
    };
    platforms: string[];
}

const platformConfigs = {
    native: {
        platforms: [
            'android',
            'ohos',
            'open-harmonyos',
            'huawei-agc',
            'ios',
            'windows',
            'mac',
            'linux',
            'xr-meta',
            'xr-huaweivr',
            'xr-pico',
            'xr-rokid',
            'xr-monado',
            'xr-spaces',
            'xr-seed',
            'ar-android',
            'ar-ios',
            'xr-gsxr',
            'xr-yvr',
            'xr-htc',
            'xr-iqiyi',
            'xr-skyworth',
            'xr-ffalcon',
            'xr-nreal',
            'xr-inmo',
            'xr-lenovo',
        ],
        platformTypeInfo: {
            icon: 'mobile',
            displayName: 'i18n:builder.asset_bundle.native',
        },
        maxOptionList: {
            compressionType: ['none', 'merge_dep', 'merge_all_json'],
        },
    },
    miniGame: {
        platforms: [
            'alipay-mini-game',
            'taobao-creative-app',
            'taobao-mini-game',
            'bytedance-mini-game',
            'oppo-mini-game',
            'huawei-quick-game',
            'vivo-mini-game',
            'xiaomi-quick-game',
            'baidu-mini-game',
            'wechatgame',
            'link-sure',
            'qtt',
            'cocos-play',
        ],
        platformTypeInfo: {
            icon: 'mini-game',
            displayName: 'i18n:builder.asset_bundle.minigame',
        },
        maxOptionList: {
            compressionType: ['none', 'merge_dep', 'merge_all_json', 'zip', 'subpackage'],
        },
        minOptionList: {
            compressionType: ['none', 'merge_dep', 'merge_all_json', 'zip'],
        },
    },
    web: {
        platforms: ['fb-instant-games', 'web-desktop', 'web-mobile'],
        platformTypeInfo: {
            icon: 'html5',
            displayName: 'i18n:builder.asset_bundle.web',
        },
        maxOptionList: {
            compressionType: ['none', 'merge_dep', 'merge_all_json', 'zip'],
        },
        minOptionList: {
            compressionType: ['none', 'merge_dep', 'merge_all_json'],
        },
    },
};

const platformTypeMap: Record<string, string> = {};

Object.keys(platformConfigs).forEach((platformType) => {
    // @ts-ignore
    const platforms: string[] = platformConfigs[platformType].platforms;
    platforms.forEach((platform) => {
        platformTypeMap[platform] = platformType;
    });
});

export function mergeBundleConfig(compressionTypeMap: Record<string, string>, isRemoteBundle: Record<string, boolean>, bundleName: string) {
    const configMap: Record<string, Record<string, ConfigItem>> = {};
    // 所有的平台都要参与计算，否则整理出的配置不完整，因为原来 meta 里会省略一些默认和没有修改过的配置
    Object.keys(platformTypeMap).forEach((platform: string) => {
        const platformType = platformTypeMap[platform];
        const config = {
            compressionType: (compressionTypeMap[platform] as string) || 'merge_dep',
            isRemote: (isRemoteBundle[platform] as boolean) || false,
        };
        const key = JSON.stringify(config);
        if (!configMap[platformType]) {
            configMap[platformType] = {
                [key]: {
                    config,
                    platforms: [platform],
                },
            };
            return;
        }

        if (!configMap[platformType][key]) {
            configMap[platformType][key] = {
                config,
                platforms: [platform],
            };
            return;
        }

        configMap[platformType][key].platforms.push(platform);
    });
    const bundleConfig: any = {
        displayName: bundleName,
        configs: {},
    };

    Object.keys(configMap).forEach((platformType) => {
        // 降序排列
        const allConfigs = Object.values(configMap[platformType]).sort((a, b) => b.platforms.length - a.platforms.length);
        if (!allConfigs.length) {
            return;
        }

        if (platformType !== 'miniGame') {
            const preferredOptions = allConfigs.shift()!.config;
            bundleConfig.configs[platformType] = {
                preferredOptions,
            };
            if (!allConfigs.length) {
                return;
            }
        } else {
            bundleConfig.configs[platformType] = {
                configMode: 'overwrite',
            };
        }

        const overwriteSettings: Record<string, any> = {};
        allConfigs.forEach((configs) => {
            configs.platforms.forEach((platform) => {
                // 和默认值一样时，且为小游戏平台时，无需调整此平台配置
                if (configs.config.compressionType === 'merge_dep' && !configs.config.isRemote && platformType !== 'miniGame') {
                    return;
                }
                overwriteSettings[platform] = configs.config;
            });
        });
        bundleConfig.configs[platformType].overwriteSettings = overwriteSettings;
    });

    return bundleConfig;
}
