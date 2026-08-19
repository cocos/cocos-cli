'use strict';

import { IPlatformBuildPluginConfig } from '../../../@types/protected';
import { commonOptions } from '../../native-common';

// 与 android 一致：联动条件按 options.platform 取包名，不要硬编码 packages['google-play']
function pkgOptions(options: any): any {
    return options?.packages?.[options?.platform] || options?.packages?.['google-play'] || {};
}

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'i18n:google-play.title',
    platformType: 'ANDROID',
    doc: 'editor/publish/google-play/build-example-google-play.html',
    hooks: './src/hooks',
    commonOptions: {
        polyfills: {
            hidden: true,
        },
        useBuiltinServer: {
            hidden: false,
        },
        nativeCodeBundleMode: {
            default: 'wasm',
        },
    },
    verifyRuleMap: {
        packageName: {
            func: (str: string) => {
                // refer: https://developer.android.com/studio/build/application-id.html
                return /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(str);
            },
            message: 'Invalid package name specified',
        },
        // 当 useDebugKeystore=false 时，keystore 相关字段（keystorePath/Password/Alias/AliasPassword）
        // 需校验：keystoreRequired 卡 undefined/null（真的没设），keystoreNotEmpty 卡 ''（设了但空）。
        // 迁移自 editor 的 getVerifyMap，两条规则区分语义。
        // gate 用 !== false：checkBuildOption 逐字段校验时不会合并平台默认值（createVerifyOptions 只 clone 调用方传入的 options），
        // 字段缺失时必须按声明的默认值 true 处理，否则会误报"keystore 不能为空"。
        keystoreRequired: {
            func: (value: unknown, options: any) => {
                if (pkgOptions(options).useDebugKeystore !== false) {
                    return true;
                }
                return value !== null && value !== undefined;
            },
            message: 'Required when useDebugKeystore is false (field must be set for the custom release keystore; set useDebugKeystore to true to use the built-in debug keystore)',
        },
        keystoreNotEmpty: {
            func: (value: unknown, options: any) => {
                if (pkgOptions(options).useDebugKeystore !== false) {
                    return true;
                }
                return value !== '';
            },
            message: 'Cannot be empty when useDebugKeystore is false (a value is needed for the custom release keystore; set useDebugKeystore to true to use the built-in debug keystore)',
        },
        // apiLevel 校验：Google Play 政策最低 API 24（apiLevelMin24 兜底政策），
        // 同时保留引擎子系统的技术约束（tbb/延迟渲染管线 >= 21）。数值上被 24 覆盖，
        // 联动规则不会真正 fire，但保留可以表达 constraint 来源（Google Play 政策 vs 引擎特性）。
        apiLevelIsNumber: {
            func: (value: unknown) => typeof value === 'number' ? !isNaN(value) : !isNaN(Number(value)),
            message: 'API Level must be a number',
        },
        apiLevelMin24: {
            func: (value: unknown) => Number(value) >= 24,
            message: 'Google Play requires the minimum API Level to be 24.',
        },
        apiLevelTbb: {
            func: (value: unknown, options: any) => {
                if (pkgOptions(options).JobSystem !== 'tbb') {
                    return true;
                }
                return Number(value) >= 21;
            },
            message: 'When TBB is enabled, the minimum API Level required is 21.',
        },
        apiLevelRenderPipeline: {
            func: (value: unknown, options: any) => {
                if (options?.renderPipeline !== '5d45ba66-829a-46d3-948e-2ed3fa7ee421') {
                    return true;
                }
                return Number(value) >= 21;
            },
            message: 'When Deferred Render Pipeline is enabled, the minimum API Level required is 21.',
        },
        // 迁移自 editor verificationFunc 剩余 case：appABIs / renderBackEnd / orientation
        appABIs: {
            func: (value: unknown) => Array.isArray(value) && value.length > 0,
            message: 'appABIs must include at least one ABI',
        },
        renderBackEnd: {
            func: (value: unknown) => {
                if (!value || typeof value !== 'object') {
                    return false;
                }
                // 只认可 google-play 支持的 backend key；至少 1 个开启才算合法。
                const supported = ['vulkan', 'gles3', 'gles2'];
                const v = value as Record<string, unknown>;
                return supported.some((k) => !!v[k]);
            },
            message: 'renderBackEnd must have at least one supported backend enabled (vulkan / gles3 / gles2 for google-play)',
        },
        orientation: {
            func: (value: unknown) => {
                if (!value || typeof value !== 'object') {
                    return false;
                }
                return Object.values(value as Record<string, unknown>).some((v) => !!v);
            },
            message: 'orientation must have at least one direction enabled',
        },
        // maxAspectRatio 只在 resizeableActivity=false 时校验，Required 结尾使空值也能走进 func
        maxAspectRatioRequired: {
            func: (value: unknown, options: any) => {
                if (pkgOptions(options).resizeableActivity !== false) {
                    return true;
                }
                if (typeof value !== 'string' || value.trim() === '') {
                    return false;
                }
                const trimmed = value.trim();
                const LOWER_BOUND = 1.33;
                const optMatch = trimmed.match(/^(\d+(?:\.\d+)?)(?:\s*\(\s*\d+\s*:\s*\d+\s*\))?$/);
                if (optMatch) {
                    return Number.parseFloat(optMatch[1]) >= LOWER_BOUND;
                }
                const fracMatch = trimmed.match(/^(\d+)\s*:\s*(\d+)$/);
                if (fracMatch) {
                    const w = Number.parseInt(fracMatch[1], 10);
                    const h = Number.parseInt(fracMatch[2], 10);
                    return w > 0 && h > 0 && w / h >= LOWER_BOUND;
                }
                return false;
            },
            message: 'maxAspectRatio must be a number, "w:h", or "n.n (w:h)" with value >= 1.33 (required when resizeableActivity is false)',
        },
        // remoteUrl 只在 androidInstant=true 且非空时要求 http 前缀
        remoteUrlHttp: {
            func: (value: unknown, options: any) => {
                if (!pkgOptions(options).androidInstant) {
                    return true;
                }
                if (value === '' || value === null || value === undefined) {
                    return true;
                }
                return typeof value === 'string' && value.startsWith('http');
            },
            message: 'remoteUrl should start with http when androidInstant is enabled',
        },
    },
    options: {
        swappy: {
            label: 'i18n:google-play.options.swappy',
            type: 'boolean',
            default: false,
            description: 'i18n:google-play.options.swappy_tips',
        },
        adpf: {
            default: true,
            type: 'boolean',
            label: 'i18n:google-play.options.adpf',
            description: 'i18n:google-play.options.adpf_tips',
        },
        renderBackEnd: {
            label: 'i18n:google-play.options.render_back_end',
            type: 'object',
            properties: {
                vulkan: {
                    label: 'Vulkan',
                    type: 'boolean',
                    default: false,
                },
                gles3: {
                    label: 'GLES3',
                    type: 'boolean',
                    default: true,
                },
                gles2: {
                    label: 'GLES2',
                    type: 'boolean',
                    default: true,
                },
            },
            default: {
                vulkan: false,
                gles3: true,
                gles2: true,
            },
            hidden: true,
            verifyRules: ['renderBackEnd'],
        },
        packageName: {
            label: 'i18n:google-play.options.package_name',
            type: 'string',
            default: 'com.cocos.game',
            verifyRules: ['required', 'packageName'],
        },
        customIcon: {
            label: 'i18n:google-play.custom_icon.title',
            type: 'string',
            default: 'default',
        },
        apiLevel: {
            label: 'i18n:google-play.options.apiLevel',
            type: 'number',
            default: 35,
            // Google Play 最低 API 24；min24 兜政策提示先命中，tbb/renderPipeline 保留技术约束语义（被 24 覆盖，实际不会 fire）
            verifyRules: ['required', 'apiLevelIsNumber', 'apiLevelMin24', 'apiLevelTbb', 'apiLevelRenderPipeline'],
        },
        appABIs: {
            label: 'i18n:google-play.options.appABIs',
            type: 'array',
            items: { type: 'string' },
            default: ['arm64-v8a'],
            hidden: true,
            verifyRules: ['appABIs'],
        },
        useDebugKeystore: {
            label: 'i18n:google-play.KEYSTORE.use_debug_keystore',
            type: 'boolean',
            default: true,
        },
        keystorePath: {
            label: 'i18n:google-play.KEYSTORE.keystore_path',
            type: 'string',
            default: '',
            verifyRules: ['keystoreRequired', 'keystoreNotEmpty'],
        },
        keystorePassword: {
            label: 'i18n:google-play.KEYSTORE.keystore_password',
            type: 'string',
            default: '',
            verifyRules: ['keystoreRequired', 'keystoreNotEmpty'],
        },
        keystoreAlias: {
            label: 'i18n:google-play.KEYSTORE.keystore_alias',
            type: 'string',
            default: '',
            verifyRules: ['keystoreRequired', 'keystoreNotEmpty'],
        },
        keystoreAliasPassword: {
            label: 'i18n:google-play.KEYSTORE.keystore_alias_password',
            type: 'string',
            default: '',
            verifyRules: ['keystoreRequired', 'keystoreNotEmpty'],
        },
        resizeableActivity: {
            label: 'i18n:google-play.options.resizeable_activity',
            type: 'boolean',
            default: true,
            hidden: true,
        },
        maxAspectRatio: {
            label: 'i18n:google-play.options.max_aspect_ratio',
            type: 'string',
            default: '2.4',
            verifyRules: ['maxAspectRatioRequired'],
        },
        orientation: {
            label: 'i18n:google-play.options.screen_orientation',
            type: 'object',
            properties: {
                portrait: {
                    label: 'i18n:google-play.options.portrait',
                    type: 'boolean',
                    default: false,
                },
                upsideDown: {
                    label: 'i18n:google-play.options.upsideDown',
                    type: 'boolean',
                    default: false,
                },
                landscapeRight: {
                    label: 'i18n:google-play.options.landscape_right',
                    type: 'boolean',
                    default: true,
                },
                landscapeLeft: {
                    label: 'i18n:google-play.options.landscape_left',
                    type: 'boolean',
                    default: true,
                },
            },
            default: {
                portrait: false,
                upsideDown: false,
                landscapeRight: true,
                landscapeLeft: true,
            },
            hidden: true,
            verifyRules: ['orientation'],
        },
        appBundle: {
            label: 'i18n:google-play.options.app_bundle',
            type: 'boolean',
            default: true,
            hidden: true,
        },
        androidInstant: {
            label: 'i18n:google-play.options.google_play_instant',
            type: 'boolean',
            default: false,
        },
        googleBilling: {
            label: 'i18n:google-play.options.google_play_billing',
            type: 'boolean',
            default: true,
            hidden: true,
        },
        inputSDK: {
            label: 'i18n:google-play.options.input_sdk',
            type: 'boolean',
            default: false,
            hidden: true,
        },
        remoteUrl: {
            label: 'i18n:google-play.options.remoteUrl',
            type: 'string',
            default: '',
            hidden: true,
            verifyRules: ['remoteUrlHttp'],
        },
        playGames: {
            type: 'boolean',
            default: true,
            hidden: true,
        },
        isSoFileCompressed: {
            label: 'i18n:google-play.options.compress_so_files',
            type: 'boolean',
            default: false,
        },
    },
    textureCompressConfig: {
        platformType: 'android',
        support: {
            rgb: ['etc2_rgb', 'etc1_rgb', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
            rgba: ['etc2_rgba', 'etc1_rgb_a', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
        },
    },
};

export default config;
