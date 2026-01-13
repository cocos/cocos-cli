import { Platform } from '../@types';
import { OverwriteCommonOption } from '../@types/protected';

export const NATIVE_PLATFORM: Platform[] = [
    'android',
    'ios',
    'windows',
    'mac',
    'ohos',
    'harmonyos-next',
];

// 支持的平台数组，顺序将会影响界面的平台排序
export const PLATFORMS: string[] = [
    ...NATIVE_PLATFORM,

    'web-desktop',
    'web-mobile',
];

export const overwriteCommonOptions: OverwriteCommonOption[] = [
    'buildPath',
    'server',
    'sourceMaps',
    'server',
    'polyfills',
    'name',
    'mainBundleIsRemote',
    'experimentalEraseModules',
    'buildStageGroup',
];
