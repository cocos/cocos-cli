import { existsSync } from 'fs';
import { join, relative, basename } from 'path';
import utils from '../../../base/utils';
import builderConfig from '../../share/builder-config';
import { getBuildUrlPath, registerBuildPath } from '../../build.middleware';
import { exec } from 'child_process';

interface VSCodeApi {
    Uri?: {
        parse(value: string): unknown;
    };
    env?: {
        openExternal(uri: unknown): Promise<boolean> | boolean;
    };
}

function normalizePreviewUrl(url: string, useLocalHost?: boolean) {
    if (!useLocalHost) {
        return url;
    }
    try {
        const urlObj = new URL(url);
        if (urlObj.protocol === 'http:') {
            urlObj.hostname = 'localhost';
            return urlObj.toString();
        }
    } catch (error) {
        console.warn(`Failed to normalize preview url: ${url}`);
    }
    return url;
}

export async function getPreviewUrl(dest: string, platform?: string, useLocalHost?: boolean) {
    const rawPath = utils.Path.resolveToRaw(dest);
    if (!existsSync(rawPath)) {
        throw new Error(`Build path not found: ${dest}`);
    }
    const serverService = (await import('../../../../server/server')).serverService;
    const buildKey = getBuildUrlPath(rawPath);
    if (buildKey) {
        return normalizePreviewUrl(`${serverService.url}/build/${buildKey}/index.html`, useLocalHost);
    }
    
    if (rawPath.startsWith(builderConfig.projectRoot) && platform) {
        const registerName = basename(rawPath);
        registerBuildPath(platform, registerName, rawPath);
        return normalizePreviewUrl(`${serverService.url}/build/${platform}/${registerName}/index.html`, useLocalHost);
    }
    
    const buildRoot = join(builderConfig.projectRoot, 'build');
    const relativePath = relative(buildRoot, rawPath);
    return normalizePreviewUrl(serverService.url + '/build/' + relativePath + '/index.html', useLocalHost);
}

/**
 * 使用系统默认命令打开浏览器
 * @param url 要打开的 URL
 * @param completedCallback 浏览器打开完成后的回调函数
 */
async function openExternalWithVSCode(url: string): Promise<boolean> {
    let vscode: VSCodeApi | undefined;
    try {
        vscode = require('vscode') as VSCodeApi;
    } catch {
        return false;
    }

    if (!vscode?.Uri?.parse || !vscode.env?.openExternal) {
        return false;
    }

    const opened = await Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url)));
    if (!opened) {
        console.warn(`VS Code failed to open url: ${url}`);
    }
    return opened;
}

async function openUrlWithVSCodeFallback(url: string): Promise<void> {
    console.log(`正在打开 URL: ${url}`);
    if (await openExternalWithVSCode(url)) {
        console.log(`正在通过 VS Code 打开: ${url}`);
        return;
    }

    await new Promise<void>((resolve) => {
        openBrowser(url, resolve);
    });
}

function openBrowser(url: string, completedCallback?: () => void): void {
    const currentPlatform = process.platform;

    let command: string | undefined;
    switch (currentPlatform) {
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
            if (completedCallback) {
                completedCallback();
            }
            return;
    }

    //@ts-expect-error
    //hack: when run on pink use simple browser instead of default browser
    if (process && process.addGlobalOpenUrl) {
        //@ts-expect-error
        process.addGlobalOpenUrl(url);
        if (completedCallback) {
            completedCallback();
        }
        return;
    }

    if (command) {
        exec(command, (error: any) => {
            if (error) {
                console.error('打开浏览器失败:', error.message);
                console.log(`请手动打开浏览器访问: ${url}`);
            } else {
                console.log(`正在浏览器中打开: ${url}`);
            }

            // 无论成功或失败都调用回调
            if (completedCallback) {
                completedCallback();
            }
        });
    } else if (completedCallback) {
        completedCallback();
    }
}

/**
 * 异步打开 URL，在浏览器打开完成时 resolve
 * @param url 要打开的 URL
 * @returns Promise，在浏览器打开完成时 resolve
 */
export function openUrlAsync(url: string): Promise<void> {
    return openUrlWithVSCodeFallback(url);
}

export async function run(platform: string, dest: string, useLocalHost?: boolean) {
    // if (GlobalConfig.mode === 'simple') {
    //     throw new Error('simple mode not support run in platform ' + platform);
    // }
    const url = await getPreviewUrl(dest, platform, useLocalHost);
    // 打开浏览器
    try {
        await openUrlAsync(url);
    } catch (error) {
        console.error('打开浏览器时发生错误:', error);
        console.log(`请手动打开浏览器访问: ${url}`);
    }
    return url;
}
