import { PluginManager } from '../manager/plugin';
import type { TextureCompressRenderConfig, PlatformTextureCompressConfig, ITextureCompressPlatform } from '../@types';

jest.mock('../../base/i18n', () => {
    const mock = {
        transI18nName(name: string) {
            const map: Record<string, string> = {
                'i18n:builder.displayName.android': 'Android',
                'i18n:builder.displayName.ios': 'iOS',
                'i18n:builder.displayName.web-mobile': 'Web Mobile',
                'i18n:builder.displayName.web-desktop': 'Web Desktop',
                'i18n:builder.displayName.wechatgame': '微信小游戏',
                'i18n:builder.displayName.harmonyos-next': 'HarmonyOS Next',
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

jest.mock('../share/texture-compress', () => ({
    configGroups: {
        android: { displayName: 'Android', support: { rgb: [], rgba: [] } },
        ios: { displayName: 'iOS', support: { rgb: [], rgba: [] } },
        web: { displayName: 'Web', support: { rgb: [], rgba: [] } },
        miniGame: { displayName: 'Mini Game', support: { rgb: [], rgba: [] } },
        'harmonyos-next': { displayName: 'HarmonyOS Next', support: { rgb: [], rgba: [] } },
    },
}));

jest.mock('../../configuration', () => ({
    configurationRegistry: { register: jest.fn() },
}));

jest.mock('../../../global', () => ({
    GlobalPaths: { workspace: '/tmp/test-workspace' },
}));

function createPluginManager(): PluginManager {
    return new PluginManager();
}

describe('PluginManager.queryTextureCompressConfig', () => {
    let pm: PluginManager;

    beforeEach(() => {
        pm = createPluginManager();
    });

    it('should return empty object when no platforms have texture config', () => {
        (pm as any).platformConfig = {
            windows: { name: 'Windows' },
        };
        const result = pm.queryTextureCompressConfig();
        expect(result).toEqual({});
    });

    it('should skip platforms without texture config', () => {
        (pm as any).platformConfig = {
            windows: { name: 'Windows' },
            android: {
                name: 'Android',
                texture: {
                    platformType: 'android',
                    support: { rgb: ['etc1_rgb'], rgba: ['etc2_rgba'] },
                },
            },
        };
        const result = pm.queryTextureCompressConfig();
        expect(Object.keys(result)).toEqual(['android']);
    });

    it('should group platforms by texture platformType', () => {
        (pm as any).platformConfig = {
            android: {
                name: 'Android',
                texture: {
                    platformType: 'android',
                    support: { rgb: ['etc1_rgb'], rgba: ['etc2_rgba'] },
                },
            },
            'web-mobile': {
                name: 'Web Mobile',
                texture: {
                    platformType: 'web',
                    support: { rgb: ['jpg'], rgba: ['png'] },
                },
            },
            'web-desktop': {
                name: 'Web Desktop',
                texture: {
                    platformType: 'web',
                    support: { rgb: ['jpg'], rgba: ['png'] },
                },
            },
        };

        const result = pm.queryTextureCompressConfig();

        expect(Object.keys(result).sort()).toEqual(['android', 'web']);
        expect(Object.keys(result.web.platformConfigs).sort()).toEqual(['web-desktop', 'web-mobile']);
    });

    it('should use configGroups displayName for each platform type', () => {
        (pm as any).platformConfig = {
            android: {
                name: 'Android',
                texture: {
                    platformType: 'android',
                    support: { rgb: [], rgba: [] },
                },
            },
        };

        const result = pm.queryTextureCompressConfig();
        expect(result.android.displayName).toBe('Android');
    });

    it('should fallback displayName to platformType when configGroups has no entry', () => {
        (pm as any).platformConfig = {
            'custom-platform': {
                name: 'Custom',
                texture: {
                    platformType: 'customType' as ITextureCompressPlatform,
                    support: { rgb: [], rgba: [] },
                },
            },
        };

        const result = pm.queryTextureCompressConfig();
        expect(result.customType.displayName).toBe('customType');
    });

    it('should translate platformName via i18n', () => {
        (pm as any).platformConfig = {
            wechatgame: {
                name: 'i18n:builder.displayName.wechatgame',
                texture: {
                    platformType: 'miniGame',
                    support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] },
                },
            },
        };

        const result = pm.queryTextureCompressConfig();
        expect(result.miniGame.platformConfigs.wechatgame.platformName).toBe('微信小游戏');
    });

    it('should fallback platformName to platform key when name is missing', () => {
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

    it('should preserve support formats for each platform', () => {
        const rgb = ['etc2_rgb', 'astc_8x8', 'jpg', 'webp'];
        const rgba = ['etc2_rgba', 'astc_8x8', 'png', 'webp'];
        (pm as any).platformConfig = {
            android: {
                name: 'Android',
                texture: {
                    platformType: 'android',
                    support: { rgb, rgba },
                },
            },
        };

        const result = pm.queryTextureCompressConfig();
        expect(result.android.platformConfigs.android.support.rgb).toEqual(rgb);
        expect(result.android.platformConfigs.android.support.rgba).toEqual(rgba);
    });

    it('should set correct platformType on each PlatformTextureCompressConfig', () => {
        (pm as any).platformConfig = {
            'harmonyos-next': {
                name: 'HarmonyOS Next',
                texture: {
                    platformType: 'harmonyos-next',
                    support: { rgb: ['astc_8x8'], rgba: ['astc_8x8'] },
                },
            },
        };

        const result = pm.queryTextureCompressConfig();
        expect(result['harmonyos-next'].platformConfigs['harmonyos-next'].platformType).toBe('harmonyos-next');
    });

    it('should handle all platform types together', () => {
        (pm as any).platformConfig = {
            android: {
                name: 'Android',
                texture: { platformType: 'android', support: { rgb: ['etc1_rgb'], rgba: ['etc2_rgba'] } },
            },
            ios: {
                name: 'iOS',
                texture: { platformType: 'ios', support: { rgb: ['pvrtc_4bits_rgb'], rgba: ['pvrtc_4bits_rgba'] } },
            },
            'web-mobile': {
                name: 'Web Mobile',
                texture: { platformType: 'web', support: { rgb: ['jpg'], rgba: ['png'] } },
            },
            wechatgame: {
                name: 'i18n:builder.displayName.wechatgame',
                texture: { platformType: 'miniGame', support: { rgb: ['etc1_rgb'], rgba: ['etc1_rgb_a'] } },
            },
            'harmonyos-next': {
                name: 'HarmonyOS Next',
                texture: { platformType: 'harmonyos-next', support: { rgb: ['astc_8x8'], rgba: ['astc_8x8'] } },
            },
        };

        const result = pm.queryTextureCompressConfig();
        expect(Object.keys(result).sort()).toEqual(['android', 'harmonyos-next', 'ios', 'miniGame', 'web']);
    });

    it('should conform to TextureCompressRenderConfig type structure', () => {
        (pm as any).platformConfig = {
            android: {
                name: 'Android',
                texture: {
                    platformType: 'android',
                    support: { rgb: ['etc1_rgb', 'jpg'], rgba: ['etc2_rgba', 'png'] },
                },
            },
        };

        const result = pm.queryTextureCompressConfig();
        const config: TextureCompressRenderConfig = result.android;

        expect(typeof config.displayName).toBe('string');
        expect(typeof config.platformConfigs).toBe('object');

        const platformConfig: PlatformTextureCompressConfig = config.platformConfigs.android;
        expect(typeof platformConfig.platformName).toBe('string');
        expect(typeof platformConfig.platformType).toBe('string');
        expect(typeof platformConfig.support).toBe('object');
        expect(Array.isArray(platformConfig.support.rgb)).toBe(true);
        expect(Array.isArray(platformConfig.support.rgba)).toBe(true);
    });
});
