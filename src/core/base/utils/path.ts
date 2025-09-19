'use strict';

import * as Path from 'path';
import { join } from 'path';

/**
 * 返回一个不含扩展名的文件名
 * @param path
 */
export function basenameNoExt(path: string) {
    return Path.basename(path, Path.extname(path));
}

/**
 * 将 \ 统一换成 /
 * @param path
 */
export function slash(path: string) {
    return path.replace(/\\/g, '/');
}

/**
 * 去除路径最后的斜杆，返回一个不带斜杆的路径
 * @param path
 */
export function stripSep(path: string) {
    path = Path.normalize(path);
    let i;
    for (i = path.length - 1; i >= 0; --i) {
        if (path[i] !== Path.sep) {
            break;
        }
    }
    return path.substring(0, i + 1);
}

/**
 * 删除一个路径的扩展名
 * @param path
 */
export function stripExt(path: string) {
    const extname = Path.extname(path);
    return path.substring(0, path.length - extname.length);
}

/**
 * 判断路径 pathA 是否包含 pathB
 * pathA = foo/bar,         pathB = foo/bar/foobar, return true
 * pathA = foo/bar,         pathB = foo/bar,        return true
 * pathA = foo/bar/foobar,  pathB = foo/bar,        return false
 * pathA = foo/bar/foobar,  pathB = foobar/bar/foo, return false
 * @param pathA
 * @param pathB
 */
export function contains(pathA: string, pathB: string) {
    pathA = stripSep(pathA);
    pathB = stripSep(pathB);

    if (process.platform === 'win32') {
        pathA = pathA.toLowerCase();
        pathB = pathB.toLowerCase();
    }

    //
    if (pathA === pathB) {
        return true;
    }

    // never compare files
    if (Path.dirname(pathA) === Path.dirname(pathB)) {
        return false;
    }

    if (pathA.length < pathB.length && pathB.indexOf(pathA + Path.sep) === 0) {
        return true;
    }

    return false;
}

/**
 * 格式化路径
 * 如果是 Windows 平台，需要将盘符转成小写进行判断
 * @param path 
 */
export function normalize(path: string) {
    path = Path.normalize(path);
    if (process.platform === 'win32') {
        if (/^[a-z]/.test(path[0]) && !/electron.asar/.test(path)) {
            path = path[0].toUpperCase() + path.substr(1);
        }
    }
    return path;
}


class FileUrlManager {
    static urlMap: Record<string, RegisterProtocolInfo> = {

    };

    /**
     * 注册某个协议信息
     * @param protocol
     * @param protocolInfo
     */
    register(protocol: string, protocolInfo: RegisterProtocolInfo) {
        if (!FileUrlManager.urlMap) {
            FileUrlManager.urlMap = {};
        }
        if (FileUrlManager.urlMap[protocol] || protocol === 'file') {
            console.warn(`[UI-File] Register protocol(${protocol}) failed! protocol(${protocol}) has exist!`);
            return false;
        }
        FileUrlManager.urlMap[protocol] = protocolInfo;
        return true;
    }

    /**
     * 反注册某个协议信息
     * @param protocol 协议头
     */
    unregister(protocol: string) {
        delete FileUrlManager.urlMap[protocol];
        return true;
    }

    getAllFileProtocol() {
        return Object.keys(FileUrlManager.urlMap).map((protocol) => {
            return {
                protocol,
                label: FileUrlManager.urlMap[protocol].label,
                path: FileUrlManager.urlMap[protocol].path,
            };
        });
    }

    // 转成未处理过的（不带协议）
    resolveToRaw(url: string) {
        const matchInfo = url.match(/^([a-zA-z]*):\/\/(.*)$/);
        if (matchInfo) {
            const relPath = matchInfo[2].replace(/\\/g, '/');
            const info = this.getProtocalInfo(matchInfo[1]);
            if (info) {
                return join(info.path, relPath);
            }
        }
        return url;
    }

    // 转成带协议的地址格式
    resolveToUrl(raw: string, protocol: string) {
        if (!raw || !isAbsolute(raw) || !protocol) {
            return '';
        }
        const info = this.getProtocalInfo(protocol);
        if (!info) {
            return '';
        }
        return info.protocol + '://' + relative(info.path, raw).replace(/\\/g, '/');
    }

    getProtocalInfo(protocol: string): ProtocolInfo | undefined {
        if (!FileUrlManager.urlMap[protocol]) {
            return undefined;
        }
        return {
            protocol,
            ...FileUrlManager.urlMap[protocol],
        };
    }
}

const fileUrlManager = new FileUrlManager();

export interface ProtocolInfo extends RegisterProtocolInfo {
    protocol: string;
}

// 使用 bind 绑定 this 上下文
export const register = fileUrlManager.register.bind(fileUrlManager);
export const unregister = fileUrlManager.unregister.bind(fileUrlManager);
export const resolveToRaw = fileUrlManager.resolveToRaw.bind(fileUrlManager);
export const resolveToUrl = fileUrlManager.resolveToUrl.bind(fileUrlManager);
export const resolve = Path.resolve;
export const isAbsolute = Path.isAbsolute;
export const relative = Path.relative;
export const dirname = Path.dirname;
export const basename = Path.basename;
export const extname = Path.extname;
export const sep = Path.sep;
export const delimiter = Path.delimiter;
export const parse = Path.parse;
export const format = Path.format;
export interface RegisterProtocolInfo {
    label: string;
    description?: string;
    path: string; // 与转换 handlers 二选一
    invalidInfo?: string; // 不符合当前协议头时的文本提示
    // 自定义协议转换
    // handlers?: {
    //     fileToUrl: (path: string) => string;
    //     urlToFile: (path: string) => string;
    // }
}


