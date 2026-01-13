'use strict';

import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../native-common';

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'HarmonyOS Next',
    platformType: 'OPEN_HARMONY', // 历史原因，理论上应该使用HarmonyOS Next
    doc: 'editor/publish/publish-openharmony.html',
    hooks: './hooks',
    commonOptions: {
        polyfills: {
            hidden: true,
        },
        sourceMaps: {
            hidden: true,
        },
    },
    verifyRuleMap: {
        packageName: {
            func: (str: string) => {
                // refer: https://developer.huawei.com/consumer/cn/doc/app/agc-help-createharmonyapp-0000001945392297
                return /^(?:[a-zA-Z](?:\w*[0-9a-zA-Z])?)(?:\.[0-9a-zA-Z](?:\w*[0-9a-zA-Z])?){2,}$/.test(str);
            },
            message: 'Invalid package name specified',
        },
    },
    options: {
        ...baseNativeCommonOptions,
        packageName: {
            label: 'i18n:harmonyos-next.options.package_name',
            type: 'string',
            default: 'com.cocos.test',
            verifyRules: ['required', 'packageName'],
        },
        orientation: {
            label: 'i18n:harmonyos-next.options.orientation',
            type: 'object',
            properties: {
                portrait: {
                    label: 'i18n:harmonyos-next.options.portrait',
                    type: 'boolean',
                    default: false,
                },
                landscapeRight: {
                    label: 'i18n:harmonyos-next.options.landscape_right',
                    type: 'boolean',
                    default: true,
                },
                landscapeLeft: {
                    label: 'i18n:harmonyos-next.options.landscape_left',
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
        appABIs: {
            type: 'array',
            default: ['arm64-v8a'],
            items: { type: 'string' },
        },
        renderBackEnd: {
            label: 'i18n:harmonyos-next.options.render_back_end',
            description: 'i18n:harmonyos-next.options.render_back_end',
            type: 'object',
            properties: {
                // TODO OHOS 暂时隐藏其他后端选项
                // vulkan: {
                //     label: 'VULKAN',
                //     default: false,
                //     render: {
                //         ui: 'ui-checkbox',
                //     },
                // },
                gles3: {
                    label: 'GLES3',
                    type: 'boolean',
                    default: true,
                },
                // gles2: {
                //     label: 'GLES2',
                //     default: false,
                //     render: {
                //         ui: 'ui-checkbox',
                //     },
                // },
            },
        },
        jsEngine: {
            default: 'JSVM',  // 可以选择 V8 或者 ARK
            label: 'i18n:harmonyos-next.options.js_engine',
            type: 'string',
        },
        deviceTypes: {
            default: {
                default: true
            },
            label: 'i18n:harmonyos-next.options.device_types',
            type: 'object',
            properties: {
                phone: {
                    label: 'i18n:harmonyos-next.options.device_phone',
                    type: 'boolean',
                    default: false,
                },
                tablet: {
                    label: 'i18n:harmonyos-next.options.device_tablet',
                    type: 'boolean',
                    default: false,
                },
                pc_2in1: {
                    label: 'i18n:harmonyos-next.options.device_pc_2in1',
                    type: 'boolean',
                    default: false,
                },
                tv: {
                    label: 'i18n:harmonyos-next.options.device_tv',
                    type: 'boolean',
                    default: false,
                },
                wearable: {
                    label: 'i18n:harmonyos-next.options.device_wearable',
                    type: 'boolean',
                    default: false,
                },
                car: {
                    label: 'i18n:harmonyos-next.options.device_car',
                    type: 'boolean',
                    default: false,
                },
                default: {
                    label: 'i18n:harmonyos-next.options.device_default',
                    type: 'boolean',
                    default: false,
                },
            }
        },
        // 因为游戏手柄适配时，OH的版本要求要大于20，因此默认是关闭的
        // 后期成熟的话，可以完全移除这个选项，默认应该是开启的。
        useGamepad: {
            label: 'i18n:harmonyos-next.options.use_gamepad',
            type: 'boolean',
            default: false,
        }
        // API11 has changed and is temporarily hidden.
        // useAotOptimization: {
        //     label: 'i18n:openharmony.options.use_aot_optimization',
        //     description: 'i18n:openharmony.tips.use_aot_optimization',
        //     default: false,
        //     render: {
        //         ui: 'ui-checkbox',
        //     },
        // },
        // useV8: {
        //     label: 'i18n:openharmony.options.use_v8',
        //     description: 'i18n:openharmony.tips.use_v8',
        //     default: true,
        //     render: {
        //         ui: 'ui-checkbox'
        //     },

        // },
    },
    // TODO OHOS 该平台是否有需要支持压缩纹理
    textureCompressConfig: {
        platformType: 'harmonyos-next',
        support: {
            rgb: ['etc2_rgb', 'etc1_rgb', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
            rgba: ['etc2_rgba', 'etc1_rgb_a', 'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'],
        },
    },
};

export default config;