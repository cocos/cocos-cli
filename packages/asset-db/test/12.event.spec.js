'use strict';

const { expect } = require('chai');

const path = require('path');
const fse = require('fs-extra');
const { v4 } = require('node-uuid');

const { create } = require('../dist');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');

// 事件管理器

class TestImporter extends Importer {
    get name() {
        return 'test';
    }

    async import(asset) {
        asset.createSubAsset('test', 'test-sub');
    }
}

class TestSubImporter extends Importer {
    get name() {
        return 'test-sub';
    }

    async import(asset) {

    }
}

describe('AssetDB 事件系统', () => {
    const PATH = {
        ROOT: path.join(__dirname, './event'),
        TARGET: path.join(__dirname, './event/target'),
        LIBRARY: path.join(__dirname, './event/library'),
        TEMP: path.join(__dirname, './event/temp'),

        FILE1: path.join(__dirname, './event/target', '1.test'),
        FILE2: path.join(__dirname, './event/target', '2.test'),
    };

    describe('新增带有子资源的 asset', () => {
        let DB;
        const events = [];

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = create({
                name: 'test1',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestImporter, ['.test']);
            DB.importerManager.add(TestSubImporter);

            DB.on('added', (asset) => {
                events.push({
                    type: 'add',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('changed', (asset) => {
                events.push({
                    type: 'change',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('deleted', (asset) => {
                events.push({
                    type: 'delete',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });

            await DB.start();

            fse.outputJSONSync(PATH.FILE1, { a: 1, }, { spaces: 2, });
            await DB.refresh(PATH.TARGET);
        });

        after(async () => {
            await DB.stop();
            fse.removeSync(PATH.ROOT);
        });

        it('消息数量', () => {
            expect(events.length).to.equals(2);
        });

        it('消息种类', () => {
            expect(events[0].type).to.equals('add');
            expect(events[1].type).to.equals('add');
        });

        it('消息顺序', () => {
            // subAsset 先发完成的消息
            expect(events[0].uuid.indexOf('@')).to.not.equals(-1);
            // 然后才是 Asset 完成导入
            expect(events[1].uuid.indexOf('@')).to.equals(-1);
        });

        it('消息时机', () => {
            expect(events[0].importer).to.equals('test-sub');
            expect(events[1].importer).to.equals('test');
        });
    });

    describe('修改 asset', () => {
        let DB;
        const events = [];

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = create({
                name: 'test1',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestImporter, ['.test']);
            DB.importerManager.add(TestSubImporter);
            await DB.start();

            fse.outputJSONSync(PATH.FILE1, { a: 1, }, { spaces: 2, });
            await DB.refresh(PATH.TARGET);

            DB.on('added', (asset) => {
                events.push({
                    type: 'add',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('changed', (asset) => {
                events.push({
                    type: 'change',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('deleted', (asset) => {
                events.push({
                    type: 'delete',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });

            const previousMtimeMs = fse.statSync(PATH.FILE1).mtimeMs;
            fse.outputJSONSync(PATH.FILE1, { a: 2, }, { spaces: 2, });
            // Windows CI may preserve the same mtime for two rapid writes.
            fse.utimesSync(PATH.FILE1, new Date(), new Date(previousMtimeMs + 5000));
            await DB.refresh(PATH.TARGET);
        });

        after(async () => {
            await DB.stop();
            fse.removeSync(PATH.ROOT);
        });

        it('消息数量', () => {
            expect(events.length).to.equals(2);
        });

        it('消息种类', () => {
            expect(events[0].type).to.equals('change');
            expect(events[1].type).to.equals('change');
        });

        it('消息顺序', () => {
            // subAsset 先发完成的消息
            expect(events[0].uuid.indexOf('@')).to.not.equals(-1);
            // 然后才是 Asset 完成导入
            expect(events[1].uuid.indexOf('@')).to.equals(-1);
        });

        it('消息时机', () => {
            expect(events[0].importer).to.equals('test-sub');
            expect(events[1].importer).to.equals('test');
        });
    });

    describe('删除 asset', () => {
        let DB;
        const events = [];

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = create({
                name: 'test1',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestImporter, ['.test']);
            DB.importerManager.add(TestSubImporter);
            await DB.start();

            fse.outputJSONSync(PATH.FILE1, { a: 1, }, { spaces: 2, });
            await DB.refresh(PATH.TARGET);

            DB.on('added', (asset) => {
                events.push({
                    type: 'add',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('changed', (asset) => {
                events.push({
                    type: 'change',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('deleted', (asset) => {
                events.push({
                    type: 'delete',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });

            fse.removeSync(PATH.FILE1);
            await DB.refresh(PATH.TARGET);
        });

        after(async () => {
            await DB.stop();
            fse.removeSync(PATH.ROOT);
        });

        it('消息数量', () => {
            expect(events.length).to.equals(2);
        });

        it('消息种类', () => {
            expect(events[0].type).to.equals('delete');
            expect(events[1].type).to.equals('delete');
        });

        it('消息顺序', () => {
            // subAsset 先发完成的消息
            expect(events[0].uuid.indexOf('@')).to.not.equals(-1);
            // 然后才是 Asset 完成导入
            expect(events[1].uuid.indexOf('@')).to.equals(-1);
        });

        it('消息时机', () => {
            expect(events[0].importer).to.equals('test-sub');
            expect(events[1].importer).to.equals('test');
        });
    });

    describe('Reimport Asset', () => {
        let DB;
        const events = [];

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = create({
                name: 'test1',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestImporter, ['.test']);
            DB.importerManager.add(TestSubImporter);
            await DB.start();

            fse.outputJSONSync(PATH.FILE1, { a: 1, }, { spaces: 2, });
            await DB.refresh(PATH.TARGET);

            DB.on('added', (asset) => {
                events.push({
                    type: 'add',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('changed', (asset) => {
                events.push({
                    type: 'change',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('deleted', (asset) => {
                events.push({
                    type: 'delete',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });

            await DB.reimport(PATH.FILE1);
        });

        after(async () => {
            await DB.stop();
            fse.removeSync(PATH.ROOT);
        });

        it('消息数量', () => {
            expect(events.length).to.equals(2);
        });

        it('消息种类', () => {
            expect(events[0].type).to.equals('change');
            expect(events[1].type).to.equals('change');
        });

        it('消息顺序', () => {
            // subAsset 先发完成的消息
            expect(events[0].uuid.indexOf('@')).to.not.equals(-1);
            // 然后才是 Asset 完成导入
            expect(events[1].uuid.indexOf('@')).to.equals(-1);
        });

        it('消息时机', () => {
            expect(events[0].importer).to.equals('test-sub');
            expect(events[1].importer).to.equals('test');
        });
    });

    describe('Reimport SubAsset', () => {
        let DB;
        const events = [];

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = create({
                name: 'test1',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestImporter, ['.test']);
            DB.importerManager.add(TestSubImporter);
            await DB.start();

            fse.outputJSONSync(PATH.FILE1, { a: 1, }, { spaces: 2, });
            await DB.refresh(PATH.TARGET);

            DB.on('added', (asset) => {
                events.push({
                    type: 'add',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('changed', (asset) => {
                events.push({
                    type: 'change',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('deleted', (asset) => {
                events.push({
                    type: 'delete',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });

            const json = fse.readJSONSync(PATH.FILE1 + '.meta');
            await DB.reimport(json.uuid + '@0cc66');
        });

        after(async () => {
            await DB.stop();
            fse.removeSync(PATH.ROOT);
        });

        it('消息数量', () => {
            expect(events.length).to.equals(1);
        });

        it('消息种类', () => {
            expect(events[0].type).to.equals('change');
        });

        it('消息顺序', () => {
            expect(events[0].uuid.indexOf('@')).to.not.equals(-1);
        });

        it('消息时机', () => {
            expect(events[0].importer).to.equals('test-sub');
        });
    });

    describe('Refresh 一个新资源', () => {
        let DB;
        const events = [];

        before(async () => {
            fse.ensureDirSync(PATH.LIBRARY);
            DB = create({
                name: 'test1',
                target: PATH.TARGET,
                library: PATH.LIBRARY,
                temp: PATH.TEMP,
                level: 0,
            });
            DB.importerManager.add(TestImporter, ['.test']);
            DB.importerManager.add(TestSubImporter);
            await DB.start();

            DB.on('added', (asset) => {
                events.push({
                    type: 'add',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('changed', (asset) => {
                events.push({
                    type: 'change',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });
            DB.on('deleted', (asset) => {
                events.push({
                    type: 'delete',
                    uuid: asset.uuid,
                    importer: asset.meta.importer,
                });
            });

            fse.outputJSONSync(PATH.FILE1, { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(PATH.FILE1 + '.meta', completionMeta({ importer: 'abc', imported: true, }), { spaces: 2, });
            await DB.refresh(PATH.FILE1);
        });

        after(async () => {
            await DB.stop();
            fse.removeSync(PATH.ROOT);
        });

        it('消息数量', () => {
            expect(events.length).to.equals(2);
        });

        it('消息种类', () => {
            expect(events[0].type).to.equals('add');
        });

        it('消息顺序', () => {
            expect(events[0].uuid.indexOf('@')).to.not.equals(-1);
        });

        it('消息时机', () => {
            expect(events[0].importer).to.equals('test-sub');
        });
    });
});
