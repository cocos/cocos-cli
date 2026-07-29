const mockGetModules = jest.fn();
const mockGetGameConfig = jest.fn();
const mockGetConfigPath = jest.fn();
const mockPathExists = jest.fn();
const mockReadJSON = jest.fn();
const mockQueryAssetInfo = jest.fn();

jest.mock('../../engine', () => ({
    Engine: {
        getModules: mockGetModules,
        getGameConfig: mockGetGameConfig,
    },
}));

jest.mock('../../configuration', () => ({
    configurationManager: {
        getConfigPath: mockGetConfigPath,
    },
}));

jest.mock('../../assets', () => ({
    assetManager: {
        queryAssetInfo: mockQueryAssetInfo,
    },
    assetDBManager: {
        assetDBInfo: {},
    },
}));

jest.mock('fs-extra', () => ({
    pathExists: mockPathExists,
    readJSON: mockReadJSON,
    stat: jest.fn(),
    readFile: jest.fn(),
}));

import { scriptingRoutes } from '../scripting-routes';

describe('preview scripting routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetModules.mockReturnValue(['base', 'custom-pipeline']);
        mockGetGameConfig.mockResolvedValue({
            overrideSettings: {
                rendering: {
                    customPipeline: false,
                },
            },
        });
        mockGetConfigPath.mockResolvedValue('E:/project/settings/cocos.config.json');
        mockPathExists.mockResolvedValue(true);
        mockQueryAssetInfo.mockReturnValue(null);
    });

    it('normalizes disk graphics settings when serving engine modules', async () => {
        mockReadJSON.mockResolvedValue({
            engine: {
                globalConfigKey: 'default',
                configs: {
                    default: {
                        includeModules: ['base', 'custom-pipeline', 'custom-pipeline-post-process'],
                    },
                },
                graphics: {
                    pipeline: 'legacy-pipeline',
                    'custom-pipeline-post-process': true,
                },
            },
        });
        const route = scriptingRoutes.find((item) => item.url === '/scripting/engine/modules');
        const res = {
            json: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler({} as any, res as any, jest.fn());

        expect(res.json).toHaveBeenCalledWith(['base', 'legacy-pipeline']);
    });

    it('falls back to cached engine modules when disk config cannot be read', async () => {
        const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
        mockGetModules.mockReturnValue(['base', 'physics-builtin']);
        mockReadJSON.mockRejectedValue(new Error('broken config'));
        const route = scriptingRoutes.find((item) => item.url === '/scripting/engine/modules');
        const res = {
            json: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler({} as any, res as any, jest.fn());

        expect(res.json).toHaveBeenCalledWith(['base', 'physics-builtin']);
        debugSpy.mockRestore();
    });

    it('normalizes disk graphics settings when serving game config', async () => {
        mockReadJSON.mockResolvedValue({
            engine: {
                globalConfigKey: 'default',
                configs: {
                    default: {
                        includeModules: ['base', 'custom-pipeline'],
                    },
                },
            },
        });
        const route = scriptingRoutes.find((item) => item.url === '/scripting/engine/game-config');
        const req = {
            protocol: 'http',
            get: jest.fn().mockReturnValue('localhost:7456'),
        };
        const res = {
            json: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler(req as any, res as any, jest.fn());

        expect(mockGetGameConfig).toHaveBeenCalledWith(
            'http://localhost:7456',
            'http://localhost:7456/scripting/asset-library',
            'http://localhost:7456/scripting/asset-library',
        );
        expect(res.json).toHaveBeenCalledWith({
            overrideSettings: {
                rendering: {
                    customPipeline: true,
                    effectSettingsPath: 'http://localhost:7456/scripting/engine/effect-settings',
                },
            },
        });
    });

    it('serves explicit asset-library requests by uuid', async () => {
        const uuid = '45e7c0c8-2699-4912-b45f-d42bb8384189';
        mockQueryAssetInfo.mockReturnValue({
            library: {
                '.json': 'E:/project/library/45/45e7c0c8-2699-4912-b45f-d42bb8384189.json',
            },
        });
        const url = `/scripting/asset-library/${uuid.slice(0, 2)}/${uuid}.json`;
        const route = scriptingRoutes.find((item) => item.url instanceof RegExp && item.url.test(url));
        const req = {
            path: url,
        };
        const res = {
            set: jest.fn(),
            sendFile: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler(req as any, res as any, jest.fn());

        expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(res.sendFile).toHaveBeenCalledWith(
            'E:/project/library/45/45e7c0c8-2699-4912-b45f-d42bb8384189.json',
            { dotfiles: 'allow' },
        );
    });

    it('does not match implicit root library asset requests', () => {
        const uuid = '45e7c0c8-2699-4912-b45f-d42bb8384189';
        const route = scriptingRoutes.find((item) => item.url instanceof RegExp && item.url.test(`/${uuid.slice(0, 2)}/${uuid}.json`));

        expect(route).toBeUndefined();
    });
});
