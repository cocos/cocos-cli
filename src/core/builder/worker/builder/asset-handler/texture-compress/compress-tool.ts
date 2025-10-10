import { existsSync, ensureDirSync } from 'fs-extra';
import { dirname } from 'path';
import * as Path from 'path';
import { roundToPowerOfTwo } from './utils';
import { quickSpawn } from '../../utils';
import i18n from '../../../../../base/i18n';
import { ICompressConfig, ITextureCompressType } from '../../../../@types';
import { GlobalPaths } from '../../../../../../global';
import utils from '../../../../../base/utils';
import { BuildGlobalInfo } from '../../../../share/builder-config';
const Sharp = require('sharp');

/**
 * 压缩 jpg png
 * @param {string} option 参数
 * @param {object} format 图片格式类型以及对应质量
 */
export async function compressJpgAndPng(option: ICompressConfig) {
    return new Promise<void>((resolve, reject) => {
        let img = Sharp(option.src);
        if (option.format === 'png') {
            img = img.png({
                quality: option.compressOptions.quality || 100,
            });
        } else {
            img = img.jpeg({
                quality: option.compressOptions.quality || 100,
            });
        }
        // 工具可能不会自动生成输出目录文件夹
        ensureDirSync(dirname(option.dest));
        img.toFile(option.dest)
            .then(() => {
                resolve();
            })
            .catch((err: Error) => {
                reject(err);
            });
    });
}

/**
 * 压缩 webp 格式图片
 * @param {string} option
 * @param {object} format
 */
export async function compressWebp(option: ICompressConfig) {
    const { src, dest, format, compressOptions } = option;
    // 工具可能不会自动生成输出目录文件夹
    ensureDirSync(dirname(dest));
    console.debug('start compress webp', src, dest, format);
    let webpTool = Path.join(GlobalPaths.staticDir, 'tools/libwebp_darwin/bin/cwebp');
    if (process.platform === 'win32') {
        webpTool = Path.join(GlobalPaths.staticDir, 'libwebp_win32/bin/cwebp.exe');
    }
    const args = [src, '-o', dest, '-q', String(compressOptions.quality), '-quiet', '-exact'];
    console.debug(`webp compress command : ${webpTool} ${args.join(' ')}`);
    await quickSpawn(webpTool, args, {
        prefix: '[compress webp]',
    });
    console.log('compress webp success ' + `{link(${dest})}`);
}

/**
 * 压缩 pvr 类型图片
 * @param {*} option
 * @param {*} format
 */
export async function compressPVR(option: ICompressConfig) {
    console.debug('start compress pvr', option);
    let src = option.src;
    if (option.format.endsWith('rgb_a')) {
        const tempDest = Path.join(BuildGlobalInfo.projectTempDir, 'builder', 'CompressTexture', 'pvr_alpha', option.uuid + Path.extname(src));
        await createAlphaAtlas(src, tempDest);
        src = tempDest;
    }
    const { dest, format, compressOptions } = option;
    // 工具可能不会自动生成输出目录文件夹
    ensureDirSync(dirname(dest));
    // https://github.com/cocos/cocos-editor/pull/1046
    // PVR 升级的已知问题：ios 上似乎会出现渲染效果异常？？暂不确定
    // https://docs.imgtec.com/tools-manuals/pvrtextool-manual/html/topics/cli/command-line-options.html#encode-format-desc
    let pvrTool = Path.join(GlobalPaths.staticDir, 'tools/PVRTexTool_darwin/PVRTexToolCLI');
    if (process.platform === 'win32') {
        pvrTool = Path.join(GlobalPaths.staticDir, 'tools/PVRTexTool_win32/PVRTexToolCLI.exe');
    }

    const compressFormatMap: Record<string, string> = {
        pvrtc_4bits_rgba: 'PVRTC1_4',
        pvrtc_4bits_rgb: 'PVRTC1_4_RGB',
        pvrtc_4bits_rgb_a: 'PVRTC1_4_RGB',
        pvrtc_2bits_rgba: 'PVRTC1_2',
        pvrtc_2bits_rgb: 'PVRTC1_2_RGB',
        pvrtc_2bits_rgb_a: 'PVRTC1_2_RGB',
    };

    // 根据 option.format 转换格式
    const compressFormat = compressFormatMap[format];
    if (!compressFormat) {
        console.error(`Invalid pvr compress format ${format}`);
        return;
    }

    const quality = 'pvrtc' + compressOptions.quality;
    const pvrOpts = [
        '-i',
        src,
        '-o',
        dest,

        // xx 的扩张方式是采用拉伸的方式对图片进行重置的
        // '-square', '+',
        // '-pot', '+',

        // xxcanvas 的扩张方式是采用留白的方式对图片进行重置的
        // 因为 sprite frame 的 rect 也是按照像素来存储的，所以用留白的方式更友好
        '-squarecanvas',
        '+',
        '-potcanvas',
        '+',

        '-q',
        quality,
        '-f',
        `${compressFormat},UBN,lRGB`,
    ];

    console.debug(`pvrtc compress command :  ${pvrTool} ${pvrOpts.join(' ')}`);

    // 目前 pvrtc 生成图片会默认输出到 stderr 内，需要使用 debug 输出 stderr
    await quickSpawn(pvrTool, pvrOpts, {
        downGradeWaring: true,
        downGradeLog: true,
        // 这个工具的默认输出都在 stderr 里
        ignoreError: true,
        downGradeError: true,
        prefix: '[compress pvrtc]',
    });
    if (existsSync(dest)) {
        console.log('compress pvrtc success ' + `{link(${dest})}`);
    } else {
        console.error(i18n.t('builder.error.texture_compress_failed', {
            type: format,
            asset: `{asset(${option.uuid})}`,
            toolsPath: `{file(${pvrTool})}`,
            toolHomePage: 'https://developer.imaginationtech.com/pvrtextool/',
        }));
    }
}

