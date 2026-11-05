import * as assetdb from '@cocos/asset-db';
import { ensureDir, mkdtemp, outputFile, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import assetDBManager from '../manager/asset-db';
import assetManager from '../manager/asset';
import script from '../../scripting';

const DATABASE_NAME = 'query-script-users';
const SCRIPT_URL = `db://${DATABASE_NAME}/test.js`;

class ScriptImporter extends assetdb.Importer {
    get name() {
        return 'query-test-script';
    }

    get assetType() {
        return 'cc.Script';
    }

    async import() {
        return true;
    }
}

describe('script asset users with a real asset database', () => {
    let root: string;
    let database: assetdb.AssetDB;
    let queryScriptUsers: jest.SpyInstance;

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'cocos-query-script-users-'));
        const target = join(root, 'assets');
        await ensureDir(join(root, 'library'));
        await ensureDir(join(root, 'temp'));
        await outputFile(join(target, 'test.js'), 'module.exports = {};');
        await outputFile(join(target, 'consumer.ts'), 'import value from "./test.js";');
        database = assetdb.create({
            name: DATABASE_NAME,
            target,
            library: join(root, 'library'),
            temp: join(root, 'temp'),
            level: 0,
            ignoreFiles: [],
            readonly: false,
        });
        database.importerManager.add(ScriptImporter, ['.js', '.ts']);
        assetDBManager.assetDBMap[DATABASE_NAME] = database;
        await database.start();
    });

    beforeEach(() => {
        queryScriptUsers = jest.spyOn(script, 'queryScriptUsers');
        database.path2asset.get(join(root, 'assets', 'consumer.ts'))!.setData('dependScripts', []);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await database?.stop();
        delete assetDBManager.assetDBMap[DATABASE_NAME];
        await remove(root);
    });

    it.each(['script', 'all'] as const)('omits an unregistered CommonJS wrapper for %s queries', async type => {
        // PackerDriver converts test.mjs?cjs=&original=.js to this non-asset path.
        queryScriptUsers.mockResolvedValue([join(root, 'assets', 'test.mjs')]);

        await expect(assetManager.queryAssetUsers(SCRIPT_URL, type)).resolves.toEqual([]);
        expect(queryScriptUsers).toHaveBeenCalledWith(join(root, 'assets', 'test.js'));
    });

    it.each(['script', 'all'] as const)('preserves registered script users alongside a CommonJS wrapper for %s queries', async type => {
        const consumerPath = join(root, 'assets', 'consumer.ts');
        const consumerUUID = assetdb.queryUUID(consumerPath);
        expect(consumerUUID).not.toBe('');
        queryScriptUsers.mockResolvedValue([
            join(root, 'assets', 'test.mjs'),
            consumerPath,
        ]);

        await expect(assetManager.queryAssetUsers(SCRIPT_URL, type)).resolves.toEqual([consumerUUID]);
    });

    it('preserves asset users when a script user has no asset UUID', async () => {
        const consumerPath = join(root, 'assets', 'consumer.ts');
        const consumer = database.path2asset.get(consumerPath)!;
        const scriptUUID = assetdb.queryUUID(SCRIPT_URL);
        consumer.setData('dependScripts', [scriptUUID]);
        queryScriptUsers.mockResolvedValue([join(root, 'assets', 'test.mjs')]);

        await expect(assetManager.queryAssetUsers(SCRIPT_URL, 'all')).resolves.toEqual([consumer.uuid]);
    });
});
