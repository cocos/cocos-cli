'use strict';

import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../native-common';

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'OHOS',
    platformType: 'OHOS',
    doc: 'editor/publish/publish-huawei-ohos.html',
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
                // refer: https://developer.ohos.com/studio/build/application-id.html
                return /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(str);
            },
            message: 'Invalid package name specified',
        },
    },
    hooks: './hooks',

    options: {
        ...baseNativeCommonOptions,
        packageName: {
            label: 'i18n:ohos.options.package_name',
            type: 'string',
            default: 'com.cocos.ohos',
            verifyRules: ['required', 'packageName'],
        },
        apiLevel: {
            label: 'i18n:ohos.options.apiLevel',
            type: 'number',
            // TODO OHOS 默认值、是否为必选项
            default: 5,
            verifyRules: ['required'],
        },
        orientation: {
            label: 'i18n:ohos.options.orientation',
            type: 'object',
            properties: {
                portrait: {
                    label: 'i18n:ohos.options.portrait',
                    type: 'boolean',
                    default: false,
                },
                upsideDown: {
                    label: 'i18n:ohos.options.upsideDown',
                    type: 'boolean',
                    default: false,
                },
                landscapeRight: {
                    label: 'i18n:ohos.options.landscape_right',
                    type: 'boolean',
                    default: true,
                },
                landscapeLeft: {
                    label: 'i18n:ohos.options.landscape_left',
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

    },
    // TODO OHOS 该平台是否有需要支持压缩纹理
    // textureCompressConfig: {
    //     platformType: 'ohos',
    //     support: {
    //         rgb: ['etc2_rgb', 'etc1_rgb', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
    //         rgba: ['etc2_rgba', 'etc1_rgb_a', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
    //     },
    // },
};

export default config;