/**
 * 压缩 etc 类型图片
 * @param option
 * @param format
 */
export async function compressEtc(option: ICompressConfig) {
    const { dest, format, compressOptions, uuid } = option;
    console.debug('start compress etc', option.src, dest, format);
    let src = option.src;
    // 工具可能不会自动生成输出目录文件夹
    ensureDirSync(dirname(dest));
    if (format.endsWith('rgb_a')) {
        // 理论上同一资源的 alpha 贴图可以复用，且应该走 getAssetTempDirByUuid 使用缓存即可，但由于这个工具需要单独可以走测试例试，所以暂时先不走通用地址
        // 理论上 etc 和 pvr 的 alpha 贴图也可以复用，但由于可能存在并发的权限问题，暂不复用
        // NOTE: 注意，这里的图片名称必须和 dest 保持一致，因为此压缩工具压缩出来的结果无法改变图片名称
        const tempDest = Path.join(BuildGlobalInfo.projectTempDir, 'builder', 'CompressTexture', 'etc_alpha', uuid, Path.basename(dest, Path.extname(dest)) + Path.extname(src));
        await createAlphaAtlas(src, tempDest);
        src = tempDest;
    }

    let etcTool = Path.join(GlobalPaths.staticDir, 'tools/mali_darwin/etcpack');
    if (process.platform === 'win32') {
        etcTool = Path.join(GlobalPaths.staticDir, 'tools/mali_win32/etcpack.exe');
    }

    const toolDir = Path.dirname(etcTool);
    etcTool = '.' + Path.sep + Path.basename(etcTool);

    const compressFormatMap: Record<string, any> = {
        etc1_rgb: {
            etcFormat: 'etc1',
            compressFormat: 'RGB',
        },
        etc1_rgb_a: {
            etcFormat: 'etc1',
            compressFormat: 'RGB',
        },
        etc2_rgba: {
            etcFormat: 'etc2',
            compressFormat: 'RGBA',
        },
        etc2_rgb: {
            etcFormat: 'etc2',
            compressFormat: 'RGB',
        },
    };

    const { etcFormat, compressFormat } = compressFormatMap[format];

    const args = [Path.normalize(src), Path.dirname(dest), '-c', etcFormat, '-s', compressOptions.quality];

    // windows 中需要进入到 toolDir 去执行命令才能成功
    const cwd = toolDir;

    const env = Object.assign({}, process.env);
    // convert 是 imagemagick 中的一个工具
    // etcpack 中应该是以 'convert' 而不是 './convert' 来调用工具的，所以需要将 toolDir 加到环境变量中
    // toolDir 需要放在前面，以防止系统找到用户自己安装的 imagemagick 版本
    env.PATH = toolDir + ':' + env.PATH;

    const opts = {
        cwd: cwd,
        env: env,
        prefix: '[compress etc]',
    };

    if (etcFormat === 'etc2') {
        args.push('-f', compressFormat);
    }

    console.debug(`etc compress command :  ${etcTool} ${args.join(' ')}`);
    await quickSpawn(etcTool, args, opts);
    if (existsSync(dest)) {
        console.log('compress etc success ' + `{link(${dest})}`);
    } else {
        console.error(i18n.t('builder.error.texture_compress_failed', {
            type: format,
            asset: `{asset(${uuid})}`,
            toolsPath: `{file(${etcTool})}`,
            toolHomePage: 'https://imagemagick.org/script/command-line-processing.php',
        }));
    }
}

/**
 * 压缩 astc 类型图片
 * @param format
 */
