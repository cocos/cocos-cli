import { mkdtemp, outputFile, ensureDir, readFile, remove, move, symlink } from 'fs-extra';
import { existsSync, readFileSync, lstatSync, readlinkSync } from 'fs';
import { dirname, join, relative } from 'path';
import { tmpdir } from 'os';

interface TestDatabase {
    options: { name: string; target: string; readonly: boolean };
    flag: { started: boolean };
}

interface TestAsset {
    uuid: string;
    url: string;
    source: string;
    _parent: TestAsset | null;
    _assetDB: TestDatabase;
    meta: { importer: string };
    isDirectory(): boolean;
}

let mockRoot = '';
let mockDatabase: TestDatabase;
const mockAssets = new Map<string, TestAsset>();
const mockDatabaseManager = {
    assetDBMap: {} as Record<string, TestDatabase>,
    assetDBInfo: {} as Record<string, { name: string; target: string }>,
    addTask: async (task: (...args: unknown[]) => unknown, args: unknown[]) => task(...args),
    autoRefreshAssetLazy: jest.fn(),
};
const mockQueryAsset = (key: string): TestAsset | null =>
    [...mockAssets.values()].find(asset => asset.uuid === key || asset.url === key || asset.source === key) ?? null;
const mockPath = (value: string): string =>
    value.startsWith('db://assets/') ? join(mockRoot, 'assets', value.slice('db://assets/'.length)) : value;
const mockUrl = (value: string): string =>
    value.startsWith('db://') ? value : `db://assets/${relative(join(mockRoot, 'assets'), value).replace(/\\/g, '/')}`;
const mockRefresh = jest.fn(async (value: string) => {
    const path = mockPath(value);
    if (existsSync(path) && existsSync(`${path}.meta`)) {
        const meta = JSON.parse(readFileSync(`${path}.meta`, 'utf8')) as { uuid: string };
        const asset = mockAssets.get(meta.uuid);
        if (asset) {
            for (const current of mockAssets.values()) {
                if (current.source === path && current.uuid !== asset.uuid) mockAssets.delete(current.uuid);
            }
            asset.source = path;
            asset.url = mockUrl(path);
        }
    }
    return 1;
});
const mockExternalWrites = jest.fn(async (_ids: string[], task: () => Promise<unknown>) => task());

jest.mock('@cocos/asset-db', () => ({
    refresh: (path: string) => mockRefresh(path),
    reimport: jest.fn(),
    queryUrl: (path: string) => mockUrl(path),
    Asset: class {},
}));
jest.mock('../asset-config', () => ({ __esModule: true, default: { data: {} } }));
jest.mock('../manager/asset-db', () => ({ __esModule: true, default: mockDatabaseManager }));
jest.mock('../manager/asset-handler', () => ({ __esModule: true, default: {} }));
jest.mock('../manager/asset-copy', () => ({ copyAssetSource: jest.fn() }));
jest.mock('../asset-handler/utils', () => ({ mergeMeta: jest.fn() }));
jest.mock('../../base/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        Path: jest.requireActual('../../base/utils/path'),
        File: jest.requireActual('../../base/utils/file'),
    },
}));
jest.mock('../utils', () => ({
    url2path: (value: string) => mockPath(value),
    url2uuid: (value: string) => value,
    ensureOutputData: jest.fn(),
    pathToDbUrlIfAssetDBPath: (value: string) => mockUrl(value),
    dirnameForDbUrlOrPath: (value: string) => value.slice(0, value.lastIndexOf('/')),
}));
jest.mock('../manager/query', () => ({
    __esModule: true,
    ASSET_TREE_INFO_DATA_KEYS: ['subAssets', 'displayName', 'extends'],
    default: {
        queryAsset: (key: string) => mockQueryAsset(key),
        queryAssets: () => [...mockAssets.values()],
        queryAssetInfo: (key: string) => {
            const asset = mockQueryAsset(key);
            return asset ? { uuid: asset.uuid, url: asset.url, source: asset.source } : null;
        },
    },
}));
jest.mock('../animation-graph-service', () => ({
    __esModule: true,
    default: { runExternalWrites: (ids: string[], task: () => Promise<unknown>) => mockExternalWrites(ids, task) },
}));

