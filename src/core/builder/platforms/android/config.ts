'use strict';

import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../native-common';

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'Android',
    platformType: 'ANDROID',
    doc: 'editor/publish/android/build-example-android.html',
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
            label: 'i18n:android.options.package_name',
            type: 'string',
            default: 'com.cocos.game',
            verifyRules: ['required', 'packageName'],
        },
        apiLevel: {
            label: 'i18n:android.options.apiLevel',
            type: 'number',
            default: 35,
            verifyRules: ['required'],
        },
        appABIs: {
            label: 'i18n:android.options.appABIs',
            type: 'array',
            default: ['arm64-v8a'],
            items: { type: 'string' },
        },
        resizeableActivity: {
            label: 'i18n:android.options.resizeable_activity',
            type: 'boolean',
            default: true,
        },
        maxAspectRatio: {
            label: 'i18n:android.options.max_aspect_ratio',
            type: 'string',
            default: '2.4',
        },
        orientation: {
            label: 'i18n:android.options.screen_orientation',
            type: 'object',
            properties: {
                portrait: {
                    label: 'i18n:android.options.portrait',
                    type: 'boolean',
                    default: false,
                },
                upsideDown: {
                    label: 'i18n:android.options.upsideDown',
                    type: 'boolean',
                    default: false,
                },
                landscapeRight: {
                    label: 'i18n:android.options.landscape_right',
                    type: 'boolean',
                    default: true,
                },
                landscapeLeft: {
                    label: 'i18n:android.options.landscape_left',
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
            label: 'i18n:android.KEYSTORE.use_debug_keystore',
            type: 'boolean',
            default: true,
        },
        keystorePath: {
            label: 'i18n:android.KEYSTORE.keystore_path',
            type: 'string',
            default: '',
        },
        keystorePassword: {
            label: 'i18n:android.KEYSTORE.keystore_password',
            type: 'string',
            default: '',
        },
        keystoreAlias: {
            label: 'i18n:android.KEYSTORE.keystore_alias',
            type: 'string',
            default: '',
        },
        keystoreAliasPassword: {
            label: 'i18n:android.KEYSTORE.keystore_alias_password',
            type: 'string',
            default: '',
        },
        appBundle: {
            label: 'i18n:android.options.app_bundle',
            type: 'boolean',
            default: false,
        },
        androidInstant: {
            label: 'i18n:android.options.google_play_instant',
            type: 'boolean',
            default: false,
        },
        inputSDK: {
            label: 'i18n:android.options.input_sdk',
            type: 'boolean',
            default: false,
        },
        remoteUrl: {
            label: 'i18n:android.options.remoteUrl',
            type: 'string',
            default: '',
        },
        swappy: {
            label: 'i18n:android.options.swappy',
            type: 'boolean',
            default: false,
            description: 'i18n:android.options.swappy_tips',
        },
        renderBackEnd: {
            label: 'i18n:android.options.render_back_end',
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
    },
    textureCompressConfig: {
        platformType: 'android',
        support: {
            rgb: ['etc2_rgb', 'etc1_rgb', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
            rgba: ['etc2_rgba', 'etc1_rgb_a', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
        },
    },
    hooks: './hooks',
};

export default config;

