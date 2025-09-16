import { Asset, VirtualAsset } from '@editor/asset-db';
import { IAsset, ThumbnailInfo } from '../../../@types/protected';
import { ImageAsset, Rect } from 'cc';
import { existsSync, readFile } from 'fs-extra';
import { join } from 'path';
import Sharp from 'sharp';
import {
    ImageAssetUserData,
    ImageImportType,
    SpriteFrameAssetUserData,
    SpriteFrameBaseAssetUserData,
    Texture2DAssetUserData,
    TextureCubeAssetUserData,
} from '../../../@types/userDatas';
import { getDependUUIDList } from '../../utils';
import { applyContourBleed } from '../utils/algorithm/bleeding';
import { makeDefaultSpriteFrameBaseAssetUserData, makeDefaultTextureBaseAssetUserData } from '../texture-base';

const enum Color {
    Red = 0,
    Green,
    Blue,
    Alpha = 3,
}
const RGBChannels: Sharp.Channels = 3;
const RGBAChannels: Sharp.Channels = 4;

export function makeDefaultTextureCubeAssetUserData(): TextureCubeAssetUserData {
    const userData = makeDefaultTextureBaseAssetUserData() as TextureCubeAssetUserData;
    userData.isRGBE = false;
    userData.mipfilter = 'linear';
    return userData;
}

export function makeDefaultTexture2DAssetUserData(): Texture2DAssetUserData {
    return makeDefaultTextureBaseAssetUserData();
}

export function makeDefaultTexture2DAssetUserDataFromImagePath(path: string): Texture2DAssetUserData {
    return Object.assign(makeDefaultTextureBaseAssetUserData(), {
        isUuid: false,
        imageUuidOrDatabaseUri: path,
    });
}

export function makeDefaultTexture2DAssetUserDataFromImageUuid(uuid: string, extName?: string): Texture2DAssetUserData {
    const defaultUserData = makeDefaultTextureBaseAssetUserData();
    if (extName && ['.exr', '.hdr', '.znt'].includes(extName)) {
        defaultUserData.mipfilter = 'none';
        defaultUserData.minfilter = 'nearest';
        defaultUserData.magfilter = 'nearest';
    }
    return Object.assign(defaultUserData, {
        isUuid: true,
        imageUuidOrDatabaseUri: uuid,
    });
}

export function makeDefaultSpriteFrameAssetUserData(): SpriteFrameBaseAssetUserData {
    return makeDefaultSpriteFrameBaseAssetUserData();
}

export function makeDefaultSpriteFrameAssetUserDataFromImageUuid(uuid: string, atlas: string): SpriteFrameAssetUserData {
    return Object.assign(makeDefaultSpriteFrameBaseAssetUserData(), {
        isUuid: true,
        imageUuidOrDatabaseUri: uuid,
        atlasUuid: atlas,
    });
}

export async function saveImageAsset(
    asset: Asset | VirtualAsset,
    imageDataBufferOrimagePath: Buffer,
    extName: string,
    displayName: string,
) {
    // Save the image data into library.
    if (typeof imageDataBufferOrimagePath === 'string') {
        await asset.copyToLibrary(extName, imageDataBufferOrimagePath);
    } else {
        await asset.saveToLibrary(extName, imageDataBufferOrimagePath);
    }
    // Create the image asset.
    const image = new ImageAsset();
    image.name = displayName;
    image._setRawAsset(extName);

    const serializeJSON = EditorExtends.serialize(image);
    await asset.saveToLibrary('.json', serializeJSON);

    const depends = getDependUUIDList(serializeJSON);
    asset.setData('depends', depends);
}

export const defaultIconConfig: ThumbnailInfo = {
    type: 'icon',
    value: 'image',
};

/** 返回一个资源是否可以被消除阴影 */
export function isCapableToFixAlphaTransparencyArtifacts(asset: Asset | VirtualAsset, type: ImageImportType, extName: string): boolean {
    const disableTypes: ImageImportType[] = ['normal map', 'texture cube', 'sprite-frame', 'texture'];
    if (disableTypes.includes(type)) {
        return false;
    }
    const formatName = extName.toLocaleLowerCase().replace('.', '');
    const userData = asset.userData as ImageAssetUserData;
    const bannedFormatList = ['hdr', 'exr'];
    return !bannedFormatList.includes(formatName) && !userData.isRGBE;
}

