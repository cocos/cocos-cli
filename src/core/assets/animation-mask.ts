import { Asset } from '@cocos/asset-db';
import { readJSON } from 'fs-extra';

import assetManager from './manager/asset';
import type { IAsset } from './@types/protected';
import type { AnimationMaskChange, AnimationMaskDump } from './@types/public';
import {
    ANIMATION_MASK_TYPE,
    JOINT_MASK_TYPE,
    PREFAB_TYPE,
    assertRecord,
    applyJointChanges,
    extractPrefabJointPaths,
    jointMasksToDump,
    normalizeJointMasks,
    type SerializedJointMask,
} from './animation-mask-utils';

const ANIMATION_MASK_SERIALIZED_TYPE = 'cc.animation.AnimationMask';
const ANIMATION_MASK_ASSET_TYPE = 'cc.AnimationMask';

interface SerializedAnimationMask {
    __type__?: string;
    _jointMasks?: SerializedJointMask[];
    [key: string]: unknown;
}

function ensureAnimationMaskAsset(asset: IAsset | null, id: string): IAsset {
    if (!asset) {
        throw new Error(`AnimationMask asset not found: ${id}`);
    }
    const type = assetManager.queryAssetProperty(asset, 'type');
    if (type !== ANIMATION_MASK_ASSET_TYPE && type !== ANIMATION_MASK_TYPE) {
        throw new Error(`Asset is not an AnimationMask: ${id}`);
    }
    if (!(asset instanceof Asset) || !asset.source) {
        throw new Error(`AnimationMask asset must be a source asset: ${id}`);
    }
    return asset;
}

function ensureReadonly(value: unknown): never {
    throw new Error(`Unsupported AnimationMask source content: ${String(value)}`);
}

function getLibraryJSONPath(asset: IAsset): string {
    if (!asset.library) {
        throw new Error(`Asset has no imported library JSON: ${asset.uuid}`);
    }
    return `${asset.library}.json`;
}

function resolveSkeletonSourceAsset(id: string): IAsset {
    const asset = assetManager.queryAsset(id);
    if (!asset) {
        throw new Error(`Skeleton source asset not found: ${id}`);
    }

    const importer = asset.meta?.importer;
    if (importer === 'gltf' || importer === 'fbx') {
        const gltfScenes = Object.values(asset.subAssets || {})
            .filter((subAsset) => subAsset.meta?.importer === 'gltf-scene');
        if (!gltfScenes.length) {
            throw new Error(`glTF source has no gltf-scene sub asset: ${id}`);
        }
        return gltfScenes[0] as IAsset;
    }

    if (importer !== 'prefab' && importer !== 'gltf-scene') {
        throw new Error(`Skeleton source must be a Prefab or glTF scene: ${id}`);
    }

    const type = assetManager.queryAssetProperty(asset, 'type');
    if (type !== PREFAB_TYPE) {
        throw new Error(`Skeleton source is not a Prefab asset: ${id}`);
    }

    return asset;
}

async function readAnimationMaskSource(asset: IAsset): Promise<SerializedAnimationMask> {
    const source = (asset as Asset).source;
    if (!source) {
        return ensureReadonly(asset.uuid);
    }
    const data = await readJSON(source);
    assertRecord(data, `Invalid AnimationMask JSON: ${source}`);
    if (data.__type__ !== ANIMATION_MASK_SERIALIZED_TYPE) {
        throw new Error(`Invalid AnimationMask type: ${String(data.__type__)}`);
    }
    return data as SerializedAnimationMask;
}

async function writeAnimationMaskSource(asset: IAsset, data: SerializedAnimationMask): Promise<void> {
    const source = (asset as Asset).source;
    if (!source) {
        return ensureReadonly(asset.uuid);
    }
    await assetManager.saveAsset(asset.uuid, JSON.stringify(data, undefined, 2));
}

async function readPrefabJSON(asset: IAsset): Promise<unknown[]> {
    const file = asset instanceof Asset ? asset.source : getLibraryJSONPath(asset);
    const data = await readJSON(file);
    if (!Array.isArray(data)) {
        throw new Error(`Invalid Prefab JSON: ${file}`);
    }
    if (!data[0] || (data[0] as { __type__?: string }).__type__ !== PREFAB_TYPE) {
        throw new Error(`Invalid Prefab asset type: ${file}`);
    }
    return data;
}

export async function queryAnimationMask(uuid: string): Promise<AnimationMaskDump> {
    const asset = ensureAnimationMaskAsset(assetManager.queryAsset(uuid), uuid);
    const data = await readAnimationMaskSource(asset);
    return jointMasksToDump(asset.uuid, normalizeJointMasks(data._jointMasks));
}

export async function importAnimationMaskSkeleton(uuid: string, skeletonSourceUuid: string): Promise<AnimationMaskDump> {
    const maskAsset = ensureAnimationMaskAsset(assetManager.queryAsset(uuid), uuid);
    const sourceAsset = resolveSkeletonSourceAsset(skeletonSourceUuid);
    const maskData = await readAnimationMaskSource(maskAsset);
    const currentMasks = normalizeJointMasks(maskData._jointMasks);
    const currentPathSet = new Set(currentMasks.map((joint) => joint.path));
    const importedPaths = extractPrefabJointPaths(await readPrefabJSON(sourceAsset));

    for (const path of importedPaths) {
        if (!currentPathSet.has(path)) {
            currentMasks.push({ __type__: JOINT_MASK_TYPE, path, enabled: true });
            currentPathSet.add(path);
        }
    }

    maskData._jointMasks = currentMasks;
    await writeAnimationMaskSource(maskAsset, maskData);
    return jointMasksToDump(maskAsset.uuid, currentMasks);
}

export async function clearAnimationMaskNodes(uuid: string): Promise<AnimationMaskDump> {
    const asset = ensureAnimationMaskAsset(assetManager.queryAsset(uuid), uuid);
    const data = await readAnimationMaskSource(asset);
    data._jointMasks = [];
    await writeAnimationMaskSource(asset, data);
    return jointMasksToDump(asset.uuid, []);
}

export async function changeAnimationMaskDump(uuid: string, changes: AnimationMaskChange[]): Promise<AnimationMaskDump> {
    const asset = ensureAnimationMaskAsset(assetManager.queryAsset(uuid), uuid);
    const data = await readAnimationMaskSource(asset);
    const nextMasks = applyJointChanges(normalizeJointMasks(data._jointMasks), changes);
    data._jointMasks = nextMasks;
    await writeAnimationMaskSource(asset, data);
    return jointMasksToDump(asset.uuid, nextMasks);
}

export async function saveAnimationMask(uuid: string): Promise<void> {
    const asset = ensureAnimationMaskAsset(assetManager.queryAsset(uuid), uuid);
    const data = await readAnimationMaskSource(asset);
    await writeAnimationMaskSource(asset, {
        ...data,
        _jointMasks: normalizeJointMasks(data._jointMasks),
    });
}
