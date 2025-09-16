'use strict';

import { Asset } from '@editor/asset-db';
import { Filter, SpriteFrameBaseAssetUserData, TextureBaseAssetUserData, WrapMode } from '../../@types/userDatas';

export const defaultMinFilter: Filter = 'linear';
export const defaultMagFilter: Filter = 'linear';
export const defaultMipFilter: Filter = 'none';
export const defaultWrapModeS: WrapMode = 'repeat';
export const defaultWrapModeT: WrapMode = 'repeat';

export function makeDefaultTextureBaseAssetUserData(): TextureBaseAssetUserData {
    return {
        wrapModeS: defaultWrapModeS,
        wrapModeT: defaultWrapModeT,
        minfilter: defaultMinFilter,
        magfilter: defaultMagFilter,
        mipfilter: defaultMipFilter,
        anisotropy: 0,
    };
}

interface SpriteFrameVertices {
    rawPosition: number[];
    indexes: number[];
    uv: number[];
    nuv: number[];
    minPos: number[];
    maxPos: number[];
}

export function makeDefaultSpriteFrameBaseAssetUserData(): SpriteFrameBaseAssetUserData {
    return {
        trimThreshold: 1,
        rotated: false,
        offsetX: 0,
        offsetY: 0,
        trimX: 0,
        trimY: 0,
        width: 80,
        height: 80,
        rawWidth: 80,
        rawHeight: 80,
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        borderRight: 0,
        packable: true,
        pixelsToUnit: 100,
        pivotX: 0.5,
        pivotY: 0.5,
        meshType: 0,
        vertices: {
            rawPosition: [],
            indexes: [],
            uv: [],
            nuv: [],
            minPos: [],
            maxPos: [],
        },
    };
}

export function getWrapMode(wrapMode: WrapMode) {
    switch (wrapMode) {
        // @ts-ignore
        case 'clamp-to-edge':
            return cc.TextureBase.WrapMode.CLAMP_TO_EDGE;
        // @ts-ignore
        case 'repeat':
            return cc.TextureBase.WrapMode.REPEAT;
        // @ts-ignore
        case 'mirrored-repeat':
            return cc.TextureBase.WrapMode.MIRRORED_REPEAT;
    }
}

export function getWrapModeString(num: number) {
    switch (num) {
        // @ts-ignore
        case cc.TextureBase.WrapMode.CLAMP_TO_EDGE:
            return 'clamp-to-edge';
        // @ts-ignore
        case cc.TextureBase.WrapMode.REPEAT:
            return 'repeat';
        // @ts-ignore
        case cc.TextureBase.WrapMode.MIRRORED_REPEAT:
            return 'mirrored-repeat';
    }
}

export function getFilter(filter: Filter) {
    switch (filter) {
        // @ts-ignore
        case 'nearest':
            return cc.TextureBase.Filter.NEAREST;
        // @ts-ignore
        case 'linear':
            return cc.TextureBase.Filter.LINEAR;
        // @ts-ignore
        case 'none':
            return cc.TextureBase.Filter.NONE;
    }
}

export function getFilterString(num: number) {
    switch (num) {
        // @ts-ignore
        case cc.TextureBase.Filter.NEAREST:
            return 'nearest';
        // @ts-ignore
        case cc.TextureBase.Filter.LINEAR:
            return 'linear';
        // @ts-ignore
        case cc.TextureBase.Filter.NONE:
            return 'none';
    }
}

// @ts-ignore
export function applyTextureBaseAssetUserData(userData: TextureBaseAssetUserData, texture: cc.Texture2D) {
    texture.setWrapMode(getWrapMode(userData.wrapModeS), getWrapMode(userData.wrapModeT));
    texture.setFilters(getFilter(userData.minfilter), getFilter(userData.magfilter));
    texture.setMipFilter(getFilter(userData.mipfilter));
    texture.setAnisotropy(userData.anisotropy);
}

export async function migrateAnisotropy(asset: Asset) {
    const userData = asset.userData as TextureBaseAssetUserData;
    if (!userData || !userData.anisotropy) {
        return;
    }
    userData.anisotropy = 0;
}
