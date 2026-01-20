'use strict';
import { IOhosInternalBuildOptions } from './type';
import { existsSync, statSync, readdirSync } from 'fs-extra';
import { dirname, join, normalize } from 'path';
import { platform } from 'os';

/**
 * 生成新的配置
 * @param options
 */
export async function generateOptions(options: IOhosInternalBuildOptions) {
    const ohos = options.packages.ohos;
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
                    console.log(`[OHOS] Auto-detected SDK at: ${ohos.sdkPath}`);
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
                    console.log(`[OHOS] Auto-detected SDK at: ${ohos.sdkPath}`);
                }
            }
        }
    }
    if (ohos.sdkPath && !process.env.OHOS_HOME) {
        console.log(`[OHOS] Using SDK at: ${ohos.sdkPath}`);
    }

    if (!ohos.ndkPath) {
        ohos.ndkPath = process.env.OHOS_NDK_ROOT || '';
        // 如果有了 SDK 路径但没有 NDK 路径，尝试在 SDK/ndk 下查找
        if (!ohos.ndkPath && ohos.sdkPath) {
             // 目前只支持这个版本
             const ndkPath = join(ohos.sdkPath, 'native', '2.1.1.21');
             if (existsSync(ndkPath)) {
                ohos.ndkPath = ndkPath;
                console.log(`[OHOS] Auto-detected NDK at: ${ohos.ndkPath}`);
             }
        }
    }
    if (ohos.ndkPath && !process.env.OHOS_HOME) {
        console.log(`[OHOS] Using NDK at: ${ohos.ndkPath}`);
    }

    ohos.sdkPath = ohos.sdkPath || '';
    ohos.ndkPath = ohos.ndkPath || '';

    if(ohos.sdkPath === '' || ohos.ndkPath === '') {
        console.log('[OHOS] The SDK or NDK is not configured.');
    }

    console.log(`[OHOS] Using SDK at: ${ohos.sdkPath}, Using NDK at: ${ohos.ndkPath}`);
    return ohos;
}