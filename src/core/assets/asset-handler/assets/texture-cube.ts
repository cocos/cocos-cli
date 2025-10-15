import { VirtualAsset, Asset, queryUUID } from '@editor/asset-db';
import * as cc from 'cc';

import { AssetHandler } from '../../@types/protected';
import { TextureCubeAssetUserData } from '../../@types/userDatas';
import { getDependUUIDList } from '../utils';
import { makeDefaultTextureBaseAssetUserData, applyTextureBaseAssetUserData } from './texture-base';
import { loadAssetSync } from './utils/load-asset-sync';

type FaceName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export function makeDefaultTextureCubeAssetUserData(): TextureCubeAssetUserData {
    const userData = makeDefaultTextureBaseAssetUserData();
    (userData as unknown as TextureCubeAssetUserData).isRGBE = false;
    return userData as unknown as TextureCubeAssetUserData;
}

export const TextureCubeHandler: AssetHandler = {
    name: 'texture-cube',

    assetType: 'cc.TextureCube',

    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newCubeMap',
                    fullFileName: 'cubemap.cubemap',
                    content: '',
                    name: 'default',
                },
            ];
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.4',

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: VirtualAsset) {
            if (Object.getOwnPropertyNames(asset.userData).length === 0) {
                asset.assignUserData(makeDefaultTextureCubeAssetUserData(), true);
                asset.userData.isRGBE = false;
            }

            const userData = asset.userData as TextureCubeAssetUserData;

            const faceNames: FaceName[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

            const faceAssets = {} as Record<FaceName, cc.ImageAsset>;
            for (const faceName of faceNames) {
                let faceImageUUID = userData[faceName];
                if (!faceImageUUID) {
                    const defaultFaceUrl = `db://internal/default_cubemap/${faceName}.jpg`;
                    const uuid = queryUUID(defaultFaceUrl);
                    if (uuid) {
                        faceImageUUID = uuid;
                    } else {
                        throw new Error(`[[internal-error]] Default face url ${defaultFaceUrl} doesn't exists.`);
                    }
                }
                const face = loadAssetSync(faceImageUUID, cc.ImageAsset);
                if (!face) {
                    throw new Error(`Failed to load ${faceName} face of ${asset.uuid}.`);
                }
                faceAssets[faceName] = face;
            }

            const texture = new cc.TextureCube();
            applyTextureBaseAssetUserData(userData, texture);
            if (asset.parent instanceof Asset) {
                texture.name = asset.parent.basename || '';
            }
            texture.isRGBE = userData.isRGBE;
            texture._mipmaps = [faceAssets];

            const serializeJSON = EditorExtends.serialize(texture);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default TextureCubeHandler;
