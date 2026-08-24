const mockGetModules = jest.fn();
const mockGetGameConfig = jest.fn();
const mockGetConfigPath = jest.fn();
const mockPathExists = jest.fn();
const mockReadJSON = jest.fn();
const mockQueryAssetInfo = jest.fn();
const mockScripting = {
    projectPath: '/project',
};

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

jest.mock('../../scripting', () => ({
    __esModule: true,
    default: mockScripting,
}));

jest.mock('fs-extra', () => ({
    pathExists: mockPathExists,
    readJSON: mockReadJSON,
    stat: jest.fn(),
    readFile: jest.fn(),
}));

import { scriptingRoutes } from '../scripting-routes';
import { join } from 'path';

describe('preview scripting routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockScripting.projectPath = '/project';
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

    it('serves userland custom macro module from project temp programming output', async () => {
        const route = scriptingRoutes.find((item) => item.url === '/userland/macro');
        const next = jest.fn();
        const res = {
            setHeader: jest.fn(),
            sendFile: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler({} as any, res as any, next);

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/javascript; charset=utf-8');
        expect(res.sendFile).toHaveBeenCalledWith(join(mockScripting.projectPath, 'temp', 'programming', 'custom-macro.js'));
        expect(next).not.toHaveBeenCalled();
    });

    it('passes userland custom macro requests through when the generated file is missing', async () => {
        mockPathExists.mockResolvedValueOnce(false);
        const route = scriptingRoutes.find((item) => item.url === '/userland/macro');
        const next = jest.fn();
        const res = {
            setHeader: jest.fn(),
            sendFile: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler({} as any, res as any, next);

        expect(res.sendFile).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith();
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

    it('serves explicit asset-library requests for files stored under a uuid directory', async () => {
        const uuid = '0835f102-5471-47a3-9a76-01c07ac9cdb2';
        mockQueryAssetInfo.mockReturnValue({
            library: {
                'OpenSans-Regular.ttf': 'E:/engine/editor/library/08/0835f102-5471-47a3-9a76-01c07ac9cdb2/OpenSans-Regular.ttf',
            },
        });
        const url = `/scripting/asset-library/${uuid.slice(0, 2)}/${uuid}/OpenSans-Regular.ttf`;
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
            'E:/engine/editor/library/08/0835f102-5471-47a3-9a76-01c07ac9cdb2/OpenSans-Regular.ttf',
            { dotfiles: 'allow' },
        );

        const otherUuid = 'b5475517-23b9-4873-bc1a-968d96616081';
        expect((route!.url as RegExp).test(
            `/scripting/asset-library/${otherUuid.slice(0, 2)}/${otherUuid}/OpenSans-Bold.ttf`,
        )).toBe(true);
    });

    it('does not match nested or traversing asset-library file requests', () => {
        const uuid = '0835f102-5471-47a3-9a76-01c07ac9cdb2';
        const url = `/scripting/asset-library/${uuid.slice(0, 2)}/${uuid}/OpenSans-Regular.ttf`;
        const route = scriptingRoutes.find((item) => item.url instanceof RegExp && item.url.test(url));

        expect(route).toBeDefined();
        expect((route!.url as RegExp).test(`/scripting/asset-library/${uuid.slice(0, 2)}/${uuid}/fonts/OpenSans-Regular.ttf`)).toBe(false);
        expect((route!.url as RegExp).test(`/scripting/asset-library/${uuid.slice(0, 2)}/${uuid}/../OpenSans-Regular.ttf`)).toBe(false);
    });

    it('does not match implicit root library asset requests', () => {
        const uuid = '45e7c0c8-2699-4912-b45f-d42bb8384189';
        const route = scriptingRoutes.find((item) => item.url instanceof RegExp && item.url.test(`/${uuid.slice(0, 2)}/${uuid}.json`));

        expect(route).toBeUndefined();
    });
});
