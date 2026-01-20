'use strict';
import { IHarmonyOSNextInternalBuildOptions } from './type';
import { existsSync } from 'fs-extra';
import { join } from 'path';

/**
 * 生成新的配置
 * @param options
 */
export async function generateOptions(options: IHarmonyOSNextInternalBuildOptions) {
    const ohos = options.packages['harmonyos-next'];
    ohos.orientation = ohos.orientation || {};
    if(!ohos.sdkPath) {
        ohos.sdkPath = process.env.HARMONYOS_NEXT_HOME || process.env.HARMONYOS_NEXT_SDK_ROOT || '';
        //TODO:sdk目录和NDK目录都是在软件安装目录下的，目前暂时不支持自动检测软件位置的功能
    }
    if (ohos.sdkPath && !process.env.HARMONYOS_NEXT_HOME) {
        console.log(`[HarmonyOS Next] Using SDK at: ${ohos.sdkPath}`);
    }

    if (!ohos.ndkPath) {
        ohos.ndkPath = process.env.HARMONYOS_NEXT_NDK_ROOT || '';
        // 如果有了 SDK 路径但没有 NDK 路径，尝试在 SDK/native 下查找
        if (!ohos.ndkPath && ohos.sdkPath) {
            // ndk和sdk是绑定的，不需要指定ndk的版本
            const ndkPath = join(ohos.sdkPath, 'native');
            if (existsSync(ndkPath)) {
                ohos.ndkPath = ndkPath;
                console.log(`[HarmonyOS Next] Auto-detected NDK at: ${ohos.ndkPath}`);
            }
        }
    }
    if (ohos.ndkPath && !process.env.HARMONYOS_NEXT_HOME) {
        console.log(`[HarmonyOS Next] Using NDK at: ${ohos.ndkPath}`);
    }

    ohos.sdkPath = ohos.sdkPath || '';
    ohos.ndkPath = ohos.ndkPath || '';

    if(ohos.sdkPath === '' || ohos.ndkPath === '') {
        console.log('[HarmonyOS Next] The SDK or NDK is not configured.');
    }
    console.log(`[HarmonyOS Next] Using SDK at: ${ohos.sdkPath}, Using NDK at: ${ohos.ndkPath}`);
    return ohos;
}

