'use strict';

import { pathExists, remove } from 'fs-extra';
import { dirname, join } from 'path';
import { GlobalPaths } from '../../../../../global';
import { IBuildTaskOption } from '../../../@types';
/**
 * 清空项目相关的资源和脚本
 * @param projectPath
 */
export async function clearDest(projectPath: string) {
    try {
        await remove(join(projectPath, 'data'));
    } catch (err: any) {
        console.error(err);
    }
}

export async function getCmakePath(): Promise<string> {
    const executable = process.platform === 'win32' ? 'cmake.exe' : 'cmake';
    const defaultCmakePath = join(GlobalPaths.staticDir, 'tools/cmake', 'bin', executable);
    if (await pathExists(defaultCmakePath)) {
        return defaultCmakePath;
    }

    const candidates = [process.cwd(), __dirname];
    for (const start of candidates) {
        let current = start;
        while (true) {
            const fallback = join(current, 'static', 'tools', 'cmake', 'bin', executable);
            if (await pathExists(fallback)) {
                console.warn(`Fallback cmake path from ${defaultCmakePath} to ${fallback}`);
                return fallback;
            }

            const parent = dirname(current);
            if (parent === current) {
                break;
            }
            current = parent;
        }
    }

    return defaultCmakePath;
}

// 支持中文的平台如果有修改，需要同步到 configs
export function acceptChineseName(options: IBuildTaskOption) {
    return ['mac', 'ios', 'windows', 'android'].includes(options.platform);
}

export function checkName(value: string, options: IBuildTaskOption) {
    if (acceptChineseName(options)) {
        return /^[\u4e00-\u9fa5A-Za-z0-9-_]+$/.test(value);
    } else {
        return /^[A-Za-z0-9-_]+$/.test(value);
    }
}
