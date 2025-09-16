import { Asset } from '@editor/asset-db';
import { makeDefaultTextureBaseAssetUserData } from './texture-base';
import { migratePlatformSettings } from './image/migrations';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';

interface IAutoAtlasUserData {
    compressed: boolean;
    dest: any;
    // size of packed image.
    maxWidth: number;
    maxHeight: number;

    // padding of image.
    padding: number;

    allowRotation: boolean;
    forceSquared: boolean;
    powerOfTwo: boolean;
    algorithm: string;
    format: string;
    quality: number;
    contourBleed: boolean;
    paddingBleed: boolean;
    filterUnused: boolean;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    platformSettings: any;
    textureSetting: any;
}

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
                },
            ];
        },
    },

    importer: {
        version: '1.0.8',
        /**
         * 数据迁移
         */
        migrations: [
            {
                version: '1.0.5',
                migrate: migratePlatformSettings,
            },
            {
                version: '1.0.6',
                migrate: (asset: Asset) => {
                    const userData = asset.userData as IAutoAtlasUserData;
                    ['removeTextureInBundle', 'removeImageInBundle', 'removeSpriteAtlasInBundle'].forEach((key) => {
                        // @ts-ignore
                        if (typeof userData[key] !== 'boolean') {
                            // @ts-ignore
                            userData[key] = false;
                        }
                    });
                },
            },
            {
                version: '1.0.8',
                migrate: (asset: Asset) => {
                    const userData = asset.userData as IAutoAtlasUserData;
                    // 面板上隐藏了 allowRotation 和 algorithm
                    if (!userData['allowRotation']) {
                        userData['allowRotation'] = true;
                    }
                    if (!userData['algorithm'] || userData['algorithm'] !== 'MaxRects') {
                        userData['algorithm'] = 'MaxRects';
                    }
                },
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
        async import(asset: Asset) {
            const userData = asset.userData as IAutoAtlasUserData;
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
