import * as fse from 'fs-extra';
import * as path from 'path';
import * as assetdb from '@cocos/asset-db';
import type {
    IAssetDeleteOptions,
    IAssetFileSystemProvider,
    IAssetRenameOptions,
    IAssetWriteFileOptions,
} from '@cocos/asset-db';
import { resetFileSystemProvider as resetAssetDBFileSystemProvider } from '@cocos/asset-db';

jest.mock('../../scripting', () => ({
    __esModule: true,
    default: {
        updateDatabases: jest.fn(),
        isTargetReady: jest.fn(() => true),
        compileScripts: jest.fn(),
        queryScriptUsers: jest.fn(async () => []),
    },
}));

import assetManager from '../manager/asset';
import assetDBManager from '../manager/asset-db';
import { resetFileSystemProvider as resetCLIFileSystemProvider } from '../manager/filesystem';

describe('assetManager.renameAsset internal library deletion', () => {
    const PATH = {
        ROOT: path.join(__dirname, 'asset-manager-rename-trash'),
        TARGET: path.join(__dirname, 'asset-manager-rename-trash/target'),
        LIBRARY: path.join(__dirname, 'asset-manager-rename-trash/library'),
        TEMP: path.join(__dirname, 'asset-manager-rename-trash/temp'),
        SOURCE: path.join(__dirname, 'asset-manager-rename-trash/target/prefab.prefab'),
        RENAMED: path.join(__dirname, 'asset-manager-rename-trash/target/prefab-renamed.prefab'),
    };

    class PrefabLikeImporter extends assetdb.Importer {
        get name() {
            return 'prefab';
        }

        async import(asset: assetdb.Asset) {
            await asset.saveToLibrary('.json', '{"type":"prefab"}');
            return true;
        }
    }

    function isTestLibraryPath(filePath: string) {
        const normalizedFilePath = path.normalize(filePath).toLowerCase();
        const normalizedLibraryPath = path.normalize(PATH.LIBRARY).toLowerCase();

        return normalizedFilePath === normalizedLibraryPath
            || normalizedFilePath.startsWith(`${normalizedLibraryPath}${path.sep}`);
    }

    function createPinkLikeProvider(libraryTrashCalls: string[]): IAssetFileSystemProvider {
        return {
            async readFile(filePath: string, encoding?: BufferEncoding) {
                return encoding ? await fse.readFile(filePath, encoding) : await fse.readFile(filePath);
            },

            async writeFile(filePath: string, content: Buffer | string | Uint8Array, _options?: IAssetWriteFileOptions) {
                await fse.ensureDir(path.dirname(filePath));
                await fse.outputFile(filePath, content);
            },

            async createDirectory(dirPath: string) {
                await fse.ensureDir(dirPath);
            },

            async delete(filePath: string, options?: IAssetDeleteOptions) {
                if (isTestLibraryPath(filePath) && options?.useTrash !== false) {
                    libraryTrashCalls.push(filePath);
                }

                await fse.remove(filePath);
            },

            async rename(oldPath: string, newPath: string, options?: IAssetRenameOptions) {
                await fse.move(oldPath, newPath, { overwrite: !!options?.overwrite });
            },

            async copy(sourcePath: string, destinationPath: string, options?: IAssetRenameOptions) {
                await fse.copy(sourcePath, destinationPath, {
                    overwrite: options?.overwrite,
                });
            },
        };
    }

    function createDB() {
        return assetdb.create({
            name: 'assets',
            target: PATH.TARGET,
            library: PATH.LIBRARY,
            temp: PATH.TEMP,
            level: 0,
            ignoreFiles: [],
            readonly: false,
        });
    }

    async function startTestDB() {
        const db = createDB();
        db.importerManager.add(PrefabLikeImporter, ['.prefab']);

        assetDBManager.assetDBMap.assets = db;
        assetDBManager.assetDBInfo.assets = {
            name: 'assets',
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

        await db.start();
        return db;
    }

    afterEach(async () => {
        const db = assetDBManager.assetDBMap.assets;
        if (db) {
            await db.stop();
        }
        delete assetDBManager.assetDBMap.assets;
        delete assetDBManager.assetDBInfo.assets;
        assetDBManager.ready = false;

        resetCLIFileSystemProvider();
        resetAssetDBFileSystemProvider();
        await fse.remove(PATH.ROOT);
    });

    it('should not send prefab library json to provider trash branch when renaming through assetManager.renameAsset', async () => {
        const libraryTrashCalls: string[] = [];

        assetDBManager.setFileSystemProvider(createPinkLikeProvider(libraryTrashCalls));
        await fse.ensureDir(PATH.TARGET);
        await fse.outputFile(PATH.SOURCE, '[{"__type__":"cc.Prefab"}]');

        await startTestDB();

        const importedAsset = assetManager.queryAsset(PATH.SOURCE);
        expect(importedAsset).toBeTruthy();
        expect(importedAsset!.meta.files).toEqual(expect.arrayContaining(['.json']));

        libraryTrashCalls.length = 0;

        await assetManager.renameAsset(PATH.SOURCE, path.basename(PATH.RENAMED));

        expect(libraryTrashCalls).toEqual([]);
        expect(fse.existsSync(PATH.SOURCE)).toBe(false);
        expect(fse.existsSync(`${PATH.SOURCE}.meta`)).toBe(false);
        expect(fse.existsSync(PATH.RENAMED)).toBe(true);
        expect(fse.existsSync(`${PATH.RENAMED}.meta`)).toBe(true);
    });
});
