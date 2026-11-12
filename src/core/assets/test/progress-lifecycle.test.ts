import EventEmitter from 'events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import * as assetdb from '@cocos/asset-db';
import { assetDBManager, assetManager, startAssetDB, stopAssetDB } from '..';
import assetHandlerManager from '../manager/asset-handler';
import assetQuery from '../manager/query';
import scripting from '../../scripting';

const progressEvents = ['add', 'change', 'delete'];
const completedEvents = ['added', 'changed', 'deleted'];
const changeEvents = ['asset-add', 'asset-change', 'asset-delete'] as const;
const managerEvents = ['db-created', 'db-removed', 'assets:ready'];
const managerClass = assetDBManager.constructor as typeof assetDBManager.constructor & { useCache: boolean };

describe('AssetManager startup progress lifecycle', () => {
    let fixture: string;
    let originalMap: typeof assetDBManager.assetDBMap;
    let originalInfo: typeof assetDBManager.assetDBInfo;
    let originalReady: boolean;
    let originalUseCache: boolean;
    let originalListenerCounts: number[];
    const onProgress = jest.fn();
    const onChange = jest.fn();
    const listenerCounts = () => managerEvents.map(event => assetDBManager.listenerCount(event));

    beforeEach(async () => {
        fixture = realpathSync(mkdtempSync(join(tmpdir(), 'asset-progress-lifecycle-')));
        originalMap = assetDBManager.assetDBMap;
        originalInfo = assetDBManager.assetDBInfo;
        originalReady = assetDBManager.ready;
        originalUseCache = managerClass.useCache;
        originalListenerCounts = listenerCounts();
        assetDBManager.assetDBMap = {};
        assetDBManager.assetDBInfo = {};
        assetDBManager.ready = false;
        managerClass.useCache = false;
        onProgress.mockClear();
        onChange.mockClear();

        // Keep the real AssetManager, startup orchestration, hooks and stop entry.
        // Stub only DB/compilation I/O; DB events flow through real progress handlers.
        jest.spyOn(console, 'debug').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(scripting, 'updateDatabases').mockResolvedValue(undefined);
        jest.spyOn(assetHandlerManager, 'compileEffect').mockImplementation(() => {});
        jest.spyOn(assetHandlerManager, 'startAutoGenEffectBin').mockImplementation(() => {});
        jest.spyOn(assetHandlerManager, 'destroyAsset').mockResolvedValue(undefined);
        jest.spyOn(assetQuery, 'queryAssetInfos').mockReturnValue([]);
        jest.spyOn(assetdb, 'create').mockImplementation(options => {
            const db = new EventEmitter();
            const cachePath = join(fixture, `${options.name}.cache`);
            writeFileSync(cachePath, '{}');
            return Object.assign(db, {
                options,
                cachePath,
                importerManager: {},
                assetProgressInfo: { current: 1, total: 2, wait: 0 },
                taskManager: { start() {}, stop() {}, async waitQueue() {} },
                async start({ hooks }: { hooks: Record<string, () => Promise<void>> }) {
                    db.emit('add', { url: `db://${options.name}/startup.ts` });
                    await hooks.afterPreImport?.();
                    await hooks.afterStart?.();
                },
                async startWithCache() {
                    db.emit('add', { url: `db://${options.name}/startup.ts` });
                },
                async stop() {},
            }) as unknown as assetdb.AssetDB;
        });

        for (const name of ['internal', 'assets']) {
            const target = join(fixture, name);
            mkdirSync(target);
            assetDBManager.assetDBInfo[name] = {
                name, target, library: join(fixture, 'library'), temp: join(fixture, 'temp'), state: 'none',
            } as typeof assetDBManager.assetDBInfo[string];
        }
        await assetManager.init();
        assetManager.onProgress(onProgress);
        for (const event of changeEvents) {
            assetManager.on(event, onChange);
        }
    });

    afterEach(async () => {
        await stopAssetDB();
        assetManager.destroyed();
        assetManager.removeListener('progress', onProgress);
        for (const event of changeEvents) {
            assetManager.removeListener(event, onChange);
        }
        assetDBManager.assetDBMap = originalMap;
        assetDBManager.assetDBInfo = originalInfo;
        assetDBManager.ready = originalReady;
        managerClass.useCache = originalUseCache;
        jest.restoreAllMocks();
        expect(dirname(fixture)).toBe(realpathSync(tmpdir()));
        expect(basename(fixture)).toMatch(/^asset-progress-lifecycle-/);
        rmSync(fixture, { recursive: true, force: true });
    });

    async function expectReadyWithoutProgress() {
        expect(assetDBManager.ready).toBe(true);
        const dbs = Object.values(assetDBManager.assetDBMap);
        expect(dbs).toHaveLength(2);
        for (const db of dbs) {
            expect(progressEvents.map(event => db.listenerCount(event))).toEqual([0, 0, 0]);
            expect(completedEvents.map(event => db.listenerCount(event))).toEqual([1, 1, 1]);
        }
        onProgress.mockClear();
        onChange.mockClear();
        const db = assetDBManager.assetDBMap.assets;
        const asset = { url: 'db://assets/ordinary.ts' };
        for (const event of [...progressEvents, ...completedEvents]) {
            db.emit(event, asset);
        }
        await Promise.resolve(); // Allow the real asynchronous deleted handler to finish.
        expect(onProgress).not.toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledTimes(3);
    }

    it.each([false, true])('cleans progress after every ready without reinitializing (cache=%s)', async useCache => {
        managerClass.useCache = useCache;
        // init is deliberately called only by beforeEach, not between rounds.
        for (let round = 0; round < 3; round++) {
            onProgress.mockClear();
            await startAssetDB();
            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(onProgress).toHaveBeenCalledWith(2, 4, 'db://assets/startup.ts', 'processing');
            await expectReadyWithoutProgress();
            await stopAssetDB();
        }
    });

    it('does not duplicate subscriptions when initialized repeatedly, and unbinds on destroy', async () => {
        await assetManager.init();
        expect(listenerCounts()).toEqual(originalListenerCounts.map(count => count + 1));
        await startAssetDB();
        expect(onProgress).toHaveBeenCalledTimes(2);
        await expectReadyWithoutProgress();
        await stopAssetDB();
        assetManager.destroyed();
        expect(listenerCounts()).toEqual(originalListenerCounts);

        await assetManager.init();
        expect(listenerCounts()).toEqual(originalListenerCounts.map(count => count + 1));
        await startAssetDB();
        await expectReadyWithoutProgress();
    });
});
