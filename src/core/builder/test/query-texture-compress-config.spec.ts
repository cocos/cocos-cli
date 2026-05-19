/**
 * 纹理压缩完整测试用例
 *
 * 基于 Cocos Creator 中
 * builtin/builder/@types/public/texture-compress.d.ts 定义的类型和格式，
 * 结合 cocos-cli 中 share/texture-compress.ts 的实际配置数据，
 * 对纹理压缩的类型定义、格式配置、平台支持、质量参数、configGroups 合并逻辑
 * 以及 queryTextureCompressConfig 进行全面测试。
 */

import { PluginManager } from '../manager/plugin';
import {
    ITextureCompressType,
    ITextureCompressPlatform,
    ITextureCompressFormatType,
    ITextureFormatInfo,
    ISupportFormat,
    IConfigGroupsInfo,
    TextureCompressRenderConfig,
    PlatformTextureCompressConfig,
    PlatformCompressConfig,
    IPVRQuality,
    IETCQuality,
    IASTCQuality,
} from '../@types';

// ============ Mocks ============

jest.mock('../../base/i18n', () => {
    const mock = {
        transI18nName(name: string) {
            const map: Record<string, string> = {
                'i18n:builder.displayName.android': 'Android',
                'i18n:builder.displayName.google-play': 'Google Play',
                'i18n:builder.displayName.ios': 'iOS',
                'i18n:builder.displayName.web-mobile': 'Web Mobile',
                'i18n:builder.displayName.web-desktop': 'Web Desktop',
                'i18n:builder.displayName.harmonyos-next': 'HarmonyOS Next',
                'i18n:wechatgame.title': '微信小游戏',
                'i18n:bytedance-mini-game.title': '抖音小游戏',
                'i18n:alipay-mini-game.title': '支付宝小游戏',
                'i18n:taobao-mini-game.title': '淘宝小游戏',
                'i18n:xiaomi-quick-game.title': '小米快游戏',
                'i18n:oppo-mini-game.title': 'OPPO 小游戏',
                'i18n:vivo-mini-game.title': 'vivo 小游戏',
                'i18n:huawei-quick-game.title': '华为快游戏',
                'i18n:honor-mini-game.title': '荣耀小游戏',
                'i18n:migu-mini-game.title': '咪咕小游戏',
                'i18n:sud-mini-game.title': 'SUD',
                'i18n:sudv2-mini-game.title': 'SUDv2',
                'i18n:fb-instant-games.title': 'Facebook Instant Games',
            };
            return map[name] || name;
        },
        t(key: string) { return key; },
        setLanguage() {},
        registerLanguagePatch() {},
        _lang: 'en',
    };
    return { __esModule: true, default: mock };
});

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: { commonOptionConfigs: {} },
}));

jest.mock('../share/texture-compress', () => {
    const defaultSupport = { rgb: ['jpg', 'webp'], rgba: ['png', 'webp'] };
    return {
        defaultSupport,
        configGroups: {
            android: { defaultSupport, support: { rgb: [...defaultSupport.rgb], rgba: [...defaultSupport.rgba] }, displayName: 'Android', icon: 'android' },
            ios: { defaultSupport, support: { rgb: [...defaultSupport.rgb], rgba: [...defaultSupport.rgba] }, displayName: 'iOS', icon: 'ios' },
            web: { defaultSupport, support: { rgb: [...defaultSupport.rgb], rgba: [...defaultSupport.rgba] }, displayName: 'Web', icon: 'html5' },
            miniGame: { defaultSupport, support: { rgb: [...defaultSupport.rgb], rgba: [...defaultSupport.rgba] }, displayName: 'Mini Game', icon: 'mini-game', supportOverwrite: true },
            'harmonyos-next': { defaultSupport, support: { rgb: [...defaultSupport.rgb], rgba: [...defaultSupport.rgba] }, displayName: 'HarmonyOS', icon: 'harmony-os' },
        },
        textureFormatConfigs: {
            pvr: {
                displayName: 'PVRTC', suffix: '.pvr', parallelism: true, childProcess: true,
                options: { quality: { default: 'normal', type: 'enum', items: [{ value: 'fastest' }, { value: 'fast' }, { value: 'normal' }, { value: 'high' }, { value: 'best' }] } },
                formats: [
                    { value: 'pvrtc_2bits_rgb', formatSuffix: 'RGB_PVRTC_2BPPV1', displayName: 'PVRTC 2bits RGB' },
                    { value: 'pvrtc_2bits_rgba', formatSuffix: 'RGBA_PVRTC_2BPPV1', displayName: 'PVRTC 2bits RGBA', alpha: true },
                    { value: 'pvrtc_2bits_rgb_a', formatSuffix: 'RGB_A_PVRTC_2BPPV1', displayName: 'PVRTC 2bits RGB Separate A', alpha: true },
                    { value: 'pvrtc_4bits_rgb', formatSuffix: 'RGB_PVRTC_4BPPV1', displayName: 'PVRTC 4bits RGB' },
                    { value: 'pvrtc_4bits_rgba', formatSuffix: 'RGBA_PVRTC_4BPPV1', displayName: 'PVRTC 4bits RGBA', alpha: true },
                    { value: 'pvrtc_4bits_rgb_a', formatSuffix: 'RGB_A_PVRTC_4BPPV1', displayName: 'PVRTC 4bits RGB Separate A', alpha: true },
                ],
            },
            etc: {
                displayName: 'ETC', suffix: '.pkm', parallelism: false, childProcess: true,
                options: { quality: { default: 'fast', type: 'enum', items: [{ value: 'slow' }, { value: 'fast' }] } },
                formats: [
                    { value: 'etc1_rgb', formatSuffix: 'RGB_ETC1', displayName: 'ETC1 RGB' },
                    { value: 'etc1_rgb_a', formatSuffix: 'RGBA_ETC1', displayName: 'ETC1 RGB Separate A', alpha: true },
                    { value: 'etc2_rgb', formatSuffix: 'RGB_ETC2', displayName: 'ETC2 RGB' },
                    { value: 'etc2_rgba', formatSuffix: 'RGBA_ETC2', displayName: 'ETC2 RGBA', alpha: true },
                ],
            },
            astc: {
                displayName: 'ASTC', suffix: '.astc', parallelism: false, childProcess: true,
                options: { quality: { default: 'medium', type: 'enum', items: [{ value: 'veryfast' }, { value: 'fast' }, { value: 'medium' }, { value: 'thorough' }, { value: 'exhaustive' }] } },
                formats: [
                    { value: 'astc_4x4', formatSuffix: 'RGBA_ASTC_4x4', displayName: 'ASTC 4x4', alpha: true },
                    { value: 'astc_5x5', formatSuffix: 'RGBA_ASTC_5x5', displayName: 'ASTC 5x5', alpha: true },
                    { value: 'astc_6x6', formatSuffix: 'RGBA_ASTC_6x6', displayName: 'ASTC 6x6', alpha: true },
                    { value: 'astc_8x8', formatSuffix: 'RGBA_ASTC_8x8', displayName: 'ASTC 8x8', alpha: true },
                    { value: 'astc_10x5', formatSuffix: 'RGBA_ASTC_10x5', displayName: 'ASTC 10x5', alpha: true },
                    { value: 'astc_10x10', formatSuffix: 'RGBA_ASTC_10x10', displayName: 'ASTC 10x10', alpha: true },
                    { value: 'astc_12x12', formatSuffix: 'RGBA_ASTC_12x12', displayName: 'ASTC 12x12', alpha: true },
                ],
            },
            png: {
                displayName: 'PNG', suffix: '.png', parallelism: true,
                options: { quality: { default: 80, type: 'number', step: 1, maximum: 100, minimum: 10 } },
                formats: [{ displayName: 'PNG', value: 'png', alpha: true }],
            },
            jpg: {
                displayName: 'JPG', suffix: '.jpg', parallelism: true,
                options: { quality: { default: 80, type: 'number', step: 1, maximum: 100, minimum: 10 } },
                formats: [{ displayName: 'JPG', value: 'jpg', alpha: false }],
            },
            webp: {
                displayName: 'WEBP', suffix: '.webp', parallelism: true, childProcess: true,
                options: { quality: { default: 80, type: 'number', minimum: 10, maximum: 100, step: 1 } },
                formats: [{ displayName: 'WEBP', value: 'webp', alpha: true }],
            },
        },
        formatsInfo: {},
    };
});

