import * as assetdb from '@cocos/asset-db';
import * as fse from 'fs-extra';
import * as path from 'path';
import assetManager from '../manager/asset';
import assetDBManager from '../manager/asset-db';

const DATABASE_NAME = 'sub-asset-url-resolution';
const CHILD_NAME = 'Character_Soldier_anima-003.prefab';
const LEGACY_CHILD_ID = 'c6110';
const PATH = {
    ROOT: path.join(__dirname, DATABASE_NAME),
    TARGET: path.join(__dirname, DATABASE_NAME, 'target'),
    LIBRARY: path.join(__dirname, DATABASE_NAME, 'library'),
    TEMP: path.join(__dirname, DATABASE_NAME, 'temp'),
    SOURCE: path.join(__dirname, DATABASE_NAME, 'target', 'Character_Soldier_anima-003.fbx-like'),
};

class RenamedSceneImporter extends assetdb.Importer {
    get name() {
        return 'renamed-scene';
    }

    get assetType() {
        return 'cc.Prefab';
    }

    async import(asset: assetdb.Asset | assetdb.VirtualAsset) {
        if (!asset.parent) {
            await asset.createSubAsset(CHILD_NAME, this.name, { id: LEGACY_CHILD_ID });
        }
        return true;
    }
}

describe('sub-asset URL resolution with a real asset database', () => {
    let database: assetdb.AssetDB | undefined;
    let originalReady: boolean;

    beforeEach(async () => {
        originalReady = assetDBManager.ready;
        await fse.remove(PATH.ROOT);
        await Promise.all([
            fse.ensureDir(PATH.TARGET),
            fse.ensureDir(PATH.LIBRARY),
            fse.ensureDir(PATH.TEMP),
        ]);
        await fse.outputFile(PATH.SOURCE, 'fbx-like');

        database = assetdb.create({
            name: DATABASE_NAME,
            target: PATH.TARGET,
            library: PATH.LIBRARY,
            temp: PATH.TEMP,
            level: 0,
            ignoreFiles: [],
            readonly: false,
        });
        database.importerManager.add(RenamedSceneImporter, ['.fbx-like']);
        assetDBManager.assetDBMap[DATABASE_NAME] = database;
        assetDBManager.assetDBInfo[DATABASE_NAME] = {
            name: DATABASE_NAME,
            target: PATH.TARGET,
            readonly: false,
            temp: PATH.TEMP,
            library: PATH.LIBRARY,
            level: 0,
            globList: [],
            ignoreFiles: [],
            visible: true,
            state: 'none',
            preImportExtList: [],
        };
        assetDBManager.ready = true;

        await database.start();
    });

    afterEach(async () => {
        if (database) {
            await database.stop();
        }
        delete assetDBManager.assetDBMap[DATABASE_NAME];
        delete assetDBManager.assetDBInfo[DATABASE_NAME];
        assetDBManager.ready = originalReady;
        await fse.remove(PATH.ROOT);
    });

    it('returns the same child for its current dbURL and preserved UUID', () => {
        const rootAsset = database!.path2asset.get(PATH.SOURCE);
        const childAsset = rootAsset?.subAssets[LEGACY_CHILD_ID];
        expect(rootAsset).toBeDefined();
        expect(childAsset).toBeDefined();

        const childUrl = `db://${DATABASE_NAME}/${path.basename(PATH.SOURCE)}/${CHILD_NAME}`;
        expect(assetManager.queryUUID(childUrl)).toBe(childAsset!.uuid);

        const infoByUrl = assetManager.queryAssetInfo(childUrl);
        const infoByUUID = assetManager.queryAssetInfo(childAsset!.uuid);
        expect(infoByUrl).not.toBeNull();
        expect(infoByUrl).toEqual(infoByUUID);
        expect(infoByUrl!.uuid).toBe(`${rootAsset!.uuid}@${LEGACY_CHILD_ID}`);
    });
});
