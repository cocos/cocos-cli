import { ensureDir, mkdtemp, outputJSON, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';

const mockAssetDBManager = {
    ready: true,
    assetDBMap: {} as Record<string, { options: { target: string } }>,
    assetDBInfo: {} as Record<string, unknown>,
    addDB: jest.fn(),
};

const mockAssetManager = {};

jest.mock('../../src/core/assets', () => ({
    assetDBManager: mockAssetDBManager,
    assetManager: mockAssetManager,
}));

jest.mock('../../src/core/configuration', () => ({
    configurationManager: { on: jest.fn() },
    configurationRegistry: {
        getInstances: () => ({}),
        on: jest.fn(),
        register: jest.fn().mockResolvedValue({
            get: jest.fn().mockResolvedValue({}),
        }),
    },
}));

const mockProject = { path: '' };
jest.mock('../../src/core/project', () => ({
    __esModule: true,
    default: mockProject,
}));

const mockEngine = {
    getInfo: () => ({ typescript: { path: 'C:/engine' } }),
};
jest.mock('../../src/core/engine', () => ({ Engine: mockEngine }));

import { reconcileLocalizationRuntimeMount } from '../../src/lib/assets/assets';

describe('public Localization Runtime reconcile', () => {
    let fixtureRoot: string;
    let previousResourcesPath: string | undefined;

    beforeEach(async () => {
        fixtureRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-runtime-reconcile-'));
        previousResourcesPath = (process as { resourcesPath?: string }).resourcesPath;
        (process as { resourcesPath?: string }).resourcesPath = join(fixtureRoot, 'resources');
        mockProject.path = join(fixtureRoot, 'project');
        mockAssetDBManager.ready = true;
        mockAssetDBManager.assetDBMap = {};
        mockAssetDBManager.assetDBInfo = {};
        mockAssetDBManager.addDB.mockReset();

        const extensionRoot = join(
            fixtureRoot,
            'resources',
            'app',
            'extensions',
            '@pink-localization-editor',
        );
        await ensureDir(join(extensionRoot, 'static', 'assets'));
        await outputJSON(join(extensionRoot, 'package.json'), {
            name: 'pink-localization-editor',
            contributions: {
                'asset-db': {
                    mount: {
                        name: 'localization-editor',
                        path: './static/assets',
                        readonly: true,
                        visible: true,
                        enable: 'L10nEnable',
                    },
                },
            },
        });
        await outputJSON(
            join(mockProject.path, 'settings', 'v2', 'packages', 'localization-editor.json'),
            { L10nEnable: false },
        );
    });

    afterEach(async () => {
        (process as { resourcesPath?: string }).resourcesPath = previousResourcesPath;
        await remove(fixtureRoot);
    });

    it('re-reads persisted false-to-true and calls AssetDB add once in one session', async () => {
        const assetConfig = await import('../../src/core/assets/asset-config');
        await assetConfig.default.init();

        await expect(reconcileLocalizationRuntimeMount()).rejects.toThrow('unavailable or disabled');
        expect(mockAssetDBManager.addDB).not.toHaveBeenCalled();

        await outputJSON(
            join(mockProject.path, 'settings', 'v2', 'packages', 'localization-editor.json'),
            { L10nEnable: true },
        );
        mockAssetDBManager.addDB.mockImplementation(async (info: { name: string; target: string }) => {
            mockAssetDBManager.assetDBMap[info.name] = { options: { target: info.target } };
            mockAssetDBManager.assetDBInfo[info.name] = info;
        });

        const first = await reconcileLocalizationRuntimeMount();
        const second = await reconcileLocalizationRuntimeMount();

        expect(first).toBe(second);
        expect(mockAssetDBManager.addDB).toHaveBeenCalledTimes(1);
        expect(mockAssetDBManager.addDB.mock.calls[0][0]).toMatchObject({
            name: 'localization-editor',
            target: join(
                fixtureRoot,
                'resources',
                'app',
                'extensions',
                '@pink-localization-editor',
                'static',
                'assets',
            ),
            readonly: true,
            visible: true,
            library: join(fixtureRoot, 'project', 'library', 'localization-editor'),
        });
        expect(assetConfig.default.data.assetDBList.filter((info) => info.name === 'localization-editor')).toHaveLength(1);
    });
});
