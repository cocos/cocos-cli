'use strict';

import { IAsset } from '../../../../assets/@types/protected';
import { IBundle } from '../../../@types/protected';
import { buildAssetLibrary } from '../manager/asset-library';

declare const cc: any;

const _ = require('lodash');

/**
 * 分组重新划分
 * 将所有分组内，重复的数据，单独提取成新的分组
 * 
 * @param groups 传入一个分组数组（二维数组）
 * @param checkResult 是否检查结果
 */
export function splitGroups(groups: string[][], checkResult = false) {

    if (groups.length < 2) {
        return groups;
    }
    const processedList = [groups[0]];
    loopGroups:
    for (let i1 = 1; i1 < groups.length; i1++) {
        let test = groups[i1];
        const oldProcessedListLen = processedList.length;
        for (let i2 = 0; i2 < oldProcessedListLen; i2++) {
            let processed = processedList[i2];
            const intersection = _.intersection(processed, test);
            const processedLen = processed.length, testLen = test.length, intersectionLen = intersection.length;
            // compare
            if (intersectionLen === 0) {
                continue;
            }
            else if (intersectionLen === processedLen) {
                if (processedLen !== testLen) {
                    // processed entirely contained in test
                    test = _.difference(test, intersection);
                }
                else {
                    continue loopGroups;
                }
            }
            else if (intersectionLen === testLen) {
                if (processedLen !== testLen) {
                    // test entirely contained in processed
                    processed = _.difference(processed, intersection);
                    processedList[i2] = processed;
                    processedList.push(intersection);
                }
                continue loopGroups;
            }
            else {
                test = _.difference(test, intersection);
                processed = _.difference(processed, intersection);
                processedList[i2] = processed;
                processedList.push(intersection);
            }
        }
        processedList.push(test);
    }

    if (checkResult) {
        const resFlatten = _.flatten(processedList);
        const resUniq = _.uniq(resFlatten);
        if (resUniq.length < resFlatten.length) {
            console.warn('Internal error: SizeMinimized.transformGroups: res not unique, transform canceled');
            return groups;
        }
        else {
            const inputFlatten = _.flatten(groups);
            const diff = _.difference(inputFlatten, resUniq);
            if (diff.length > 0) {
                console.warn('Internal error: SizeMinimized.transformGroups: not have the same members, transform canceled');
                return groups;
            }
        }
    }

    return processedList;
}

// TODO json 分组不应该简单只依照依赖关系，应该考虑到控制最终大 json 在一定范围之内
// TODO 资源依赖关系在 bundle 整理资源时已经查询过一次，理论上不需要重复整理，这个递归比较消耗需要尽量减少不必要的查询
// 否则有可能出现非常大的 json 文件，这对加载来说没有好处
/**
 * 爬取某个资源依赖的 json 资源的分组数据
 * @param uuid
 */
export async function walk(asset: IAsset, bundle: IBundle) {
    // 资源依赖数组
    const assetDepends: string[] = [];
    const hasChecked = new Set<string>();
    const rawAsset = asset;
    /**
     * 获取依赖 uuid 数组
     * @param uuid
     */
    async function getDepends(asset: IAsset) {
        hasChecked.add(asset.uuid);
        if (bundle.getRedirect(asset.uuid)) {
            return;
        }
        if (assetDepends.includes(asset.uuid)) {
            return;
        }

        // 有 json 文件的，才会被记录
        if (asset.meta.files.includes('.json')) {
            assetDepends.push(asset.uuid);
        }

        // 将不满足条件的资源 uuid 排除出去
        const uuids = (await buildAssetLibrary.getDependUuids(asset.uuid) || []).filter((uuid: string) => {
            const asset = buildAssetLibrary.getAsset(uuid);
            if (!asset) {
                return false;
            }
            const assetType = buildAssetLibrary.getAssetProperty(asset, 'type');
            if (!assetType) {
                return;
            }
            if (assetType === 'cc.Texture2D') {
                return false;
            }
            const ctor = cc.js.getClassByName(assetType);
            return ctor;
        });

        // 需要递归查询依赖的资源是否还有依赖
        for (let i = 0; i < uuids.length; i++) {
            const sUuid = uuids[i];
            if (hasChecked.has(sUuid)) {
                if (sUuid === asset.uuid || sUuid === rawAsset.uuid) {
                    console.debug(`[json-group] check self or raw asset, skip. ${sUuid} depended by ${asset.uuid} has checked in raw asset ${rawAsset.uuid}/bundle(${bundle.name})}`);
                    continue;
                }
                // console.debug(`[json-group] ${sUuid} depended by ${asset.uuid} has checked in raw asset ${rawAsset.uuid}}`);
                continue;
            }
            await getDepends(buildAssetLibrary.getAsset(sUuid));
        }
    }

    // 将不满足条件的资源 uuid 排除出去
    await getDepends(asset);

    // 如果没有依赖，则不需要分组
    if (!assetDepends || assetDepends.length < 1) {
        // 如果没有 json 文件，则跳过
        if (asset.meta.files.includes('.json')) {
            return [asset.uuid];
        } else {
            return [];
        }
    }

    // 将自己添加到合并队列
    if (!assetDepends.includes(asset.uuid) && asset.meta.files.includes('.json')) {
        assetDepends.push(asset.uuid);
    }

    return [...new Set(assetDepends)];
}

/**
 * 检查一个 uuid 是否已经在其他分组里
 * @param uuid 
 * @param groups 
 */
export function hasGroups(uuid: string, groups: string[][]) {
    for (let i = 0; i < groups.length; i++) {
        const list = groups[i];

        for (let j = 0; j < list.length; j++) {
            if (list[j] === uuid) {
                return true;
            }
        }
    }
    return false;
}
