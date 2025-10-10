import * as Path from 'path';
import i18n from '../../../../../base/i18n';
import { ITextureFormatInfo } from '../../../../@types';

export function changeSuffix(path: string, suffix: string) {
    return Path.join(Path.dirname(path), Path.basename(path, Path.extname(path)) + suffix);
}

export function getSuffix(formatInfo: ITextureFormatInfo, suffix: string) {
    const PixelFormat = cc.Texture2D.PixelFormat;
    if (formatInfo.formatSuffix && PixelFormat[formatInfo.formatSuffix]) {
        suffix += `@${PixelFormat[formatInfo.formatSuffix]}`;
    }
    return suffix;
}

// 谷歌统计的通用数据格式
export function changeInfoToLabel(info: Record<string, any>) {
    return Object.keys(info).map((key) => `${key}:${info[key]}`).join(',');
}

export function roundToPowerOfTwo(value: number) {
    let powers = 2;
    while (value > powers) {
        powers *= 2;
    }

    return powers;
}

/**
 * 根据当前图片是否带有透明通道过滤掉同类型的不推荐的格式
 * 如果同类型图片只有一种配置，则不作过滤处理
 * @param compressOptions
 * @param hasAlpha
 */
export function checkCompressOptions(compressOptions: Record<string, any>, hasAlpha: boolean, uuid: string) {
    const etcArr = Object.keys(compressOptions).filter((format) => format.startsWith('etc'));
    const pvrArr = Object.keys(compressOptions).filter((format) => format.startsWith('pvr'));
    if (etcArr.length > 1) {
        const invalidFormats = etcArr.filter((format) => (hasAlpha ? format.endsWith('rgb') : !format.endsWith('rgb')));
        invalidFormats.forEach((format) => delete compressOptions[format]);
    }
    if (pvrArr.length > 1) {
        const invalidFormats = pvrArr.filter((format) => (hasAlpha ? format.endsWith('rgb') : !format.endsWith('rgb')));
        invalidFormats.forEach((format) => delete compressOptions[format]);
    } else if (!hasAlpha && pvrArr[0] && pvrArr[0].endsWith('rgb_a')) {
        // 不带透明度的图压缩成 rgb_a 需要过滤掉报警告，否则压缩后会失败报错
        // https://github.com/cocos-creator/3d-tasks/issues/5298
        delete compressOptions[pvrArr[0]];
        console.warn(i18n.t('builder.warn.compress_rgb_a', {
            uuid: `{asset(${uuid})}`,
        }));
    }
}