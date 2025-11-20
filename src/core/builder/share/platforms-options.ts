import { Platform } from '../@types';
import { OverwriteCommonOption } from '../@types/protected';

const INTERNAL_NATIVE_PLATFORM: Platform[] = [
    'android',
    'ios',
    'windows',
    'mac',
];


export const NATIVE_PLATFORM: Platform[] = [
    'android',
    'ios',
    'windows',
    'mac',
];

// 支持的平台数组，顺序将会影响界面的平台排序
export const PLATFORMS: Platform[] = [
    ...NATIVE_PLATFORM,

    'web-desktop',
    'web-mobile',
];

// 平台构建必须的插件名
export const platformPlugins: string[] = ['native', ...PLATFORMS];

export const internalNativePlugins: string[] = [
    'native',
    ...INTERNAL_NATIVE_PLATFORM,
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
