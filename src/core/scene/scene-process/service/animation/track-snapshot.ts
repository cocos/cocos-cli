/*---------------------------------------------------------------------------------------------
 * Copyright (c) SUD. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Asset, animation, deserialize, js, type AnimationClip } from 'cc';
import { loadAnimationAssetValue, queryAnimationAssetCtor } from './asset-value';

/**
 * 序列化原始轨道，保留属性 dump 无法表达的路径、代理和未定型曲线
 *
 * Clip 未提供原始轨道集合时返回 undefined，由调用方保留原有的曲线恢复流程
 */
export function captureAnimationTracks(clip: AnimationClip): string | undefined {
    if (!clip.tracks) {
        return undefined;
    }

    const serialized = EditorExtends.serialize({ tracks: Array.from(clip.tracks) }, {
        dontStripDefault: true,
    });
    return typeof serialized === 'string' ? serialized : JSON.stringify(serialized);
}

/**
 * 从快照恢复并替换 Clip 的原始轨道
 *
 * 轨道和资源引用恢复完成前不修改当前 Clip；无法加载的资源保留类型与 UUID 占位，非法快照仍抛出错误
 */
export async function restoreAnimationTracks(clip: AnimationClip, serialized: string): Promise<void> {
    const details = new deserialize.Details();
    details.reset();
    const restored: unknown = deserialize(JSON.parse(serialized), details);
    if (
        !restored
        || typeof restored !== 'object'
        || !('tracks' in restored)
        || !Array.isArray(restored.tracks)
        || !restored.tracks.every(track => track instanceof animation.Track)
    ) {
        throw new Error('Invalid animation track snapshot.');
    }

    await restoreTrackAssetReferences(details);

    for (let index = Array.from(clip.tracks).length - 1; index >= 0; index--) {
        clip.removeTrack(index);
    }
    for (const track of restored.tracks) {
        clip.addTrack(track);
    }
}

/**
 * 恢复轨道快照中的资源引用
 *
 * 沿用动画关键帧的加载失败回退，按引用声明的类型创建占位资源并保留 UUID
 */
async function restoreTrackAssetReferences(
    details: InstanceType<typeof deserialize.Details>,
): Promise<void> {
    const uuids = details.uuidList;
    if (!uuids) {
        return;
    }

    const loads = new Map<string, Promise<Asset>>();
    const assets = await Promise.all(uuids.map((uuid, index) => {
        if (typeof uuid !== 'string') {
            throw new Error('Invalid asset UUID in animation track snapshot.');
        }

        const type = details.uuidTypeList[index] || '';
        const key = JSON.stringify([uuid, type]);
        let loading = loads.get(key);
        if (!loading) {
            const assetCtor = queryAnimationAssetCtor({
                type: { value: type },
                valueCtor: js.getClassById(type),
            }) ?? Asset;
            loading = loadAnimationAssetValue(assetCtor, uuid);
            loads.set(key, loading);
        }
        return loading;
    }));

    // 引擎按 uuidList 的顺序回填字段，按索引保留每处引用各自声明的资源类型
    let referenceIndex = 0;
    details.assignAssetsBy(() => assets[referenceIndex++]);
}
