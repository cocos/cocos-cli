'use strict';

import { join, dirname, basename, extname, sep, normalize } from 'path';

import { PNG } from 'pngjs';
import TGA from 'tga-js';
import { readFile, ensureDirSync, existsSync } from 'fs-extra';
import PSD from 'psd.js';
import Sharp from 'sharp';
import { GlobalPaths } from '../../../../../global';
import utils from '../../../../base/utils';

export async function convertTGA(data: Buffer): Promise<{ extName: string; data: Buffer }> {
    const tga = new TGA();
    tga.load(data);
    const imageData = tga.getImageData();
    const png = new PNG({ width: imageData.width, height: imageData.height });
    png.data = Buffer.from(imageData.data);
    return await savePNGObject(png);
}

export async function convertImageToHDR(file: string, uuid: string, temp: string) {
    // const output = join(temp, uuid + '.hdr');
    const output = join(temp, uuid + '.hdr');
    ensureDirSync(dirname(output));

    // https://github.com/ImageMagick/ImageMagick
    let convertTool = join(GlobalPaths.staticDir, 'tools/mali_darwin/convert');
    if (process.platform === 'win32') {
        convertTool = join(GlobalPaths.staticDir, 'tools/mali_win32/convert.exe');
    }
    const toolDir = dirname(convertTool);
    convertTool = '.' + sep + basename(convertTool);
    const env = Object.assign({}, process.env);
    // convert 是 imagemagick 中的一个工具
    // etcpack 中应该是以 'convert' 而不是 './convert' 来调用工具的，所以需要将 toolDir 加到环境变量中
    // toolDir 需要放在前面，以防止系统找到用户自己安装的 imagemagick 版本
    env.PATH = toolDir + ':' + env.PATH;
    await utils.Process.quickSpawn(convertTool, [normalize(file), normalize(output)], {
        // windows 中需要进入到 toolDir 去执行命令才能成功
        cwd: toolDir,
        env: env,
    });

    return {
        extName: '.hdr',
        source: output,
    };
}

export async function convertPSD(data: Buffer): Promise<{ extName: string; data: Buffer }> {
    const psd = new PSD(data);
    psd.parse();
    const png = psd.image.toPng();
    return savePNGObject(png);
}

export async function convertTIFF(file: string) {
    return new Promise<{ extName: string; data: Buffer }>((resolve, reject) => {
        Sharp(file)
            .png()
            .toBuffer()
            .then((data: Buffer) => {
                resolve({
                    extName: '.png',
                    data,
                });
            })
            .catch((err) => reject(err));
    });
}

async function savePNGObject(png: PNG) {
    return new Promise<{ extName: string; data: Buffer }>((resolve, reject) => {
        const buffer: Buffer[] = [];
        png.on('data', (data: Buffer) => {
            buffer.push(data);
        });
        png.on('end', () => {
            resolve({
                extName: '.png',
                data: Buffer.concat(buffer as Uint8Array[]),
            });
        });
        png.on('error', (err) => {
            reject(err);
        });
        png.pack();
    });
}

export async function convertHDROrEXR(extName: string, source: string, uuid: string, temp: string) {
    console.debug(`Start to convert asset {asset[${uuid}](${uuid})}`);
    const dist = join(temp, uuid);
    ensureDirSync(temp);
    if (extName === '.hdr') {
        return await convertWithCmft(source, dist);
    } else if (extName === '.exr') {
        // 先尝试使用 cmft
        try {
            return await convertWithCmft(source, dist, '_withexr');
        } catch (error) {
            // 如果使用 cmft 直接转失败，则先转 hdr 再使用 cmft 处理
            const res = await convertImageToHDR(source, uuid, temp);
            return await convertWithCmft(res.source, dist);
        }
    }
}

// 兼容旧接口
export async function convertHDR(source: string, uuid: string, temp: string) {
    console.debug(`Start to convert asset {asset[${uuid}](${uuid})}`);
    const dist = join(temp, uuid);
    ensureDirSync(temp);
    return await convertWithCmft(source, dist);
}

export async function convertWithCmft(file: string, dist: string, version = ''): Promise<{ extName: string; source: string }> {
    // https://github.com/dariomanesku/cmft
    let tools = join(GlobalPaths.staticDir, `tools/cmft/cmftRelease64${version}${process.platform === 'win32' ? '.exe' : ''}`);
    if (!existsSync(tools)) {
        tools = join(GlobalPaths.staticDir, `tools/cmft/cmftRelease64${process.platform === 'win32' ? '.exe' : ''}`);
    }
    await utils.Process.quickSpawn(tools, [
        '--bypassoutputtype',
        '--output0params',
        'png,rgbm,latlong',
        '--input',
        file,
        '--output0',
        dist,
    ]);
    console.debug(`Convert asset${file} -> PNG success.`);
    return {
        extName: '.png',
        source: dist + '.png',
    };
}