const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
const assetConfig = (require('../asset-config') as typeof import('../asset-config')).default;
const { setFileSystemProvider, resetFileSystemProvider } =
    require('../manager/filesystem') as typeof import('../manager/filesystem');

describe('asset move preflight and submission', () => {
    async function createAsset(name: string, uuid = name, directory = false): Promise<TestAsset> {
        const source = join(mockDatabase.options.target, name);
        if (directory) await ensureDir(source);
        else await outputFile(source, `contents of ${uuid}`);
        await outputFile(`${source}.meta`, JSON.stringify({ uuid }));
        const asset: TestAsset = {
            uuid,
            url: `db://assets/${name}`,
            source,
            _parent: null,
            _assetDB: mockDatabase,
            meta: { importer: 'text' },
            isDirectory: () => directory,
        };
        mockAssets.set(uuid, asset);
        return asset;
    }

    beforeEach(async () => {
        mockRoot = await mkdtemp(join(tmpdir(), 'asset-move-preflight-'));
        mockDatabase = {
            options: { name: 'assets', target: join(mockRoot, 'assets'), readonly: false },
            flag: { started: true },
        };
        mockDatabaseManager.assetDBMap = { assets: mockDatabase };
        mockDatabaseManager.assetDBInfo = { assets: { name: 'assets', target: mockDatabase.options.target } };
        mockAssets.clear();
        mockRefresh.mockClear();
        mockExternalWrites.mockReset();
        mockExternalWrites.mockImplementation(async (_ids, task) => task());
        assetOperation.resetMovePreflights();
        assetConfig.data.root = mockRoot;
        assetConfig.data.tempRoot = join(mockRoot, 'temp');
        await ensureDir(join(mockRoot, 'assets', 'destination'));
        jest.spyOn(console, 'debug').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        resetFileSystemProvider();
        jest.restoreAllMocks();
        await remove(mockRoot);
    });

    it('observes without moving, then returns the final resource with its original UUID', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        const target = 'db://assets/destination/source.txt';
        const preflight = await assetOperation.preflightMoveAsset(source.url, target);
        expect(preflight).toEqual({ action: 'move', preflightToken: expect.any(String) });
        expect(existsSync(source.source)).toBe(true);
        expect(existsSync(mockPath(target))).toBe(false);
        expect(mockRefresh).not.toHaveBeenCalled();

        await expect(
            assetOperation.moveAsset(source.url, target, { preflightToken: preflight.preflightToken }),
        ).resolves.toEqual({ uuid: 'source-uuid', url: target, source: mockPath(target) });
        expect(await readFile(`${mockPath(target)}.meta`, 'utf8')).toBe('{"uuid":"source-uuid"}');
    });

    it.each(['body', 'metadata', 'directory'])('reports an unindexed destination %s conflict', async kind => {
        const source = await createAsset('source.txt');
        const target = join(mockRoot, 'assets', 'destination', 'source.txt');
        if (kind === 'directory') await ensureDir(target);
        else await outputFile(kind === 'metadata' ? `${target}.meta` : target, 'occupied');

        await expect(assetOperation.preflightMoveAsset(source.uuid, target)).resolves.toEqual({
            action: 'choose-conflict-handling',
            preflightToken: expect.any(String),
            conflict: {
                sourceUrl: source.url,
                targetUrl: mockUrl(target),
                sourceIsDirectory: false,
                targetIsDirectory: kind === 'metadata' ? null : kind === 'directory',
            },
        });
        expect(existsSync(source.source)).toBe(true);
    });

    it('returns the actual generated name and avoids orphan metadata names', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        const target = await createAsset('destination/source.txt', 'target-uuid');
        await outputFile(join(dirname(target.source), 'source-001.txt.meta'), 'orphan');
        const preflight = await assetOperation.preflightMoveAsset(source.url, target.url);
        const result = await assetOperation.moveAsset(source.url, target.url, {
            preflightToken: preflight.preflightToken,
            rename: true,
        });
        expect(result).toMatchObject({ uuid: 'source-uuid', url: 'db://assets/destination/source-002.txt' });
        expect(await readFile(target.source, 'utf8')).toBe('contents of target-uuid');
    });

    it('observes and writes the same literal percent filename', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        const occupied = await createAsset('destination/%61.txt', 'literal-target');
        const other = await createAsset('destination/a.txt', 'other-target');
        const preflight = await assetOperation.preflightMoveAsset(source.uuid, occupied.url);
        expect(preflight.action).toBe('choose-conflict-handling');
        await expect(
            assetOperation.moveAsset(source.uuid, occupied.url, {
                preflightToken: preflight.preflightToken,
                overwrite: true,
            }),
        ).resolves.toMatchObject({ uuid: 'source-uuid', url: occupied.url });
        expect(await readFile(other.source, 'utf8')).toBe('contents of other-target');
    });

    it('does not request write access to the original conflicting graph when automatically renaming', async () => {
        const source = await createAsset('source.animgraph', 'source-uuid');
        const target = await createAsset('destination/source.animgraph', 'dirty-target');
        target.meta.importer = 'animation-graph';
        mockExternalWrites.mockImplementationOnce(async () => {
            throw new Error('dirty graph');
        });
        const preflight = await assetOperation.preflightMoveAsset(source.uuid, target.url);
        await expect(
            assetOperation.moveAsset(source.uuid, target.url, {
                preflightToken: preflight.preflightToken,
                rename: true,
            }),
        ).resolves.toMatchObject({ uuid: 'source-uuid', url: 'db://assets/destination/source-001.animgraph' });
        expect(mockExternalWrites).not.toHaveBeenCalled();
        mockExternalWrites.mockReset();
        mockExternalWrites.mockImplementation(async (_ids, task) => task());
    });

    it('overwrites using the source identity, including a file replacing a directory', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        const target = await createAsset('destination/source.txt', 'target-uuid', true);
        await outputFile(join(target.source, 'target-only.txt'), 'old child');
        const preflight = await assetOperation.preflightMoveAsset(source.uuid, target.url);
        const result = await assetOperation.moveAsset(source.uuid, target.url, {
            preflightToken: preflight.preflightToken,
            overwrite: true,
        });
        expect(result).toMatchObject({ uuid: 'source-uuid', url: target.url });
        expect(await readFile(target.source, 'utf8')).toBe('contents of source-uuid');
        expect(mockAssets.has('target-uuid')).toBe(false);
    });

    it.each(['source body', 'source metadata', 'target body', 'target metadata'])(
        'refuses changed %s before any move',
        async changed => {
            const source = await createAsset('source.txt');
            const originalPath = source.source;
            const target = join(mockRoot, 'assets', 'destination', 'source.txt');
            const preflight = await assetOperation.preflightMoveAsset(source.url, target);
            const changedPath = changed.startsWith('source') ? source.source : target;
            await outputFile(
                changed.endsWith('metadata') ? `${changedPath}.meta` : changedPath,
                'changed after preflight',
            );
            const rename = jest.fn();
            setFileSystemProvider({ rename });

            await expect(
                assetOperation.moveAsset(source.url, target, {
                    preflightToken: preflight.preflightToken,
                    overwrite: true,
                }),
            ).rejects.toThrow('changed after preflight');
            expect(rename).not.toHaveBeenCalled();
            expect(mockRefresh).not.toHaveBeenCalled();
            expect(existsSync(originalPath)).toBe(true);
        },
    );

    it('observes changes inside a source directory', async () => {
        const source = await createAsset('folder', 'folder', true);
        const child = join(source.source, 'child.txt');
        await outputFile(child, 'before');
        const target = 'db://assets/destination/folder';
        const preflight = await assetOperation.preflightMoveAsset(source.url, target);
        await outputFile(child, 'after');
        await expect(
            assetOperation.moveAsset(source.url, target, { preflightToken: preflight.preflightToken }),
        ).rejects.toThrow('changed after preflight');
        expect(await readFile(child, 'utf8')).toBe('after');
    });

    it('binds the request, consumes failed submissions once, and never falls back to an unguarded move', async () => {
        const source = await createAsset('source.txt');
        const target = 'db://assets/destination/source.txt';
        const preflight = await assetOperation.preflightMoveAsset(source.url, target);
        await expect(
            assetOperation.moveAsset(source.url, 'db://assets/destination/other.txt', {
                preflightToken: preflight.preflightToken,
            }),
        ).rejects.toThrow('changed after preflight');
        await expect(
            assetOperation.moveAsset(source.url, target, { preflightToken: preflight.preflightToken }),
        ).rejects.toThrow('invalid or already used');
        await expect(assetOperation.moveAsset(source.url, target, { preflightToken: '' })).rejects.toThrow(
            'invalid or already used',
        );
        expect(existsSync(source.source)).toBe(true);
    });

    it.each(['replace mount', 'stop mount', 'readonly'])('refuses a changed database: %s', async change => {
        const source = await createAsset('source.txt');
        const target = 'db://assets/destination/source.txt';
        const preflight = await assetOperation.preflightMoveAsset(source.url, target);
        if (change === 'replace mount') mockDatabaseManager.assetDBMap.assets = { ...mockDatabase };
        else if (change === 'stop mount') mockDatabase.flag.started = false;
        else mockDatabase.options.readonly = true;
        await expect(
            assetOperation.moveAsset(source.url, target, { preflightToken: preflight.preflightToken }),
        ).rejects.toThrow();
        expect(existsSync(source.source)).toBe(true);
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it.each(['db://missing/file.txt', 'db://assets/../outside.txt', 'db://assets', 'relative.txt'])(
        'rejects invalid target %s during preflight',
        async target => {
            const source = await createAsset('source.txt');
            await expect(assetOperation.preflightMoveAsset(source.url, target)).rejects.toThrow();
            expect(mockRefresh).not.toHaveBeenCalled();
        },
    );

    it.each(['target changed', 'lifecycle reset'])(
        'rechecks after waiting for Animation Graph writes: %s',
        async change => {
            const source = await createAsset('source.animgraph');
            source.meta.importer = 'animation-graph';
            const target = 'db://assets/destination/source.animgraph';
            const preflight = await assetOperation.preflightMoveAsset(source.url, target);
            let release!: () => void;
            let entered!: () => void;
            const blocked = new Promise<void>(resolve => {
                release = resolve;
            });
            const started = new Promise<void>(resolve => {
                entered = resolve;
            });
            mockExternalWrites.mockImplementationOnce(async (_ids, task) => {
                entered();
                await blocked;
                return task();
            });
            const moving = assetOperation.moveAsset(source.url, target, {
                preflightToken: preflight.preflightToken,
                overwrite: true,
            });
            const rejected = expect(moving).rejects.toThrow('changed after preflight');
            await started;
            if (change === 'target changed') await outputFile(mockPath(target), 'new target');
            else assetOperation.resetMovePreflights();
            release();
            await rejected;
            expect(existsSync(source.source)).toBe(true);
            expect(mockRefresh).not.toHaveBeenCalled();
        },
    );

    it('keeps explicit direct calls compatible and returns their final resource', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        await createAsset('destination/source.txt');
        await expect(
            assetOperation.moveAsset(source.uuid, 'db://assets/destination/source.txt', { rename: true }),
        ).resolves.toMatchObject({ uuid: 'source-uuid', url: 'db://assets/destination/source-001.txt' });
    });

    it('does not refresh or report success when overwriting fails', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        const target = await createAsset('destination/source.txt', 'target-uuid');
        const preflight = await assetOperation.preflightMoveAsset(source.url, target.url);
        setFileSystemProvider({
            rename: async (from, to, options) => {
                if (from === source.source) throw new Error('body denied');
                await move(from, to, { overwrite: !!options?.overwrite });
            },
        });
        await expect(
            assetOperation.moveAsset(source.uuid, target.url, {
                preflightToken: preflight.preflightToken,
                overwrite: true,
            }),
        ).rejects.toThrow('body denied');
        expect(mockRefresh).not.toHaveBeenCalled();
        expect(await readFile(`${source.source}.meta`, 'utf8')).toBe('{"uuid":"source-uuid"}');
        expect(await readFile(`${target.source}.meta`, 'utf8')).toBe('{"uuid":"target-uuid"}');
    });

    it('rejects target replacement between overwrite steps before refreshing Asset DB', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        const target = await createAsset('destination/source.txt', 'target-uuid');
        const preflight = await assetOperation.preflightMoveAsset(source.uuid, target.url);
        let retainedMeta = '';
        const rename = jest.fn(async (from: string, to: string, options?: { overwrite?: boolean }) => {
            await move(from, to, { overwrite: !!options?.overwrite });
            if (from === `${target.source}.meta`) {
                retainedMeta = to;
                await move(target.source, join(mockRoot, 'externally-saved-target'));
                await outputFile(target.source, 'third-party content');
            }
        });
        setFileSystemProvider({ rename });

        await expect(assetOperation.moveAsset(source.uuid, target.url, {
            preflightToken: preflight.preflightToken,
            overwrite: true,
        })).rejects.toThrow('could not be restored safely');

        expect(rename.mock.calls.some(([from]) => from === source.source || from === target.source)).toBe(false);
        expect(mockRefresh).not.toHaveBeenCalled();
        expect(await readFile(source.source, 'utf8')).toBe('contents of source-uuid');
        expect(await readFile(`${source.source}.meta`, 'utf8')).toBe('{"uuid":"source-uuid"}');
        expect(await readFile(target.source, 'utf8')).toBe('third-party content');
        expect(existsSync(`${target.source}.meta`)).toBe(false);
        expect(await readFile(retainedMeta, 'utf8')).toBe('{"uuid":"target-uuid"}');
    });

    it.each(['body', 'metadata'])(
        'automatically renames around dangling %s links without replacing them',
        async kind => {
            const source = await createAsset('source.txt', 'source-uuid');
            const target = 'db://assets/destination/source.txt';
            const linkTarget = join(mockRoot, 'missing');
            const suffix = kind === 'metadata' ? '.meta' : '';
            const occupied = [mockPath(target), mockPath('db://assets/destination/source-001.txt')];
            for (const path of occupied) await symlink(linkTarget, `${path}${suffix}`);
            const preflight = await assetOperation.preflightMoveAsset(source.url, target);
            expect(preflight.action).toBe('choose-conflict-handling');

            const moved = await assetOperation.moveAsset(source.uuid, target, {
                preflightToken: preflight.preflightToken,
                rename: true,
            });

            expect(moved).toMatchObject({ uuid: source.uuid, url: 'db://assets/destination/source-002.txt' });
            for (const path of occupied) {
                expect(lstatSync(`${path}${suffix}`).isSymbolicLink()).toBe(true);
                expect(readlinkSync(`${path}${suffix}`)).toBe(linkTarget);
            }
        },
    );

    it.each(['body', 'metadata'])(
        'replaces a dangling %s link when overwrite is explicitly selected',
        async kind => {
            const source = await createAsset('source.txt', 'source-uuid');
            const sourcePath = source.source;
            const target = 'db://assets/destination/source.txt';
            const targetPath = mockPath(target);
            const linkTarget = join(mockRoot, 'missing');
            const linkPath = kind === 'metadata' ? `${targetPath}.meta` : targetPath;
            await symlink(linkTarget, linkPath);
            const preflight = await assetOperation.preflightMoveAsset(source.uuid, target);
            expect(preflight.action).toBe('choose-conflict-handling');

            const moved = await assetOperation.moveAsset(source.uuid, target, {
                preflightToken: preflight.preflightToken,
                overwrite: true,
            });

            expect(moved).toMatchObject({ uuid: 'source-uuid', url: target });
            expect(lstatSync(linkPath).isFile()).toBe(true);
            expect(await readFile(targetPath, 'utf8')).toBe('contents of source-uuid');
            expect(await readFile(`${targetPath}.meta`, 'utf8')).toBe('{"uuid":"source-uuid"}');
            expect(existsSync(linkTarget)).toBe(false);
            expect(existsSync(sourcePath)).toBe(false);
            expect(existsSync(`${sourcePath}.meta`)).toBe(false);
        },
    );

    it.each(['body', 'metadata'])(
        'refuses a generated name whose %s becomes a dangling link while waiting for graph writes',
        async kind => {
            const source = await createAsset('source.animgraph', 'source-uuid');
            source.meta.importer = 'animation-graph';
            const target = await createAsset('destination/source.animgraph', 'target-uuid');
            const generated = mockPath('db://assets/destination/source-001.animgraph');
            const occupiedPath = kind === 'metadata' ? `${generated}.meta` : generated;
            const linkTarget = join(mockRoot, 'missing');
            const preflight = await assetOperation.preflightMoveAsset(source.uuid, target.url);
            mockExternalWrites.mockImplementationOnce(async (_ids, task) => {
                await symlink(linkTarget, occupiedPath);
                return task();
            });

            await expect(
                assetOperation.moveAsset(source.uuid, target.url, {
                    preflightToken: preflight.preflightToken,
                    rename: true,
                }),
            ).rejects.toThrow('generated asset move destination changed');

            expect(lstatSync(occupiedPath).isSymbolicLink()).toBe(true);
            expect(readlinkSync(occupiedPath)).toBe(linkTarget);
            expect(await readFile(`${source.source}.meta`, 'utf8')).toBe('{"uuid":"source-uuid"}');
            expect(mockRefresh).not.toHaveBeenCalled();
        },
    );

    it('overwrites through an existing parent symlink inside the Asset DB', async () => {
        const source = await createAsset('source.txt', 'source-uuid');
        const previous = await createAsset('destination/source.txt', 'target-uuid');
        await symlink(
            join(mockDatabase.options.target, 'destination'),
            join(mockDatabase.options.target, 'alias'),
            'dir',
        );
        const target = 'db://assets/alias/source.txt';
        const preflight = await assetOperation.preflightMoveAsset(source.uuid, target);
        expect(preflight.action).toBe('choose-conflict-handling');

        const moved = await assetOperation.moveAsset(source.uuid, target, {
            preflightToken: preflight.preflightToken,
            overwrite: true,
        });

        expect(moved).toMatchObject({ uuid: 'source-uuid', url: target });
        expect(await readFile(previous.source, 'utf8')).toBe('contents of source-uuid');
        expect(await readFile(`${previous.source}.meta`, 'utf8')).toBe('{"uuid":"source-uuid"}');
        expect(lstatSync(join(mockDatabase.options.target, 'alias')).isSymbolicLink()).toBe(true);
    });

    it.each(['dangling', 'file', 'outside'])('rejects a parent symlink pointing to %s during preflight', async kind => {
        const source = await createAsset('source.txt');
        const outside = join(mockRoot, 'outside');
        await ensureDir(outside);
        const linkTarget = kind === 'dangling' ? join(mockRoot, 'missing') : kind === 'file' ? source.source : outside;
        const alias = join(mockDatabase.options.target, 'alias');
        await symlink(linkTarget, alias);

        await expect(assetOperation.preflightMoveAsset(source.uuid, 'db://assets/alias/source.txt')).rejects.toThrow();

        expect(readlinkSync(alias)).toBe(linkTarget);
        expect(existsSync(source.source)).toBe(true);
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    describe('resolved path overlap', () => {
        async function expectRejectedWithoutWrites(action: () => Promise<unknown>, paths: string[]): Promise<void> {
            const before = await Promise.all(paths.map(path => readFile(path)));
            const write = jest.fn(async () => {
                throw new Error('Unexpected filesystem mutation');
            });
            setFileSystemProvider({ rename: write, createDirectory: write, delete: write, writeFile: write, copy: write });

            await expect(action()).rejects.toThrow('Cannot move an asset into or over itself');

            expect(write).not.toHaveBeenCalled();
            expect(mockRefresh).not.toHaveBeenCalled();
            expect(existsSync(assetConfig.data.tempRoot)).toBe(false);
            expect(await Promise.all(paths.map(path => readFile(path)))).toEqual(before);
        }

        it.each(['existing', 'missing'])('rejects an alias into the source when the destination is %s', async kind => {
            const source = await createAsset('a', 'source-uuid', true);
            const keep = await createAsset('a/keep.txt', 'keep-uuid');
            const paths = [`${source.source}.meta`, keep.source, `${keep.source}.meta`];
            if (kind === 'existing') {
                const target = await createAsset('a/new.txt', 'target-uuid');
                paths.push(target.source, `${target.source}.meta`);
            }
            const alias = join(mockDatabase.options.target, 'link');
            await symlink(source.source, alias, 'dir');

            await expectRejectedWithoutWrites(
                () => assetOperation.preflightMoveAsset(source.uuid, 'db://assets/link/new.txt'),
                paths,
            );

            expect(readlinkSync(alias)).toBe(source.source);
            if (kind === 'missing') {
                expect(existsSync(join(source.source, 'new.txt'))).toBe(false);
                expect(existsSync(join(source.source, 'new.txt.meta'))).toBe(false);
            }
        });

        it.each(['same entry', 'ancestor'])('rejects an alias addressing the %s of the source', async relation => {
            const parent = await createAsset('container', 'parent-uuid', true);
            const source = await createAsset('container/source', 'source-uuid', true);
            const child = await createAsset('container/source/child.txt', 'child-uuid');
            await symlink(mockDatabase.options.target, join(mockDatabase.options.target, 'alias'), 'dir');
            const target = relation === 'same entry' ? 'db://assets/alias/container/source' : 'db://assets/alias/container';

            await expectRejectedWithoutWrites(
                () => assetOperation.preflightMoveAsset(source.uuid, target),
                [`${parent.source}.meta`, `${source.source}.meta`, child.source, `${child.source}.meta`],
            );
        });

        it('resolves aliases in the source parent as well as the destination parent', async () => {
            await createAsset('container', 'parent-uuid', true);
            const source = await createAsset('container/source', 'source-uuid', true);
            const target = await createAsset('container/source/child.txt', 'child-uuid');
            const sourceMeta = `${source.source}.meta`;
            const alias = join(mockDatabase.options.target, 'alias');
            await symlink(join(mockDatabase.options.target, 'container'), alias, 'dir');
            source.source = join(alias, 'source');
            source.url = 'db://assets/alias/source';

            await expectRejectedWithoutWrites(
                () => assetOperation.preflightMoveAsset(source.uuid, target.url),
                [sourceMeta, target.source, `${target.source}.meta`],
            );
        });

        it.each(['before submission', 'while waiting for graph writes'])(
            'rejects a parent alias redirected into the source %s',
            async timing => {
                const source = await createAsset('a', 'source-uuid', true);
                const child = await createAsset('a/new.txt', 'child-uuid');
                const graph = await createAsset('a/graph.animgraph', 'graph-uuid');
                graph.meta.importer = 'animation-graph';
                const destination = await createAsset('destination/new.txt', 'destination-uuid');
                const alias = join(mockDatabase.options.target, 'alias');
                await symlink(join(mockDatabase.options.target, 'destination'), alias, 'dir');
                const target = 'db://assets/alias/new.txt';
                const preflight = await assetOperation.preflightMoveAsset(source.uuid, target);
                expect(preflight.action).toBe('choose-conflict-handling');
                const redirect = async () => {
                    await remove(alias);
                    await symlink(source.source, alias, 'dir');
                };
                if (timing === 'before submission') {
                    await redirect();
                } else {
                    mockExternalWrites.mockImplementationOnce(async (_ids, task) => {
                        await redirect();
                        return task();
                    });
                }

                await expectRejectedWithoutWrites(
                    () => assetOperation.moveAsset(source.uuid, target, {
                        preflightToken: preflight.preflightToken, overwrite: true,
                    }),
                    [
                        `${source.source}.meta`, child.source, `${child.source}.meta`,
                        graph.source, `${graph.source}.meta`, destination.source, `${destination.source}.meta`,
                    ],
                );

                if (timing !== 'before submission') {
                    expect(mockExternalWrites).toHaveBeenCalledWith(['graph-uuid'], expect.any(Function));
                }
                await expect(assetOperation.moveAsset(source.uuid, target, {
                    preflightToken: preflight.preflightToken, overwrite: true,
                })).rejects.toThrow('invalid or already used');
            },
        );

        it.each(['valid', 'dangling'])('keeps a %s destination symlink as the entry being replaced', async kind => {
            const source = await createAsset('a', 'source-uuid', true);
            const target = 'db://assets/destination/link';
            const linkTarget = kind === 'valid' ? source.source : join(mockRoot, 'missing');
            await symlink(linkTarget, mockPath(target), 'dir');

            await expect(assetOperation.preflightMoveAsset(source.uuid, target)).resolves.toMatchObject({
                action: 'choose-conflict-handling',
            });

            expect(readlinkSync(mockPath(target))).toBe(linkTarget);
            expect(mockRefresh).not.toHaveBeenCalled();
        });

        it('keeps a source symlink as the entry being moved', async () => {
            const referenced = await createAsset('referenced', 'referenced-uuid', true);
            const source = await createAsset('source-link', 'source-uuid', true);
            await remove(source.source);
            await symlink(referenced.source, source.source, 'dir');

            await expect(assetOperation.preflightMoveAsset(source.uuid, 'db://assets/referenced/new')).resolves.toMatchObject({
                action: 'move',
            });

            expect(readlinkSync(source.source)).toBe(referenced.source);
            expect(await readFile(`${source.source}.meta`, 'utf8')).toBe('{"uuid":"source-uuid"}');
            expect(mockRefresh).not.toHaveBeenCalled();
        });
    });
});
