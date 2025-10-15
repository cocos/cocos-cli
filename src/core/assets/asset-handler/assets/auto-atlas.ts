import { Asset } from '@editor/asset-db';
import { makeDefaultTextureBaseAssetUserData } from './texture-base';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';
import { AutoAtlasAssetUserData } from '../../@types/userDatas';

const defaultAutoAtlasUserData = {
    maxWidth: 1024,
    maxHeight: 1024,

    // padding of image.
    padding: 2,

    allowRotation: true,
    forceSquared: false,
    powerOfTwo: false,
    algorithm: 'MaxRects',
    format: 'png',
    quality: 80,
    contourBleed: true,
    paddingBleed: true,
    filterUnused: true,
    removeTextureInBundle: true,
    removeImageInBundle: true,
    removeSpriteAtlasInBundle: true,
    compressSettings: {},
    textureSetting: makeDefaultTextureBaseAssetUserData(),
};

const AutoAtlasHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'auto-atlas',

    // pac 文件实际上在编辑器下没用到，只有构建时会用。因此这里把类型设置为 cc.SpriteAtlas，方便构建时当成图集来处理。
    assetType: 'cc.SpriteAtlas',
    createInfo: {
        generateMenuInfo() {
            return [
                {
                    label: 'i18n:ENGINE.assets.newPac',
                    fullFileName: 'auto-atlas.pac',
                    template: `db://internal/default_file_content/${AutoAtlasHandler.name}/default.pac`,
                    name: 'default',
                },
            ];
        },
    },

    importer: {
        version: '1.0.8',

        /**
         * 实际导入流程
         * 需要自己控制是否生成、拷贝文件
         *
         * 返回是否导入成功的标记
         * 如果返回 false，则 imported 标记不会变成 true
         * 后续的一系列操作都不会执行
         * @param asset
         */
        async import(asset: Asset) {
            const userData = asset.userData as AutoAtlasAssetUserData;
            // @ts-ignore
            Object.keys(defaultAutoAtlasUserData).forEach((key: string) => {
                if (!(key in userData)) {
                    // @ts-ignore
                    userData[key] = defaultAutoAtlasUserData[key];
                }
            });
            // @ts-ignore
            const autoAtlas = new cc.SpriteAtlas();
            autoAtlas.name = asset.basename || '';

            const serializeJSON = EditorExtends.serialize(autoAtlas);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default AutoAtlasHandler;
