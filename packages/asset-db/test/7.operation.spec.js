'use strict';

const { expect } = require('chai');

const fse = require('fs-extra');
const path = require('path');
const { v4 } = require('node-uuid');

const { AssetDB } = require('../dist/libs/asset-db');
const { refresh } = require('../dist/libs/manager');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');
const { VirtualAsset } = require('../dist/libs/asset');
const { nameToId } = require('../dist/libs/utils');

describe('文件操作', () => {

    const PATH = {
        ROOT: path.join(__dirname, './operation'),
        TARGET: path.join(__dirname, './operation/target'),
        LIBRARY: path.join(__dirname, './operation/library'),
        TEMP: path.join(__dirname, './operation/temp'),

        FILE: path.join(__dirname, './operation/target', '1.test'),
    };
    // 记录导入元素
    const record = [];

    class TestAImporter extends Importer {
        get name() {
            return 'test-a';
        }

        async import(asset) {
            record.push('a');
        }
    }

    it('does not resolve unrelated indexed parents when refreshing an ordinary file', async () => {
        const root = path.join(PATH.ROOT, 'scoped-refresh');
        const target = path.join(root, 'assets');
        const file = path.join(target, 'selected', 'file.test');
        fse.outputFileSync(file, 'initial');
        for (let i = 0; i < 30; i++) fse.outputFileSync(path.join(target, `other-${i}`, 'file.test'), 'other');
        fse.ensureDirSync(path.join(root, 'library'));
        const db = new AssetDB({ name: 'scoped-refresh', target,
            library: path.join(root, 'library'), temp: path.join(root, 'temp'), level: 0 });
        const realpath = fse.realpathSync;
        try {
            await db.start();
            const uuid = db.path2asset.get(file).uuid;
            const unrelatedReads = [];
            fse.realpathSync = function (file, ...args) {
                if (String(file).startsWith(path.join(target, 'other-'))) unrelatedReads.push(file);
                return realpath.call(this, file, ...args);
            };
            fse.writeFileSync(file, 'updated contents');

            await db.refresh(file);

            expect(db.path2asset.get(file).uuid).to.equal(uuid);
            expect(fse.readFileSync(file, 'utf8')).to.equal('updated contents');
            expect(unrelatedReads).to.deep.equal([]);
        } finally {
            fse.realpathSync = realpath;
            await db.stop();
            fse.removeSync(root);
        }
    });

    for (const [directory, targetDirectory] of [[false, false], [false, true], [true, false], [true, true]]) {
        it(`reconciles equal-mtime metadata when a ${directory ? 'directory' : 'file'} replaces a ${targetDirectory ? 'directory' : 'file'}`, async () => {
            const root = path.join(PATH.ROOT, 'replacement-kind');
            const targetRoot = path.join(root, 'assets');
            const source = path.join(targetRoot, 'source');
            const target = path.join(targetRoot, 'target');
            fse.outputFileSync(directory ? path.join(source, 'child.test') : source, 'new');
            fse.outputFileSync(targetDirectory ? path.join(target, 'child.test') : target, 'old');
            fse.ensureDirSync(path.join(root, 'library'));
            const imports = [];
            class KindImporter extends Importer {
                get name() { return 'kind'; }
                async validate() { return true; }
                async import(asset) { imports.push({ uuid: asset.uuid, directory: asset.isDirectory() }); return true; }
            }
            const db = new AssetDB({ name: 'replacement-kind', target: targetRoot,
                library: path.join(root, 'library'), temp: path.join(root, 'temp'), level: 0 });
            db.importerManager.add(KindImporter, ['', '.test']);
            try {
                await db.start();
                // Replacement files may preserve their timestamps, as with checkout or restore.
                const timestamp = new Date('2025-01-01T00:00:00Z');
                const replacedFiles = [source, target];
                if (directory) replacedFiles.push(path.join(source, 'child.test'));
                if (targetDirectory) replacedFiles.push(path.join(target, 'child.test'));
                for (const file of replacedFiles) fse.utimesSync(file + '.meta', timestamp, timestamp);
                await db.refresh(source);
                await db.refresh(target);
                const sourceChildUuid = directory ? db.path2asset.get(path.join(source, 'child.test')).uuid : null;
                const targetChildUuid = targetDirectory ? db.path2asset.get(path.join(target, 'child.test')).uuid : null;
                const sourceUuid = db.path2asset.get(source).uuid;
                const targetAsset = db.path2asset.get(target);
                const targetUuid = targetAsset.uuid;
                expect(targetAsset.isDirectory()).to.equal(targetDirectory);
                const removedKinds = [];
                db.on('deleted', asset => {
                    if (asset.uuid === targetUuid) removedKinds.push(asset.isDirectory());
                });
                imports.length = 0;
                await fse.move(source + '.meta', target + '.meta', { overwrite: true });
                await fse.move(source, target, { overwrite: true });

                await db.refresh(source);
                await refresh('db://replacement-kind/target', { reloadMetadata: true });

                expect(removedKinds).to.deep.equal([targetDirectory]);
                expect(db.getAsset(targetUuid)).to.equal(null);
                if (targetChildUuid) expect(db.getAsset(targetChildUuid)).to.equal(null);
                if (sourceChildUuid) {
                    expect(db.getAsset(sourceChildUuid).source).to.equal(path.join(target, 'child.test'));
                    expect(fse.readJSONSync(path.join(target, 'child.test.meta')).uuid).to.equal(sourceChildUuid);
                }
                expect(fse.readJSONSync(target + '.meta').uuid).to.equal(sourceUuid);
                expect(db.getAsset(sourceUuid).isDirectory()).to.equal(directory);
                expect(imports.filter(entry => entry.uuid === sourceUuid)).to.deep.equal([{ uuid: sourceUuid, directory }]);
            } finally {
                await db.stop();
                fse.removeSync(root);
            }
        });
    }

    describe('在数据库内新增 / 删除文件', async () => {
        let DB;

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = new AssetDB({
                name: 'test',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestAImporter, ['.test']);
            await DB.start();
        });

        after(async () => {
            await DB.stop();
            // 清空测试数据
            fse.removeSync(PATH.ROOT);
        });

        it('初始数据库内容为空', async () => {
            // 数据内容为空
            expect(DB.path2asset.size).to.equal(0);
            expect(DB.uuid2asset.size).to.equal(0);
        });

        it('模拟文件并导入', async () => {
            // 模拟数据
            fse.outputJSONSync(path.join(PATH.TARGET, '1.test'), { a: 1, }, { spaces: 2, });

            // 导入资源
            await DB.refresh(path.join(PATH.TARGET, '1.test'));
            expect(DB.path2asset.size).to.equal(1);
            expect(DB.uuid2asset.size).to.equal(1);

        });

        it('删除文件', async () => {
            fse.removeSync(PATH.FILE);
            // 文件不存在，导入失败
            await DB.refresh(PATH.FILE);
            expect(DB.path2asset.size).to.equal(0);
            expect(DB.uuid2asset.size).to.equal(0);
        });
    });

    ///////////////////////////////////////////////

    describe('资源改名', async () => {
        let DB;

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = new AssetDB({
                name: 'test',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestAImporter, ['.test']);
            await DB.start();
        });

        after(async () => {
            await DB.stop();
            // 清空测试数据
            fse.removeSync(PATH.ROOT);
        });

        it('初始数据库内容为空', async () => {
            // 数据内容为空
            expect(DB.path2asset.size).to.equal(0);
            expect(DB.uuid2asset.size).to.equal(0);
        });

        it('模拟文件并导入', async () => {
            // 模拟数据
            fse.outputJSONSync(PATH.FILE, { a: 1, }, { spaces: 2, });

            // 导入资源
            await DB.refresh(PATH.FILE);
            expect(DB.path2asset.size).to.equal(1);
            expect(DB.uuid2asset.size).to.equal(1);
        });

        it('将文件改名并重新导入', async () => {
            const file = path.join(PATH.TARGET, '2.test');
            // 模拟数据
            fse.renameSync(PATH.FILE, file);
            fse.renameSync(PATH.FILE + '.meta', file + '.meta');

            // 导入资源
            await DB.refresh(path.join(PATH.TARGET, '2.test'));

            expect(DB.path2asset.size).to.equal(1);
            expect(DB.uuid2asset.size).to.equal(1);

            const asset = DB.path2asset.get(file);
            expect(!!asset).to.equal(true);
            expect(asset.source).to.equal(file);
            expect(asset.basename).to.equal('2');
            expect(asset.extname).to.equal('.test');
        });

        it('更改文件 meta 内的 uuid', async () => {
            const assetFile = path.join(PATH.TARGET, '2.test');
            const metaFile = path.join(PATH.TARGET, '2.test.meta');
            const previousMtimeMs = fse.statSync(metaFile).mtimeMs;
            const metaJSON = fse.readJSONSync(metaFile);
            metaJSON.uuid = v4();
            fse.outputJSONSync(metaFile, metaJSON, { spaces: 2 });
            // Windows CI may preserve the same mtime for two rapid writes.
            fse.utimesSync(metaFile, new Date(), new Date(previousMtimeMs + 5000));

            // 导入资源
            await DB.refresh(path.join(PATH.TARGET, '2.test'));

            expect(DB.path2asset.size).to.equal(1);
            expect(DB.uuid2asset.size).to.equal(1);

            expect(DB.path2asset.get(assetFile).uuid).to.equal(metaJSON.uuid);
            expect(!!DB.uuid2asset.get(metaJSON.uuid)).to.equal(true);
        });
    });

    ///////////////////////////////////////////////

    describe('文件夹改名', async () => {
        let DB;

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = new AssetDB({
                name: 'test',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestAImporter, ['.test']);
            await DB.start();
        });

        after(async () => {
            await DB.stop();
            fse.removeSync(PATH.ROOT);
        });

        it('初始数据库内容为空', async () => {
            // 数据内容为空
            expect(DB.path2asset.size).to.equal(0);
            expect(DB.uuid2asset.size).to.equal(0);
        });

        it('模拟文件并导入', async () => {
            // 模拟数据
            fse.outputJSONSync(path.join(PATH.TARGET, 'test', '1.test'), { a: 1, }, { spaces: 2, });

            // 导入资源
            await DB.refresh(path.join(PATH.TARGET, 'test'));
            expect(DB.path2asset.size).to.equal(2);
            expect(DB.uuid2asset.size).to.equal(2);
        });

        it('将文件改名并重新导入', async () => {
            const dir1 = path.join(PATH.TARGET, 'test');
            const dir2 = path.join(PATH.TARGET, 'test2');
            const dir3 = path.join(PATH.TARGET, 'test3');

            const file1 = path.join(PATH.TARGET, 'test', '1.test');
            const file2 = path.join(PATH.TARGET, 'test2', '1.test');
            const file3 = path.join(PATH.TARGET, 'test3', '1.test');

            // 模拟数据
            fse.renameSync(dir1, dir2);
            fse.renameSync(dir1 + '.meta', dir2 + '.meta');

            // 导入资源
            await DB.refresh(dir2);

            expect(DB.path2asset.size).to.equal(2);
            expect(DB.uuid2asset.size).to.equal(2);

            expect(DB.path2asset.has(dir1)).to.equal(false);
            expect(DB.path2asset.has(dir2)).to.equal(true);

            expect(DB.path2asset.has(file1)).to.equal(false);
            expect(DB.path2asset.has(file2)).to.equal(true);

            // 模拟数据
            fse.renameSync(dir2, dir3);
            fse.renameSync(dir2 + '.meta', dir3 + '.meta');

            // 导入资源
            await DB.refresh(dir3);

            expect(DB.path2asset.size).to.equal(2);
            expect(DB.uuid2asset.size).to.equal(2);

            expect(DB.path2asset.has(dir2)).to.equal(false);
            expect(DB.path2asset.has(dir3)).to.equal(true);

            expect(DB.path2asset.has(file2)).to.equal(false);
            expect(DB.path2asset.has(file3)).to.equal(true);
        });
    });

});
