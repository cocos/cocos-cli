'use strict';
/**
 * 工具函数，不可引用一些特殊进程的全局变量或者特殊模块
 */
import { basename, dirname, extname, join } from 'path';
import { existsSync, ensureDirSync, readFileSync } from 'fs-extra';
import i18n from '../../../../../base/i18n';
import { ICompressConfig } from '../../../../@types';

const Sharp = require('sharp');

export function isPowerOfTwo(num: number) {
    return num > 0 && (num & (num - 1)) == 0;
}

// TODO 此方法从引擎处拷贝，如有修改需要同步，否则相关功能会有异常
export function getMipLevel(width: number, height: number) {
    let size = Math.max(width, height);
    let level = 0;
    while (size) { size >>= 1; level++; }
    return level;
}

export async function genMipmapFiles(file: string, destDir?: string, forceChangeToPowerOfTwo?: boolean) {
    const sharpResult = Sharp(file);
    const metaData = await sharpResult.metadata();
    if (!isPowerOfTwo(metaData.width) || !isPowerOfTwo(metaData.height)) {
        throw new Error(i18n.t('builder.project.texture_compress.mipmap.noPowerOfTwo'));
        // TODO forceChangeToPowerOfTwo
    }
    let width = metaData.width;
    let height = metaData.height;
    destDir = destDir || dirname(file);
    const extName = extname(file);
    const name = basename(file, extName);
    const fileRes: string[] = [];
    const mipLevel = getMipLevel(width, height);
    for (let i = mipLevel; i > 0; i--) {
        // 最小一像素
        if (width === 1 && height === 1) {
            break;
        }
        width = Math.max(width / 2, 1);
        height = Math.max(height / 2, 1);
        const dest = join(destDir, 'mipmaps', `${name}@mipmap_${i - 1}${extName}`);
        fileRes.push(dest);
        if (existsSync(dest)) {
            continue;
        }
        ensureDirSync(dirname(dest));
        await sharpResult.resize(width, height).toFile(dest);
    }
    // 降序写入
    return fileRes;
}

export function checkHasMipMaps(meta: any): boolean {
    let mipfilter;
    if (meta.subMetas['6c48a']) {
        mipfilter = meta.subMetas['6c48a'].userData.mipfilter;
    } else if (meta.userData.textureSetting) {
        mipfilter = meta.userData.textureSetting.mipfilter;
    }
    if (['nearest', 'linear'].includes(mipfilter)) {
        return true;
    }
    return false;
}

export async function compressMipmapFiles(optionItem: ICompressConfig, compressFunc: Function): Promise<Buffer[]> {
    if (!optionItem.mipmapFiles || !optionItem.mipmapFiles.length || ['png', 'jpg', 'webp'].includes(optionItem.format)) {
        return [];
    }
    console.debug(`Start merge mipmaps file of asset ${optionItem.uuid}`);
    const res: Buffer[] = [];
    for (let i = 0; i < optionItem.mipmapFiles.length; i++) {
        const file = optionItem.mipmapFiles[i];
        const dest = join(dirname(optionItem.dest), 'mipmaps', basename(file, extname(file)) + extname(optionItem.dest));
        await compressFunc!({
            ...optionItem,
            src: file,
            dest,
        });
        res.push(readFileSync(dest));
    }
    console.debug(`Merge mipmaps file of asset ${optionItem.uuid} success`);
    return res;
}
