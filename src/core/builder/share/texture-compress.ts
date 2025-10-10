import { ISupportFormat, IConfigGroups, ITextureCompressFormatType, ITextureFormatConfig, ITextureCompressType, ITextureFormatInfo, ICustomConfig, AllTextureCompressConfig } from "../@types";

export const defaultSupport: ISupportFormat = Object.freeze({
    rgb: ['jpg', 'webp'],
    rgba: ['png', 'webp'],
});

export const configGroups: IConfigGroups = {
    web: {
        defaultSupport,
        support: JSON.parse(JSON.stringify(defaultSupport)),
        displayName: 'Web',
        icon: 'html5',
    },
    // pc: {
    //     support: JSON.parse(JSON.stringify(defaultSupport)),
    //     displayName: 'Mac & Windows',
    //     icon: 'desktop',
    // },
    ios: {
        defaultSupport,
        support: JSON.parse(JSON.stringify(defaultSupport)),
        displayName: 'iOS',
        icon: 'ios',
    },
    miniGame: {
        defaultSupport,
        support: JSON.parse(JSON.stringify(defaultSupport)),
        displayName: 'Mini Game',
        icon: 'mini-game',
        supportOverwrite: true,
    },
    android: {
        defaultSupport,
        support: JSON.parse(JSON.stringify(defaultSupport)),
        displayName: 'Android',
        icon: 'android',
    },
    'harmonyos-next': {
        defaultSupport,
        support: JSON.parse(JSON.stringify(defaultSupport)),
        displayName: 'HarmonyOS',
        icon: 'harmony-os',
    },
};

