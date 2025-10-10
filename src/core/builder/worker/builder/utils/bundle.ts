import { IAssetInfo } from '../../../../assets/@types/protected';
import minimatch from 'minimatch';
import { Asset, VirtualAsset } from '@editor/asset-db';
import { BundleFilterConfig } from '../../../@types';

export function checkAssetWithFilterConfig(assetInfo: Asset | VirtualAsset | IAssetInfo, bundleFilterConfig?: BundleFilterConfig[]): boolean {
    if (!bundleFilterConfig || !bundleFilterConfig.length) {
        return true;
    }

    // 排除规则，只要有一个符合规则的 match = false
    const includeConfigs = bundleFilterConfig.filter((config) => config.range === 'include');
    const allMatch = !includeConfigs.length || includeConfigs.some(config => matchFilterConfig(assetInfo, config));
    if (!allMatch) {
        return false;
    }
    const excludeConfigs = bundleFilterConfig.filter((config) => config.range === 'exclude');
    if (!excludeConfigs.length) {
        return allMatch;
    }

    return !excludeConfigs.some((config) => matchFilterConfig(assetInfo, config));
}

/**
 * 返回资源是否匹配当前规则的布尔值
 * @param assetInfo 
 * @param config 
 * @returns 
 */
export function matchFilterConfig(assetInfo: Asset | VirtualAsset | IAssetInfo, config: BundleFilterConfig) {
    // 默认情况和异常下资源都是通过过滤的，include 就匹配，exclude 就不匹配
    const matchDefault = config.range === 'include';
    let match = matchDefault;
    if (config.type === 'asset' && config.assets) {
        if (!config.assets.length) {
            match = matchDefault;
        } else {
            match = config.assets.includes(assetInfo.uuid);
        }
    } else if (config.type === 'url' && config.patchOption) {
        if (!config.patchOption.value) {
            match = matchDefault;
        } else {
            switch (config.patchOption.patchType) {
                case 'beginWith':
                    match = (new RegExp(`^${config.patchOption.value}`, 'i')).test(assetInfo.url);
                    break;
                case 'endWith':
                    match = (new RegExp(`${config.patchOption.value}$`, 'i')).test(assetInfo.url);
                    break;
                case 'contain':
                    match = (new RegExp(config.patchOption.value, 'i')).test(assetInfo.url);
                    break;
                case 'glob':
                    match = minimatch(assetInfo.url, config.patchOption.value, {
                        nocase: true,
                    });
                    break;
            }
        }
    }
    return match;
}

export function filterAssetWithBundleConfig(assets: (Asset | VirtualAsset | IAssetInfo)[], bundleFilterConfig?: BundleFilterConfig[]) {
    return assets.filter((assetInfo) => checkAssetWithFilterConfig(assetInfo, bundleFilterConfig));
}
