import { existsSync } from 'fs';
import { relative } from 'path';
import utils from '../../../base/utils';

export async function getPreviewUrl(dest: string) {
    const rawPath = utils.Path.resolveToRaw(dest);
    if (!existsSync(rawPath)) {
        throw new Error(`Build path not found: ${dest}`);
    }
    const serverService = (await import('../../../../server/server')).serverService;

    const relativePath = relative(utils.Path.resolveToRaw('project://build'), rawPath);
    return serverService.url + '/build/' + relativePath + '/index.html';
}

export async function run(dest: string) {
    const url = await getPreviewUrl(dest);
    // 打开浏览器
    try {
        const { exec } = require('child_process');
        const platform = process.platform;

        let command: string;
        switch (platform) {
            case 'win32':
                command = `start ${url}`;
                break;
            case 'darwin':
                command = `open ${url}`;
                break;
            case 'linux':
                command = `xdg-open ${url}`;
                break;
            default:
                console.log(`请手动打开浏览器访问: ${url}`);
                return url;
        }

        exec(command, (error: any) => {
            if (error) {
                console.error('打开浏览器失败:', error.message);
                console.log(`请手动打开浏览器访问: ${url}`);
            } else {
                console.log(`正在浏览器中打开: ${url}`);
            }
        });
    } catch (error) {
        console.error('打开浏览器时发生错误:', error);
        console.log(`请手动打开浏览器访问: ${url}`);
    }
    return url;
}