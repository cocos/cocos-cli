import { basename } from 'path';
import { IAsset } from '../../assets/@types/protected';
import { BundleCompressionType } from '../@types';
import { PlatformBundleConfig, IPlatformInfo, BundleRenderConfig, CustomBundleConfig, CustomBundleConfigItem } from '../@types/protected';

export enum BundleCompressionTypes {
    NONE = 'none',
    MERGE_DEP = 'merge_dep',
    MERGE_ALL_JSON = 'merge_all_json',
    SUBPACKAGE = 'subpackage',
    ZIP = 'zip',
}

export enum BuiltinBundleName {
    RESOURCES = 'resources',
    MAIN = 'main',
    START_SCENE = 'start-scene',
    INTERNAL = 'internal',
}

export function getBundleDefaultName(assetInfo: IAsset) {
    return basename(assetInfo.source).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export const BundlecompressionTypeMap = {
    [BundleCompressionTypes.NONE]: 'i18n:builder.asset_bundle.none',
    [BundleCompressionTypes.SUBPACKAGE]: 'i18n:builder.asset_bundle.subpackage',
    [BundleCompressionTypes.MERGE_DEP]: 'i18n:builder.asset_bundle.merge_dep',
    [BundleCompressionTypes.MERGE_ALL_JSON]: 'i18n:builder.asset_bundle.merge_all_json',
    [BundleCompressionTypes.ZIP]: 'i18n:builder.asset_bundle.zip',
};

export const BundlePlatformTypes = {
    native: {
        icon: 'mobile',
        displayName: 'i18n:builder.asset_bundle.native',
    },
    web: {
        icon: 'html5',
        displayName: 'i18n:builder.asset_bundle.web',
    },
    miniGame: {
        icon: 'mini-game',
        displayName: 'i18n:builder.asset_bundle.minigame',
    },
};

export const DefaultBundleConfig: CustomBundleConfig = {
    displayName: 'i18n:builder.asset_bundle.defaultConfig',
    configs: {
        native: {
            preferredOptions: {
                isRemote: false,
                compressionType: 'merge_dep',
            },
        },
        web: {
            preferredOptions: {
                isRemote: false,
                compressionType: 'merge_dep',
            },
            fallbackOptions: {
                compressionType: 'merge_dep',
            },
        },
        miniGame: {
            fallbackOptions: {
                isRemote: false,
                compressionType: 'merge_dep',
            },
            configMode: 'fallback',
        },
    },
};

export function transformPlatformSettings(config: CustomBundleConfigItem, platformConfigs: Record<string, PlatformBundleConfig>) {
    const res: Record<string, { compressionType: BundleCompressionType, isRemote: boolean }> = {};
    Object.keys(platformConfigs).forEach((platform) => {
        const option = getValidOption(platform, config, platformConfigs);
        option.isRemote = getInvalidRemote(option.compressionType, option.isRemote);
        option.compressionType = option.compressionType || BundleCompressionTypes.MERGE_DEP;
        res[platform] = option;
    });
    return res;
}

function getValidOption(platform: string, config: CustomBundleConfigItem, platformConfigs: Record<string, PlatformBundleConfig>) {
    const mode = config.configMode || (platformConfigs[platform].platformType === 'miniGame' ? 'fallback' : 'auto');
    // mode 为 fallback 时， 优先使用回退选项
    if (mode === 'fallback' && config.fallbackOptions) {
        return {
            ...config.preferredOptions,
            compressionType: config.fallbackOptions.compressionType,
            isRemote: config.fallbackOptions.isRemote ?? false,
        };
    }
    // 有针对平台的设置，优先使用平台设置
    if (config.overwriteSettings && config.overwriteSettings[platform]) {
        return config.overwriteSettings[platform];
    }
    const support = platformConfigs[platform].supportOptions.compressionType;
    if (mode === 'overwrite' && (!config.overwriteSettings || !config.overwriteSettings[platform])) {
        return {
            compressionType: BundleCompressionTypes.MERGE_DEP,
            isRemote: false,
        };
    }

    // 偏好设置的选项，平台都支持，直接使用
    if (config.preferredOptions && support.includes(config.preferredOptions.compressionType)) {
        return config.preferredOptions;
    }

    // 有回退选项时，优先使用回退选项
    if (config.fallbackOptions) {
        return {
            ...config.preferredOptions,
            compressionType: config.fallbackOptions.compressionType,
        };
    }

    // 无回退选项时，使用替换偏好设置内平台不支持的选项
    return {
        ...config.preferredOptions,
    };
}

export function checkRemoteDisabled(compressionType: BundleCompressionType) {
    return compressionType === BundleCompressionTypes.SUBPACKAGE || compressionType === BundleCompressionTypes.ZIP;
}

export function getInvalidRemote(compressionType: BundleCompressionType, isRemote?: boolean): boolean | undefined {
    if (compressionType === BundleCompressionTypes.SUBPACKAGE) {
        return false;
    } else if (compressionType === BundleCompressionTypes.ZIP) {
        return true;
    }

    return isRemote ?? false;
}