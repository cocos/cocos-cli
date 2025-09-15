import { Platform } from "../@types";
import { OverwriteCommonOption } from "../@types/protected";

const INTERNAL_NATIVE_PLATFORM: Platform[] = [
    'android',
    'google-play', // 💰
    'ohos', // 💰
    'harmonyos-next', // 💰
    'huawei-agc', // 💰
    'ios',
    // 'ios-app-clip',
    'windows',
    'mac',
    'linux',
];

export const EXTERNAL_NATIVE_PLATFORM: Platform[] = [
    'online',

    'xr-meta',
    'xr-huaweivr',
    'xr-pico',
    'xr-rokid',
    'xr-monado',
    'xr-spaces',
    'xr-seed',
    'ar-android',
    'ar-ios',
    'xr-gsxr',
    'xr-yvr',
    'xr-htc',
    'xr-iqiyi',
    'xr-skyworth',
    'xr-ffalcon',
    'xr-nreal',
    'xr-inmo',
    'xr-lenovo',

    'android-hmi',
];

export const NATIVE_PLATFORM: Platform[] = [
    ...INTERNAL_NATIVE_PLATFORM,
    ...EXTERNAL_NATIVE_PLATFORM,
];

// 支持的平台数组，顺序将会影响界面的平台排序，💰 是金主爸爸，需要给它们一个好位置
export const PLATFORMS: Platform[] = [
    ...INTERNAL_NATIVE_PLATFORM,

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
    // 'cocos-play', // 3.7.0 已废弃此平台
    'link-sure',
    'qtt',
    'fb-instant-games',

    'web-desktop',
    'web-mobile',

    'cocos-runtime',
    'platform-example',
    ...EXTERNAL_NATIVE_PLATFORM,
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
    'cocos-hot-fix',
    'localization-editor',
    'automation-framework',
    // 内部插件示例模板
    'platform-example',
    'xr-plugin',
    'adsense-h5g-plugin',
    'hmi-adapter',
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
