'use strict';

import { IPlatformBuildPluginConfig } from '../../../@types/protected';
import { commonOptions } from '../../native-common';

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
            verifyRules: ['required'],
        },
        appABIs: {
            label: 'i18n:google-play.options.appABIs',
            type: 'object',
            properties: {
                'arm64-v8a': {
                    label: 'arm64-v8a',
                    type: 'boolean',
                    default: true,
                },
                'arm-v7a': {
                    label: 'arm-v7a',
                    type: 'boolean',
                    default: false,
                },
                x86: {
                    label: 'x86',
                    type: 'boolean',
                    default: false,
                },
                x86_64: {
                    label: 'x86_64',
                    type: 'boolean',
                    default: false,
                },
            },
            default: {
                'arm64-v8a': true,
                'arm-v7a': false,
                x86: false,
                x86_64: false,
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
            label: 'i18n:google-play.tips.google_play_billing',
            type: 'boolean',
            default: true,
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
            hidden: true,
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
