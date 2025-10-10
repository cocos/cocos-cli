import { ensureDirSync } from 'fs-extra';
import { join } from 'path';
import { buildTempDir } from './config';
import { AtlasInfo, PacInfo, SpriteFrameInfo } from './pac-info';
import { IInternalPackOptions, IPackResult, IPackOptions } from '../../../../@types/protected';

const Algorithm = require('./algorithm');
const Sharp = require('sharp');

const applyBleed = require('./bleeding').applyBleed;

export async function packer(spriteFrameInfos: SpriteFrameInfo[], packOptions: IInternalPackOptions): Promise<IPackResult> {

    // 超出了 AtlasInfo 的最大宽或高而无法打包的 SpriteFrame
    const filterResult = filterUnpacked(spriteFrameInfos);
    console.debug(`Start trim sprite image ...`);
    await trimImages(filterResult.result);
    console.debug('determine atlas size...');

    const deterResult = determineAtlasSize(filterResult.result, packOptions);
    const unpackedImages = Array.from(filterResult.unpackedImages.concat(deterResult.unpackedImages));
    console.debug('Start generate atlas image...');
    await Promise.all(
        deterResult.packAtlas.map((atlas) => {
            return generateAtlas(atlas, packOptions);
        }),
    );
    return {
        atlases: deterResult.packAtlas.map((atlas) => atlas.toJSON()),
        unpackedImages: unpackedImages.map((asset) => {
            return {
                imageUuid: asset.uuid,
                libraryPath: asset._file,
            };
        }),
        pacUuid: spriteFrameInfos[0]._pacUuid,
    };
}

function determineAtlasSize(spriteFrameInfos: SpriteFrameInfo[], options: IInternalPackOptions) {
    // 先拷贝一份新数组
    const inputs = spriteFrameInfos.concat();
    const packAtlas = [];
    let unpackedImages: SpriteFrameInfo[] = [];
    let packingFunc = Algorithm[options.algorithm];
    if (!packingFunc) {
        console.warn(`determineAtlasSize failed: Can not find algorithm ${options.algorithm}, use MaxRects`);
        packingFunc = Algorithm.MaxRects;
    }
    const maxWidth = options.maxWidth;
    const maxHeight = options.maxHeight;
    const allowRotation = options.allowRotation;

    // 多张碎图无法放进图集内时，自动生成多个图集
    let n = 0;
    while (inputs.length > 0) {
        const packedSprites = packingFunc(inputs, maxWidth, maxHeight, allowRotation);

        if (packedSprites.length === 0) {
            unpackedImages = unpackedImages.concat(inputs);
            break;
        }

        packedSprites.forEach((rect: any) => {
            inputs.splice(inputs.indexOf(rect), 1);
        });

        let width = 0;
        let height = 0;

        // tslint:disable-next-line: prefer-for-of
        for (let i = 0; i < packedSprites.length; i++) {
            const item = packedSprites[i];

            item.rotatedWidth = item.rotated ? item.height : item.width;
            item.rotatedHeight = item.rotated ? item.width : item.height;

            item.trim.rotatedWidth = item.rotated ? item.trim.height : item.trim.width;
            item.trim.rotatedHeight = item.rotated ? item.trim.width : item.trim.height;

            const right = item.x + item.rotatedWidth;
            const top = item.y + item.rotatedHeight;

            if (right > width) {
                width = right;
            }
            if (top > height) {
                height = top;
            }
        }
        const name = options.name + '-' + n;
        n++;
        const imagePath = join(options.destDir, name + '.' + options.format);
        packAtlas.push(new AtlasInfo(packedSprites, width, height, name, imagePath));
    }

    // square and powerOfTwo options here
    packAtlas.forEach((atlas: AtlasInfo) => {
        applySquareAndPowerConstraints(atlas, options.forceSquared, options.powerOfTwo);

        atlas.spriteFrameInfos.forEach((item: any) => {
            item.trim.x = item.x + options.padding + options.bleed;
            item.trim.y = item.y + options.padding + options.bleed;
        });
    });
    return {
        packAtlas,
        unpackedImages,
    };
}

function applySquareAndPowerConstraints(options: any, square: boolean, powerOfTwo: boolean) {
    if (square) {
        options.width = options.height = Math.max(options.width, options.height);
    }
    if (powerOfTwo) {
        options.width = roundToPowerOfTwo(options.width);
        options.height = roundToPowerOfTwo(options.height);
    }
}