jest.mock('../../configuration', () => ({
    configurationRegistry: { register: jest.fn() },
}));

jest.mock('../../../global', () => ({
    GlobalPaths: { workspace: '/tmp/test-workspace' },
}));

// ============ 真实平台数据（来自 3.8.8 编辑器的平台 config.ts） ============

const ASTC_TYPES: ITextureCompressType[] = [
    'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12',
];

const REAL_PLATFORM_CONFIGS: Record<string, { name: string; texture: PlatformCompressConfig }> = {
    android: {
        name: 'i18n:builder.displayName.android',
        texture: {
            platformType: 'android',
            support: {
                rgb: ['etc2_rgb', 'etc1_rgb', ...ASTC_TYPES],
                rgba: ['etc2_rgba', 'etc1_rgb_a', ...ASTC_TYPES],
            },
        },
    },
    'google-play': {
        name: 'i18n:builder.displayName.google-play',
        texture: {
            platformType: 'android',
            support: {
                rgb: ['etc2_rgb', 'etc1_rgb', ...ASTC_TYPES],
                rgba: ['etc2_rgba', 'etc1_rgb_a', ...ASTC_TYPES],
            },
        },
    },
    ios: {
        name: 'i18n:builder.displayName.ios',
        texture: {
            platformType: 'ios',
            support: {
                rgb: ['pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', 'etc2_rgb', 'etc1_rgb', ...ASTC_TYPES],
                rgba: ['pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', 'etc2_rgba', 'etc1_rgb_a', ...ASTC_TYPES],
            },
        },
    },
    'web-mobile': {
        name: 'i18n:builder.displayName.web-mobile',
        texture: {
            platformType: 'web',
            support: {
                rgb: ['etc2_rgb', 'etc1_rgb', 'pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', ...ASTC_TYPES],
                rgba: ['etc2_rgba', 'etc1_rgb_a', 'pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', ...ASTC_TYPES],
            },
        },
    },
    'web-desktop': {
        name: 'i18n:builder.displayName.web-desktop',
        texture: {
            platformType: 'web',
            support: { rgb: [], rgba: [] },
        },
    },
    'harmonyos-next': {
        name: 'i18n:builder.displayName.harmonyos-next',
        texture: {
            platformType: 'harmonyos-next',
            support: {
                rgb: ['etc2_rgb', 'etc1_rgb', ...ASTC_TYPES],
                rgba: ['etc2_rgba', 'etc1_rgb_a', ...ASTC_TYPES],
            },
        },
    },
    // ---- 小游戏平台（全部 platformType: 'miniGame'） ----
    wechatgame: {
        name: 'i18n:wechatgame.title',
        texture: {
            platformType: 'miniGame',
            support: {
                rgb: ['etc1_rgb', 'pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', 'etc2_rgb', ...ASTC_TYPES],
                rgba: ['etc1_rgb_a', 'pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'etc2_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', ...ASTC_TYPES],
            },
        },
    },
    'bytedance-mini-game': {
        name: 'i18n:bytedance-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: {
                rgb: ['etc2_rgb', 'etc1_rgb', 'pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', ...ASTC_TYPES],
                rgba: ['etc2_rgba', 'etc1_rgb_a', 'pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', ...ASTC_TYPES],
            },
        },
    },
    'alipay-mini-game': {
        name: 'i18n:alipay-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: {
                rgb: ['etc1_rgb', 'pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', ...ASTC_TYPES],
                rgba: ['etc1_rgb_a', 'pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', ...ASTC_TYPES],
            },
        },
    },
    'taobao-mini-game': {
        name: 'i18n:taobao-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: {
                rgb: ['etc1_rgb', 'pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', ...ASTC_TYPES],
                rgba: ['etc1_rgb_a', 'pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', ...ASTC_TYPES],
            },
        },
    },
    'xiaomi-quick-game': {
        name: 'i18n:xiaomi-quick-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'oppo-mini-game': {
        name: 'i18n:oppo-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'vivo-mini-game': {
        name: 'i18n:vivo-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'huawei-quick-game': {
        name: 'i18n:huawei-quick-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'honor-mini-game': {
        name: 'i18n:honor-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'migu-mini-game': {
        name: 'i18n:migu-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'sud-mini-game': {
        name: 'i18n:sud-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'sudv2-mini-game': {
        name: 'i18n:sudv2-mini-game.title',
        texture: {
            platformType: 'miniGame',
            support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
        },
    },
    'fb-instant-games': {
        name: 'i18n:fb-instant-games.title',
        texture: {
            platformType: 'miniGame',
            support: {
                rgb: ['etc1_rgb', 'pvrtc_4bits_rgb', 'pvrtc_2bits_rgb'],
                rgba: ['etc1_rgb_a', 'pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba'],
            },
        },
    },
};

// ============ 所有合法的格式值（来自 3.8.8 texture-compress.d.ts） ============

const ALL_COMPRESS_TYPES: ITextureCompressType[] = [
    'jpg', 'png', 'webp',
    'pvrtc_4bits_rgb', 'pvrtc_4bits_rgba', 'pvrtc_4bits_rgb_a',
    'pvrtc_2bits_rgb', 'pvrtc_2bits_rgba', 'pvrtc_2bits_rgb_a',
    'etc1_rgb', 'etc1_rgb_a',
    'etc2_rgb', 'etc2_rgba',
    'astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12',
];

const ALL_PLATFORMS: ITextureCompressPlatform[] = ['miniGame', 'web', 'ios', 'android', 'harmonyos-next'];
const ALL_FORMAT_TYPES: ITextureCompressFormatType[] = ['pvr', 'jpg', 'png', 'etc', 'astc', 'webp'];

