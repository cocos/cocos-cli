import { existsSync } from 'fs';
import { join, relative } from 'path';
import utils from '../../../base/utils';
import { BuildGlobalInfo } from '../../share/builder-config';
import { GlobalConfig } from '../../../../global';

export async function getPreviewUrl(dest: string) {
    const rawPath = utils.Path.resolveToRaw(dest);
    if (!existsSync(rawPath)) {
        throw new Error(`Build path not found: ${dest}`);
    }
    const serverService = (await import('../../../../server/server')).serverService;
    const buildRoot = join(BuildGlobalInfo.projectRoot, 'build');
    const relativePath = relative(buildRoot, rawPath);
    return serverService.url + '/build/' + relativePath + '/index.html';
}

export async function run(dest: string) {
    if (GlobalConfig.mode === 'simple') {
        // TODO simple 模式需要单独开启服务器来启动项目，需要改造服务器的启动流程
        throw new Error('Can not support run web platform in simple mode');
    }
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
        //@ts-expect-error
        //hack: when run on pink use simple browser instead of default browser
        if(process && process.addGlobalOpenUrl) {
            //@ts-expect-error
            return process.addGlobalOpenUrl(url);
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