export async function handleImageUserData(asset: Asset | VirtualAsset, imageDataBufferOrimagePath: Buffer | string, rawExtName: string) {
    if (typeof imageDataBufferOrimagePath === 'string') {
        imageDataBufferOrimagePath = await readFile(imageDataBufferOrimagePath);
    }
    const userData = asset.userData as ImageAssetUserData;
    const sharpResult = Sharp(imageDataBufferOrimagePath);
    const metaData = await sharpResult.metadata();
    userData.hasAlpha = metaData.hasAlpha;
    userData.type ||= 'texture';
    // Do flip if needed.
    const flipVertical = !!userData.flipVertical;
    if (flipVertical) {
        imageDataBufferOrimagePath = await sharpResult.flip().toBuffer();
    }

    if (userData.fixAlphaTransparencyArtifacts && metaData.hasAlpha) {
        userData.fixAlphaTransparencyArtifacts = true;
        const img = await Sharp(imageDataBufferOrimagePath).raw().toBuffer();
        /**
         * sharp 库获取含 alpha 通道的 png 图片的原始 buffer 的时候,会将图片展成四个通道。
         * 部分情况下会是有透明度的使用灰度通道的 Png ,这个时候通道数量为 2 所以不能够使用原图的通道数，
         * 因此将通道数强制设置为 4
         */

        let hasPurelyTransparentPixel = false;
        for (let index = 0; index < img.length; index += RGBAChannels) {
            const alpha = img[index + Color.Alpha];
            if (alpha === 0) {
                hasPurelyTransparentPixel = true;
                break;
            }
        }
        if (hasPurelyTransparentPixel) {
            const newBuffer = Buffer.from(img as Uint8Array);
            //   offset
            //   . . .
            //   . o .
            //   . . .
            const sampleXOffsets = [-1, 0, 1, -1, 1, -1, 0, 1];
            const sampleYOffsets = [-1, -1, -1, 0, 0, 1, 1, 1];
            const bufIdxOffsets: number[] = [];
            const ditch = metaData.width! * RGBAChannels;
            for (let j = 0; j < sampleXOffsets.length; j++) {
                bufIdxOffsets[j] = sampleXOffsets[j] * RGBAChannels + sampleYOffsets[j] * ditch;
            }
            applyContourBleed(
                newBuffer,
                img,
                metaData.width!,
                new Rect(0, 0, metaData.width, metaData.height),
                sampleXOffsets,
                sampleYOffsets,
                bufIdxOffsets,
            );
            imageDataBufferOrimagePath = await Sharp(newBuffer, {
                raw: {
                    channels: RGBAChannels,
                    height: metaData.height!,
                    width: metaData.width!,
                },
            })
                .toFormat('png')
                .toBuffer();
        }
    }

    // flip green channel
    if (userData.flipGreenChannel) {
        const sharpResult = await Sharp(imageDataBufferOrimagePath);
        const { width, height } = await sharpResult.metadata();
        const buffer = await sharpResult.raw().toBuffer();
        const channels = (buffer.length / width! / height!) as Sharp.Channels;
        const startIndex = Color.Green;
        for (let index = startIndex; index < buffer.length; index = channels! + index) {
            buffer[index] = 255 - buffer[index];
        }
        const opts = { raw: { width: width!, height: height!, channels: channels! } };
        imageDataBufferOrimagePath = await Sharp(buffer, opts).toFormat('png').toBuffer();
    }
    return imageDataBufferOrimagePath;
}

export async function importWithType(asset: Asset | VirtualAsset, type: ImageImportType, displayName: string, extName: string) {
    const userData = asset.userData;
    switch (type) {
        case 'texture':
            {
                const texture2DSubAsset = await asset.createSubAsset('texture', 'texture', {
                    displayName,
                });
                userData.redirect = texture2DSubAsset.uuid;
                texture2DSubAsset.assignUserData(makeDefaultTexture2DAssetUserDataFromImageUuid(asset.uuid, extName));
                texture2DSubAsset.userData.imageUuidOrDatabaseUri = asset.uuid;
                texture2DSubAsset.userData.visible = false;
            }
            break;
        case 'normal map':
            {
                const normal2DSubAsset = await asset.createSubAsset('normalMap', 'texture', {
                    displayName,
                });
                normal2DSubAsset.assignUserData(makeDefaultTexture2DAssetUserDataFromImageUuid(asset.uuid));
            }
            break;
        case 'texture cube':
            {
                const textureCubeSubAsset = await asset.createSubAsset('textureCube', 'erp-texture-cube', {
                    displayName,
                });
                textureCubeSubAsset.assignUserData(makeDefaultTextureCubeAssetUserData());
                (textureCubeSubAsset.userData as TextureCubeAssetUserData).imageDatabaseUri = asset.uuid;
                (textureCubeSubAsset.userData as TextureCubeAssetUserData).isRGBE = !!userData.isRGBE;
            }
            break;
        case 'sprite-frame':
            {
                // const sprite2DSubAsset = await asset.createSubAsset(asset.basename, 'texture');
                const texture2DSubAssetWithSprite = await asset.createSubAsset('texture', 'texture', {
                    displayName,
                });
                texture2DSubAssetWithSprite.userData.wrapModeS = texture2DSubAssetWithSprite.userData.wrapModeS || 'clamp-to-edge';
                texture2DSubAssetWithSprite.userData.wrapModeT = texture2DSubAssetWithSprite.userData.wrapModeT || 'clamp-to-edge';
                userData.redirect = texture2DSubAssetWithSprite.uuid;
                texture2DSubAssetWithSprite.userData.imageUuidOrDatabaseUri = asset.uuid;
                texture2DSubAssetWithSprite.userData.isUuid = true;
                texture2DSubAssetWithSprite.userData.visible = false;
                const textureSpriteFrameSubAsset = await asset.createSubAsset('spriteFrame', 'sprite-frame', {
                    displayName,
                });
                textureSpriteFrameSubAsset.assignUserData(
                    makeDefaultSpriteFrameAssetUserDataFromImageUuid(texture2DSubAssetWithSprite.uuid, ''),
                );
                textureSpriteFrameSubAsset.userData.imageUuidOrDatabaseUri = texture2DSubAssetWithSprite.uuid;
            }
            break;
    }
}

export async function converImage() { }

export async function openImageAsset(asset: Asset) {
    // TODO: 实现打开图片资产

    return false;
}
