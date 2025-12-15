import { existsSync } from 'fs';
import { join, relative, basename } from 'path';
import utils from '../../../base/utils';
import { BuildGlobalInfo } from '../../share/builder-config';
import { getBuildUrlPath, registerBuildPath } from '../../build.middleware';

export async function getPreviewUrl(dest: string, platform?: string) {
    const rawPath = utils.Path.resolveToRaw(dest);
    if (!existsSync(rawPath)) {
        throw new Error(`Build path not found: ${dest}`);
    }
    const serverService = (await import('../../../../server/server')).serverService;
    const buildKey = getBuildUrlPath(rawPath);
    if (buildKey) {
        return `${serverService.url}/build/${buildKey}/index.html`;
    }
    
    if (rawPath.startsWith(BuildGlobalInfo.projectRoot) && platform) {
        const registerName = basename(rawPath);
        registerBuildPath(platform, registerName, rawPath);
        return `${serverService.url}/build/${platform}/${registerName}/index.html`;
    }
    
    const buildRoot = join(BuildGlobalInfo.projectRoot, 'build');
    const relativePath = relative(buildRoot, rawPath);
    return serverService.url + '/build/' + relativePath + '/index.html';
}

export async function run(platform: string, dest: string) {
    const url = await getPreviewUrl(dest, platform);
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