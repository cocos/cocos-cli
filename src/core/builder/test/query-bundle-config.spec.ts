import { PluginManager } from '../manager/plugin';
import type { BundleQueryConfig } from '../@types/protected';
import type { BundlePlatformType, PlatformBundleConfig } from '../@types/protected';

jest.mock('../../base/i18n', () => {
    const mock = {
        transI18nName(name: string) {
            const map: Record<string, string> = {
                'i18n:builder.asset_bundle.native': 'Native',
                'i18n:builder.asset_bundle.web': 'Web',
                'i18n:builder.asset_bundle.minigame': 'Mini Game',
                'i18n:builder.displayName.windows': 'Windows',
                'i18n:builder.displayName.android': 'Android',
                'i18n:builder.displayName.web-mobile': 'Web Mobile',
                'i18n:builder.displayName.wechatgame': '微信小游戏',
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
    configGroups: {},
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

function setupBundleConfigs(
    pm: PluginManager,
    configs: Record<string, { platformType: BundlePlatformType; supportOptions: Record<string, any[]> }>,
    platformConfig?: Record<string, { name: string }>,
) {
    (pm as any).bundleConfigs = configs;
    if (platformConfig) {
        (pm as any).platformConfig = platformConfig;
    }
}

describe('PluginManager.queryBundleConfig', () => {
    let pm: PluginManager;

    beforeEach(() => {
        pm = createPluginManager();
    });

    it('should return empty object when no platforms are registered', () => {
        setupBundleConfigs(pm, {});
        const result = pm.queryBundleConfig();
        expect(result).toEqual({});
    });

    it('should group platforms by platformType', () => {
        setupBundleConfigs(pm, {
            windows: {
                platformType: 'native',
                supportOptions: { compressionType: ['none', 'merge_dep', 'merge_all_json'] },
            },
            android: {
                platformType: 'native',
                supportOptions: { compressionType: ['none', 'merge_dep', 'merge_all_json'] },
            },
            'web-mobile': {
                platformType: 'web',
                supportOptions: { compressionType: ['none', 'merge_dep', 'merge_all_json'] },
            },
        }, {
            windows: { name: 'i18n:builder.displayName.windows' },
            android: { name: 'i18n:builder.displayName.android' },
            'web-mobile': { name: 'i18n:builder.displayName.web-mobile' },
        });

        const result = pm.queryBundleConfig();

        expect(Object.keys(result)).toEqual(expect.arrayContaining(['native', 'web']));
        expect(Object.keys(result.native.platformConfigs)).toEqual(expect.arrayContaining(['windows', 'android']));
        expect(Object.keys(result.web.platformConfigs)).toEqual(['web-mobile']);
    });

    it('should translate displayName for each platform type', () => {
        setupBundleConfigs(pm, {
            windows: {
                platformType: 'native',
                supportOptions: { compressionType: ['none'] },
            },
        }, {
            windows: { name: 'Windows' },
        });

        const result = pm.queryBundleConfig();
        expect(result.native.displayName).toBe('Native');
    });

    it('should translate platformName for each platform', () => {
        setupBundleConfigs(pm, {
            wechatgame: {
                platformType: 'miniGame',
                supportOptions: { compressionType: ['none', 'subpackage'] },
            },
        }, {
            wechatgame: { name: 'i18n:builder.displayName.wechatgame' },
        });

        const result = pm.queryBundleConfig();
        expect(result.miniGame.platformConfigs.wechatgame.platformName).toBe('微信小游戏');
    });

    it('should fallback to platform key when platformConfig has no name', () => {
        setupBundleConfigs(pm, {
            'unknown-platform': {
                platformType: 'native',
                supportOptions: { compressionType: ['none'] },
            },
        });
        (pm as any).platformConfig = {};

        const result = pm.queryBundleConfig();
        expect(result.native.platformConfigs['unknown-platform'].platformName).toBe('unknown-platform');
    });

    it('should fallback displayName to platformType when BundlePlatformTypes has no entry', () => {
        setupBundleConfigs(pm, {
            'custom-platform': {
                platformType: 'customType' as BundlePlatformType,
                supportOptions: { compressionType: ['none'] },
            },
        }, {
            'custom-platform': { name: 'Custom' },
        });

        const result = pm.queryBundleConfig();
        expect(result.customType).toBeDefined();
        expect(result.customType.displayName).toBe('customType');
    });

    it('should preserve supportOptions for each platform', () => {
        const compressionTypes = ['none', 'merge_dep', 'merge_all_json', 'subpackage', 'zip'];
        setupBundleConfigs(pm, {
            wechatgame: {
                platformType: 'miniGame',
                supportOptions: { compressionType: compressionTypes },
            },
        }, {
            wechatgame: { name: 'WeChat' },
        });

        const result = pm.queryBundleConfig();
        expect(result.miniGame.platformConfigs.wechatgame.supportOptions.compressionType).toEqual(compressionTypes);
    });

    it('should set correct platformType on each PlatformBundleConfig', () => {
        setupBundleConfigs(pm, {
            'web-mobile': {
                platformType: 'web',
                supportOptions: { compressionType: ['none'] },
            },
        }, {
            'web-mobile': { name: 'Web Mobile' },
        });

        const result = pm.queryBundleConfig();
        expect(result.web.platformConfigs['web-mobile'].platformType).toBe('web');
    });

    it('should handle all three platform types together', () => {
        setupBundleConfigs(pm, {
            windows: {
                platformType: 'native',
                supportOptions: { compressionType: ['none', 'merge_dep'] },
            },
            'web-mobile': {
                platformType: 'web',
                supportOptions: { compressionType: ['none', 'merge_dep'] },
            },
            wechatgame: {
                platformType: 'miniGame',
                supportOptions: { compressionType: ['none', 'subpackage'] },
            },
        }, {
            windows: { name: 'Windows' },
            'web-mobile': { name: 'Web Mobile' },
            wechatgame: { name: 'i18n:builder.displayName.wechatgame' },
        });

        const result = pm.queryBundleConfig();

        expect(Object.keys(result).sort()).toEqual(['miniGame', 'native', 'web']);
        expect(result.native.platformConfigs.windows).toBeDefined();
        expect(result.web.platformConfigs['web-mobile']).toBeDefined();
        expect(result.miniGame.platformConfigs.wechatgame).toBeDefined();
    });

    it('should conform to BundleQueryConfig type structure', () => {
        setupBundleConfigs(pm, {
            android: {
                platformType: 'native',
                supportOptions: { compressionType: ['none', 'merge_dep', 'merge_all_json', 'zip'] },
            },
        }, {
            android: { name: 'Android' },
        });

        const result = pm.queryBundleConfig();
        const config: BundleQueryConfig = result.native;

        expect(typeof config.displayName).toBe('string');
        expect(typeof config.platformConfigs).toBe('object');

        const platformConfig: PlatformBundleConfig = config.platformConfigs.android;
        expect(typeof platformConfig.platformName).toBe('string');
        expect(typeof platformConfig.platformType).toBe('string');
        expect(typeof platformConfig.supportOptions).toBe('object');
        expect(Array.isArray(platformConfig.supportOptions.compressionType)).toBe(true);
    });
});
