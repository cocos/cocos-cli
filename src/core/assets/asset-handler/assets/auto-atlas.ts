import { Asset } from '@cocos/asset-db';
import { createTextureBasePropertySchema, makeDefaultTextureBaseAssetUserData } from './texture-base';

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
    propertySchemaConfig: {
            maxWidth: {
                title: 'i18n:importer.property_schema.auto_atlas.max_width',
                description: 'i18n:importer.property_schema.auto_atlas.max_width_description',
                type: 'number',
                default: defaultAutoAtlasUserData.maxWidth,
                minimum: 1,
                step: 1,
            },
            maxHeight: {
                title: 'i18n:importer.property_schema.auto_atlas.max_height',
                description: 'i18n:importer.property_schema.auto_atlas.max_height_description',
                type: 'number',
                default: defaultAutoAtlasUserData.maxHeight,
                minimum: 1,
                step: 1,
            },
            padding: {
                title: 'i18n:importer.property_schema.auto_atlas.padding',
                description: 'i18n:importer.property_schema.auto_atlas.padding_description',
                type: 'number',
                default: defaultAutoAtlasUserData.padding,
                minimum: 0,
                step: 1,
            },
            allowRotation: {
                title: 'i18n:importer.property_schema.auto_atlas.allow_rotation',
                description: 'i18n:importer.property_schema.auto_atlas.allow_rotation_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.allowRotation,
            },
            forceSquared: {
                title: 'i18n:importer.property_schema.auto_atlas.force_squared',
                description: 'i18n:importer.property_schema.auto_atlas.force_squared_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.forceSquared,
            },
            powerOfTwo: {
                title: 'i18n:importer.property_schema.auto_atlas.power_of_two',
                description: 'i18n:importer.property_schema.auto_atlas.power_of_two_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.powerOfTwo,
            },
            algorithm: {
                title: 'i18n:importer.property_schema.auto_atlas.algorithm',
                description: 'i18n:importer.property_schema.auto_atlas.algorithm_description',
                type: 'string',
                default: defaultAutoAtlasUserData.algorithm,
                enum: ['MaxRects'],
                enumDescriptions: ['i18n:importer.property_schema.auto_atlas.max_rects'],
            },
            format: {
                title: 'i18n:importer.property_schema.auto_atlas.format',
                description: 'i18n:importer.property_schema.auto_atlas.format_description',
                type: 'string',
                default: defaultAutoAtlasUserData.format,
                enum: ['png', 'jpg'],
                enumDescriptions: [
                    'i18n:importer.property_schema.auto_atlas.png',
                    'i18n:importer.property_schema.auto_atlas.jpg',
                ],
            },
            quality: {
                title: 'i18n:importer.property_schema.auto_atlas.quality',
                description: 'i18n:importer.property_schema.auto_atlas.quality_description',
                type: 'number',
                default: defaultAutoAtlasUserData.quality,
                minimum: 0,
                maximum: 100,
                step: 1,
            },
            contourBleed: {
                title: 'i18n:importer.property_schema.auto_atlas.contour_bleed',
                description: 'i18n:importer.property_schema.auto_atlas.contour_bleed_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.contourBleed,
            },
            paddingBleed: {
                title: 'i18n:importer.property_schema.auto_atlas.padding_bleed',
                description: 'i18n:importer.property_schema.auto_atlas.padding_bleed_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.paddingBleed,
            },
            filterUnused: {
                title: 'i18n:importer.property_schema.auto_atlas.filter_unused',
                description: 'i18n:importer.property_schema.auto_atlas.filter_unused_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.filterUnused,
            },
            removeTextureInBundle: {
                title: 'i18n:importer.property_schema.auto_atlas.remove_texture_in_bundle',
                description: 'i18n:importer.property_schema.auto_atlas.remove_texture_in_bundle_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.removeTextureInBundle,
            },
            removeImageInBundle: {
                title: 'i18n:importer.property_schema.auto_atlas.remove_image_in_bundle',
                description: 'i18n:importer.property_schema.auto_atlas.remove_image_in_bundle_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.removeImageInBundle,
            },
            removeSpriteAtlasInBundle: {
                title: 'i18n:importer.property_schema.auto_atlas.remove_sprite_atlas_in_bundle',
                description: 'i18n:importer.property_schema.auto_atlas.remove_sprite_atlas_in_bundle_description',
                type: 'boolean',
                default: defaultAutoAtlasUserData.removeSpriteAtlasInBundle,
            },
            textureSetting: {
                title: 'i18n:importer.property_schema.auto_atlas.texture_setting',
                description: 'i18n:importer.property_schema.auto_atlas.texture_setting_description',
                type: 'object',
                default: defaultAutoAtlasUserData.textureSetting,
                properties: createTextureBasePropertySchema(),
            },
    },
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
