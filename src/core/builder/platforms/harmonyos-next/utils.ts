'use strict';
import { IHarmonyOSNextInternalBuildOptions } from './type';
import { existsSync, statSync, readdirSync } from 'fs-extra';
import { dirname, join, normalize } from 'path';
import { platform } from 'os';

/**
 * 生成新的配置
 * @param options
 */
export async function generateOptions(options: IHarmonyOSNextInternalBuildOptions) {
    const ohos = options.packages['harmonyos-next'];
    ohos.orientation = ohos.orientation || {};
    if(!ohos.sdkPath) {
        ohos.sdkPath = process.env.OHOS_HOME || process.env.OHOS_SDK_ROOT || '';
            
        // 尝试默认路径 (Windows)
        if (!ohos.sdkPath && process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA;
            if (localAppData) {
                const defaultSdkPath = join(localAppData, 'Huawei', 'Sdk');
                if (existsSync(defaultSdkPath)) {
                    ohos.sdkPath = defaultSdkPath;
                    console.log(`[HarmonyOS Next] Auto-detected SDK at: ${ohos.sdkPath}`);
                }
            }
        }
        // 尝试默认路径 (Mac)
        if (!ohos.sdkPath && process.platform === 'darwin') {
            const home = process.env.HOME;
            if (home) {
                const defaultSdkPath = join(home, 'Library', 'Huawei', 'sdk');
                if (existsSync(defaultSdkPath)) {
                    ohos.sdkPath = defaultSdkPath;
                    console.log(`[HarmonyOS Next] Auto-detected SDK at: ${ohos.sdkPath}`);
                }
            }
        }
    }
    if (ohos.sdkPath && !process.env.ANDROID_HOME) {
        console.log(`[HarmonyOS Next] Using SDK at: ${ohos.sdkPath}`);
    }

    if (!ohos.ndkPath) {
        ohos.ndkPath = process.env.ANDROID_NDK_HOME || process.env.NDK_ROOT || '';
        
        // 如果有了 SDK 路径但没有 NDK 路径，尝试在 SDK/ndk 下查找
        if (!ohos.ndkPath && ohos.sdkPath) {
            // 目前只支持这个版本
            const ndkPath = join(ohos.sdkPath, 'ndk', '2.1.1.21');
            if (existsSync(ndkPath)) {
                ohos.ndkPath = ndkPath;
                console.log(`[HarmonyOS Next] Auto-detected NDK at: ${ohos.ndkPath}`);
            }
        }
    }
    if (ohos.ndkPath && !process.env.ANDROID_HOME) {
        console.log(`[HarmonyOS Next] Using NDK at: ${ohos.ndkPath}`);
    }

    ohos.sdkPath = ohos.sdkPath || '';
    ohos.ndkPath = ohos.ndkPath || '';

    return ohos;
}

