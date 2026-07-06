'use strict';

import { existsSync, statSync, readdirSync } from 'fs-extra';
import { dirname, join, normalize } from 'path';
import { platform } from 'os';
import { IGooglePlayInternalBuildOptions } from './type';
import { BuildCheckResult } from '../../../@types/protected';

export function checkPackageNameValidity(packageName: string) {
    return /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(packageName);
}

export function checkIsEmpty(value: any) {
    return value === null || value === undefined || value === '';
}

export async function checkAndroidAPILevels(value: number, options: IGooglePlayInternalBuildOptions): Promise<BuildCheckResult> {
    const res: BuildCheckResult = {
        valid: true,
    };
    if (checkIsEmpty(value)) {
        res.valid = false;
        res.level = 'error';
        res.message = 'API Level cannot be empty';
        return res;
    }
    if (isNaN(value)) {
        res.valid = false;
        res.level = 'error';
        res.message = 'API Level must be a number';
        return res;
    }
    const APIVersion = value;
    if (options.packages['google-play'].androidInstant && APIVersion < 23) {
        res.valid = false;
        res.level = 'error';
        res.message = 'When Android Instant App is enabled, the minimum API Level required is 23.';
        res.fixedValue = 23;
        return res;
    }
    if ((options.packages as any).native?.JobSystem === 'tbb' && APIVersion < 21) {
        res.valid = false;
        res.level = 'error';
        res.message = 'When TBB is enabled, the minimum API Level required is 21.';
        res.fixedValue = 21;
        return res;
    }
    if (options.renderPipeline === '5d45ba66-829a-46d3-948e-2ed3fa7ee421' && APIVersion < 21) {
        res.valid = false;
        res.level = 'error';
        res.message = 'When Deferred Render Pipeline is enabled, the minimum API Level required is 21.';
        res.fixedValue = 21;
        return res;
    }
    if (APIVersion < 19) {
        res.valid = false;
        res.level = 'error';
        res.message = 'The minimum API Level required is 19.';
        res.fixedValue = 19;
        return res;
    }

    return res;
}

function findSdkPath(): string {
    const envSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (envSdk) {
        return envSdk;
    }

    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const defaultSdkPath = join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
        if (existsSync(defaultSdkPath)) {
            return defaultSdkPath;
        }
    } else if (process.platform === 'darwin' && process.env.HOME) {
        const defaultSdkPath = join(process.env.HOME, 'Library', 'Android', 'sdk');
        if (existsSync(defaultSdkPath)) {
            return defaultSdkPath;
        }
    }
    return '';
}

function findNdkPath(sdkPath: string): string {
    const envNdk = process.env.ANDROID_NDK_HOME || process.env.NDK_ROOT;
    if (envNdk) {
        return envNdk;
    }

    if (!sdkPath) {
        return '';
    }

    const ndkBase = join(sdkPath, 'ndk');
    if (!existsSync(ndkBase)) {
        return '';
    }

    const dirs = readdirSync(ndkBase);
    const priorityVersions = ['28', '23'];
    for (const ver of priorityVersions) {
        const match = dirs.find((dir) => dir.startsWith(`${ver}.`) && statSync(join(ndkBase, dir)).isDirectory());
        if (match) {
            console.log(`[GooglePlay] Found NDK version ${ver} at: ${join(ndkBase, match)}`);
            return join(ndkBase, match);
        }
    }

    const otherVersions = dirs
        .filter((dir) => !priorityVersions.some((ver) => dir.startsWith(`${ver}.`)) && /^\d+\./.test(dir) && statSync(join(ndkBase, dir)).isDirectory())
        .sort();
    if (otherVersions.length > 0) {
        const latest = otherVersions[otherVersions.length - 1];
        console.log(`[GooglePlay] Found NDK version ${latest} at: ${join(ndkBase, latest)}`);
        return join(ndkBase, latest);
    }
    return '';
}

function resolveJavaPath(javaHome: string): { javaHome: string; javaPath: string } {
    if (!javaHome) {
        return { javaHome: '', javaPath: '' };
    }

    try {
        const st = statSync(javaHome);
        if (st.isFile()) {
            return { javaHome: normalize(join(dirname(javaHome), '..')), javaPath: javaHome };
        }
        if (st.isDirectory()) {
            const javaFileName = platform() === 'win32' ? 'java.exe' : 'java';
            const javaPath = join(javaHome, 'bin', javaFileName);
            if (existsSync(javaPath)) {
                return { javaHome, javaPath };
            }
            console.error(`Java executable not found at ${javaHome}/bin`);
        }
    } catch (error) {
        console.error(error);
    }
    return { javaHome, javaPath: '' };
}

export async function generateAndroidOptions(options: IGooglePlayInternalBuildOptions) {
    const googlePlay = options.packages['google-play'];
    googlePlay.orientation = googlePlay.orientation || {
        landscapeRight: true,
        landscapeLeft: true,
        portrait: false,
        upsideDown: false,
    };

    if (!googlePlay.sdkPath) {
        googlePlay.sdkPath = findSdkPath();
        if (googlePlay.sdkPath) {
            console.log(`[GooglePlay] Auto-detected SDK at: ${googlePlay.sdkPath}`);
        }
    } else if (!process.env.ANDROID_HOME) {
        console.log(`[GooglePlay] Using SDK at: ${googlePlay.sdkPath}`);
    }
    googlePlay.sdkPath = googlePlay.sdkPath || '';

    if (!googlePlay.ndkPath) {
        googlePlay.ndkPath = findNdkPath(googlePlay.sdkPath);
        if (googlePlay.ndkPath) {
            console.log(`[GooglePlay] Auto-detected NDK at: ${googlePlay.ndkPath}`);
        }
    } else if (!process.env.ANDROID_NDK_HOME) {
        console.log(`[GooglePlay] Using NDK at: ${googlePlay.ndkPath}`);
    }
    googlePlay.ndkPath = googlePlay.ndkPath || '';

    googlePlay.javaHome = googlePlay.javaHome || process.env.JAVA_HOME || '';
    const { javaHome, javaPath } = resolveJavaPath(googlePlay.javaHome);
    googlePlay.javaHome = javaHome;
    googlePlay.javaPath = javaPath;

    return googlePlay;
}