const ALL_MINI_GAME_PLATFORMS = [
    'wechatgame', 'bytedance-mini-game', 'alipay-mini-game', 'taobao-mini-game',
    'xiaomi-quick-game', 'oppo-mini-game', 'vivo-mini-game', 'huawei-quick-game',
    'honor-mini-game', 'migu-mini-game', 'sud-mini-game', 'sudv2-mini-game', 'fb-instant-games',
];

// 按纹理格式支持丰富度分类
const MINI_GAME_FULL_SUPPORT = ['wechatgame', 'bytedance-mini-game', 'alipay-mini-game', 'taobao-mini-game'];
const MINI_GAME_ETC_ONLY = ['xiaomi-quick-game', 'oppo-mini-game', 'vivo-mini-game', 'huawei-quick-game', 'honor-mini-game', 'migu-mini-game', 'sud-mini-game', 'sudv2-mini-game'];
const MINI_GAME_ETC_PVRTC = ['fb-instant-games'];

function createPluginManager(): PluginManager {
    return new PluginManager();
}

// ============ 测试用例 ============

describe('纹理压缩完整测试', () => {

    // ========== 1. 类型定义与格式常量验证 ==========

    describe('1. 类型定义与格式常量验证', () => {
        const { textureFormatConfigs, configGroups, defaultSupport } = require('../share/texture-compress');

        it('ITextureCompressType 应覆盖 3.8.8 编辑器定义的所有 20 种具名格式', () => {
            expect(ALL_COMPRESS_TYPES).toHaveLength(20);
            const uniqueTypes = new Set(ALL_COMPRESS_TYPES);
            expect(uniqueTypes.size).toBe(20);
        });

        it('ITextureCompressPlatform 应包含 5 个平台', () => {
            expect(ALL_PLATFORMS).toEqual(['miniGame', 'web', 'ios', 'android', 'harmonyos-next']);
        });

        it('ITextureCompressFormatType 应包含 6 种格式类型', () => {
            expect(ALL_FORMAT_TYPES).toEqual(['pvr', 'jpg', 'png', 'etc', 'astc', 'webp']);
        });

        it('textureFormatConfigs 应包含全部 6 种格式类型的配置', () => {
            expect(Object.keys(textureFormatConfigs).sort()).toEqual([...ALL_FORMAT_TYPES].sort());
        });

        it('configGroups 应包含全部 5 个平台分组', () => {
            expect(Object.keys(configGroups).sort()).toEqual([...ALL_PLATFORMS].sort());
        });

        it('defaultSupport 应包含 jpg/webp (rgb) 和 png/webp (rgba)', () => {
            expect(defaultSupport.rgb).toEqual(['jpg', 'webp']);
            expect(defaultSupport.rgba).toEqual(['png', 'webp']);
        });
    });

    // ========== 2. PVR 格式配置验证 ==========

    describe('2. PVR (PVRTC) 格式配置', () => {
        const { textureFormatConfigs } = require('../share/texture-compress');
        const pvr = textureFormatConfigs.pvr;

        it('应有 6 种 PVRTC 子格式', () => {
            expect(pvr.formats).toHaveLength(6);
        });

        it('格式值应匹配编辑器定义', () => {
            const values = pvr.formats.map((f: ITextureFormatInfo) => f.value);
            expect(values).toEqual([
                'pvrtc_2bits_rgb', 'pvrtc_2bits_rgba', 'pvrtc_2bits_rgb_a',
                'pvrtc_4bits_rgb', 'pvrtc_4bits_rgba', 'pvrtc_4bits_rgb_a',
            ]);
        });

        it('每个格式应有 formatSuffix 用于引擎运行时解析', () => {
            pvr.formats.forEach((f: ITextureFormatInfo) => {
                expect(f.formatSuffix).toBeDefined();
                expect(f.formatSuffix!.length).toBeGreaterThan(0);
            });
        });

        it('RGB 格式的 alpha 应为 falsy，RGBA/RGB_A 格式的 alpha 应为 true', () => {
            pvr.formats.forEach((f: ITextureFormatInfo) => {
                if (f.value === 'pvrtc_2bits_rgb' || f.value === 'pvrtc_4bits_rgb') {
                    expect(f.alpha).toBeFalsy();
                } else {
                    expect(f.alpha).toBe(true);
                }
            });
        });

        it('输出后缀应为 .pvr', () => {
            expect(pvr.suffix).toBe('.pvr');
        });

        it('应支持并行压缩和子进程', () => {
            expect(pvr.parallelism).toBe(true);
            expect(pvr.childProcess).toBe(true);
        });

        it('质量选项应为 enum 类型，包含 5 个级别', () => {
            expect(pvr.options.quality.type).toBe('enum');
            const qualityValues: IPVRQuality[] = pvr.options.quality.items.map((i: any) => i.value);
            expect(qualityValues).toEqual(['fastest', 'fast', 'normal', 'high', 'best']);
            expect(pvr.options.quality.default).toBe('normal');
        });
    });

    // ========== 3. ETC 格式配置验证 ==========

    describe('3. ETC 格式配置', () => {
        const { textureFormatConfigs } = require('../share/texture-compress');
        const etc = textureFormatConfigs.etc;

        it('应有 4 种 ETC 子格式 (ETC1 RGB, ETC1 RGB_A, ETC2 RGB, ETC2 RGBA)', () => {
            expect(etc.formats).toHaveLength(4);
            const values = etc.formats.map((f: ITextureFormatInfo) => f.value);
            expect(values).toEqual(['etc1_rgb', 'etc1_rgb_a', 'etc2_rgb', 'etc2_rgba']);
        });

        it('输出后缀应为 .pkm', () => {
            expect(etc.suffix).toBe('.pkm');
        });

        it('不应支持并行压缩（ETC 编码器限制）', () => {
            expect(etc.parallelism).toBe(false);
        });

        it('质量选项应为 enum 类型，仅 slow/fast 两档', () => {
            expect(etc.options.quality.type).toBe('enum');
            const qualityValues: IETCQuality[] = etc.options.quality.items.map((i: any) => i.value);
            expect(qualityValues).toEqual(['slow', 'fast']);
            expect(etc.options.quality.default).toBe('fast');
        });

        it('ETC1 和 ETC2 的 alpha 属性应正确', () => {
            const etc1Rgb = etc.formats.find((f: ITextureFormatInfo) => f.value === 'etc1_rgb');
            const etc1RgbA = etc.formats.find((f: ITextureFormatInfo) => f.value === 'etc1_rgb_a');
            const etc2Rgb = etc.formats.find((f: ITextureFormatInfo) => f.value === 'etc2_rgb');
            const etc2Rgba = etc.formats.find((f: ITextureFormatInfo) => f.value === 'etc2_rgba');

            expect(etc1Rgb!.alpha).toBeFalsy();
            expect(etc1RgbA!.alpha).toBe(true);
            expect(etc2Rgb!.alpha).toBeFalsy();
            expect(etc2Rgba!.alpha).toBe(true);
        });
    });

    // ========== 4. ASTC 格式配置验证 ==========

    describe('4. ASTC 格式配置', () => {
        const { textureFormatConfigs } = require('../share/texture-compress');
        const astc = textureFormatConfigs.astc;

        it('应有 7 种 ASTC 块尺寸', () => {
            expect(astc.formats).toHaveLength(7);
            const values = astc.formats.map((f: ITextureFormatInfo) => f.value);
            expect(values).toEqual(['astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12']);
        });

        it('所有 ASTC 格式均应支持 alpha', () => {
            astc.formats.forEach((f: ITextureFormatInfo) => {
                expect(f.alpha).toBe(true);
            });
        });

        it('输出后缀应为 .astc', () => {
            expect(astc.suffix).toBe('.astc');
        });

        it('不应支持并行压缩（ASTC 编码器高 CPU 占用）', () => {
            expect(astc.parallelism).toBe(false);
        });

        it('质量选项应为 enum 类型，包含 5 个级别', () => {
            expect(astc.options.quality.type).toBe('enum');
            const qualityValues: IASTCQuality[] = astc.options.quality.items.map((i: any) => i.value);
            expect(qualityValues).toEqual(['veryfast', 'fast', 'medium', 'thorough', 'exhaustive']);
            expect(astc.options.quality.default).toBe('medium');
        });

        it('formatSuffix 应以 RGBA_ASTC_ 为前缀', () => {
            astc.formats.forEach((f: ITextureFormatInfo) => {
                expect(f.formatSuffix).toMatch(/^RGBA_ASTC_/);
            });
        });

        it('ASTC 块尺寸整体趋势从小到大排列（10x5 是非对称块的特例）', () => {
            const blockSizes = astc.formats.map((f: ITextureFormatInfo) => {
                const match = (f.value as string).match(/astc_(\d+)x(\d+)/);
                return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
            });
            expect(blockSizes[0]).toBe(16);  // 4x4
            expect(blockSizes[1]).toBe(25);  // 5x5
            expect(blockSizes[2]).toBe(36);  // 6x6
            expect(blockSizes[3]).toBe(64);  // 8x8
            expect(blockSizes[4]).toBe(50);  // 10x5 (非对称块)
            expect(blockSizes[5]).toBe(100); // 10x10
            expect(blockSizes[6]).toBe(144); // 12x12
        });
    });

    // ========== 5. 通用图片格式（PNG / JPG / WEBP）配置验证 ==========

    describe('5. 通用图片格式 (PNG / JPG / WEBP) 配置', () => {
        const { textureFormatConfigs } = require('../share/texture-compress');

        it('PNG 应支持 alpha，质量为数值类型 (10-100)', () => {
            const png = textureFormatConfigs.png;
            expect(png.formats[0].alpha).toBe(true);
            expect(png.options.quality.type).toBe('number');
            expect(png.options.quality.minimum).toBe(10);
            expect(png.options.quality.maximum).toBe(100);
            expect(png.options.quality.default).toBe(80);
            expect(png.suffix).toBe('.png');
        });

        it('JPG 不应支持 alpha，质量为数值类型 (10-100)', () => {
            const jpg = textureFormatConfigs.jpg;
            expect(jpg.formats[0].alpha).toBe(false);
            expect(jpg.options.quality.type).toBe('number');
            expect(jpg.options.quality.minimum).toBe(10);
            expect(jpg.options.quality.maximum).toBe(100);
            expect(jpg.options.quality.default).toBe(80);
            expect(jpg.suffix).toBe('.jpg');
        });

        it('WEBP 应支持 alpha，且需要子进程处理', () => {
            const webp = textureFormatConfigs.webp;
            expect(webp.formats[0].alpha).toBe(true);
            expect(webp.childProcess).toBe(true);
            expect(webp.suffix).toBe('.webp');
        });

        it('PNG / JPG / WEBP 均应支持并行压缩', () => {
            expect(textureFormatConfigs.png.parallelism).toBe(true);
            expect(textureFormatConfigs.jpg.parallelism).toBe(true);
            expect(textureFormatConfigs.webp.parallelism).toBe(true);
        });
    });

    // ========== 6. 各平台纹理压缩支持验证（基于 3.8.8 真实配置） ==========

    describe('6. 各平台纹理压缩支持验证', () => {

        describe('6.1 Android 平台', () => {
            const cfg = REAL_PLATFORM_CONFIGS.android.texture;

            it('platformType 应为 android', () => {
                expect(cfg.platformType).toBe('android');
            });

            it('RGB 应支持 ETC + ASTC（共 9 种）', () => {
                expect(cfg.support.rgb).toHaveLength(9);
                expect(cfg.support.rgb).toContain('etc2_rgb');
                expect(cfg.support.rgb).toContain('etc1_rgb');
                ASTC_TYPES.forEach(t => expect(cfg.support.rgb).toContain(t));
            });

            it('RGBA 应支持 ETC + ASTC（共 9 种）', () => {
                expect(cfg.support.rgba).toHaveLength(9);
                expect(cfg.support.rgba).toContain('etc2_rgba');
                expect(cfg.support.rgba).toContain('etc1_rgb_a');
                ASTC_TYPES.forEach(t => expect(cfg.support.rgba).toContain(t));
            });

            it('Android 不应支持 PVRTC（PVRTC 仅限 Apple GPU）', () => {
                cfg.support.rgb.forEach(f => expect(f).not.toMatch(/^pvrtc/));
                cfg.support.rgba.forEach(f => expect(f).not.toMatch(/^pvrtc/));
            });
        });

        describe('6.2 Google Play 平台', () => {
            const cfg = REAL_PLATFORM_CONFIGS['google-play'].texture;

            it('platformType 应与 Android 相同（android）', () => {
                expect(cfg.platformType).toBe('android');
            });

            it('支持的格式应与 Android 完全一致', () => {
                expect(cfg.support.rgb).toEqual(REAL_PLATFORM_CONFIGS.android.texture.support.rgb);
                expect(cfg.support.rgba).toEqual(REAL_PLATFORM_CONFIGS.android.texture.support.rgba);
            });
        });

        describe('6.3 iOS 平台', () => {
            const cfg = REAL_PLATFORM_CONFIGS.ios.texture;

            it('platformType 应为 ios', () => {
                expect(cfg.platformType).toBe('ios');
            });

            it('RGB 应支持 PVRTC + ETC + ASTC（共 11 种）', () => {
                expect(cfg.support.rgb).toHaveLength(11);
                expect(cfg.support.rgb).toContain('pvrtc_4bits_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_2bits_rgb');
                expect(cfg.support.rgb).toContain('etc2_rgb');
                expect(cfg.support.rgb).toContain('etc1_rgb');
            });

            it('RGBA 应支持 PVRTC + ETC + ASTC（共 13 种，含 rgb_a 分离通道变体）', () => {
                expect(cfg.support.rgba).toHaveLength(13);
                expect(cfg.support.rgba).toContain('pvrtc_4bits_rgb_a');
                expect(cfg.support.rgba).toContain('pvrtc_4bits_rgba');
                expect(cfg.support.rgba).toContain('pvrtc_2bits_rgb_a');
                expect(cfg.support.rgba).toContain('pvrtc_2bits_rgba');
                expect(cfg.support.rgba).toContain('etc2_rgba');
                expect(cfg.support.rgba).toContain('etc1_rgb_a');
            });

            it('iOS 是唯一同时支持 PVRTC + ETC + ASTC 三种 GPU 格式的平台', () => {
                const hasPvrtc = cfg.support.rgb.some((f: string) => f.startsWith('pvrtc'));
                const hasEtc = cfg.support.rgb.some((f: string) => f.startsWith('etc'));
                const hasAstc = cfg.support.rgb.some((f: string) => f.startsWith('astc'));
                expect(hasPvrtc && hasEtc && hasAstc).toBe(true);
            });
        });

        describe('6.4 Web Mobile 平台', () => {
            const cfg = REAL_PLATFORM_CONFIGS['web-mobile'].texture;

            it('platformType 应为 web', () => {
                expect(cfg.platformType).toBe('web');
            });

            it('应支持所有 GPU 纹理格式（WebGL 可能运行在任何设备上）', () => {
                expect(cfg.support.rgb.length).toBeGreaterThanOrEqual(11);
                expect(cfg.support.rgba.length).toBeGreaterThanOrEqual(13);
            });

            it('RGB 应包含 ETC + PVRTC + ASTC', () => {
                expect(cfg.support.rgb).toContain('etc2_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_4bits_rgb');
                expect(cfg.support.rgb).toContain('astc_4x4');
            });
        });

        describe('6.5 Web Desktop 平台', () => {
            const cfg = REAL_PLATFORM_CONFIGS['web-desktop'].texture;

            it('platformType 应为 web', () => {
                expect(cfg.platformType).toBe('web');
            });

            it('不应支持任何 GPU 纹理压缩格式（桌面浏览器通常不需要）', () => {
                expect(cfg.support.rgb).toHaveLength(0);
                expect(cfg.support.rgba).toHaveLength(0);
            });
        });

        describe('6.6 HarmonyOS Next 平台', () => {
            const cfg = REAL_PLATFORM_CONFIGS['harmonyos-next'].texture;

            it('platformType 应为 harmonyos-next', () => {
                expect(cfg.platformType).toBe('harmonyos-next');
            });

            it('支持的格式应与 Android 一致（ETC + ASTC）', () => {
                expect(cfg.support.rgb).toEqual(REAL_PLATFORM_CONFIGS.android.texture.support.rgb);
                expect(cfg.support.rgba).toEqual(REAL_PLATFORM_CONFIGS.android.texture.support.rgba);
            });

            it('不应支持 PVRTC', () => {
                cfg.support.rgb.forEach((f: string) => expect(f).not.toMatch(/^pvrtc/));
            });
        });

        describe('6.7 小游戏平台（共 13 个，全部 platformType: miniGame）', () => {

            it('所有 13 个小游戏平台的 platformType 均为 miniGame', () => {
                ALL_MINI_GAME_PLATFORMS.forEach(platform => {
                    expect(REAL_PLATFORM_CONFIGS[platform].texture.platformType).toBe('miniGame');
                });
            });

            it('微信小游戏: 应支持 ETC1 + ETC2 + PVRTC + ASTC', () => {
                const cfg = REAL_PLATFORM_CONFIGS.wechatgame.texture;
                expect(cfg.support.rgb).toContain('etc1_rgb');
                expect(cfg.support.rgb).toContain('etc2_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_4bits_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_2bits_rgb');
                ASTC_TYPES.forEach(t => expect(cfg.support.rgb).toContain(t));
            });

            it('抖音小游戏: 应支持 ETC1 + ETC2 + PVRTC + ASTC', () => {
                const cfg = REAL_PLATFORM_CONFIGS['bytedance-mini-game'].texture;
                expect(cfg.support.rgb).toContain('etc2_rgb');
                expect(cfg.support.rgb).toContain('etc1_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_4bits_rgb');
                ASTC_TYPES.forEach(t => expect(cfg.support.rgb).toContain(t));
            });

            it('支付宝小游戏: 应支持 ETC1 + PVRTC + ASTC（无 ETC2）', () => {
                const cfg = REAL_PLATFORM_CONFIGS['alipay-mini-game'].texture;
                expect(cfg.support.rgb).toContain('etc1_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_4bits_rgb');
                ASTC_TYPES.forEach(t => expect(cfg.support.rgb).toContain(t));
                expect(cfg.support.rgb).not.toContain('etc2_rgb');
            });

            it('淘宝小游戏: 支持格式应与支付宝小游戏一致', () => {
                const alipay = REAL_PLATFORM_CONFIGS['alipay-mini-game'].texture;
                const taobao = REAL_PLATFORM_CONFIGS['taobao-mini-game'].texture;
                expect(taobao.support.rgb).toEqual(alipay.support.rgb);
                expect(taobao.support.rgba).toEqual(alipay.support.rgba);
            });

            it('微信/抖音/支付宝/淘宝 是 4 个格式最丰富的小游戏平台（支持 ASTC）', () => {
                MINI_GAME_FULL_SUPPORT.forEach(platform => {
                    const cfg = REAL_PLATFORM_CONFIGS[platform].texture;
                    expect(cfg.support.rgb.some((f: string) => f.startsWith('astc'))).toBe(true);
                    expect(cfg.support.rgb.some((f: string) => f.startsWith('pvrtc'))).toBe(true);
                    expect(cfg.support.rgb.some((f: string) => f.startsWith('etc'))).toBe(true);
                });
            });

            it('Facebook Instant Games: 应支持 ETC1 + PVRTC（无 ASTC、无 ETC2）', () => {
                const cfg = REAL_PLATFORM_CONFIGS['fb-instant-games'].texture;
                expect(cfg.support.rgb).toContain('etc1_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_4bits_rgb');
                expect(cfg.support.rgb).toContain('pvrtc_2bits_rgb');
                expect(cfg.support.rgb).not.toContain('etc2_rgb');
                cfg.support.rgb.forEach((f: string) => expect(f).not.toMatch(/^astc/));
            });

            it('小米/OPPO/vivo/华为/荣耀/咪咕/SUD/SUDv2: 仅支持 ETC1', () => {
                MINI_GAME_ETC_ONLY.forEach(platform => {
                    const cfg = REAL_PLATFORM_CONFIGS[platform].texture;
                    expect(cfg.support.rgb).toEqual(['etc1_rgb']);
                    expect(cfg.support.rgba).toEqual(['etc1_rgb_a']);
                });
            });

            it('仅 ETC1 的 8 个平台不应支持 PVRTC 和 ASTC', () => {
                MINI_GAME_ETC_ONLY.forEach(platform => {
                    const cfg = REAL_PLATFORM_CONFIGS[platform].texture;
                    const allFormats = [...cfg.support.rgb, ...cfg.support.rgba];
                    allFormats.forEach((f: string) => {
                        expect(f).not.toMatch(/^pvrtc/);
                        expect(f).not.toMatch(/^astc/);
                    });
                });
            });

            it('所有小游戏平台的 support 格式应都在合法范围内', () => {
                ALL_MINI_GAME_PLATFORMS.forEach(platform => {
                    const cfg = REAL_PLATFORM_CONFIGS[platform].texture;
                    cfg.support.rgb.forEach((f: string) => expect(ALL_COMPRESS_TYPES).toContain(f));
                    cfg.support.rgba.forEach((f: string) => expect(ALL_COMPRESS_TYPES).toContain(f));
                });
            });

            it('微信小游戏是唯一同时支持 ETC2 的小游戏平台', () => {
                const etc2Platforms = ALL_MINI_GAME_PLATFORMS.filter(platform => {
                    return REAL_PLATFORM_CONFIGS[platform].texture.support.rgb.includes('etc2_rgb');
                });
                expect(etc2Platforms).toEqual(['wechatgame', 'bytedance-mini-game']);
            });
        });
    });

    // ========== 7. configGroups 合并逻辑验证 ==========

    describe('7. configGroups 平台注册合并逻辑', () => {
        let pm: PluginManager;

        beforeEach(() => {
            pm = createPluginManager();
        });

        it('注册平台后 configGroups 的 support 应合并该平台的格式', () => {
            const { configGroups } = require('../share/texture-compress');
            const androidGroup: IConfigGroupsInfo = configGroups.android;
            const originalRgbLen = androidGroup.support.rgb.length;

            (pm as any).platformConfig = {};
            (pm as any).configMap = {};

            // 模拟 registerPlatform 中的合并逻辑
            const newFormats = ['etc2_rgb', 'etc1_rgb'];
            const lodash = require('lodash');
            androidGroup.support.rgb = lodash.union(androidGroup.support.rgb, newFormats);

            expect(androidGroup.support.rgb).toContain('etc2_rgb');
            expect(androidGroup.support.rgb).toContain('etc1_rgb');
            expect(androidGroup.support.rgb.length).toBeGreaterThanOrEqual(originalRgbLen);
        });

        it('合并时应使用 lodash.union 去重，不产生重复格式', () => {
            const lodash = require('lodash');
            const existing = ['jpg', 'webp', 'etc2_rgb'];
            const incoming = ['etc2_rgb', 'astc_4x4', 'jpg'];
            const merged = lodash.union(existing, incoming);

            expect(merged).toEqual(['jpg', 'webp', 'etc2_rgb', 'astc_4x4']);
            expect(new Set(merged).size).toBe(merged.length);
        });

        it('defaultSupport 应被合并到平台的 support 中', () => {
            const { configGroups, defaultSupport } = require('../share/texture-compress');
            const androidGroup: IConfigGroupsInfo = configGroups.android;

            const platformSupport: ISupportFormat = {
                rgb: ['etc2_rgb'],
                rgba: ['etc2_rgba'],
            };

            if (androidGroup.defaultSupport) {
                const lodash = require('lodash');
                platformSupport.rgb = lodash.union(platformSupport.rgb, androidGroup.defaultSupport.rgb);
                platformSupport.rgba = lodash.union(platformSupport.rgba, androidGroup.defaultSupport.rgba);
            }

            expect(platformSupport.rgb).toContain('etc2_rgb');
            expect(platformSupport.rgb).toContain('jpg');
            expect(platformSupport.rgb).toContain('webp');
            expect(platformSupport.rgba).toContain('etc2_rgba');
            expect(platformSupport.rgba).toContain('png');
            expect(platformSupport.rgba).toContain('webp');
        });

        it('miniGame 分组应设置 supportOverwrite: true', () => {
            const { configGroups } = require('../share/texture-compress');
            expect(configGroups.miniGame.supportOverwrite).toBe(true);
        });

        it('其他分组不应设置 supportOverwrite', () => {
            const { configGroups } = require('../share/texture-compress');
            expect(configGroups.android.supportOverwrite).toBeUndefined();
            expect(configGroups.ios.supportOverwrite).toBeUndefined();
            expect(configGroups.web.supportOverwrite).toBeUndefined();
            expect(configGroups['harmonyos-next'].supportOverwrite).toBeUndefined();
        });
    });

    // ========== 8. queryTextureCompressConfig 查询接口测试 ==========

    describe('8. queryTextureCompressConfig 查询接口', () => {
        let pm: PluginManager;

        beforeEach(() => {
            pm = createPluginManager();
        });

        it('注入全部 3.8.8 真实平台后应返回 5 个分组', () => {
            (pm as any).platformConfig = {};
            for (const [platform, data] of Object.entries(REAL_PLATFORM_CONFIGS)) {
                (pm as any).platformConfig[platform] = {
                    name: data.name,
                    texture: data.texture,
                };
            }

            const result = pm.queryTextureCompressConfig();
            expect(Object.keys(result).sort()).toEqual(['android', 'harmonyos-next', 'ios', 'miniGame', 'web']);
        });

        it('miniGame 分组应包含全部 13 个小游戏平台', () => {
            (pm as any).platformConfig = {};
            for (const [platform, data] of Object.entries(REAL_PLATFORM_CONFIGS)) {
                (pm as any).platformConfig[platform] = {
                    name: data.name,
                    texture: data.texture,
                };
            }

            const result = pm.queryTextureCompressConfig();
            expect(result.miniGame).toBeDefined();
            expect(result.miniGame.displayName).toBe('Mini Game');
            const miniGamePlatforms = Object.keys(result.miniGame.platformConfigs).sort();
            expect(miniGamePlatforms).toEqual(ALL_MINI_GAME_PLATFORMS.slice().sort());
            expect(miniGamePlatforms).toHaveLength(13);
        });

        it('miniGame 分组中每个平台的 i18n 名称应被正确翻译', () => {
            (pm as any).platformConfig = {};
            ALL_MINI_GAME_PLATFORMS.forEach(platform => {
                const data = REAL_PLATFORM_CONFIGS[platform];
                (pm as any).platformConfig[platform] = { name: data.name, texture: data.texture };
            });

            const result = pm.queryTextureCompressConfig();
            expect(result.miniGame.platformConfigs.wechatgame.platformName).toBe('微信小游戏');
            expect(result.miniGame.platformConfigs['bytedance-mini-game'].platformName).toBe('抖音小游戏');
            expect(result.miniGame.platformConfigs['alipay-mini-game'].platformName).toBe('支付宝小游戏');
            expect(result.miniGame.platformConfigs['taobao-mini-game'].platformName).toBe('淘宝小游戏');
            expect(result.miniGame.platformConfigs['xiaomi-quick-game'].platformName).toBe('小米快游戏');
            expect(result.miniGame.platformConfigs['oppo-mini-game'].platformName).toBe('OPPO 小游戏');
            expect(result.miniGame.platformConfigs['vivo-mini-game'].platformName).toBe('vivo 小游戏');
            expect(result.miniGame.platformConfigs['huawei-quick-game'].platformName).toBe('华为快游戏');
            expect(result.miniGame.platformConfigs['honor-mini-game'].platformName).toBe('荣耀小游戏');
            expect(result.miniGame.platformConfigs['migu-mini-game'].platformName).toBe('咪咕小游戏');
            expect(result.miniGame.platformConfigs['sud-mini-game'].platformName).toBe('SUD');
            expect(result.miniGame.platformConfigs['sudv2-mini-game'].platformName).toBe('SUDv2');
            expect(result.miniGame.platformConfigs['fb-instant-games'].platformName).toBe('Facebook Instant Games');
        });

        it('android 分组应包含 android 和 google-play 两个平台', () => {
            (pm as any).platformConfig = {
                android: { name: 'Android', texture: REAL_PLATFORM_CONFIGS.android.texture },
                'google-play': { name: 'Google Play', texture: REAL_PLATFORM_CONFIGS['google-play'].texture },
            };

            const result = pm.queryTextureCompressConfig();
            expect(Object.keys(result.android.platformConfigs).sort()).toEqual(['android', 'google-play']);
        });

        it('web 分组应包含 web-mobile 和 web-desktop 两个平台', () => {
            (pm as any).platformConfig = {
                'web-mobile': { name: 'Web Mobile', texture: REAL_PLATFORM_CONFIGS['web-mobile'].texture },
                'web-desktop': { name: 'Web Desktop', texture: REAL_PLATFORM_CONFIGS['web-desktop'].texture },
            };

            const result = pm.queryTextureCompressConfig();
            expect(Object.keys(result.web.platformConfigs).sort()).toEqual(['web-desktop', 'web-mobile']);
            expect(result.web.displayName).toBe('Web');
        });

        it('web-desktop 在 web 分组中 support 应为空数组', () => {
            (pm as any).platformConfig = {
                'web-desktop': { name: 'Web Desktop', texture: REAL_PLATFORM_CONFIGS['web-desktop'].texture },
            };

            const result = pm.queryTextureCompressConfig();
            expect(result.web.platformConfigs['web-desktop'].support.rgb).toEqual([]);
            expect(result.web.platformConfigs['web-desktop'].support.rgba).toEqual([]);
        });

        it('i18n 名称应被正确翻译', () => {
            (pm as any).platformConfig = {
                android: { name: 'i18n:builder.displayName.android', texture: REAL_PLATFORM_CONFIGS.android.texture },
            };

            const result = pm.queryTextureCompressConfig();
            expect(result.android.platformConfigs.android.platformName).toBe('Android');
        });

        it('没有 texture 配置的平台应被跳过', () => {
            (pm as any).platformConfig = {
                windows: { name: 'Windows' },
                mac: { name: 'Mac' },
                android: { name: 'Android', texture: REAL_PLATFORM_CONFIGS.android.texture },
            };

            const result = pm.queryTextureCompressConfig();
            expect(Object.keys(result)).toEqual(['android']);
        });

        it('无任何平台注册时应返回空对象', () => {
            (pm as any).platformConfig = {};
            expect(pm.queryTextureCompressConfig()).toEqual({});
        });

        it('返回结果应符合 TextureCompressRenderConfig 类型结构', () => {
            (pm as any).platformConfig = {
                ios: { name: 'iOS', texture: REAL_PLATFORM_CONFIGS.ios.texture },
            };

            const result = pm.queryTextureCompressConfig();
            const config: TextureCompressRenderConfig = result.ios;

            expect(typeof config.displayName).toBe('string');
            expect(typeof config.platformConfigs).toBe('object');

            const platConfig: PlatformTextureCompressConfig = config.platformConfigs.ios;
            expect(typeof platConfig.platformName).toBe('string');
            expect(typeof platConfig.platformType).toBe('string');
            expect(Array.isArray(platConfig.support.rgb)).toBe(true);
            expect(Array.isArray(platConfig.support.rgba)).toBe(true);
        });
    });

    // ========== 9. getTexturePlatformConfigs 接口测试 ==========

    describe('9. getTexturePlatformConfigs 接口', () => {
        let pm: PluginManager;

        beforeEach(() => {
            pm = createPluginManager();
        });

        it('应返回所有已注册平台的纹理配置', () => {
            (pm as any).platformConfig = {
                android: { name: 'Android', texture: REAL_PLATFORM_CONFIGS.android.texture },
                ios: { name: 'iOS', texture: REAL_PLATFORM_CONFIGS.ios.texture },
            };

            const result = pm.getTexturePlatformConfigs();
            expect(Object.keys(result).sort()).toEqual(['android', 'ios']);
            expect(result.android.name).toBe('Android');
            expect(result.android.textureCompressConfig).toEqual(REAL_PLATFORM_CONFIGS.android.texture);
        });

        it('没有 texture 的平台也应在结果中（textureCompressConfig 为 undefined）', () => {
            (pm as any).platformConfig = {
                windows: { name: 'Windows' },
            };

            const result = pm.getTexturePlatformConfigs();
            expect(result.windows.name).toBe('Windows');
            expect(result.windows.textureCompressConfig).toBeUndefined();
        });
    });

    // ========== 10. 格式与平台交叉验证 ==========

    describe('10. 格式与平台交叉验证', () => {

        it('所有平台的 support 中的格式值应都在 ALL_COMPRESS_TYPES 范围内', () => {
            for (const [, data] of Object.entries(REAL_PLATFORM_CONFIGS)) {
                data.texture.support.rgb.forEach(f => {
                    expect(ALL_COMPRESS_TYPES).toContain(f);
                });
                data.texture.support.rgba.forEach(f => {
                    expect(ALL_COMPRESS_TYPES).toContain(f);
                });
            }
        });

        it('PVRTC 支持平台: iOS、Web Mobile 及部分小游戏（微信/抖音/支付宝/淘宝/Meta）', () => {
            const pvrtcPlatforms: string[] = [];
            for (const [name, data] of Object.entries(REAL_PLATFORM_CONFIGS)) {
                const allFormats = [...data.texture.support.rgb, ...data.texture.support.rgba];
                if (allFormats.some(f => f.startsWith('pvrtc'))) {
                    pvrtcPlatforms.push(name);
                }
            }
            expect(pvrtcPlatforms.sort()).toEqual([
                'alipay-mini-game', 'bytedance-mini-game', 'fb-instant-games',
                'ios', 'taobao-mini-game', 'web-mobile', 'wechatgame',
            ].sort());
        });

        it('ASTC 支持平台: Android / Google Play / iOS / Web Mobile / HarmonyOS 及 4 个小游戏', () => {
            const astcPlatforms: string[] = [];
            for (const [name, data] of Object.entries(REAL_PLATFORM_CONFIGS)) {
                if (data.texture.support.rgb.some(f => f.startsWith('astc'))) {
                    astcPlatforms.push(name);
                }
            }
            expect(astcPlatforms.sort()).toEqual([
                'alipay-mini-game', 'android', 'bytedance-mini-game', 'google-play',
                'harmonyos-next', 'ios', 'taobao-mini-game', 'web-mobile', 'wechatgame',
            ].sort());
        });

        it('ETC 在除 Web Desktop 外的所有平台中均支持', () => {
            const etcPlatforms: string[] = [];
            for (const [name, data] of Object.entries(REAL_PLATFORM_CONFIGS)) {
                if (data.texture.support.rgb.some(f => f.startsWith('etc'))) {
                    etcPlatforms.push(name);
                }
            }
            expect(etcPlatforms).not.toContain('web-desktop');
            // 6 内置平台（android, google-play, ios, web-mobile, harmonyos-next 不含 web-desktop）+ 13 小游戏 = 18
            expect(etcPlatforms).toHaveLength(18);
        });

        it('Web Desktop 不支持任何 GPU 纹理压缩', () => {
            const cfg = REAL_PLATFORM_CONFIGS['web-desktop'].texture;
            expect(cfg.support.rgb).toHaveLength(0);
            expect(cfg.support.rgba).toHaveLength(0);
        });
    });

    // ========== 11. 格式后缀与引擎运行时映射验证 ==========

    describe('11. 格式后缀与引擎运行时映射', () => {
        const { textureFormatConfigs } = require('../share/texture-compress');

        it('每种格式类型应有唯一的文件后缀', () => {
            const suffixes = Object.values(textureFormatConfigs).map((c: any) => c.suffix);
            expect(new Set(suffixes).size).toBe(suffixes.length);
        });

        it('后缀映射应正确: pvr→.pvr, etc→.pkm, astc→.astc, png→.png, jpg→.jpg, webp→.webp', () => {
            expect(textureFormatConfigs.pvr.suffix).toBe('.pvr');
            expect(textureFormatConfigs.etc.suffix).toBe('.pkm');
            expect(textureFormatConfigs.astc.suffix).toBe('.astc');
            expect(textureFormatConfigs.png.suffix).toBe('.png');
            expect(textureFormatConfigs.jpg.suffix).toBe('.jpg');
            expect(textureFormatConfigs.webp.suffix).toBe('.webp');
        });

        it('所有子格式应有 displayName', () => {
            for (const [, config] of Object.entries(textureFormatConfigs) as [string, any][]) {
                config.formats.forEach((f: ITextureFormatInfo) => {
                    expect(f.displayName).toBeDefined();
                    expect(f.displayName.length).toBeGreaterThan(0);
                });
            }
        });

        it('GPU 纹理格式（PVR/ETC/ASTC）应都有 formatSuffix 用于引擎 PixelFormat 映射', () => {
            const gpuFormats = ['pvr', 'etc', 'astc'];
            for (const type of gpuFormats) {
                const config = textureFormatConfigs[type];
                config.formats.forEach((f: ITextureFormatInfo) => {
                    expect(f.formatSuffix).toBeDefined();
                    expect(typeof f.formatSuffix).toBe('string');
                });
            }
        });

        it('通用图片格式（PNG/JPG/WEBP）不需要 formatSuffix', () => {
            const imgFormats = ['png', 'jpg', 'webp'];
            for (const type of imgFormats) {
                const config = textureFormatConfigs[type];
                config.formats.forEach((f: ITextureFormatInfo) => {
                    expect(f.formatSuffix).toBeUndefined();
                });
            }
        });
    });

    // ========== 12. 并行与子进程调度参数验证 ==========

    describe('12. 并行与子进程调度参数', () => {
        const { textureFormatConfigs } = require('../share/texture-compress');

        it('支持并行的格式: PNG, JPG, WEBP, PVR', () => {
            expect(textureFormatConfigs.png.parallelism).toBe(true);
            expect(textureFormatConfigs.jpg.parallelism).toBe(true);
            expect(textureFormatConfigs.webp.parallelism).toBe(true);
            expect(textureFormatConfigs.pvr.parallelism).toBe(true);
        });

        it('不支持并行的格式: ETC, ASTC', () => {
            expect(textureFormatConfigs.etc.parallelism).toBe(false);
            expect(textureFormatConfigs.astc.parallelism).toBe(false);
        });

        it('需要子进程的格式: PVR, ETC, ASTC, WEBP', () => {
            expect(textureFormatConfigs.pvr.childProcess).toBe(true);
            expect(textureFormatConfigs.etc.childProcess).toBe(true);
            expect(textureFormatConfigs.astc.childProcess).toBe(true);
            expect(textureFormatConfigs.webp.childProcess).toBe(true);
        });

        it('不需要子进程的格式: PNG, JPG', () => {
            expect(textureFormatConfigs.png.childProcess).toBeUndefined();
            expect(textureFormatConfigs.jpg.childProcess).toBeUndefined();
        });
    });

    // ========== 13. 边界情况测试 ==========

    describe('13. 边界情况', () => {
        let pm: PluginManager;

        beforeEach(() => {
            pm = createPluginManager();
        });

        it('平台注册了无效的 platformType 时 queryTextureCompressConfig 应使用 platformType 作为 displayName', () => {
            (pm as any).platformConfig = {
                'custom-device': {
                    name: 'Custom Device',
                    texture: {
                        platformType: 'unknownType' as ITextureCompressPlatform,
                        support: { rgb: ['jpg'], rgba: ['png'] },
                    },
                },
            };

            const result = pm.queryTextureCompressConfig();
            expect(result.unknownType).toBeDefined();
            expect(result.unknownType.displayName).toBe('unknownType');
        });

        it('全部 13 个真实小游戏平台应合并到同一个 miniGame 分组中', () => {
            (pm as any).platformConfig = {};
            ALL_MINI_GAME_PLATFORMS.forEach(platform => {
                const data = REAL_PLATFORM_CONFIGS[platform];
                (pm as any).platformConfig[platform] = { name: data.name, texture: data.texture };
            });

            const result = pm.queryTextureCompressConfig();
            expect(Object.keys(result)).toEqual(['miniGame']);
            expect(Object.keys(result.miniGame.platformConfigs)).toHaveLength(13);
            expect(result.miniGame.displayName).toBe('Mini Game');
        });

        it('平台 support 为空数组时查询不应报错', () => {
            (pm as any).platformConfig = {
                'empty-platform': {
                    name: 'Empty',
                    texture: { platformType: 'web', support: { rgb: [], rgba: [] } },
                },
            };

            const result = pm.queryTextureCompressConfig();
            expect(result.web.platformConfigs['empty-platform'].support.rgb).toEqual([]);
            expect(result.web.platformConfigs['empty-platform'].support.rgba).toEqual([]);
        });

        it('同一个 platformType 下注册大量平台时 platformConfigs 应完整', () => {
            const platforms: Record<string, any> = {};
            for (let i = 0; i < 10; i++) {
                platforms[`mini-game-${i}`] = {
                    name: `MiniGame ${i}`,
                    texture: { platformType: 'miniGame', support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] } },
                };
            }
            (pm as any).platformConfig = platforms;

            const result = pm.queryTextureCompressConfig();
            expect(Object.keys(result.miniGame.platformConfigs)).toHaveLength(10);
        });

        it('平台未提供 name 时应回退使用平台 key 作为 platformName', () => {
            (pm as any).platformConfig = {
                'unknown-platform': {
                    texture: {
                        platformType: 'web',
                        support: { rgb: ['jpg'], rgba: ['png'] },
                    },
                },
            };
            const result = pm.queryTextureCompressConfig();
            expect(result.web.platformConfigs['unknown-platform'].platformName).toBe('unknown-platform');
        });
    });
});
