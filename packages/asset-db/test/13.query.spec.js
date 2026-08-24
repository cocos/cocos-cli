'use strict';

// 检查 db 提供的一些查询接口

const { expect } = require('chai');

const path = require('path');
const fse = require('fs-extra');
const { v4 } = require('node-uuid');

const { create, queryAsset, queryUUID, queryPath, queryUrl } = require('../dist');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');

class TestImporter extends Importer {
    get name() {
        return 'test';
    }

    async import(asset) {
        asset.createSubAsset('test', 'test-sub'); // 0cc66
    }
}

class TestSubImporter extends Importer {
    get name() {
        return 'test-sub';
    }

    async import(asset) {

    }
}

describe('AssetDB 查询接口', () => {
    const PATH1 = {
        ROOT: path.join(__dirname, './query1'),
        TARGET: path.join(__dirname, './query1/target'),
        LIBRARY: path.join(__dirname, './query1/library'),
        TEMP: path.join(__dirname, './query1/temp'),

        FILE1: path.join(__dirname, './query1/target', './dir/1.test'),
        FILE2: path.join(__dirname, './query1/target', './dir/2@3.test'),

        UUID1: v4(),
        UUID2: v4(),
    };
    const PATH2 = {
        ROOT: path.join(__dirname, './query2'),
        TARGET: path.join(__dirname, './query2/target'),
        LIBRARY: path.join(__dirname, './query2/library'),
        TEMP: path.join(__dirname, './query2/temp'),

        FILE1: path.join(__dirname, './query2/target', './dir/1.test'),

        UUID1: v4(),
    };
    let DB1;
    let DB2;
    const events = [];

    before(async () => {
        fse.ensureDirSync(PATH1.LIBRARY);
        fse.ensureDirSync(PATH2.LIBRARY);
        DB1 = create({
            name: 'test1',
            target: PATH1.TARGET,
            library: PATH1.LIBRARY,
            temp: PATH1.TEMP,
            level: 0,
        });
        DB1.importerManager.add(TestImporter, ['.test']);
        DB1.importerManager.add(TestSubImporter);

        fse.outputJSONSync(PATH1.FILE1, { a: 1, }, { spaces: 2, });
        fse.outputJSONSync(PATH1.FILE1 + '.meta', completionMeta({ uuid: PATH1.UUID1 }), { spaces: 2, });

        fse.outputJSONSync(PATH1.FILE2, { a: 2, }, { spaces: 2, });
        fse.outputJSONSync(PATH1.FILE2 + '.meta', completionMeta({ uuid: PATH1.UUID2 }), { spaces: 2, });
        await DB1.start();

        DB2 = create({
            name: 'test2',
            target: PATH2.TARGET,
            library: PATH2.LIBRARY,
            temp: PATH2.TEMP,
            level: 0,
        });
        DB2.importerManager.add(TestImporter, ['.test']);
        DB2.importerManager.add(TestSubImporter);

        fse.outputJSONSync(PATH2.FILE1, { a: 1, }, { spaces: 2, });
        fse.outputJSONSync(PATH2.FILE1 + '.meta', completionMeta({ uuid: PATH2.UUID1 }), { spaces: 2, });
        await DB2.start();
    });

    after(async () => {
        await DB1.stop();
        await DB2.stop();
        fse.removeSync(PATH1.ROOT);
        fse.removeSync(PATH2.ROOT);
    });

    // ========

    it('通过 url 查询 asset', () => {
        const asset1 = queryAsset('db://test1/dir/1.test');
        expect(asset1.uuid).to.equals(PATH1.UUID1);
        const subAsset1 = queryAsset('db://test1/dir/1.test@0cc66');
        expect(subAsset1.uuid).to.equals(PATH1.UUID1 + '@0cc66');

        const asset2 = queryAsset('db://test2/dir/1.test');
        expect(asset2.uuid).to.equals(PATH2.UUID1);
        const subAsset2 = queryAsset('db://test2/dir/1.test@0cc66');
        expect(subAsset2.uuid).to.equals(PATH2.UUID1 + '@0cc66');

        const asset3 = queryAsset('db://test1/dir/2@3.test');
        expect(asset3.uuid).to.equals(PATH1.UUID2);
        const subAsset3 = queryAsset('db://test1/dir/2@3.test@0cc66');
        expect(subAsset3.uuid).to.equals(PATH1.UUID2 + '@0cc66');
    });

    it('通过 url 查询 uuid', () => {
        const uuid1 = queryUUID('db://test1/dir/1.test');
        expect(uuid1).to.equals(PATH1.UUID1);
        const subUUID1 = queryUUID('db://test1/dir/1.test@0cc66');
        expect(subUUID1).to.equals(PATH1.UUID1 + '@0cc66');

        const uuid2 = queryUUID('db://test2/dir/1.test');
        expect(uuid2).to.equals(PATH2.UUID1);
        const subUUID2 = queryUUID('db://test2/dir/1.test@0cc66');
        expect(subUUID2).to.equals(PATH2.UUID1 + '@0cc66');

        const uuid3 = queryUUID('db://test1/dir/2@3.test');
        expect(uuid3).to.equals(PATH1.UUID2);
        const subUUID3 = queryUUID('db://test1/dir/2@3.test@0cc66');
        expect(subUUID3).to.equals(PATH1.UUID2 + '@0cc66');
    });

    it('通过 url 查询 path', () => {
        const file1 = queryPath('db://test1/dir/1.test');
        expect(file1).to.equals(PATH1.FILE1);
        const subFile1 = queryPath('db://test1/dir/1.test@0cc66');
        expect(subFile1).to.equals(PATH1.FILE1 + '@0cc66');

        const file2 = queryPath('db://test2/dir/1.test');
        expect(file2).to.equals(PATH2.FILE1);
        const subFile2 = queryPath('db://test2/dir/1.test@0cc66');
        expect(subFile2).to.equals(PATH2.FILE1 + '@0cc66');

        const file3 = queryPath('db://test1/dir/2@3.test');
        expect(file3).to.equals(PATH1.FILE2);
        const subFile3 = queryPath('db://test1/dir/2@3.test@0cc66');
        expect(subFile3).to.equals(PATH1.FILE2 + '@0cc66');
    });

    // ========

    it('通过 path 查询 asset', () => {
        const asset1 = queryAsset(PATH1.FILE1);
        expect(asset1.uuid).to.equals(PATH1.UUID1);
        const subAsset1 = queryAsset(PATH1.FILE1 + '@0cc66');
        expect(subAsset1.uuid).to.equals(PATH1.UUID1 + '@0cc66');

        const asset2 = queryAsset(PATH2.FILE1);
        expect(asset2.uuid).to.equals(PATH2.UUID1);
        const subAsset2 = queryAsset(PATH2.FILE1 + '@0cc66');
        expect(subAsset2.uuid).to.equals(PATH2.UUID1 + '@0cc66');

        const asset3 = queryAsset(PATH1.FILE2);
        expect(asset3.uuid).to.equals(PATH1.UUID2);
        const subAsset3 = queryAsset(PATH1.FILE2 + '@0cc66');
        expect(subAsset3.uuid).to.equals(PATH1.UUID2 + '@0cc66');
    });

    it('通过 path 查询 uuid', () => {
        const uuid1 = queryUUID(PATH1.FILE1);
        expect(uuid1).to.equals(PATH1.UUID1);
        const subUUID1 = queryUUID(PATH1.FILE1 + '@0cc66');
        expect(subUUID1).to.equals(PATH1.UUID1 + '@0cc66');

        const uuid2 = queryUUID(PATH2.FILE1);
        expect(uuid2).to.equals(PATH2.UUID1);
        const subUUID2 = queryUUID(PATH2.FILE1 + '@0cc66');
        expect(subUUID2).to.equals(PATH2.UUID1 + '@0cc66');

        const uuid3 = queryUUID(PATH1.FILE2);
        expect(uuid3).to.equals(PATH1.UUID2);
        const subUUID3 = queryUUID(PATH1.FILE2 + '@0cc66');
        expect(subUUID3).to.equals(PATH1.UUID2 + '@0cc66');
    });

    it('通过 path 查询 url', () => {
        const file1 = queryUrl(PATH1.FILE1);
        expect(file1).to.equals('db://test1/dir/1.test');
        const subFile1 = queryUrl(PATH1.FILE1 + '@0cc66');
        expect(subFile1).to.equals('db://test1/dir/1.test' + '@0cc66');

        const file2 = queryUrl(PATH2.FILE1);
        expect(file2).to.equals('db://test2/dir/1.test');
        const subFile2 = queryUrl(PATH2.FILE1 + '@0cc66');
        expect(subFile2).to.equals('db://test2/dir/1.test' + '@0cc66');

        const file3 = queryUrl(PATH1.FILE2);
        expect(file3).to.equals('db://test1/dir/2@3.test');
        const subFile3 = queryUrl(PATH1.FILE2 + '@0cc66');
        expect(subFile3).to.equals('db://test1/dir/2@3.test@0cc66');
    });

    // ========

    it('通过 uuid 查询 asset', () => {
        const asset1 = queryAsset(PATH1.UUID1);
        expect(asset1.uuid).to.equals(PATH1.UUID1);
        const subAsset1 = queryAsset(PATH1.UUID1 + '@0cc66');
        expect(subAsset1.uuid).to.equals(PATH1.UUID1 + '@0cc66');

        const asset2 = queryAsset(PATH2.UUID1);
        expect(asset2.uuid).to.equals(PATH2.UUID1);
        const subAsset2 = queryAsset(PATH2.UUID1 + '@0cc66');
        expect(subAsset2.uuid).to.equals(PATH2.UUID1 + '@0cc66');

        const asset3 = queryAsset(PATH1.UUID2);
        expect(asset3.uuid).to.equals(PATH1.UUID2);
        const subAsset3 = queryAsset(PATH1.UUID2 + '@0cc66');
        expect(subAsset3.uuid).to.equals(PATH1.UUID2 + '@0cc66');
    });

    it('通过 uuid 查询 path', () => {
        const path1 = queryPath(PATH1.UUID1);
        expect(path1).to.equals(PATH1.FILE1);
        const subPath1 = queryPath(PATH1.UUID1 + '@0cc66');
        expect(subPath1).to.equals(PATH1.FILE1 + '@0cc66');

        const path2 = queryPath(PATH2.UUID1);
        expect(path2).to.equals(PATH2.FILE1);
        const subPath2 = queryPath(PATH2.UUID1 + '@0cc66');
        expect(subPath2).to.equals(PATH2.FILE1 + '@0cc66');

        const path3 = queryPath(PATH1.UUID2);
        expect(path3).to.equals(PATH1.FILE2);
        const subPath3 = queryPath(PATH1.UUID2 + '@0cc66');
        expect(subPath3).to.equals(PATH1.FILE2 + '@0cc66');
    });

    it('通过 uuid 查询 url', () => {
        const file1 = queryUrl(PATH1.UUID1);
        expect(file1).to.equals('db://test1/dir/1.test');
        const subFile1 = queryUrl(PATH1.UUID1 + '@0cc66');
        expect(subFile1).to.equals('db://test1/dir/1.test' + '@0cc66');

        const file2 = queryUrl(PATH2.UUID1);
        expect(file2).to.equals('db://test2/dir/1.test');
        const subFile2 = queryUrl(PATH2.UUID1 + '@0cc66');
        expect(subFile2).to.equals('db://test2/dir/1.test' + '@0cc66');

        const file3 = queryUrl(PATH1.UUID2);
        expect(file3).to.equals('db://test1/dir/2@3.test');
        const subFile3 = queryUrl(PATH1.UUID2 + '@0cc66');
        expect(subFile3).to.equals('db://test1/dir/2@3.test@0cc66');
    });
});
