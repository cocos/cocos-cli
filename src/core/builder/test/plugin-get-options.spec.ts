import { PluginManager } from '../manager/plugin';
import builderConfig from '../share/builder-config';

describe('PluginManager.getOptionsByPlatform', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns a cloned merge of common and platform options', async () => {
        const commonOptions: any = {
            name: 'game',
            nested: {
                fromCommon: true,
            },
        };
        const platformOptions: any = {
            nested: {
                fromPlatform: true,
            },
            packages: {
                web: {
                    enabled: true,
                },
            },
        };
        jest.spyOn(builderConfig, 'getProject').mockImplementation(async (key?: string) => {
            if (key === 'common') {
                return commonOptions;
            }
            if (key === 'platforms.web-mobile') {
                return platformOptions;
            }
            return undefined as any;
        });

        const options = await new PluginManager().getOptionsByPlatform('web-mobile');

        (options.packages as any).web.enabled = false;
        expect(options.platform).toBe('web-mobile');
        expect(options.outputName).toBe('web-mobile');
        expect(platformOptions.packages.web.enabled).toBe(true);
        expect((commonOptions as any).platform).toBeUndefined();
        expect((commonOptions as any).outputName).toBeUndefined();
    });

    it('syncs parent upload identity options into support platform packages', async () => {
        const pm = new PluginManager() as any;
        pm.getPlatformBuildPluginConfig = jest.fn(() => ({
            supportPlatforms: {
                platforms: ['web-desktop', 'web-mobile'],
                controlledBy: 'enableWebBuild',
            },
        }));
        pm.ensurePlatformRegistered = jest.fn(async () => undefined);
        pm.getOptionsByPlatform = jest.fn(async (platform: string) => ({
            packages: {
                [platform]: {
                    appid: 'default-app-id',
                    versionName: 'default-version',
                    uploadEnv: 'prod',
                    accessToken: 'default-token',
                    childDefault: true,
                },
            },
        }));

        const options: any = {
            platform: 'openpaas',
            packages: {
                openpaas: {
                    enableWebBuild: true,
                    appid: 'parent-app-id',
                    versionName: '2.0.0',
                    uploadEnv: 'dev',
                    accessToken: 'parent-token',
                },
                'web-desktop': {
                    versionName: 'stale-child-version',
                    bridgeLink: 'https://example.com/bridge.js',
                },
            },
        };

        await pm.completeSupportPlatformOptions(options);

        expect(options.subTaskPlatforms).toEqual(['web-desktop', 'web-mobile']);
        expect(options.packages['web-desktop']).toEqual({
            appid: 'parent-app-id',
            versionName: '2.0.0',
            uploadEnv: 'dev',
            accessToken: 'parent-token',
            childDefault: true,
            bridgeLink: 'https://example.com/bridge.js',
        });
        expect(options.packages['web-mobile']).toEqual({
            appid: 'parent-app-id',
            versionName: '2.0.0',
            uploadEnv: 'dev',
            accessToken: 'parent-token',
            childDefault: true,
        });
    });
});
