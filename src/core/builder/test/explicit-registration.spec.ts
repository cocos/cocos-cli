import { PluginManager } from '../manager/plugin';
import builderConfig from '../share/builder-config';
import type { BuildRegistration } from '../registration';
import { BaseConfiguration } from '../../configuration/script/config';
import { configGroups } from '../share/texture-compress';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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

jest.mock('../../configuration', () => ({
    configurationRegistry: { register: jest.fn() },
}));

jest.mock('../../../global', () => ({
    GlobalPaths: { workspace: '/tmp/test-workspace', enginePath: '/tmp/test-engine' },
}));


const platform = (id: string): Extract<BuildRegistration, { kind: 'platform' }> => ({
    kind: 'platform', platform: id, extensionId: 'sud.platforms', root: '/arbitrary-layout',
    config: { displayName: id, platformType: 'HTML5' }, hooks: '/arbitrary-layout/platform-hooks.js',
});

describe('explicit build registration', () => {
    let configuration: BaseConfiguration;
    const originalGroups = structuredClone(configGroups);
    beforeEach(() => {
        jest.resetAllMocks();
        Object.assign(configGroups, structuredClone(originalGroups));
        configuration = new BaseConfiguration('builder', { platforms: {} });
        jest.mocked(builderConfig.getProject).mockImplementation(configuration.get.bind(configuration));
        jest.mocked(builderConfig.setProject).mockImplementation(configuration.set.bind(configuration));
    });

    it.each([
        null,
        { platformType: 'web' },
        { platformType: 'web', support: { rgb: [] } },
        { platformType: 'web', support: { rgb: 'jpg', rgba: [] } },
        { platformType: 'web', support: { rgb: [42], rgba: [] } },
        { platformType: 'unknown', support: { rgb: [], rgba: [] } },
    ])('rejects invalid texture declarations before mutating platform state: %j', async texture => {
        const manager = new PluginManager();
        const input = platform('sample-web');
        Object.assign(input.config!, { textureCompressConfig: texture });
        await expect(manager.registerContribution(input)).rejects.toThrow(/platform=sample-web provider=sud.platforms.*field=textureCompressConfig/);
        expect(manager.platformConfig['sample-web']).toBeUndefined();
        expect(manager.configMap['sample-web']).toBeUndefined();
        expect(configGroups).toEqual(originalGroups);
        expect(builderConfig.setProject).not.toHaveBeenCalled();
        Object.assign(input.config!, { textureCompressConfig: { platformType: 'web', support: { rgb: ['etc2_rgb'], rgba: [] } } });
        await manager.registerContribution(input);
        expect(manager.platformConfig['sample-web'].texture?.support.rgb).toContain('etc2_rgb');
        expect(manager.platformConfig['sample-web'].texture?.support.rgb).toContain('jpg');
        expect(manager.platformConfig['sample-web'].texture?.support.rgba).toContain('png');
        expect(input.config!.textureCompressConfig?.support).toEqual({ rgb: ['etc2_rgb'], rgba: [] });
    });

    it('initializes missing platform defaults and preserves other packages and saved settings', async () => {
        const manager = new PluginManager();
        await configuration.set('platforms.android.packages', { android: { appid: 'saved' } }, 'project');
        await configuration.set('platforms.android.packages', { android: { appid: 'local' } }, 'local');
        await expect(configuration.get('platforms.android.packages', 'default')).rejects.toThrow();
        const input = platform('android');
        input.config!.options = { appid: { type: 'string', default: 'default-app' } };
        await manager.registerContribution(input);
        await manager.registerContribution({
            kind: 'plugin', platform: 'android', extensionId: 'acme.stamp', root: '/plugin',
            config: { options: { stamp: { type: 'string', default: 'stable' } } },
        });
        expect(await configuration.get('platforms.android.packages', 'default')).toEqual({
            android: { appid: 'default-app' }, 'acme.stamp': { stamp: 'stable' },
        });
        expect(await configuration.get('platforms.android.packages', 'project')).toEqual({ android: { appid: 'saved' } });
        expect(await configuration.get('platforms.android.packages', 'local')).toEqual({ android: { appid: 'local' } });
    });

    it('scopes resource processors to matching platforms and preserves remaining tasks', async () => {
        const root = mkdtempSync(join(tmpdir(), 'build-processors-'));
        try {
            const assetHandlers = join(root, 'processors.cjs');
            writeFileSync(assetHandlers, 'exports.compressTextures = async tasks => { tasks.splice(0, 1); };');
            const manager = new PluginManager();
            await manager.registerContribution(platform('web-a'));
            await manager.registerContribution(platform('web-b'));
            await manager.registerContribution({ kind: 'plugin', platform: 'web-a', extensionId: 'acme.textures', root, assetHandlers });
            const handlers = manager.getAssetHandlers('compressTextures', 'web-a');
            const tasks = [{ uuid: 'handled' }, { uuid: 'remaining' }];
            await handlers.handles['acme.textures'](tasks);
            expect(tasks).toEqual([{ uuid: 'remaining' }]);
            expect(handlers.required).toEqual(['acme.textures']);
            expect(manager.getAssetHandlers('compressTextures', 'web-b').pkgNameOrder).toEqual([]);
            expect(manager.getAssetHandlers('compressTextures').pkgNameOrder).toEqual([]);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

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
    it('rejects unknown kinds before modifying the registry', async () => {
        const manager = new PluginManager();
        await expect(manager.registerContribution({ ...platform('web-a'), kind: 'other' } as unknown as Parameters<PluginManager['registerContribution']>[0])).rejects.toThrow('Unsupported build registration kind');
        expect(manager.platformConfig['web-a']).toBeUndefined();
    });

});
