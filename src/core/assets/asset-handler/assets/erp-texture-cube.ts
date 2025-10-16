'use strict';

import { queryAsset, VirtualAsset } from '@editor/asset-db';
import { applyTextureBaseAssetUserData } from './texture-base';
import { equirectToCubemapFaces, nearestPowerOfTwo } from './utils/equirect-cubemap-faces';
import * as cc from 'cc';
import { ISimpleLayout, matchSimpleLayout } from './utils/cube-map-simple-layout';

import sharp from 'sharp';
import { copyFileSync, existsSync, readFile } from 'fs-extra';
import { basename, dirname, join } from 'path';
import { ensureDirSync } from 'fs-extra';

import { getDependUUIDList } from '../utils';
import { AssetHandler } from '../../@types/protected';
import { TextureCubeAssetUserData } from '../../@types/userDatas';
import { makeDefaultTextureCubeAssetUserData } from './image/utils';
import { GlobalPaths } from '../../../../global';
import utils from '../../../base/utils';

type ITextureCubeMipMap = cc.TextureCube['mipmaps'][0];

type ITextureFaceMipMapData = Record<keyof ITextureCubeMipMap, Buffer>;
const verticalCount = 2;

interface IMipmapAtlasLayout {
    left: number;
    top: number;
    width: number;
    height: number;
    level: number;
}
/**
 * @en The way to fill mipmaps.
 * @zh 填充mipmaps的方式。
 */
export enum MipmapMode {
    /**
     * @zh
     * 不使用mipmaps
     * @en
     * Not using mipmaps
     * @readonly
     */
    NONE = 0,
    /**
     * @zh
     * 使用自动生成的mipmaps
     * @en
     * Using the automatically generated mipmaps
     * @readonly
     */
    AUTO = 1,
    /**
     * @zh
     * 使用卷积图填充mipmaps
     * @en
     * Filling mipmaps with convolutional maps
     * @readonly
     */
    BAKED_CONVOLUTION_MAP = 2,
}

