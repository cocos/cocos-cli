import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmdirSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import * as assetdb from '@cocos/asset-db';
import { assetDBManager as manager, assetManager, stopAssetDB } from '..';
import * as Assets from '../../../lib/assets/assets';
import assetHandlerManager from '../manager/asset-handler';
import assetQuery from '../manager/query';
import scripting from '../../scripting';

const managerClass = manager.constructor as typeof manager.constructor & { useCache: boolean };
const progressEvents = ['add', 'change', 'delete'];

describe('startup rollback with real AssetDB stop failures', () => {
    let fixture: string;
    let blockedRecord: string | undefined;
    let originalMap: typeof manager.assetDBMap;
    let originalInfo: typeof manager.assetDBInfo;
    let originalReady: boolean;
    let originalUseCache: boolean;
    let errorLog: jest.SpyInstance;
    const created: assetdb.AssetDB[] = [];
    const onCreated = (db: assetdb.AssetDB) => created.push(db);
    const onRemoved = jest.fn();
    const onReady = jest.fn();
    const finalizationError = new Error('finalization failure');

    beforeEach(async () => {
        fixture = realpathSync(mkdtempSync(join(tmpdir(), 'asset-cleanup-retry-')));
        originalMap = manager.assetDBMap;
        originalInfo = manager.assetDBInfo;
        originalReady = manager.ready;
        originalUseCache = managerClass.useCache;
        manager.assetDBMap = {};
        manager.assetDBInfo = {};
        manager.ready = false;
        managerClass.useCache = false;
        blockedRecord = undefined;
        created.length = 0;
        onRemoved.mockClear();
        onReady.mockClear();

        jest.spyOn(console, 'debug').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
        // DB creation, filesystem, start, stop, registry and AssetManager are real.
        jest.spyOn(scripting, 'updateDatabases').mockResolvedValue(undefined);
        jest.spyOn(assetQuery, 'queryAssetInfos').mockReturnValue([]);
        jest.spyOn(assetHandlerManager, 'startAutoGenEffectBin').mockImplementation(() => {});
        jest.spyOn(assetHandlerManager, 'compileEffect').mockImplementationOnce(() => {
            const db = manager.assetDBMap.assets;
            expect(assetdb.get('assets')).toBe(db);
            const record = join(db.options.library, '.assets-info.json');
            expect(record).toBe(join(fixture, 'library', '.assets-info.json'));
            blockedRecord = record;
            if (existsSync(record)) unlinkSync(record);
            mkdirSync(record);
            throw finalizationError;
        }).mockImplementation(() => {});

        for (const name of ['internal', 'assets']) {
            const target = join(fixture, name);
            mkdirSync(target);
            manager.assetDBInfo[name] = {
                name, target, library: join(fixture, 'library'), temp: join(fixture, 'temp'), state: 'none',
            } as typeof manager.assetDBInfo[string];
        }
        await assetManager.init();
        manager.on('db-created', onCreated);
        manager.on('db-removed', onRemoved);
        manager.on('assets:ready', onReady);
    });

    function repairRecordPath() {
        if (blockedRecord) {
            rmdirSync(blockedRecord); // Remove only the empty directory created by this test.
            blockedRecord = undefined;
        }
    }

    afterEach(async () => {
        repairRecordPath();
        await stopAssetDB();
        // Also clean the real package registry when running against the broken baseline.
        for (const db of created) {
            if (assetdb.get(db.options.name) === db) await db.stop();
        }
        assetManager.destroyed();
        manager.removeListener('db-created', onCreated);
        manager.removeListener('db-removed', onRemoved);
        manager.removeListener('assets:ready', onReady);
        manager.assetDBMap = originalMap;
        manager.assetDBInfo = originalInfo;
        manager.ready = originalReady;
        managerClass.useCache = originalUseCache;
        jest.restoreAllMocks();
        expect(dirname(fixture)).toBe(realpathSync(tmpdir()));
        expect(basename(fixture)).toMatch(/^asset-cleanup-retry-/);
        rmSync(fixture, { recursive: true, force: true });
    });

    it.each(['stop', 'start'])('retains a failed instance until real cleanup succeeds via %s', async recovery => {
        await expect(Assets.start()).rejects.toBe(finalizationError);
        const failed = created.find(db => db.options.name === 'assets')!;
        expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('startup rollback'),
            expect.objectContaining({ code: 'EISDIR', path: blockedRecord }));
        expect(assetdb.get('assets')).toBe(failed);
        expect(manager.assetDBMap.assets).toBe(failed);
        expect(manager.assetDBInfo.assets.state).toBe('startup');
        expect(onRemoved).not.toHaveBeenCalledWith(failed);
        expect(assetdb.get('internal')).toBeNull();
        expect(manager.assetDBMap.internal).toBeUndefined();
        expect(onRemoved).toHaveBeenCalledTimes(1);
        expect(manager.ready).toBe(false);
        expect(onReady).not.toHaveBeenCalled();

        // A second failed cleanup must not create replacements or publish readiness.
        await expect(Assets.start()).rejects.toMatchObject({ code: 'EISDIR' });
        expect(created).toHaveLength(2);
        expect(manager.assetDBMap.assets).toBe(failed);
        expect(assetdb.get('assets')).toBe(failed);
        expect(onReady).not.toHaveBeenCalled();

        repairRecordPath();
        if (recovery === 'stop') {
            await stopAssetDB();
            expect(assetdb.get('assets')).toBeNull();
            expect(manager.assetDBMap).toEqual({});
            expect(manager.assetDBInfo.assets.state).toBe('none');
        }
        const checkBeforeReplacement = (db: assetdb.AssetDB) => {
            if (db.options.name === 'assets') expect(assetdb.get('assets')).toBeNull();
        };
        manager.on('db-created', checkBeforeReplacement);
        try {
            await Assets.start();
        } finally {
            manager.removeListener('db-created', checkBeforeReplacement);
        }
        expect(manager.ready).toBe(true);
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(created).toHaveLength(4);
        expect(onRemoved.mock.calls.filter(([db]) => db === failed)).toHaveLength(1);
        expect(failed.listenerCount('added')).toBe(0);
        for (const [name, db] of Object.entries(manager.assetDBMap)) {
            expect(assetdb.get(name)).toBe(db);
            expect(manager.assetDBInfo[name].state).toBe('startup');
            expect(progressEvents.map(event => db.listenerCount(event))).toEqual([0, 0, 0]);
        }
        expect(manager.assetDBMap.assets).not.toBe(failed);
    });
});
