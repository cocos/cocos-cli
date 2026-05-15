import { PluginManager } from '../manager/plugin';

jest.mock('../../base/i18n', () => {
    const mock = {
        transI18nName(name: string) { return name; },
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

describe('PluginManager.getRegisteredPlatforms', () => {
    let pm: PluginManager;

    beforeEach(() => {
        pm = createPluginManager();
    });

    it('should return empty array when no platforms are registered', () => {
        (pm as any).platformConfig = {};
        const result = pm.getRegisteredPlatforms();
        expect(result).toEqual([]);
    });

    it('should return single platform key', () => {
        (pm as any).platformConfig = {
            android: { name: 'Android' },
        };
        const result = pm.getRegisteredPlatforms();
        expect(result).toEqual(['android']);
    });

    it('should return all registered platform keys', () => {
        (pm as any).platformConfig = {
            android: { name: 'Android' },
            ios: { name: 'iOS' },
            'web-mobile': { name: 'Web Mobile' },
            'web-desktop': { name: 'Web Desktop' },
            wechatgame: { name: '微信小游戏' },
            'harmonyos-next': { name: 'HarmonyOS Next' },
        };
        const result = pm.getRegisteredPlatforms();
        expect(result.sort()).toEqual([
            'android', 'harmonyos-next', 'ios', 'web-desktop', 'web-mobile', 'wechatgame',
        ]);
    });

    it('should return an array type', () => {
        (pm as any).platformConfig = {
            android: { name: 'Android' },
        };
        const result = pm.getRegisteredPlatforms();
        expect(Array.isArray(result)).toBe(true);
    });

    it('should reflect newly added platforms', () => {
        (pm as any).platformConfig = {
            android: { name: 'Android' },
        };
        expect(pm.getRegisteredPlatforms()).toEqual(['android']);

        (pm as any).platformConfig.ios = { name: 'iOS' };
        const result = pm.getRegisteredPlatforms();
        expect(result.sort()).toEqual(['android', 'ios']);
    });

    it('should include platforms regardless of their config contents', () => {
        (pm as any).platformConfig = {
            'minimal-platform': {},
            'full-platform': {
                name: 'Full',
                texture: { platformType: 'android', support: { rgb: [], rgba: [] } },
            },
        };
        const result = pm.getRegisteredPlatforms();
        expect(result.sort()).toEqual(['full-platform', 'minimal-platform']);
    });

    it('should return string[] type elements', () => {
        (pm as any).platformConfig = {
            android: { name: 'Android' },
            ios: { name: 'iOS' },
        };
        const result = pm.getRegisteredPlatforms();
        result.forEach((key) => {
            expect(typeof key).toBe('string');
        });
    });
});
