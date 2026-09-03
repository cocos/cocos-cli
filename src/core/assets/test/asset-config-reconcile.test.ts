import { ensureDir, mkdtemp, outputJSON, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';

describe('asset-config builtin Localization mount reconcile', () => {
    let fixtureRoot: string;
    let previousResourcesPath: string | undefined;

    beforeEach(async () => {
        fixtureRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-localization-mount-'));
        previousResourcesPath = (process as { resourcesPath?: string }).resourcesPath;
        (process as { resourcesPath?: string }).resourcesPath = join(fixtureRoot, 'resources');
        await createMount('@pink-localization-editor', {
            name: 'localization-editor',
            readonly: true,
            visible: true,
            enable: 'L10nEnable',
        });
        await createMount('other-extension', {
            name: 'other-assets',
            readonly: false,
            visible: true,
        });
    });

    afterEach(async () => {
        (process as { resourcesPath?: string }).resourcesPath = previousResourcesPath;
        jest.resetModules();
        await remove(fixtureRoot);
    });

    it('uses the same canonical record for cold discovery and hot false-to-true reconcile', async () => {
        await writeEnable(false);
        const assetConfig = await loadAssetConfig();
        await assetConfig.init();

        expect(assetConfig.data.assetDBList.some((info: { name: string }) => info.name === 'localization-editor')).toBe(false);
        expect(assetConfig.data.assetDBList.some((info: { name: string }) => info.name === 'other-assets')).toBe(true);

        await writeEnable(true);
        const hotInfo = assetConfig.resolveBuiltinLocalizationMount();
        expect(hotInfo).toMatchObject({
            name: 'localization-editor',
            readonly: true,
            visible: true,
            target: join(fixtureRoot, 'resources', 'app', 'extensions', '@pink-localization-editor', 'static', 'assets'),
            library: join(fixtureRoot, 'project', 'library', 'localization-editor'),
        });
    });

    it('returns the same canonical record when cold-start enable is already true', async () => {
        await writeEnable(true);
        const assetConfig = await loadAssetConfig();
        await assetConfig.init();

        const coldInfo = assetConfig.data.assetDBList.find((info: { name: string }) => info.name === 'localization-editor');
        const hotInfo = assetConfig.resolveBuiltinLocalizationMount();
        expect(hotInfo).toEqual(coldInfo);
        expect(assetConfig.data.assetDBList.some((info: { name: string }) => info.name === 'other-assets')).toBe(true);
    });

    it('rejects a disabled persisted mount without changing unrelated builtin mounts', async () => {
        await writeEnable(false);
        const assetConfig = await loadAssetConfig();
        await assetConfig.init();

        expect(() => assetConfig.resolveBuiltinLocalizationMount()).toThrow('unavailable or disabled');
        expect(assetConfig.data.assetDBList.map((info: { name: string }) => info.name)).toEqual([
            'assets',
            'internal',
            'other-assets',
        ]);
    });

    async function loadAssetConfig(): Promise<any> {
        jest.resetModules();
        const configurationInstance = {
            get: jest.fn().mockResolvedValue({}),
        };
        jest.doMock('../../configuration', () => ({
            configurationManager: { on: jest.fn() },
            configurationRegistry: {
                getInstances: () => ({}),
                on: jest.fn(),
                register: jest.fn().mockResolvedValue(configurationInstance),
            },
        }));
        jest.doMock('../../project', () => ({
            __esModule: true,
            default: { path: join(fixtureRoot, 'project') },
        }));
        jest.doMock('../../engine', () => ({
            Engine: {
                getInfo: () => ({ typescript: { path: join(fixtureRoot, 'engine') } }),
            },
        }));
        return require('../asset-config').default;
    }

    async function createMount(
        extensionName: string,
        mount: { name: string; readonly: boolean; visible: boolean; enable?: string },
    ): Promise<void> {
        const extensionRoot = join(fixtureRoot, 'resources', 'app', 'extensions', extensionName);
        await ensureDir(join(extensionRoot, 'static', 'assets'));
        await outputJSON(join(extensionRoot, 'package.json'), {
            name: extensionName,
            contributions: {
                'asset-db': {
                    mount: {
                        ...mount,
                        path: './static/assets',
                    },
                },
            },
        });
    }

    async function writeEnable(enabled: boolean): Promise<void> {
        await outputJSON(
            join(fixtureRoot, 'project', 'settings', 'v2', 'packages', 'localization-editor.json'),
            { L10nEnable: enabled },
        );
    }
});