export const ERPTextureCubeHandler: AssetHandler = {
    // Handler 的名字，用于指定 Handler as 等
    name: 'erp-texture-cube',
    assetType: 'cc.TextureCube',

    importer: {
        // 版本号如果变更，则会强制重新导入
        version: '1.0.10',
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
            }

            const userData = asset.userData as TextureCubeAssetUserData;

            const imageAsset = queryAsset(userData.imageDatabaseUri as string);
            if (!imageAsset) {
                return false;
            }
            let imageSource;
            // @ts-ignore parent
            const ext = asset.parent.extname?.toLowerCase();
            // image 导入器对这些类型进行了转换
            if (['.tga', '.hdr', '.bmp', '.psd', '.tif', '.tiff', '.exr'].includes(ext) || !ext) {
                imageSource = imageAsset.library + '.png';
            } else {
                imageSource = imageAsset.source;
            }

            // const imageSource = queryPath(userData.imageDatabaseUri as string);
            // if (!imageSource) {
            //     return false;
            // }

            const image = sharp(imageSource);
            const imageMetadata = await image.metadata();
            const width = imageMetadata.width!;
            const height = imageMetadata.height!;

            //need bakeOfflineMipmaps
            switch (asset.userData.mipBakeMode) {
                case MipmapMode.BAKED_CONVOLUTION_MAP: {
                    const file = asset.parent!.source;
                    let outWithoutExtname = join(asset.temp, 'mipmap');
                    const convolutionDir = getDirOfMipmaps(imageAsset.source, ext);
                    if (isNeedConvolution(convolutionDir)) {
                        const vectorParams = [
                            '--srcFaceSize',
                            '768',
                            '--mipatlas',
                            '--filter',
                            'radiance',
                            '--lightingModel',
                            'ggx',
                            '--excludeBase',
                            'true',
                            '--output0params',
                            userData.isRGBE ? 'png,rgbm,facelist' : 'png,bgra8,facelist', // LDR: 'png,bgra8,facelist', HDR: 'png,rgbm,facelist',
                            '--input',
                            file,
                            '--output0',
                            outWithoutExtname,
                        ];

                        if (userData.isRGBE && !['.hdr', '.exr'].includes(ext)) {
                            vectorParams.splice(0, 0, '--rgbm');
                        }

                        ensureDirSync(asset.temp);

                        console.log(`Start to bake asset {asset[${asset.uuid}](${asset.uuid})}`);

                        const cmdTool = join(GlobalPaths.staticDir, 'tools/cmft/cmftRelease64') + (process.platform === 'win32' ? '.exe' : '');
                        await utils.Process.quickSpawn(cmdTool, vectorParams, {
                            stdio: 'inherit',
                        });
                    } else {
                        outWithoutExtname = join(convolutionDir, 'mipmap');
                    }

                    const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
                    const mipmapAtlas: any = {};
                    const mipmapLayoutList = [];

                    const swapSpaceMip = asset.getSwapSpace<IFaceSwapSpace>();

                    for (let i = 0; i < faces.length; i++) {
                        // 6 个面的 atlas
                        const fileName = `${outWithoutExtname}_${i}.png`;
                        //拷贝mipmaps到project目录
                        saveMipmaps(fileName, convolutionDir);

                        const imageFace = sharp(fileName);
                        const imageFaceMetadata = await imageFace.metadata();
                        const width = imageFaceMetadata.width!;
                        mipmapLayoutList[i] = getMipmapLayout(width);

                        const faceName = faces[i];
                        const faceImageData = await imageFace.toFormat(sharp.format.png).toBuffer();
                        swapSpaceMip[faceName] = faceImageData;
                        const faceAsset = await asset.createSubAsset(faceName, 'texture-cube-face');
                        mipmapAtlas[faceName] = EditorExtends.serialize.asAsset(faceAsset.uuid, cc.ImageAsset);
                    }

                    const texture = new cc.TextureCube();
                    applyTextureBaseAssetUserData(userData, texture);
                    texture.isRGBE = userData.isRGBE;
                    texture._mipmapMode = MipmapMode.BAKED_CONVOLUTION_MAP as number;
                    texture._mipmapAtlas = {
                        atlas: mipmapAtlas,
                        layout: mipmapLayoutList[0],
                    };

                    const serializeJSON = EditorExtends.serialize(texture);
                    await asset.saveToLibrary('.json', serializeJSON);

                    const depends = getDependUUIDList(serializeJSON);
                    asset.setData('depends', depends);
                    return true;
                }
            }

            let mipmapData: ITextureFaceMipMapData;
            const simpleLayout = matchSimpleLayout(width, height);
            if (simpleLayout) {
                mipmapData = await _getFacesInSimpleLayout(imageSource, simpleLayout);
            } else {
                mipmapData = await _getFacesInEquirectangularProjected(
                    imageSource,
                    userData.faceSize === 0 ? undefined : userData.faceSize,
                    userData.isRGBE,
                );
            }

            const mipmap = {} as ITextureCubeMipMap;
            const swapSpace = asset.getSwapSpace<IFaceSwapSpace>();
            for (const faceName of Object.getOwnPropertyNames(mipmapData) as (keyof typeof mipmapData)[]) {
                const faceImageData = mipmapData[faceName];
                swapSpace[faceName] = faceImageData;
                const faceAsset = await asset.createSubAsset(faceName, 'texture-cube-face');
                // @ts-ignore
                mipmap[faceName] = EditorExtends.serialize.asAsset(faceAsset.uuid, cc.ImageAsset);
            }

            const texture = new cc.TextureCube();
            applyTextureBaseAssetUserData(userData, texture);
            texture.isRGBE = userData.isRGBE;
            texture._mipmaps = [mipmap];

            const serializeJSON = EditorExtends.serialize(texture);
            await asset.saveToLibrary('.json', serializeJSON);

            const depends = getDependUUIDList(serializeJSON);
            asset.setData('depends', depends);

            return true;
        },
    },
};

export default ERPTextureCubeHandler;

async function _getFacesInSimpleLayout(imageSource: string, layout: ISimpleLayout): Promise<ITextureFaceMipMapData> {
    const mipmapData = {} as ITextureFaceMipMapData;
    const faceNames = Object.getOwnPropertyNames(layout) as (keyof typeof layout)[];
    for (const faceName of faceNames) {
        // @ts-expect-error To keep consistent order
        mipmapData[faceName] = undefined;
    }
    await Promise.all(
        faceNames.map(async (faceName) => {
            const faceBlit = layout[faceName];
            // 最新版本 sharp 0.32.6 连续裁剪时使用同一个 image sharp 对象会裁剪异常，需要重新创建
            const image = sharp(imageSource);
            const faceSharp = image.extract({
                left: faceBlit.x,
                top: faceBlit.y,
                width: faceBlit.width,
                height: faceBlit.height,
            });
            const faceImageData = await faceSharp.toFormat(sharp.format.png).toBuffer();
            mipmapData[faceName] = faceImageData;
        }),
    );
    return mipmapData;
}