export const textureFormatConfigs: Record<ITextureCompressFormatType, ITextureFormatConfig> = {
    pvr: {
        displayName: 'PVRTC',
        options: {
            quality: {
                default: 'normal',
                render: {
                    ui: 'ui-select-pro',
                    items: [{
                        value: 'fastest',
                        label: 'Fastest',
                    }, {
                        value: 'fast',
                        label: 'Fast',
                    }, {
                        value: 'normal',
                        label: 'Normal',
                    }, {
                        value: 'high',
                        label: 'High',
                    }, {
                        value: 'best',
                        label: 'Best',
                    }],
                },

            },
        }, // 配置方式参考构建界面参数配置即可，后续这部分数据将会被记录下来
        formats: [{
            value: 'pvrtc_2bits_rgb',
            formatSuffix: 'RGB_PVRTC_2BPPV1',
            displayName: 'PVRTC 2bits RGB',
        }, {
            value: 'pvrtc_2bits_rgba',
            formatSuffix: 'RGBA_PVRTC_2BPPV1',
            displayName: 'PVRTC 2bits RGBA',
            alpha: true,
        }, {
            value: 'pvrtc_2bits_rgb_a',
            formatSuffix: 'RGB_A_PVRTC_2BPPV1',
            displayName: 'PVRTC 2bits RGB Separate A',
            alpha: true,
        }, {
            value: 'pvrtc_4bits_rgb',
            formatSuffix: 'RGB_PVRTC_4BPPV1',
            displayName: 'PVRTC 4bits RGB',
        }, {
            value: 'pvrtc_4bits_rgba',
            formatSuffix: 'RGBA_PVRTC_4BPPV1',
            displayName: 'PVRTC 4bits RGBA',
            alpha: true,
        }, {
            value: 'pvrtc_4bits_rgb_a',
            formatSuffix: 'RGB_A_PVRTC_4BPPV1',

            // 对应 cc.Texture2D.PixelFormat.RGB_A_PVRTC_4BPPV1 每一种格式都需要有引擎对应的格式字段，否则运行时也无法正常解析
            // 最终输出在序列化文件里，纹理图的格式后缀会命名为后缀 + 具体格式，例如：.pvr@RGB_A_PVRTC_4BPPV1

            displayName: 'PVRTC 4bits RGB Separate A', // 显示在纹理压缩配置界面的文本
            alpha: true, // 指定是否有透明度，也可以考虑直接使用 value 是否以 RGB_A 开头来判断
        }],
        suffix: '.pvr',
        parallelism: true,
        childProcess: true,
    },
    etc: {
        displayName: 'ETC',
        suffix: '.pkm',
        options: {
            quality: {
                default: 'fast',
                render: {
                    ui: 'ui-select-pro',
                    items: [{
                        value: 'slow',
                        label: 'Slow',
                    }, {
                        value: 'fast',
                        label: 'Fast',
                    }],
                },
            },
        },
        formats: [{
            value: 'etc1_rgb',
            formatSuffix: 'RGB_ETC1',
            displayName: 'ETC1 RGB',
        }, {
            value: 'etc1_rgb_a',
            formatSuffix: 'RGBA_ETC1',
            displayName: 'ETC1 RGB Separate A',
            alpha: true,
        }, {
            value: 'etc2_rgb',
            formatSuffix: 'RGB_ETC2',
            displayName: 'ETC2 RGB',
        }, {
            value: 'etc2_rgba',
            formatSuffix: 'RGBA_ETC2',
            displayName: 'ETC2 RGBA',
            alpha: true,
        }],
        parallelism: false,
        childProcess: true,
    },
    astc: {
        displayName: 'ASTC',
        suffix: '.astc',
        options: {
            quality: {
                default: 'medium',
                render: {
                    ui: 'ui-select-pro',
                    items: [{
                        value: 'veryfast',
                        label: 'VeryFast',
                    }, {
                        value: 'fast',
                        label: 'Fast',
                    }, {
                        value: 'medium',
                        label: 'Medium',
                    }, {
                        value: 'thorough',
                        label: 'Thorough',
                    }, {
                        value: 'exhaustive',
                        label: 'Exhaustive',
                    }],
                },
            },
        },
        formats: [{
            value: 'astc_4x4',
            formatSuffix: 'RGBA_ASTC_4x4',
            displayName: 'ASTC 4x4',
            alpha: true,
        }, {
            value: 'astc_5x5',
            formatSuffix: 'RGBA_ASTC_5x5',
            displayName: 'ASTC 5x5',
            alpha: true,
        }, {
            value: 'astc_6x6',
            formatSuffix: 'RGBA_ASTC_6x6',
            displayName: 'ASTC 6x6',
            alpha: true,
        }, {
            value: 'astc_8x8',
            formatSuffix: 'RGBA_ASTC_8x8',
            displayName: 'ASTC 8x8',
            alpha: true,
        }, {
            value: 'astc_10x5',
            formatSuffix: 'RGBA_ASTC_10x5',
            displayName: 'ASTC 10x5',
            alpha: true,
        }, {
            value: 'astc_10x10',
            formatSuffix: 'RGBA_ASTC_10x10',
            displayName: 'ASTC 10x10',
            alpha: true,
        }, {
            value: 'astc_12x12',
            formatSuffix: 'RGBA_ASTC_12x12',
            displayName: 'ASTC 12x12',
            alpha: true,
        }],
        parallelism: false,
        childProcess: true,
    },
    png: {
        displayName: 'PNG',
        suffix: '.png',
        options: {
            quality: {
                default: 80,
                render: {
                    ui: 'ui-num-input',
                    attributes: {
                        step: 1,
                        max: 100,
                        min: 10,
                    },
                },
            },
        },
        formats: [{
            displayName: 'PNG',
            value: 'png',
            alpha: true,
        }],
        parallelism: true,
    },
    jpg: {
        displayName: 'JPG',
        suffix: '.jpg',
        options: {
            quality: {
                default: 80,
                render: {
                    ui: 'ui-num-input',
                    attributes: {
                        step: 1,
                        max: 100,
                        min: 10,
                    },
                },
            },
        },
        formats: [{
            displayName: 'JPG',
            value: 'jpg',
            alpha: false,
        }],
        parallelism: true,
    },
    webp: {
        displayName: 'WEBP',
        suffix: '.webp',
        options: {
            quality: {
                default: 80,
                render: {
                    ui: 'ui-num-input',
                    attributes: {
                        step: 1,
                        max: 100,
                        min: 10,
                    },
                },
            },
        },
        formats: [{
            displayName: 'WEBP',
            value: 'webp',
            alpha: true,
        }],
        parallelism: true,
        childProcess: true,
    },
};

function getFormatsInfo(textureFormatConfig: Record<ITextureCompressType, ITextureFormatConfig>) {
    const formats: Record<string, ITextureFormatInfo> = {};
    // @ts-ignore
    Object.keys(textureFormatConfig).forEach((key: ITextureCompressFormatType) => {
        const config = textureFormatConfig[key];
        if (config.formats) {
            config.formats.forEach((formatConfig) => {
                formats[formatConfig.value] = {
                    formatType: key,
                    ...formatConfig,
                };
            });
        } else {
            formats[key] = {
                displayName: config.displayName,
                value: key,
                formatType: key,
            };
        }
    });
    return formats;
}

export const formatsInfo = getFormatsInfo(textureFormatConfigs);