function roundToPowerOfTwo(num: number): number {
    if (typeof num !== 'number') {
        return 0;
    }
    let powers = 2;
    while (num > powers) {
        powers *= 2;
    }
    return powers;
}

/**
 * 过滤无法直接打包的资源信息
 * @param spriteFrameInfos
 */
function filterUnpacked(spriteFrameInfos: SpriteFrameInfo[]) {
    const unpackedImages: SpriteFrameInfo[] = [];
    const result = spriteFrameInfos.filter((spriteFrameInfos) => {
        if (spriteFrameInfos.trim.width > 0 && spriteFrameInfos.trim.height > 0) {
            return true;
        }

        spriteFrameInfos.width = spriteFrameInfos.rawWidth;
        spriteFrameInfos.height = spriteFrameInfos.rawHeight;
        unpackedImages.push(spriteFrameInfos);
        return false;
    });
    return { unpackedImages, result };
}

/**
 * 生成合图
 * @param atlas
 * @param options
 */
async function generateAtlas(atlas: AtlasInfo, options: IPackOptions) {
    const spriteFrameInfos = atlas.spriteFrameInfos;
    const width = atlas.width;
    const height = atlas.height;
    const channels = 4;
    const opts = { raw: { width, height, channels } };

    let atlasImage = await Sharp({
        create: {
            width,
            height,
            channels,
            background: { r: 0, b: 0, g: 0, alpha: 0 },
        },
    }).toBuffer();

    const batchMemLimited = 2 * 1024 * 1024;
    let batchMem = 0;
    // 批量 sharp 处理限制数量，避免内存过大导致编辑器崩溃
    const batchCountLimited = 100;
    let batchCount = 0;
    let compositeInputs: any[] = [];

    for (let i = 0; i < spriteFrameInfos.length; i++) {
        const spriteImage = spriteFrameInfos[i];
        const x = spriteImage.trim.x;
        const y = spriteImage.trim.y;
        const width = spriteImage.trim.width;
        const height = spriteImage.trim.height;

        batchMem += width * height * channels;
        batchCount++;

        try {
            if (batchMem >= batchMemLimited || batchCount >= batchCountLimited) {
                atlasImage = await Sharp(atlasImage, opts)
                    .composite(compositeInputs)
                    .toBuffer();
                compositeInputs = [];
                batchMem = 0;
                batchCount = 0;
            }

            let sharp = Sharp(spriteImage._libraryPath);
            if (spriteImage.rotated) {
                sharp = sharp.rotate(90);
            }
            const buffer = await sharp.toBuffer();
            compositeInputs.push({
                input: buffer,
                left: x,
                top: y,
            });
        } catch (error: any) {
            console.error(
                `Handle image [${spriteImage._libraryPath} error]. \n Origin path is [${spriteImage.originalPath}:${spriteImage.name
                }]. \n Error : ${error.toString()}`,
            );
            continue;
        }
    }
    atlasImage = await Sharp(atlasImage, opts)
        .composite(compositeInputs)
        .toBuffer();
    if (options.contourBleed || options.paddingBleed) {
        applyBleed(options, atlas, atlasImage, atlasImage);
    }

    await Sharp(atlasImage, opts).png().toFile(atlas.imagePath);
}

/**
 * 根据图片设置裁剪图片
 * @param spriteFrameInfos
 */
async function trimImages(spriteFrameInfos: SpriteFrameInfo[]) {
    const trimTempDir = join(buildTempDir, 'trimImages');
    ensureDirSync(trimTempDir);
    // 将图片裁剪一遍
    await Promise.all(
        spriteFrameInfos.map((spriteFrameInfo, index) => {
            spriteFrameInfo.originalPath = spriteFrameInfo._libraryPath;
            spriteFrameInfo._libraryPath = join(trimTempDir, 'spritesheet_js_' + spriteFrameInfo.uuid + '_image_' + index++ + '.png');
            const trim = spriteFrameInfo.trim;

            const image = Sharp(spriteFrameInfo.originalPath).extract({
                left: trim.x,
                top: trim.y,
                width: trim.rotatedWidth,
                height: trim.rotatedHeight,
            });
            // TODO 原本使用 spriteFrameInfo.spriteFrame.rotated 需要确认是否保持一致
            if (spriteFrameInfo.rotated) {
                image.rotate(270);
            }
            return image.toFile(spriteFrameInfo._libraryPath).catch((err: Error) => {
                console.error(`trimImages(${spriteFrameInfo.originalPath}) failed!`);
                throw err;
            });
        }),
    );
}
