'use strict';

const { expect } = require('chai');

const fse = require('fs-extra');
const path = require('path');
const { v4 } = require('node-uuid');

const { AssetDB } = require('../dist/libs/asset-db');
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
