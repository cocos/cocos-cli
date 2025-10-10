import { Platform } from "../@types";
import { OverwriteCommonOption } from "../@types/protected";

const INTERNAL_NATIVE_PLATFORM: Platform[] = [
    'android',
    'google-play', // 💰
    'ohos', // 💰
    'harmonyos-next', // 💰
    'huawei-agc', // 💰
    'ios',
    'windows',
    'mac',
    'linux',
];


export const NATIVE_PLATFORM: Platform[] = [
    'android',
    'google-play', // 💰
    'ohos', // 💰
    'harmonyos-next', // 💰
    'huawei-agc', // 💰
    'ios',
    'windows',
    'mac',
    'linux',
];

// 支持的平台数组，顺序将会影响界面的平台排序，💰 是金主爸爸，需要给它们一个好位置
export const PLATFORMS: Platform[] = [
    ...NATIVE_PLATFORM,

    'alipay-mini-game', // 💰
    'taobao-creative-app', // 💰
    'taobao-mini-game', // 💰
    'bytedance-mini-game',
    'oppo-mini-game', // 💰
    'huawei-quick-game', // 💰
    'migu-mini-game', // 💰
    'honor-mini-game', // 💰
    'vivo-mini-game',
    'xiaomi-quick-game',
    'baidu-mini-game', // 3.7.0 强制下线
    'wechatgame',
    'wechatprogram',

    'web-desktop',
    'web-mobile',
];

// 平台构建必须的插件名
export const platformPlugins: string[] = ['native', ...PLATFORMS];

export const internalNativePlugins: string[] = [
    'native',
    ...INTERNAL_NATIVE_PLATFORM,
];

// 内置插件白名单的统一查询位置
export const builtinPlugins: string[] = [
    'engine',
    'scene',
    'cocos-service',
    ...platformPlugins,
];

// 允许外部覆盖叠加的内部插件
export const canOverwritePlugins: string[] = ['cocos-service', 'cocos-hot-fix', 'localization-editor', 'automation-framework', 'platform-example'];

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
