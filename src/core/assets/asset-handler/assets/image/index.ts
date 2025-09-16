import { Asset } from '@editor/asset-db';
import { existsSync, readFile } from 'fs-extra';
import { checkSize } from '../erp-texture-cube';
import { convertTGA, convertPSD, convertTIFF, convertHDROrEXR, convertHDR } from './image-mics';
import { migrations } from './migrations';
import Sharp from 'sharp';
import { ImageAssetUserData } from '../../../@types/userDatas';

import { join } from 'path';
import {
    defaultIconConfig,
    handleImageUserData,
    importWithType,
    isCapableToFixAlphaTransparencyArtifacts,
    openImageAsset,
    saveImageAsset,
} from './utils';
import { AssetHandler } from '../../../@types/protected';
import utils from '../../../../base/utils';

export const ImageHandler: AssetHandler = {
    displayName: 'i18n:ENGINE.assets.image.label',
    description: 'i18n:ENGINE.assets.image.description',
    // Handler 的名字，用于指定 Handler as 等
    name: 'image',

    // 引擎内对应的类型
    assetType: 'cc.ImageAsset',
    open: openImageAsset,
    iconInfo: {
        default: defaultIconConfig,
        generateThumbnail(asset: Asset) {
            const extname = asset.meta.files.find((extName) => extName !== '.json') || '.png';
            return {
                type: 'image',
                value: asset.library + extname,
            };
        },
    },
    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.27',
        migrations,
        /**
         * 是否强制刷新
         * @param asset
         */
        async force(asset: Asset) {
            return false;
        },
        /**
         * @param asset
         */
        async import(asset: Asset) {
            let extName = asset.extname.toLocaleLowerCase();
            // If it's a string, is a path to the image file.
            // Else it's the image data buffer.
            let imageDataBufferOrimagePath: string | Buffer = asset.source;
            const userData = asset.meta.userData as ImageAssetUserData;

            // 这个流程会将不同类型的图片转成 png
            if (extName === '.bmp') {
                const converted = await convertHDR(asset.source, asset.uuid, asset.temp);
                if (converted instanceof Error || !converted) {
                    console.error('Failed to convert bmp image.');
                    return false;
                }
                extName = converted.extName;
                imageDataBufferOrimagePath = converted.source;

                // bmp 导入的，默认钩上 isRGBE
                userData.isRGBE = true;
                // 对于 rgbe 类型图片默认关闭这个选项
                userData.fixAlphaTransparencyArtifacts ||= false;
            } else if (extName === '.znt') {
                const source = asset.source;
                const converted = await convertHDR(source, asset.uuid, asset.temp);
                if (converted instanceof Error || !converted) {
                    console.error(`Failed to convert asset {asset(${asset.uuid})}.`);
                    return false;
                }
                extName = converted.extName;
                imageDataBufferOrimagePath = converted.source;
                // 对于 rgbe 类型图片默认关闭这个选项
                userData.fixAlphaTransparencyArtifacts = false;
                userData.isRGBE = true;
            } else if (extName === '.hdr' || extName === '.exr') {
                const source = asset.source;
                const converted = await convertHDROrEXR(extName, source, asset.uuid, asset.temp);
                if (converted instanceof Error || !converted) {
                    console.error(`Failed to convert asset {asset(${asset.uuid})}.`);
                    return false;
                }
                extName = converted.extName;
                imageDataBufferOrimagePath = converted.source;
                // 对于 rgbe 类型图片默认关闭这个选项
                userData.fixAlphaTransparencyArtifacts = false;
                // hdr 导入的，默认钩上 isRGBE
                userData.isRGBE = true;
                const sharpResult = await Sharp(imageDataBufferOrimagePath);
                const metaData = await sharpResult.metadata();
                // 长宽符合 cubemap 的导入规则时，默认导入成 texture cube
                if (!userData.type && checkSize(metaData.width!, metaData.height!)) {
                    userData.type = 'texture cube';
                }
                const signFile = join(converted.source.replace('.png', '_sign.png'));
                if (existsSync(signFile)) {
                    userData.sign = utils.Path.resolveToUrl(signFile, 'project');
                }
                const alphaFile = join(converted.source.replace('.png', '_alpha.png'));
                if (existsSync(alphaFile)) {
                    userData.alpha = utils.Path.resolveToUrl(alphaFile, 'project');
                }
            } else if (extName === '.tga') {
                const converted = await convertTGA(await readFile(asset.source));
                if (converted instanceof Error || !converted) {
                    console.error('Failed to convert tga image.');
                    return false;
                }
                extName = converted.extName;
                imageDataBufferOrimagePath = converted.data;
            } else if (extName === '.psd') {
                const converted = await convertPSD(await readFile(asset.source));
                extName = converted.extName;
                imageDataBufferOrimagePath = converted.data;
            } else if (extName === '.tif' || extName === '.tiff') {
                const converted = await convertTIFF(asset.source);
                if (converted instanceof Error || !converted) {
                    console.error(`Failed to convert ${extName} image.`);
                    return false;
                }
                extName = converted.extName;
                imageDataBufferOrimagePath = converted.data;
            }
            // 为不同导入类型的图片设置伪影的默认值
            if (userData.fixAlphaTransparencyArtifacts === undefined) {
                userData.fixAlphaTransparencyArtifacts = isCapableToFixAlphaTransparencyArtifacts(asset, userData.type, asset.extname);
            }
            imageDataBufferOrimagePath = await handleImageUserData(asset, imageDataBufferOrimagePath, extName);

            await saveImageAsset(asset, imageDataBufferOrimagePath, extName, asset.basename);
            await importWithType(asset, userData.type, asset.basename, asset.extname);
            if (userData.sign) {
                await asset.createSubAsset('sign', 'sign-image', {
                    displayName: 'sign',
                });
            }

            // if (userData.alpha) {
            //     // TODO 暂时先用着，后续可以更改更通用的名字
            //     await asset.createSubAsset('alpha', 'sign-image', {
            //         displayName: 'alpha',
            //     });
            // }
            // await this.importWithType(asset, userData.type, asset.basename);

            if (userData.alpha) {
                // TODO 暂时先用着，后续可以更改更通用的名字
                await asset.createSubAsset('alpha', 'alpha-image', {
                    displayName: 'alpha',
                });
            }
            return true;
        },
    },

    userDataConfig: {
        default: {
            type: {
                label: 'i18n:ENGINE.assets.image.type',
                default: 'texture',
                render: {
                    ui: 'ui-select',
                    items: [
                        {
                            label: 'raw',
                            value: 'raw',
                        },
                        {
                            label: 'texture',
                            value: 'texture',
                        },
                        {
                            label: 'normal map',
                            value: 'normal map',
                        },
                        {
                            label: 'sprite-frame',
                            value: 'sprite-frame',
                        },
                        {
                            label: 'texture cube',
                            value: 'texture cube',
                        },
                    ],
                },
            },
            flipVertical: {
                label: 'i18n:ENGINE.assets.image.flipVertical',
                render: {
                    ui: 'ui-checkbox',
                },
            },
        },
    },

    /**
     * 判断是否允许使用当前的 Handler 进行导入
     * @param asset
     */
    async validate(asset: Asset) {
        return !(await asset.isDirectory());
    },
};

export default ImageHandler;
