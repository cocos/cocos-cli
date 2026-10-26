'use strict';

/* global after, before */

const { expect } = require('chai');
const fse = require('fs-extra');
const path = require('path');

const { AssetDB } = require('../dist/libs/asset-db');
const { Importer } = require('../dist/libs/importer');

describe('虚拟资源导入版本', () => {
    const PATH = {
        ROOT: path.join(__dirname, './virtual-import-version'),
        TARGET: path.join(__dirname, './virtual-import-version/target'),
        LIBRARY: path.join(__dirname, './virtual-import-version/library'),
        TEMP: path.join(__dirname, './virtual-import-version/temp'),
        FILE: path.join(__dirname, './virtual-import-version/target/animation.cached'),
    };

    let childVersionCode = 3;
    let parentImportCount = 0;
    let childImportCount = 0;

    class ParentImporter extends Importer {
        get name() {
            return 'versioned-parent';
        }

        async import(asset) {
            parentImportCount++;
            await asset.saveToLibrary('.parent', 'parent');
            await asset.createSubAsset('animation', 'versioned-child');
            return true;
        }
    }

    class ChildImporter extends Importer {
        get name() {
            return 'versioned-child';
        }

        get versionCode() {
            return childVersionCode;
        }

        async import(asset) {
            childImportCount++;
            await asset.saveToLibrary('.child', `version-${childVersionCode}`);
            return true;
        }
    }

    let database;

    before(async () => {
        fse.ensureDirSync(PATH.LIBRARY);
        fse.outputFileSync(PATH.FILE, 'animation');

        database = new AssetDB({
            name: 'virtual-import-version',
            target: PATH.TARGET,
            library: PATH.LIBRARY,
            temp: PATH.TEMP,
            level: 0,
        });
        database.importerManager.add(ParentImporter, ['.cached']);
        database.importerManager.add(ChildImporter, []);
    });

    after(async () => {
        await database.stop();
        fse.removeSync(PATH.ROOT);
    });

    it('仅虚拟子资源的 versionCode 变更时会重新导入子资源', async () => {
        await database.start();
        expect(parentImportCount).to.equal(1);
        expect(childImportCount).to.equal(1);

        await database.stop();
        parentImportCount = 0;
        childImportCount = 0;
        childVersionCode = 4;

        await database.start();

        expect(parentImportCount).to.equal(0);
        expect(childImportCount).to.equal(1);
    });
});
