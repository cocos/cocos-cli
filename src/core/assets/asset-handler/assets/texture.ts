import { VirtualAsset, Asset, queryAsset } from '@editor/asset-db';

import { ImageAsset } from 'cc';

import { AssetHandler } from '../../@types/protected';
import { Texture2DAssetUserData } from '../../@types/userDatas';
import { getDependUUIDList } from '../utils';
import { defaultIconConfig, makeDefaultTexture2DAssetUserData } from './image/utils';
import { migrateAnisotropy, applyTextureBaseAssetUserData } from './texture-base';
import { url2uuid } from '../../utils';

export const TextureHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'texture',

    // 引擎内对应的类型
    assetType: 'cc.Texture2D',
    iconInfo: {
        default: defaultIconConfig,
        generateThumbnail(asset: Asset) {
            const imageUuid = getImageUuid(asset);
            if (!imageUuid) {
                return defaultIconConfig;
            }
            const imageAsset = queryAsset(imageUuid) as Asset;
            if (imageAsset.invalid) {
                return defaultIconConfig;
            }
            const extname = imageAsset.meta.files.find((extName) => extName !== '.json') || '.png';
            return {
                type: 'image',
                value: imageAsset.library + extname,
            };
        },
    },

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.22',
        migrations: [
            {
                version: '1.0.21',
                migrate: migrateAnisotropy,
            },
        ],

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
            const userData = asset.userData as Texture2DAssetUserData;
            // @ts-ignore
            const texture = new cc.Texture2D();
            if (asset.parent instanceof Asset) {
                texture.name = asset.parent.basename || '';
                // hdr exr 导入默认值需为 nearest 过滤模式
                if (!userData.mipfilter && ['.hdr', '.exr'].includes(asset.parent.extname)) {
                    userData.mipfilter = 'none';
                    userData.minfilter = 'nearest';
                    userData.magfilter = 'nearest';
                }
            }
            asset.assignUserData(makeDefaultTexture2DAssetUserData());
            applyTextureBaseAssetUserData(userData, texture);

            const imageAsset = getImageAsset(asset);
            if (imageAsset) {
                texture._mipmaps = [imageAsset];
            } else {
                // 如果存在 imageUuidOrDatabaseUri 却无法获取到可能是资源尚未导入完成，需要做标记
                if (asset.userData.imageUuidOrDatabaseUri) {
                    asset.depend(asset.userData.imageUuidOrDatabaseUri);
                    return false;
                }
            }

            const serializeJSON = EditorExtends.serialize(texture);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default TextureHandler;

function getImageUuid(asset: VirtualAsset): string | null {
    const userData = asset.userData as Texture2DAssetUserData;
    const imageUuidOrDatabaseUri = userData.imageUuidOrDatabaseUri;
    if (!imageUuidOrDatabaseUri) {
        return null;
    }
    if (userData.isUuid) {
        return imageUuidOrDatabaseUri;
    } else {
        const imageUuid = url2uuid(imageUuidOrDatabaseUri);
        if (imageUuid) {
            return imageUuid;
        }
    }
    return null;
}

function getImageAsset(asset: VirtualAsset) {
    const imageUuid = getImageUuid(asset);
    if (imageUuid !== null) {
        // @ts-ignore
        const image = EditorExtends.serialize.asAsset(imageUuid, ImageAsset);
        return image;
    }
    return null;
}
