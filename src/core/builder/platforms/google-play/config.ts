'use strict';

import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../native-common';


const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'Google-Play',
    platformType: 'ANDROID',
    doc: 'editor/publish/google-play/build-example-google-play.html',
    hooks: './hooks',
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
    },
    options: {
        ...baseNativeCommonOptions,
        packageName: {
            label: 'i18n:google-play.options.package_name',
            type: 'string',
            default: 'com.cocos.game',
            verifyRules: ['required', 'packageName'],
        },
        apiLevel: {
            label: 'i18n:google-play.options.apiLevel',
            type: 'number',
            default: 35,
            verifyRules: ['required'],
        },
        appABIs: {
            label: 'i18n:google-play.options.appABIs',
            type: 'array',
            default: ['arm64-v8a'],
            items: { type: 'string' },
        },
        resizeableActivity: {
            label: 'i18n:google-play.options.resizeable_activity',
            type: 'boolean',
            default: true,
        },
        maxAspectRatio: {
            label: 'i18n:google-play.options.max_aspect_ratio',
            type: 'string',
            default: '2.4',
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
        },
        keystorePassword: {
            label: 'i18n:google-play.KEYSTORE.keystore_password',
            type: 'string',
            default: '',
        },
        keystoreAlias: {
            label: 'i18n:google-play.KEYSTORE.keystore_alias',
            type: 'string',
            default: '',
        },
        keystoreAliasPassword: {
            label: 'i18n:google-play.KEYSTORE.keystore_alias_password',
            type: 'string',
            default: '',
        },
        appBundle: {
            label: 'i18n:google-play.options.app_bundle',
            type: 'boolean',
            default: true,
        },
        androidInstant: {
            label: 'i18n:google-play.options.google_play_instant',
            type: 'boolean',
            default: false,
        },
        inputSDK: {
            label: 'i18n:google-play.options.input_sdk',
            type: 'boolean',
            default: false,
        },
        remoteUrl: {
            label: 'i18n:google-play.options.remoteUrl',
            type: 'string',
            default: '',
        },
        swappy: {
            label: 'i18n:google-play.options.swappy',
            type: 'boolean',
            default: false,
            description: 'i18n:google-play.options.swappy_tips',
        },
        playGames: {
            type: 'boolean',
            default: true,
        },
        googleBilling: {
            label: 'i18n:google-play.tips.google_play_billing',
            type: 'boolean',
            default: true,
        },
        customIcon: {
            label: 'i18n:google-play.custom_icon.title',
            type: 'string',
            default: 'default',
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
        },
        adpf: {
            default: true,
            type: 'boolean',
            label: 'i18n:google-play.options.adpf',
            description: 'i18n:google-play.options.adpf_tips',
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