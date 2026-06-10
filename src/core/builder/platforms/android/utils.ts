'use strict';

import { existsSync, statSync, readdirSync } from 'fs-extra';
import { dirname, join, normalize } from 'path';
import { platform } from 'os';
import { IAndroidInternalBuildOptions } from './type';
import { BuildCheckResult } from '../../@types/protected';

/**
 * 检查 android 包名的合法性
 * @param packageName
 */
export function checkPackageNameValidity(packageName: string) {
    // refer: https://developer.android.com/studio/build/application-id.html
    return /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(packageName);
}

/**
 * 检查是否为空
 */
export function checkIsEmpty(value: any) {
    if (value === null || value === undefined || value === '') {
        return true;
    }
    return false;
}

/**
 * 检查 API Level 要求，最低 18，开启延迟渲染管线后最低要求 21，开启 Instance APP 后最低 23
 * @param value
 * @param options
 * @returns
 */
export async function checkAndroidAPILevels(value: number, options: IAndroidInternalBuildOptions): Promise<BuildCheckResult> {
    const res: BuildCheckResult = {
        valid: true,
    };
    if (checkIsEmpty(value)) {
        res.valid = false;
        res.level = 'error';
        res.message = 'API Level cannot be empty';
        return res; // 必须返回，否则后续判断会报错
    }
    if (isNaN(value)) {
        res.valid = false;
        res.level = 'error';
        res.message = 'API Level must be a number';
        return res;
    }
    const APIVersion = value;
    if (options.packages.android.androidInstant && APIVersion < 23) {
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
    // const renderPipeline = await Editor.Profile.getProject('project', 'general.renderPipeline');
    const renderPipeline = options.renderPipeline;
    // 延迟渲染管线
    if (renderPipeline === '5d45ba66-829a-46d3-948e-2ed3fa7ee421' && APIVersion < 21) {
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
    if (envSdk) return envSdk;

    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const defaultSdkPath = join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
        if (existsSync(defaultSdkPath)) return defaultSdkPath;
    } else if (process.platform === 'darwin' && process.env.HOME) {
        const defaultSdkPath = join(process.env.HOME, 'Library', 'Android', 'sdk');
        if (existsSync(defaultSdkPath)) return defaultSdkPath;
    }
    return '';
}

function findNdkPath(sdkPath: string): string {
    const envNdk = process.env.ANDROID_NDK_HOME || process.env.NDK_ROOT;
    if (envNdk) return envNdk;

    if (sdkPath) {
        const ndkBase = join(sdkPath, 'ndk');
        if (existsSync(ndkBase)) {
            try {
                const dirs = readdirSync(ndkBase);
                if (dirs.length > 0) {
                    // 优先选择版本 28，其次 23
                    const priorityVersions = ['28', '23'];
                    
                    // 1. 查找优先级版本
                    for (const ver of priorityVersions) {
                        const match = dirs.find(d => d.startsWith(ver + '.') && statSync(join(ndkBase, d)).isDirectory());
                        if (match) {
                            console.log(`[Android] Found NDK version ${ver} at: ${join(ndkBase, match)}`);
                            return join(ndkBase, match);
                        }
                    }

                    // 2. 查找其他最新版本
                    const otherVersions = dirs.filter(d => 
                        !priorityVersions.some(ver => d.startsWith(ver + '.')) && 
                        /^\d+\./.test(d) && 
                        statSync(join(ndkBase, d)).isDirectory()
                    ).sort(); // 字符串排序，高版本号通常在后面
                    
                    if (otherVersions.length > 0) {
                        const latest = otherVersions[otherVersions.length - 1];
                        console.log(`[Android] Found NDK version ${latest} at: ${join(ndkBase, latest)}`);
                        return join(ndkBase, latest);
                    }
                }
            } catch (e) {
                // ignore
            }
        }
    }
    return '';
}

function resolveJavaPath(javaHome: string): { javaHome: string, javaPath: string } {
    if (!javaHome) return { javaHome: '', javaPath: '' };

    try {
        const st = statSync(javaHome);
        if (st.isFile()) {
            return { javaHome: normalize(join(dirname(javaHome), '..')), javaPath: javaHome };
        } else if (st.isDirectory()) {
            const javaFileName = platform() === 'win32' ? 'java.exe' : 'java';
            const pathToJava = join(javaHome, 'bin', javaFileName);
            if (!existsSync(pathToJava)) {
                console.error(`Java executable not found at ${javaHome}/bin`);
                return { javaHome, javaPath: '' }; // 虽然路径有问题，但还是返回 home
            }
            return { javaHome, javaPath: pathToJava };
        }
    } catch (e) {
        console.error(e);
    }
    return { javaHome, javaPath: '' };
}

/**
 * 生成 Android 选项，包括 SDK、NDK、Java 路径等
 */
export async function generateAndroidOptions(options: IAndroidInternalBuildOptions) {
    const android = options.packages.android;
    android.orientation = android.orientation || {
        landscapeRight: true,
        landscapeLeft: true,
        portrait: false,
        upsideDown: false,
    };

    // 1. SDK
    if (!android.sdkPath) {
        android.sdkPath = findSdkPath();
        if (android.sdkPath) console.log(`[Android] Auto-detected SDK at: ${android.sdkPath}`);
    } else if (!process.env.ANDROID_HOME) {
        console.log(`[Android] Using SDK at: ${android.sdkPath}`);
    }
    android.sdkPath = android.sdkPath || '';

    // 2. NDK
    if (!android.ndkPath) {
        android.ndkPath = findNdkPath(android.sdkPath);
        if (android.ndkPath) console.log(`[Android] Auto-detected NDK at: ${android.ndkPath}`);
    } else if (!process.env.ANDROID_NDK_HOME) {
        console.log(`[Android] Using NDK at: ${android.ndkPath}`);
    }
    android.ndkPath = android.ndkPath || '';

    // 3. Java
    android.javaHome = android.javaHome || process.env.JAVA_HOME || '';
    const { javaHome, javaPath } = resolveJavaPath(android.javaHome);
    android.javaHome = javaHome;
    android.javaPath = javaPath;

    return android;
}
