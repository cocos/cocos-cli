import { existsSync } from 'fs';
import { join, relative, basename } from 'path';
import utils from '../../../base/utils';
import builderConfig from '../../share/builder-config';
import { getBuildUrlPath, registerBuildPath } from '../../build.middleware';
import { openUrlAsync, connectToChromeDevTools } from './utils-browser';


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
    
    if (rawPath.startsWith(builderConfig.projectRoot) && platform) {
        const registerName = basename(rawPath);
        registerBuildPath(platform, registerName, rawPath);
        return `${serverService.url}/build/${platform}/${registerName}/index.html`;
    }
    
    const buildRoot = join(builderConfig.projectRoot, 'build');
    const relativePath = relative(buildRoot, rawPath);
    return serverService.url + '/build/' + relativePath + '/index.html';
}

export async function run(platform: string, dest: string) {
    // if (GlobalConfig.mode === 'simple') {
    //     throw new Error('simple mode not support run in platform ' + platform);
    // }
    const url = await getPreviewUrl(dest, platform);
    // 打开浏览器
    try {
        const remoteDebuggingMode = true;
        const port = 9222;
        await openUrlAsync(url, { remoteDebuggingMode, port });

        // 如果启用了远程调试模式，连接并监听浏览器日志
        if (remoteDebuggingMode) {
            await connectToChromeDevTools(port, url);
        }
    } catch (error) {
        console.error('打开浏览器时发生错误:', error);
        console.log(`请手动打开浏览器访问: ${url}`);
    }
    return url;
}
