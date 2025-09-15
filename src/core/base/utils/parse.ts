'use strict';

/**
 * return result of versionMax > versionMin，其中仅支持纯数字版本，最高支持三位数版本号：333.666.345
 * @example (3.6.2, 3.7.0) => false; (3.9.0, 3.8.0) => true; (3.8.0, 3.8.0) => false;
 * @param versionMax
 * @param versionMin
 * @param split
 */
export function compareVersion(versionMax: string, versionMin: string, split = '.') {
    if (typeof versionMax !== 'string' || typeof versionMin !== 'string') {
        throw new Error(`invalid param: ${versionMax}, ${versionMin}`);
    }
    versionMax = versionMax.replace(split, '').padStart(3, '0');
    versionMin = versionMin.replace(split, '').padStart(3, '0');
    return Number(versionMax) > Number(versionMin);
}
