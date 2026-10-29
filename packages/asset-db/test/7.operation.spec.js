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

    for (const deleteParent of [false, true]) {
        it(`refreshes alias indexes and removes UUIDs after deleting the ${deleteParent ? 'canonical parent' : 'target'}`, async () => {
            const root = path.join(PATH.ROOT, 'alias-refresh');
            const targetRoot = path.join(root, 'assets');
            const source = path.join(targetRoot, 'source');
            const target = path.join(targetRoot, 'destination', 'folder');
            const alias = path.join(targetRoot, 'links', 'alias');
            const aliasTarget = path.join(alias, 'folder');
            fse.outputFileSync(path.join(source, 'new.test'), 'new');
            fse.outputFileSync(path.join(target, 'old.test'), 'old');
            fse.ensureDirSync(path.dirname(alias));
            const db = new AssetDB({ name: 'alias-refresh', target: targetRoot,
                library: path.join(root, 'library'), temp: path.join(root, 'temp'), level: 0 });
            try {
                await db.start();
                const sourceUuid = db.path2asset.get(source).uuid;
                const childUuid = db.path2asset.get(path.join(source, 'new.test')).uuid;
                const oldUuids = [target, path.join(target, 'old.test')].map(file => db.path2asset.get(file).uuid);
                const link = deleteParent && process.platform !== 'win32'
                    ? path.relative(path.dirname(alias), path.dirname(target)) : path.dirname(target);
                await fse.symlink(link, alias, 'junction');
                await fse.move(source + '.meta', target + '.meta', { overwrite: true });
                await fse.move(source, target, { overwrite: true });

                await db.refresh(source);
                await db.refresh(aliasTarget);

                expect(oldUuids.map(uuid => db.getAsset(uuid))).to.deep.equal([null, null]);
                expect(db.getAsset(sourceUuid).source).to.equal(aliasTarget);
                expect(db.getAsset(childUuid).source).to.equal(path.join(aliasTarget, 'new.test'));
                for (const refreshPath of [target, targetRoot]) {
                    await db.refresh(refreshPath);
                    expect(fse.readJSONSync(target + '.meta').uuid).to.equal(sourceUuid);
                    expect(fse.readJSONSync(path.join(target, 'new.test.meta')).uuid).to.equal(childUuid);
                    expect(oldUuids.map(uuid => db.getAsset(uuid))).to.deep.equal([null, null]);
                }
                await db.refresh(aliasTarget);
                const removed = deleteParent ? path.dirname(target) : target;
                await fse.remove(removed);
                await fse.remove(removed + '.meta');
                await db.refresh(removed);
                expect([sourceUuid, childUuid].map(uuid => db.getAsset(uuid))).to.deep.equal([null, null]);
            } finally {
                await db.stop();
                fse.removeSync(root);
            }
        });

    }

    it('publishes a changed event when an imported file is refreshed through a parent alias', async () => {
        const root = path.join(PATH.ROOT, 'alias-event');
        const target = path.join(root, 'assets');
        const file = path.join(target, 'real', 'file.test');
        const alias = path.join(target, 'alias');
        fse.outputFileSync(file, 'contents');
        fse.ensureDirSync(path.join(root, 'library'));
        const db = new AssetDB({ name: 'alias-event', target,
            library: path.join(root, 'library'), temp: path.join(root, 'temp'), level: 0 });
        try {
            await db.start();
            const uuid = db.path2asset.get(file).uuid;
            await fse.symlink(path.dirname(file), alias, 'junction');
            const changed = [];
            db.on('changed', asset => {
                if (asset.uuid === uuid) changed.push(asset.source);
            });

            await db.refresh(path.join(alias, 'file.test'));

            expect(changed).to.deep.equal([path.join(alias, 'file.test')]);
        } finally {
            await db.stop();
            fse.removeSync(root);
        }
    });

    for (const linkText of ['missing/../live', 'missing/../alias']) {
        it(`does not project an untraversable parent link onto live resources: ${linkText}`, async () => {
            const root = path.join(PATH.ROOT, 'untraversable-alias');
            const target = path.join(root, 'assets');
            const file = path.join(target, 'live', 'file.test');
            const alias = path.join(target, 'alias');
            fse.outputFileSync(file, 'contents');
            fse.ensureDirSync(path.join(target, 'missing'));
            fse.ensureDirSync(path.join(root, 'library'));
            const db = new AssetDB({ name: 'untraversable-alias', target,
                library: path.join(root, 'library'), temp: path.join(root, 'temp'), level: 0 });
            try {
                await db.start();
                const uuid = db.path2asset.get(file).uuid;
                await fse.symlink(path.dirname(file), alias, 'dir');
                await db.refresh(path.join(alias, 'file.test'));
                if (linkText.endsWith('live')) {
                    await db.refresh(file);
                }
                await fse.unlink(alias);
                await fse.symlink(linkText, alias, 'dir');
                await fse.remove(path.join(target, 'missing'));
                await db.refresh(path.join(target, 'missing'));

                await db.refresh(linkText.endsWith('live') ? path.join(alias, 'file.test') : file);

                expect(db.getAsset(uuid)).not.to.equal(null);
                expect(fse.readFileSync(file, 'utf8')).to.equal('contents');
                expect(fse.readJSONSync(file + '.meta').uuid).to.equal(uuid);
            } finally {
                await db.stop();
                fse.removeSync(root);
            }
        });
    }

    for (const directory of [false, true]) {
        it(`refreshes the imported kind when a ${directory ? 'directory replaces a file' : 'file replaces a directory'}`, async () => {
            const root = path.join(PATH.ROOT, 'replacement-kind');
            const targetRoot = path.join(root, 'assets');
            const source = path.join(targetRoot, 'source');
            const target = path.join(targetRoot, 'target');
            fse.outputFileSync(directory ? path.join(source, 'new.test') : source, 'new');
            fse.outputFileSync(directory ? target : path.join(target, 'old.test'), 'old');
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
                const sourceUuid = db.path2asset.get(source).uuid;
                const targetAsset = db.path2asset.get(target);
                const targetUuid = targetAsset.uuid;
                expect(targetAsset.isDirectory()).to.equal(!directory);
                const removedKinds = [];
                db.on('deleted', asset => {
                    if (asset.uuid === targetUuid) removedKinds.push(asset.isDirectory());
                });
                imports.length = 0;
                await fse.move(source + '.meta', target + '.meta', { overwrite: true });
                await fse.move(source, target, { overwrite: true });

                await db.refresh(source);
                await db.refresh(target);

                expect(removedKinds).to.deep.equal([!directory]);
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