export async function compressAstc(option: ICompressConfig) {

    const { src, dest, format, compressOptions } = option;
    console.debug('start compress astc', src, dest, format);
    // 工具可能不会自动生成输出目录文件夹
    ensureDirSync(dirname(dest));
    // 参考：https://github.com/cocos-creator/3d-tasks/issues/6855
    // https://github.com/ARM-software/astc-encoder
    let astcTool = Path.join(GlobalPaths.staticDir, 'tools/astc-encoder/astcenc');
    if (process.platform === 'win32') {
        astcTool = Path.join(GlobalPaths.staticDir, 'tools/astc-encoder/astcenc.exe');
    }

    const compressFormatMap: Record<string, string> = {
        astc_4x4: '4x4',
        astc_5x5: '5x5',
        astc_6x6: '6x6',
        astc_8x8: '8x8',
        astc_10x5: '10x5',
        astc_10x10: '10x10',
        astc_12x12: '12x12',
    };

    const compressFormat = compressFormatMap[format];

    if (compressOptions.quality === 'veryfast') {
        compressOptions.quality = 'fastest';
    }

    const astcOpts = ['-cl', src, dest, compressFormat, `-${compressOptions.quality}`];

    console.debug(`astc compressed command: ${Path.basename(astcTool)} ${astcOpts.join(' ')}`);

    await quickSpawn(astcTool, astcOpts, {
        prefix: '[compress astc]',
    });
    // 目前有遇到偶现的在机子上生成 astc 失败，但是没有错误输出的情况，需要做一次检查错误提示
    if (existsSync(dest)) {
        console.log('Compress astc success ' + `{link(${dest})}`);
    } else {
        console.error(i18n.t('builder.error.texture_compress_failed', {
            type: format,
            asset: `{asset(${option.uuid})}`,
            toolsPath: `{file(${astcTool})}`,
            toolHomePage: 'https://github.com/ARM-software/astc-encoder',
        }));
    }
}

/**
 * 根据图片类型获取压缩函数
 * @param format
 */
export function getCompressFunc(format: ITextureCompressType) {
    const start = format.slice(0, 3);
    switch (start) {
        case 'jpg':
        case 'png':
            return compressJpgAndPng;
        case 'pvr':
            return compressPVR;
        case 'etc':
            return compressEtc;
        case 'web':
            return compressWebp;
        case 'ast':
            return compressAstc;
    }
}

function patchCommand(command: string, options: any): string {
    return new Function('options', 'with(options){ return String.raw`' + command + '`}')(options);
}

export async function compressCustomFormat(config: ICompressConfig) {
    const { src, dest, compressOptions } = config;
    const { command, path } = config.customConfig!;
    const rawPath = utils.Path.resolveToRaw(path);
    const toolDir = Path.dirname(rawPath);
    const opts = {
        cwd: toolDir,
        prefix: '[custom compress]',
    };
    const newCommand = patchCommand(command, {
        ...compressOptions,
        src,
        dest,
    });
    const params = newCommand.split(' ').filter((val) => !!val);
    console.debug(`custom compress command : ${rawPath} ${newCommand}`);
    await quickSpawn(rawPath, params, opts);

}

// 为 pvr 创建一张 rgb atlas 贴图
// 贴图的上半部分存原图的 rgb 值，下半部存原图的 alpha 值
async function createAlphaAtlas(src: string, dest: string) {
    const image = new Sharp(src);
    const metaData = await image.metadata();
    const width = metaData.width;
    const height = metaData.height;

    // pvr 格式需要长宽为 2 的次幂，并且需要为正方形
    // 要正确计算出下半部分的起始值需要提前算好正方形 2 次幂的值
    const resizedWidth = roundToPowerOfTwo(width);
    let resizedHeight = roundToPowerOfTwo(height);

    if (resizedHeight < resizedWidth / 2) {
        resizedHeight = resizedWidth / 2;
    }

    const inputData = await image.raw().toBuffer();
    const channels = 3;
    const rgbPixel = 0x000000;
    const outputSize = width * 2 * resizedHeight * channels;
    const outputData = Buffer.alloc(outputSize, rgbPixel);

    let outputIndex;
    let outputAlphaIndex;
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            // 设置 rgb 值到上半部分
            const index = row * width + col;
            const inputIndex = index * 4;
            outputIndex = index * 3;
            outputData[outputIndex] = inputData[inputIndex];
            outputData[outputIndex + 1] = inputData[inputIndex + 1];
            outputData[outputIndex + 2] = inputData[inputIndex + 2];

            // 设置 alpha 值到下半部分
            outputAlphaIndex = ((row + resizedHeight) * width + col) * 3;
            const alpha = inputIndex + 3;
            outputData[outputAlphaIndex] = inputData[alpha];
            outputData[outputAlphaIndex + 1] = inputData[alpha];
            outputData[outputAlphaIndex + 2] = inputData[alpha];
        }
    }
    const opts = { raw: { width, height: resizedHeight * 2, channels } };
    ensureDirSync(Path.dirname(dest));
    await Sharp(outputData, opts).toFile(dest);
}
