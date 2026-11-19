import { copy, ensureDir, lstat, mkdtemp, move, outputJSON, readFile, remove, symlink } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { internalAssetFingerprint, resolveInternalAssetPaths } from '../internal-assets';

describe('asset-config builtin Localization mount reconcile', () => {
    let fixtureRoot: string;
    let previousResourcesPath: string | undefined;

    beforeEach(async () => {
        fixtureRoot = await mkdtemp(join(tmpdir(), 'cocos-cli-localization-mount-'));
        previousResourcesPath = (process as { resourcesPath?: string }).resourcesPath;
        await outputJSON(join(fixtureRoot, 'engine', 'package.json'), { version: '4.0.0' });
        await outputJSON(join(fixtureRoot, 'engine', 'cc.config.json'), {});
        await outputJSON(join(fixtureRoot, 'engine', 'editor', 'assets', 'material.mtl'), { uuid: 'original' });
        (process as { resourcesPath?: string }).resourcesPath = join(fixtureRoot, 'resources');
        await createMount('@pink-localization-editor', {
            name: 'localization-editor',
            readonly: true,
            visible: true,
            enable: 'L10nEnable',
        }, 'pink-localization-editor');
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

    it('returns the same canonical record when cold-start enable is already true', async () => {
        await writeEnable(true);
        const assetConfig = await loadAssetConfig();
        await assetConfig.init();

        const coldInfo = assetConfig.data.assetDBList.find((info: { name: string }) => info.name === 'localization-editor');
        const hotInfo = assetConfig.resolveBuiltinLocalizationMount();
        expect(hotInfo).toEqual(coldInfo);
        expect(assetConfig.data.assetDBList.some((info: { name: string }) => info.name === 'other-assets')).toBe(true);
    });

    it('reuses a matching snapshot after relocating the same SDK', async () => {
        const engine = join(fixtureRoot, 'engine');
        const relocated = join(fixtureRoot, 'relocated-engine');
        const snapshot = join(fixtureRoot, 'snapshot');
        await outputJSON(join(snapshot, 'engine.json'), { version: 1, fingerprint: await internalAssetFingerprint(engine) });
        await copy(engine, relocated);
        expect(await resolveInternalAssetPaths(relocated, join(fixtureRoot, 'library'), snapshot)).toEqual({
            target: join(relocated, 'editor', 'assets'), library: snapshot,
        });
    });

    it('imports the selected same-version SDK and isolates its source and library', async () => {
        const engine = join(fixtureRoot, 'engine');
        const other = join(fixtureRoot, 'other-engine');
        const snapshot = join(fixtureRoot, 'snapshot');
        await copy(engine, other);
        await outputJSON(join(snapshot, 'engine.json'), { version: 1, fingerprint: await internalAssetFingerprint(engine) });
        await outputJSON(join(other, 'editor', 'assets', 'extra.mtl'), { uuid: 'extra' });
        const paths = await resolveInternalAssetPaths(other, join(fixtureRoot, 'library'), snapshot);
        expect(paths.library).not.toBe(snapshot);
        expect(paths.target).not.toBe(join(other, 'editor', 'assets'));
        expect(JSON.parse(await readFile(join(paths.target, 'extra.mtl'), 'utf8'))).toEqual({ uuid: 'extra' });
        const missing = await resolveInternalAssetPaths(engine, join(fixtureRoot, 'library'), join(fixtureRoot, 'missing'));
        expect(paths.library).not.toBe(missing.library);
    });

    it('invalidates snapshots for changed SDK revisions, sources and metadata', async () => {
        const engine = join(fixtureRoot, 'engine');
        const original = await internalAssetFingerprint(engine);
        await outputJSON(join(engine, 'engine-sdk.json'), { revision: 'revision-2' });
        const revision = await internalAssetFingerprint(engine);
        await outputJSON(join(engine, 'editor', 'assets', 'material.mtl.meta'), { uuid: 'changed' });
        const metadata = await internalAssetFingerprint(engine);
        await remove(join(engine, 'editor', 'assets', 'material.mtl'));
        expect(new Set([original, revision, metadata, await internalAssetFingerprint(engine)]).size).toBe(4);
    });

    it('reports unreadable SDK inputs instead of using another SDK snapshot', async () => {
        await expect(resolveInternalAssetPaths(join(fixtureRoot, 'missing-engine'), join(fixtureRoot, 'library'), join(fixtureRoot, 'snapshot')))
            .rejects.toThrow('ENOENT');
    });

    it.each(['root', 'nested'])('fingerprints and materializes %s asset directory links without writing through them', async mode => {
        const engine = join(fixtureRoot, 'engine');
        const assets = join(engine, 'editor', 'assets');
        const linked = join(fixtureRoot, 'linked-assets');
        const mount = mode === 'root' ? assets : join(assets, 'linked');
        if (mode === 'root') await move(assets, linked);
        else await outputJSON(join(linked, 'material.mtl'), { uuid: 'original' });
        await symlink(linked, mount, process.platform === 'win32' ? 'junction' : 'dir');
        const before = await internalAssetFingerprint(engine);
        await outputJSON(join(linked, 'material.mtl'), { uuid: 'changed' });
        expect(await internalAssetFingerprint(engine)).not.toBe(before);
        const paths = await resolveInternalAssetPaths(engine, join(fixtureRoot, 'library'), join(fixtureRoot, 'snapshot'));
        const copied = mode === 'root' ? paths.target : join(paths.target, 'linked');
        expect((await lstat(copied)).isSymbolicLink()).toBe(false);
        await outputJSON(join(copied, 'material.mtl'), { uuid: 'imported' });
        expect(JSON.parse(await readFile(join(linked, 'material.mtl'), 'utf8'))).toEqual({ uuid: 'changed' });
    });

    it('rejects circular SDK asset links before starting an import', async () => {
        const engine = join(fixtureRoot, 'engine');
        const assets = join(engine, 'editor', 'assets');
        await symlink(assets, join(assets, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
        await expect(internalAssetFingerprint(engine)).rejects.toThrow('Circular internal asset directory');
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

    it('skips legacy project Localization on cold start and reconcile', async () => {
        await createProjectMount('legacy-localization-editor', {
            name: 'localization-editor',
            readonly: true,
            visible: true,
        }, 'localization-editor');
        await writeEnable(true);
        const assetConfig = await loadAssetConfig();
        await assetConfig.init();

        const canonical = assetConfig.resolveBuiltinLocalizationMount();
        expect(canonical.target).toBe(join(fixtureRoot, 'resources', 'app', 'extensions', '@pink-localization-editor', 'static', 'assets'));
        expect(assetConfig.data.assetDBList.filter((info: { name: string }) => info.name === 'localization-editor')).toEqual([canonical]);
    });

    it('fails closed when builtin identity and mount contribution are not unique', async () => {
        await createMount('duplicate-localization-editor', {
            name: 'localization-editor',
            readonly: true,
            visible: true,
            enable: 'L10nEnable',
        }, 'pink-localization-editor');
        await writeEnable(true);
        const assetConfig = await loadAssetConfig();
        await assetConfig.init();

        expect(() => assetConfig.resolveBuiltinLocalizationMount()).toThrow('not unique');
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
        packageName = extensionName,
        extensionsRoot = join(fixtureRoot, 'resources', 'app', 'extensions'),
    ): Promise<void> {
        const extensionRoot = join(extensionsRoot, extensionName);
        await ensureDir(join(extensionRoot, 'static', 'assets'));
        await outputJSON(join(extensionRoot, 'package.json'), {
            name: packageName,
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

    async function createProjectMount(
        extensionName: string,
        mount: { name: string; readonly: boolean; visible: boolean; enable?: string },
        packageName = extensionName,
    ): Promise<void> {
        await createMount(
            extensionName,
            mount,
            packageName,
            join(fixtureRoot, 'project', 'extensions'),
        );
    }

    async function writeEnable(enabled: boolean): Promise<void> {
        await outputJSON(
            join(fixtureRoot, 'project', 'settings', 'v2', 'packages', 'localization-editor.json'),
            { L10nEnable: enabled },
        );
    }
});
