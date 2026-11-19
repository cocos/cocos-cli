import { PluginManager } from '../manager/plugin';
import builderConfig from '../share/builder-config';
import type { BuildRegistration } from '../registration';

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        transI18nName(name: string) { return name; },
        t(key: string) { return key; },
        registerLanguagePatch() {},
    },
}));

jest.mock('../../base/console', () => ({
    newConsole: {
        debug: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
        pluginTask: jest.fn(),
        trackTimeStart: jest.fn(),
        trackTimeEnd: jest.fn(() => 0),
    },
}));

jest.mock('../share/common-options-validator', () => ({
    checkBuildCommonOptionsByKey: jest.fn(),
    checkBundleCompressionSetting: jest.fn(),
}));

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {
        commonOptionConfigs: {},
        getProject: jest.fn(),
        setProject: jest.fn(),
    },
}));

jest.mock('../share/texture-compress', () => ({
    configGroups: {},
    textureFormatConfigs: {},
    formatsInfo: {},
    defaultSupport: {},
}));

jest.mock('../../configuration', () => ({
    configurationRegistry: { register: jest.fn() },
}));

jest.mock('../../../global', () => ({
    GlobalPaths: { workspace: '/tmp/test-workspace', enginePath: '/tmp/test-engine' },
}));


const platform = (id: string): BuildRegistration => ({
    kind: 'platform', platform: id, extensionId: 'sud.platforms', root: '/arbitrary-layout',
    config: { displayName: id, platformType: 'HTML5' }, hooks: '/arbitrary-layout/platform-hooks.js',
});

describe('explicit build registration', () => {
    beforeEach(() => jest.clearAllMocks());

    it('registers multiple platforms without manifest, config entry or language directory', async () => {
        const manager = new PluginManager();
        await manager.registerContribution(platform('web-a'));
        await manager.registerContribution(platform('web-b'));
        expect(manager.getHooksInfo('web-a').infos).toEqual({
            'web-a': { path: '/arbitrary-layout/platform-hooks.js', internal: true },
        });
        expect(manager.getHooksInfo('web-b').infos).toEqual({
            'web-b': { path: '/arbitrary-layout/platform-hooks.js', internal: true },
        });
    });

    it('keeps dotted plugin parameter keys intact and accepts parameter-only contributions', async () => {
        const manager = new PluginManager();
        await manager.registerContribution(platform('web-a'));
        const func = jest.fn(() => true);
        const config = { options: { stamp: { type: 'string' as const, default: 'stable' } }, verifyRuleMap: { stamp: { func, message: 'Invalid stamp' } } };
        await manager.registerContribution({ kind: 'plugin', platform: 'web-a', extensionId: 'acme.stamp', root: '/nonexistent', config });
        expect(manager.pkgOptionConfigs['web-a']['acme.stamp']).toEqual(config.options);
        expect(builderConfig.setProject).toHaveBeenCalledWith('platforms.web-a.packages', { 'acme.stamp': { stamp: 'stable' } }, 'default');
        expect(manager.getHooksInfo('web-a').infos['acme.stamp']).toBeUndefined();
        expect(config).toEqual({ options: { stamp: { type: 'string', default: 'stable' } }, verifyRuleMap: { stamp: { func, message: 'Invalid stamp' } } });
    });

    it('allows hook-only contributions with the existing public callback convention', async () => {
        const manager = new PluginManager();
        await manager.registerContribution(platform('web-a'));
        await manager.registerContribution({ kind: 'plugin', platform: 'web-a', extensionId: 'acme.hooks', root: '/hooks', hooks: '/hooks/after.js' });
        expect(manager.getHooksInfo('web-a').infos['acme.hooks']).toEqual({ path: '/hooks/after.js', internal: false });
    });

    it('rejects conflicts even when registrations arrive concurrently', async () => {
        const manager = new PluginManager();
        const results = await Promise.allSettled([manager.registerContribution(platform('web-a')), manager.registerContribution({ ...platform('web-a'), extensionId: 'other.platforms' })]);
        expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
        expect(String((results[1] as PromiseRejectedResult).reason)).toContain('providers=sud.platforms,other.platforms');
    });

    it('rejects unattached contributions without implicitly discovering platforms', async () => {
        const manager = new PluginManager();
        await expect(manager.registerContribution({ kind: 'plugin', platform: 'missing', extensionId: 'acme.hooks', root: '/hooks', hooks: '/hooks/hooks.js' })).rejects.toThrow('not registered');
    });
});