async function _getFacesInEquirectangularProjected(
    imageSource: string,
    faceSize: number | undefined,
    isRGBE: boolean | undefined,
): Promise<ITextureFaceMipMapData> {
    const buffer = await readFile(imageSource);
    const sharpResult = await sharp(buffer);
    const meta = await sharpResult.metadata();

    if (!faceSize) {
        faceSize = nearestPowerOfTwo((meta.width || 0) / 4) | 0;
    }

    // 分割图片
    const faceArray = await equirectToCubemapFaces(sharpResult, faceSize, {
        isRGBE,
    });
    if (faceArray.length !== 6) {
        throw new Error('Failed to resolve equirectangular projection image.');
    }
    // const faces = await Promise.all(faceArray.map(getCanvasData));
    return {
        right: await sharp(Buffer.from(faceArray[0].data), { raw: { width: faceSize, height: faceSize, channels: 4 } })
            .toFormat(meta.format || 'png')
            .toBuffer(),
        left: await sharp(Buffer.from(faceArray[1].data), { raw: { width: faceSize, height: faceSize, channels: 4 } })
            .toFormat(meta.format || 'png')
            .toBuffer(),
        top: await sharp(Buffer.from(faceArray[2].data), { raw: { width: faceSize, height: faceSize, channels: 4 } })
            .toFormat(meta.format || 'png')
            .toBuffer(),
        bottom: await sharp(Buffer.from(faceArray[3].data), { raw: { width: faceSize, height: faceSize, channels: 4 } })
            .toFormat(meta.format || 'png')
            .toBuffer(),
        front: await sharp(Buffer.from(faceArray[4].data), { raw: { width: faceSize, height: faceSize, channels: 4 } })
            .toFormat(meta.format || 'png')
            .toBuffer(),
        back: await sharp(Buffer.from(faceArray[5].data), { raw: { width: faceSize, height: faceSize, channels: 4 } })
            .toFormat(meta.format || 'png')
            .toBuffer(),
    };
}

function getTop(level: number, mipmapLayout: IMipmapAtlasLayout[]) {
    if (level == 0) {
        return 0;
    } else {
        return mipmapLayout.length > 0 ? mipmapLayout[0].height : 0;
    }
}
function getLeft(level: number, mipmapLayout: IMipmapAtlasLayout[]) {
    //前两张mipmap纵置布局
    if (level < verticalCount) {
        return 0;
    }
    let left = 0;
    for (let i = verticalCount - 1; i < mipmapLayout.length; i++) {
        if (i >= level) {
            break;
        }
        left += mipmapLayout[i].width;
    }
    return left;
}
/**
 * 计算约定好的mipmap布局，前两张mipmap纵向排列，后面接第二张横向排列。
 * @param size 是level 0的尺寸
 */
function getMipmapLayout(size: number) {
    const mipmapLayout: IMipmapAtlasLayout[] = [];
    let level = 0;
    while (size) {
        mipmapLayout.push({
            left: getLeft(level, mipmapLayout),
            top: getTop(level, mipmapLayout),
            width: size,
            height: size,
            level: level++,
        });
        size >>= 1;
    }
    return mipmapLayout;
}

/**
 * 获取mipmap的保存目录
 * 反射探针烘焙图的目录结构：场景名 + 文件名_convolution
 * 其他情况烘焙图的目录结构: 文件名 + _convolution
 */
function getDirOfMipmaps(filePath: string, ext: string) {
    const basePath = dirname(filePath);
    const baseName = basename(filePath, ext);
    return join(basePath, baseName + '_convolution');
}

/**
 * 如果project目录存有上次卷积的结果，无需再次做卷积以节省导入时间
 */
function isNeedConvolution(convolutionDir: string) {
    if (!existsSync(convolutionDir)) {
        return true;
    }
    const faceCount = 6;
    for (let i = 0; i < faceCount; i++) {
        const filePath = join(convolutionDir, 'mipmap_' + i.toString() + '.png');
        if (!existsSync(filePath)) {
            return true;
        }
    }
    return false;
}

/**
 * 保存卷积工具生成的mipmaps
 */
function saveMipmaps(filePath: string, destPath: string) {
    if (!existsSync(destPath)) {
        ensureDirSync(destPath);
    }
    copyFileSync(filePath, join(destPath, basename(filePath)));
}

export interface IFaceSwapSpace {
    [faceName: string]: Buffer;
}

export function checkSize(width: number, height: number) {
    return width * 4 === height * 3 || width * 3 === height * 4 || width * 6 === height || width === height * 6 || width === height * 2;
}

// async function getCanvasData(canvas: HTMLCanvasElement) {
//     const blob = await new Promise((resolve: (blob: Blob) => void, reject) => {
//         canvas.toBlob((blob) => {
//             if (blob) {
//                 resolve(blob);
//             } else {
//                 reject(blob);
//             }
//         });
//     });
//     const arrayBuffer = await new Response(blob).arrayBuffer();
//     return Buffer.from(arrayBuffer);
// }
