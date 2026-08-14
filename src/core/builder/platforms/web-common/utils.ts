import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { join, relative, basename } from 'path';
import utils from '../../../base/utils';
import builderConfig from '../../share/builder-config';
import { getBuildPath, getBuildUrlPath, registerBuildPath } from '../../build.middleware';
import { execFile } from 'child_process';

const BRIDGE_TOKEN_GLOBAL_NAME = '__SUDOP_GAME_BRIDGE_BUILD_TOKEN__';

export interface IWebBridgeScriptOptions {
    bridgeLink?: unknown;
    bridgeBuildToken?: string;
}

export async function getBuidPath(platform: string, name: string) {
    return getBuildPath(platform, name);
}

export async function getPreviewUrl(dest: string, platform?: string) {
    const rawPath = utils.Path.resolveToRaw(dest);
    if (!existsSync(rawPath)) {
        throw new Error(`Build path not found: ${dest}`);
    }
    const serverService = (await import('../../../../server/server')).serverService;
    const buildKey = getBuildUrlPath(rawPath);
    console.log(`getPreviewUrl: rawPath=${rawPath}, buildKey=${buildKey}, platform=${platform}`);
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

/**
 * 使用系统默认命令打开浏览器
 * @param url 要打开的 URL
 * @param completedCallback 浏览器打开完成后的回调函数
 */
function openBrowser(url: string, completedCallback?: () => void): void {
    const currentPlatform = process.platform;

    let command: string | undefined;
    let args: string[] = [];
    switch (currentPlatform) {
        case 'win32':
            command = 'rundll32.exe';
            args = ['url.dll,FileProtocolHandler', url];
            break;
        case 'darwin':
            command = 'open';
            args = [url];
            break;
        case 'linux':
            command = 'xdg-open';
            args = [url];
            break;
        default:
            console.log(`请手动打开浏览器访问: ${url}`);
            if (completedCallback) {
                completedCallback();
            }
            return;
    }

    if (command) {
        execFile(command, args, { windowsHide: true }, (error: any) => {
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
    console.log(`正在打开 URL: ${url}`);
    return new Promise<void>((resolve) => {
        openBrowser(url, resolve);
    });
}
export async function run(platform: string, dest: string) {
    // if (GlobalConfig.mode === 'simple') {
    //     throw new Error('simple mode not support run in platform ' + platform);
    // }
    const url = await getPreviewUrl(dest, platform);
    // 打开浏览器
    try {
        await openUrlAsync(url);
    } catch (error) {
        console.error('打开浏览器时发生错误:', error);
        console.log(`请手动打开浏览器访问: ${url}`);
    }
    return url;
}

export function injectBridgeScripts(html: string, options: IWebBridgeScriptOptions): string {
    const normalizedBridgeLink = String(options.bridgeLink || '').trim();
    if (!normalizedBridgeLink) {
        throw new Error('Missing web bridge script link');
    }

    const token = randomBytes(32).toString('hex');
    options.bridgeBuildToken = token;

    const bridgeScripts = [
        `<script>globalThis.${BRIDGE_TOKEN_GLOBAL_NAME}=${JSON.stringify(token)};</script>`,
        `<script src="${escapeHtmlAttribute(normalizedBridgeLink)}" charset="utf-8"></script>`,
    ].join('\n');

    return insertBeforeFirstScriptTag(html, bridgeScripts);
}

function insertBeforeFirstScriptTag(html: string, bridgeScripts: string): string {
    const firstScriptTag = /<script\b/i.exec(html);
    if (!firstScriptTag) {
        throw new Error('Cannot find script tag in index.html');
    }

    return `${html.slice(0, firstScriptTag.index)}${bridgeScripts}\n${html.slice(firstScriptTag.index)}`;
}

function escapeHtmlAttribute(value: string): string {
    return value.replace(/[&"<>]/g, (char) => {
        switch (char) {
        case '&':
            return '&amp;';
        case '"':
            return '&quot;';
        case '<':
            return '&lt;';
        case '>':
            return '&gt;';
        default:
            return char;
        }
    });
}
