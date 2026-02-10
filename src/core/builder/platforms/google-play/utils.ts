'use strict';

import { existsSync, statSync, readdirSync } from 'fs-extra';
import { dirname, join, normalize } from 'path';
import { platform } from 'os';
import { IGooglePlayInternalBuildOptions } from './type';
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
export async function checkAndroidAPILevels(value: number, options: IGooglePlayInternalBuildOptions): Promise<BuildCheckResult> {
    const res: BuildCheckResult = {
        newValue: value,
        error: '',
        level: 'error',
    };
    if (checkIsEmpty(value)) {
        res.error = 'API Level cannot be empty';
    }
    if (isNaN(value)) {
        res.error = 'API Level must be a number';
        return res;
    }
    const APIVersion = value;
    if (options.packages['google-play'].androidInstant && APIVersion < 23) {
        res.error = 'When Android Instant App is enabled, the minimum API Level required is 23.';
        res.newValue = 23;
        return res;
    }
    if ((options.packages as any).native?.JobSystem === 'tbb' && APIVersion < 21) {
        res.error = 'When TBB is enabled, the minimum API Level required is 21.';
        res.newValue = 21;
        return res;
    }
    // const renderPipeline = await Editor.Profile.getProject('project', 'general.renderPipeline');
    const renderPipeline = options.renderPipeline;
    // 延迟渲染管线
    if (renderPipeline === '5d45ba66-829a-46d3-948e-2ed3fa7ee421' && APIVersion < 21) {
        res.error = 'When Deferred Render Pipeline is enabled, the minimum API Level required is 21.';
        res.newValue = 21;
        return res;
    }
    if (APIVersion < 19) {
        res.error = 'The minimum API Level required is 19.';
        res.newValue = 19;
        return res;
    }

    return res;
}

/**
 * 生成 Android 选项，包括 SDK、NDK、Java 路径等
 */
export async function generateAndroidOptions(options: IGooglePlayInternalBuildOptions) {
    const googlePlay = options.packages['google-play'];
    googlePlay.orientation = googlePlay.orientation || {
        landscapeRight: true,
        landscapeLeft: true,
        portrait: false,
        upsideDown: false,
    };

    // 查询 Android SDK、NDK、Java Home 路径
    // 注意：这里需要根据实际的 Editor.Message API 来获取，在 CLI 环境中可能需要不同的方式
    // const androidSDKInfo = await Editor.Message.request('program', 'query-program-info', 'androidSDK');
    // const androidNDKInfo = await Editor.Message.request('program', 'query-program-info', 'androidNDK');
    // const javaHome = await Editor.Message.request('program', 'query-program-info', 'javaHome');
    
    // 临时处理：如果路径未设置，尝试从环境变量获取
    if (!googlePlay.sdkPath) {
        googlePlay.sdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
        
        // 尝试默认路径 (Windows)
        if (!googlePlay.sdkPath && process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA;
            if (localAppData) {
                const defaultSdkPath = join(localAppData, 'Android', 'Sdk');
                if (existsSync(defaultSdkPath)) {
                    googlePlay.sdkPath = defaultSdkPath;
                    console.log(`[Android] Auto-detected SDK at: ${googlePlay.sdkPath}`);
                }
            }
        }
        // 尝试默认路径 (Mac)
        if (!googlePlay.sdkPath && process.platform === 'darwin') {
            const home = process.env.HOME;
            if (home) {
                const defaultSdkPath = join(home, 'Library', 'Android', 'sdk');
                if (existsSync(defaultSdkPath)) {
                    googlePlay.sdkPath = defaultSdkPath;
                    console.log(`[Android] Auto-detected SDK at: ${googlePlay.sdkPath}`);
                }
            }
        }
    }
    
    if (googlePlay.sdkPath && !process.env.ANDROID_HOME) {
        console.log(`[Android] Using SDK at: ${googlePlay.sdkPath}`);
    }

    if (!googlePlay.ndkPath) {
        googlePlay.ndkPath = process.env.ANDROID_NDK_HOME || process.env.NDK_ROOT || '';
        
        // 如果有了 SDK 路径但没有 NDK 路径，尝试在 SDK/ndk 下查找
        if (!googlePlay.ndkPath && googlePlay.sdkPath) {
             const ndkBase = join(googlePlay.sdkPath, 'ndk');
             if (existsSync(ndkBase)) {
                 const dirs = readdirSync(ndkBase);
                 if (dirs.length > 0) {
                     // 优先选择版本 28，其次 23，最后是其他版本
                     const priorityVersions = ['28', '23'];
                     let selectedVersion: string | undefined;
                     
                     // 先按优先级搜索
                     for (const priorityVersion of priorityVersions) {
                         const versionDir = dirs.find(dir => {
                             const dirPath = join(ndkBase, dir);
                             return statSync(dirPath).isDirectory() && dir.startsWith(priorityVersion + '.');
                         });
                         
                         if (versionDir) {
                             selectedVersion = versionDir;
                             console.log(`[Android] Found NDK version ${priorityVersion} at: ${join(ndkBase, selectedVersion)}`);
                             break;
                         }
                     }
                     
                     // 如果优先级版本都没找到，选择其他版本（排序获取最新的）
                     if (!selectedVersion) {
                         const otherVersionDirs = dirs.filter(dir => {
                             const dirPath = join(ndkBase, dir);
                             return statSync(dirPath).isDirectory() 
                                 && !priorityVersions.some(pv => dir.startsWith(pv + '.'))
                                 && /^\d+\./.test(dir); // 版本号格式：数字.xxx
                         });
                         
                         if (otherVersionDirs.length > 0) {
                             otherVersionDirs.sort();
                             selectedVersion = otherVersionDirs[otherVersionDirs.length - 1];
                             console.log(`[Android] Found NDK version ${selectedVersion} at: ${join(ndkBase, selectedVersion)}`);
                         }
                     }
                     
                     if (selectedVersion) {
                         googlePlay.ndkPath = join(ndkBase, selectedVersion);
                         console.log(`[Android] Auto-detected NDK at: ${googlePlay.ndkPath}`);
                     }
                 }
             }
        }
    }
    
    if (googlePlay.ndkPath && !process.env.ANDROID_NDK_HOME) {
        console.log(`[Android] Using NDK at: ${googlePlay.ndkPath}`);
    }

    googlePlay.sdkPath = googlePlay.sdkPath || '';
    googlePlay.ndkPath = googlePlay.ndkPath || '';
    googlePlay.javaHome = googlePlay.javaHome || process.env.JAVA_HOME || '';
    googlePlay.javaPath = '';

    if (googlePlay.javaHome) {
        try {
            const st = statSync(googlePlay.javaHome);
            if (st.isFile()) {
                googlePlay.javaPath = googlePlay.javaHome;
                googlePlay.javaHome = normalize(join(dirname(googlePlay.javaPath), '..'));
            } else if (st.isDirectory()) {
                const javaFileName = platform() === 'win32' ? 'java.exe' : 'java';
                const pathToJava = join(googlePlay.javaHome, 'bin', javaFileName);
                if (!existsSync(pathToJava)) {
                    console.error(`Java executable not found at ${googlePlay.javaHome}/bin`);
                } else {
                    googlePlay.javaPath = pathToJava;
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    if (googlePlay.keystorePath) {
        // 在 CLI 环境中，路径处理可能需要调整
        // googlePlay.keystorePath = Editor.UI.__protected__.File.resolveToRaw(googlePlay.keystorePath);
    }

    return googlePlay;
}

