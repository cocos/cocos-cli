import EventEmitter from 'events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, sep } from 'path';
import { pathToFileURL } from 'url';
import { ModLo } from '@cocos/creator-programming-mod-lo/lib/mod-lo';
import { ModuleNotFoundError } from '@cocos/creator-programming-mod-lo/lib/resolver/resolve-error';
import { DBChangeType } from '../../scripting/packer-driver/asset-db-interop';
import type AssetDBManager from '../manager/asset-db';

const mockCreate = jest.fn();
const mockUpdateDatabases = jest.fn();
const mockExistsSync = jest.fn();

jest.mock('fs-extra', () => ({
    ...jest.requireActual('fs-extra'),
    ensureDirSync: jest.fn(),
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));
jest.mock('@cocos/asset-db', () => ({
    AssetActionEnum: { add: 0 },
    create: (...args: unknown[]) => mockCreate(...args),
}));
jest.mock('../manager/plugin', () => ({ __esModule: true, default: {} }));
jest.mock('../manager/asset', () => ({
    __esModule: true, default: { resetMovePreflights: jest.fn() },
}));
jest.mock('../manager/asset-handler', () => ({
    __esModule: true,
    default: { compileEffect: jest.fn(), startAutoGenEffectBin: jest.fn() },
}));
jest.mock('../manager/filesystem', () => ({ setFileSystemProvider: jest.fn() }));
jest.mock('../../base/console', () => ({
    newConsole: {
        trackTimeStart: jest.fn(), trackTimeEnd: jest.fn(),
        trackMemoryStart: jest.fn(), trackMemoryEnd: jest.fn(),
    },
}));
jest.mock('../../base/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../../base/utils', () => ({
    __esModule: true, default: { Path: { normalize: (value: string) => value } },
}));
jest.mock('../asset-config', () => ({ __esModule: true, default: { data: { globList: [] } } }));
jest.mock('../../scripting', () => ({
    __esModule: true,
    default: { updateDatabases: (...args: unknown[]) => mockUpdateDatabases(...args) },
}));
jest.mock('../utils', () => ({}));

const order = ['internal', 'assets', 'i18n', 'shared'];
const assetPrefix = (root: string) => pathToFileURL(root + sep).href;

describe('AssetDB startup scripting domains', () => {
    let manager: typeof AssetDBManager;
    let fixture: string;
    let roots: Record<string, string>;
    let resolver: ModLo;
    let domains: Map<string, string>;
    let events: string[];
    let imports: string[];
    let stopped: string[];
    let cached: Set<string>;
    let createFailure: string | undefined;
    let registrationFailure: string | undefined;
    let startFailure: string | undefined;
    let corruptCache: string | undefined;
    let previousQuery: typeof globalThis.assetQuery;

    beforeAll(() => {
        // Canonicalize temp roots to match ModLo on systems with symlinked temp dirs.
        fixture = realpathSync(mkdtempSync(join(tmpdir(), 'asset-db-startup-')));
        roots = Object.fromEntries(order.map(name => [name, join(fixture, name)]));
        for (const root of Object.values(roots)) {
            mkdirSync(root);
            writeFileSync(join(root, 'Entry.ts'), 'export {};');
        }
        writeFileSync(join(roots.i18n, 'LanguageData.ts'), 'export const value = 1;');
        writeFileSync(join(roots.shared, 'Shared.ts'), 'export const value = 2;');
    });

    beforeEach(() => {
        jest.spyOn(console, 'debug').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        manager = require('../manager/asset-db').default;
        manager.assetDBMap = {};
        manager.assetDBInfo = {};
        manager.ready = false;
        (manager.constructor as typeof manager.constructor & { useCache: boolean }).useCache = false;
        previousQuery = globalThis.assetQuery;
        globalThis.assetQuery = { queryAssetInfos: () => [] } as unknown as typeof globalThis.assetQuery;
        resolver = new ModLo({ _compressUUID: uuid => uuid });
        domains = new Map();
        events = [];
        imports = [];
        stopped = [];
        cached = new Set();
        createFailure = registrationFailure = startFailure = corruptCache = undefined;

        // Deliberately shuffled: internal and assets must retain their priorities.
        for (const name of ['i18n', 'assets', 'internal', 'shared']) {
            manager.assetDBInfo[name] = {
                name, target: roots[name], library: join(fixture, 'library'),
                temp: join(fixture, 'temp'), state: 'none',
            } as typeof manager.assetDBInfo[string];
        }
        for (const event of ['db-created', 'db-started', 'db-removed', 'assets:db-ready']) {
            manager.on(event, value => events.push(`${event}:${value.name || value.options.name}`));
        }
        manager.on('assets:ready', () => events.push('assets:ready'));

        mockExistsSync.mockImplementation((name: string) => cached.has(name));
        mockUpdateDatabases.mockImplementation(async (info: { dbID: string; target: string }, kind: DBChangeType) => {
            await Promise.resolve();
            if (kind === DBChangeType.add) {
                domains.set(info.dbID, info.target);
            } else {
                domains.delete(info.dbID);
            }
            resolver.setAssetPrefixes([...domains.values()].map(assetPrefix));
            events.push(`domain:${kind === DBChangeType.add ? 'add' : 'remove'}:${info.dbID}`);
            // Fail after partially updating registrations to exercise rollback.
            if (kind === DBChangeType.add && registrationFailure === info.dbID) {
                throw new Error('registration failure');
            }
        });
        mockCreate.mockImplementation(info => {
            if (createFailure === info.name) {
                throw new Error('create failure');
            }
            // Keep the real manager's create/start/cache/fallback hooks; stub DB I/O.
            return Object.assign(new EventEmitter(), {
                options: info,
                cachePath: info.name,
                importerManager: {},
                taskManager: { start() {}, stop() {}, async waitQueue() {} },
                async start({ hooks }: { hooks: Record<string, () => Promise<void>> }) {
                    importScripts(info.name);
                    await hooks.afterPreImport?.();
                    await hooks.afterStart?.();
                },
                async startWithCache() {
                    if (corruptCache === info.name) {
                        throw new Error('corrupt cache');
                    }
                    importScripts(info.name);
                },
                async stop() { stopped.push(info.name); },
            });
        });
    });

    afterEach(() => {
        manager.removeAllListeners();
        manager.assetDBMap = {};
        manager.assetDBInfo = {};
        manager.ready = false;
        (manager.constructor as typeof manager.constructor & { useCache: boolean }).useCache = false;
        globalThis.assetQuery = previousQuery;
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    afterAll(() => {
        expect(dirname(fixture)).toBe(realpathSync(tmpdir()));
        expect(basename(fixture)).toMatch(/^asset-db-startup-/);
        rmSync(fixture, { recursive: true, force: true });
    });

    function importScripts(name: string) {
        imports.push(name);
        events.push(`import:${name}`);
        // Real ModLo must resolve extensionless TS references both from the project
        // to an extension and from one extension to a later extension.
        if (name === 'assets' || name === 'i18n') {
            resolver.resolve(name === 'assets' ? '../i18n/LanguageData' : '../shared/Shared',
                pathToFileURL(join(roots[name], 'Entry.ts')));
        }
        if (startFailure === name) {
            throw new Error('start failure');
        }
    }

    function expectSuccessfulStartup() {
        expect(imports).toEqual(order);
        expect([...domains.keys()]).toEqual(order);
        const firstImport = events.findIndex(event => event.startsWith('import:'));
        for (const name of order) {
            expect(events.indexOf(`domain:add:${name}`)).toBeLessThan(firstImport);
            expect(events.filter(event => event === `db-started:${name}`)).toHaveLength(1);
            expect(events.filter(event => event === `assets:db-ready:${name}`)).toHaveLength(1);
            expect(events.indexOf(`db-started:${name}`)).toBeLessThan(events.indexOf(`assets:db-ready:${name}`));
        }
        expect(events.at(-1)).toBe('assets:ready');
        expect(manager.ready).toBe(true);
    }

    it.each([
        ['cold startup', false, []],
        ['all cache hits', true, order],
        ['missing caches', true, []],
        ['mixed caches', true, ['internal', 'i18n']],
        ['corrupt cache fallback', true, order],
    ] as const)('%s registers every scripting domain before importing', async (mode, useCache, cacheNames) => {
        (manager.constructor as typeof manager.constructor & { useCache: boolean }).useCache = useCache;
        cached = new Set(cacheNames);
        corruptCache = mode === 'corrupt cache fallback' ? 'assets' : undefined;
        await manager.start();
        expectSuccessfulStartup();
    });

    it.each(['cache hit', 'cache missing', 'cache corrupt', 'cold restart'])('%s recreates stopped databases before announcing readiness', async mode => {
        const { stopAssetDB } = await import('../index');
        const useCache = mode !== 'cold restart';
        (manager.constructor as typeof manager.constructor & { useCache: boolean }).useCache = useCache;
        cached = new Set(order);
        await manager.start();
        const previousDBs = { ...manager.assetDBMap };
        const previousConfig = manager.assetDBInfo;

        await stopAssetDB();
        expect(manager.ready).toBe(false);
        expect(manager.assetDBMap).toEqual({});
        expect(manager.assetDBInfo).toBe(previousConfig);
        expect(stopped).toEqual(order);
        expect(events.filter(event => event.startsWith('db-removed:')))
            .toEqual(order.map(name => `db-removed:${name}`));

        // Launcher closes scripting too; the next startup must register all domains again.
        domains.clear();
        resolver.setAssetPrefixes([]);
        imports = [];
        events = [];
        cached = new Set(mode === 'cache missing' ? [] : order);
        corruptCache = mode === 'cache corrupt' ? 'assets' : undefined;
        await manager.start();
        expectSuccessfulStartup();
        for (const name of order) {
            expect(manager.assetDBMap[name]).not.toBe(previousDBs[name]);
        }
    });

    it('keeps a failed stop tracked while clearing databases that stopped successfully', async () => {
        const { stopAssetDB } = await import('../index');
        await manager.start();
        const stopError = new Error('stop failure');
        const failedDB = manager.assetDBMap.assets;
        jest.spyOn(failedDB, 'stop').mockRejectedValueOnce(stopError);
        await expect(stopAssetDB()).rejects.toBe(stopError);
        expect(manager.ready).toBe(false);
        expect(manager.assetDBMap.internal).toBeUndefined();
        expect(manager.assetDBMap.assets).toBe(failedDB);
        expect(events).not.toContain('db-removed:assets');

        await stopAssetDB();
        expect(manager.assetDBMap).toEqual({});
    });

    it('waits for asynchronous scripting registration before starting any importer', async () => {
        let completeRegistration!: () => void;
        let registrationStarted!: () => void;
        const started = new Promise<void>(resolve => { registrationStarted = resolve; });
        const pending = new Promise<void>(resolve => { completeRegistration = resolve; });
        const update = mockUpdateDatabases.getMockImplementation()!;
        mockUpdateDatabases.mockImplementation(async (info, kind) => {
            if (info.dbID === 'shared' && kind === DBChangeType.add) {
                registrationStarted();
                await pending;
            }
            return update(info, kind);
        });
        const startup = manager.start();
        await started;
        const importsWhilePending = [...imports];
        completeRegistration();
        await startup;
        expect(importsWhilePending).toEqual([]);
        expectSuccessfulStartup();
    });

    it.each(['create', 'registration'])('%s failure rolls back new DBs, preserves existing DBs and permits retry', async kind => {
        const existing = { options: manager.assetDBInfo.internal } as unknown as typeof manager.assetDBMap[string];
        manager.assetDBMap.internal = existing;
        domains.set('internal', roots.internal);
        resolver.setAssetPrefixes([assetPrefix(roots.internal)]);
        if (kind === 'create') createFailure = 'i18n';
        else registrationFailure = 'i18n';

        await expect(manager.start()).rejects.toThrow(`${kind} failure`);
        expect(imports).toEqual([]);
        expect(manager.assetDBMap).toEqual({ internal: existing });
        expect([...domains.keys()]).toEqual(['internal']);
        expect(Object.keys(manager.assetDBInfo)).toHaveLength(4);
        expect(stopped).toEqual(kind === 'create' ? ['assets'] : ['i18n', 'assets']);
        expect(events.filter(event => event.startsWith('db-removed:')))
            .toHaveLength(events.filter(event => event.startsWith('db-created:')).length);
        expect(manager.ready).toBe(false);
        expect(events).not.toContain('assets:ready');

        createFailure = registrationFailure = undefined;
        await manager.start();
        expect(imports).toEqual(['assets', 'i18n', 'shared']);
        expect(manager.assetDBMap.internal).toBe(existing);
        expect(manager.ready).toBe(true);
    });

    it('does not announce readiness for a database whose import failed', async () => {
        startFailure = 'assets';
        await expect(manager.start()).rejects.toThrow('start failure');
        expect(manager.ready).toBe(false);
        expect(events).not.toContain('assets:db-ready:assets');
        expect(events).not.toContain('assets:ready');
    });

    it('still reports a genuinely missing dependency', async () => {
        await manager.start();
        expect(() => resolver.resolve('../i18n/DoesNotExist', pathToFileURL(join(roots.assets, 'Entry.ts'))))
            .toThrow(ModuleNotFoundError);
    });
});
