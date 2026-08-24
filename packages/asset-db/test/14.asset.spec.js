'use strict';

// asset 的一些测试

const { expect } = require('chai');

const path = require('path');
const fse = require('fs-extra');
const { v4 } = require('node-uuid');

const { create, queryAsset, queryUUID, queryPath, queryUrl } = require('../dist');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');
const { getAssociatedFiles } = require('../dist/libs/dependency');

class TestImporter extends Importer {
    get name() {
        return 'test';
    }

    async import(asset) {
        await asset.saveToLibrary('.js.map', 'js.map');
        await asset.saveToLibrary('.js', 'js');
        await asset.saveToLibrary('.map', 'map');
    }
}

class TestBImporter extends Importer {
    get name() {
        return 'test-b';
    }

    async import(asset) {
        await asset.saveToLibrary('a.js.map', 'js.map');
        await asset.saveToLibrary('a.js', 'js');
        await asset.saveToLibrary('a.map', 'map');
    }
}

class TestCImporter extends Importer {
    get name() {
        return 'test-c';
    }

    async import(asset) {
        await asset.saveToLibrary('.js-map', 'js-map');
        await asset.saveToLibrary('a.js-map', 'js-map');
    }
}

describe('AssetDB 查询接口', () => {
    const PATH1 = {
        ROOT: path.join(__dirname, './query1'),
        TARGET: path.join(__dirname, './query1/target'),
        LIBRARY: path.join(__dirname, './query1/library'),
        TEMP: path.join(__dirname, './query1/temp'),

        FILE1: path.join(__dirname, './query1/target', './dir/1.test'),
        FILE2: path.join(__dirname, './query1/target', './dir/2.test-b'),
        FILE3: path.join(__dirname, './query1/target', './dir/3.test-c'),

        UUID1: v4(),
        UUID2: v4(),
        UUID3: v4(),
    };
    let DB1;

    before(async () => {
        fse.ensureDirSync(PATH1.LIBRARY);
        DB1 = create({
            name: 'test1',
            target: PATH1.TARGET,
            library: PATH1.LIBRARY,
            temp: PATH1.TEMP,
            level: 0,
        });
        DB1.importerManager.add(TestImporter, ['.test']);
        DB1.importerManager.add(TestBImporter, ['.test-b']);
        DB1.importerManager.add(TestCImporter, ['.test-c']);

        fse.outputJSONSync(PATH1.FILE1, { a: 1, }, { spaces: 2, });
        fse.outputJSONSync(PATH1.FILE1 + '.meta', completionMeta({ uuid: PATH1.UUID1 }), { spaces: 2, });

        fse.outputJSONSync(PATH1.FILE2, { a: 1, }, { spaces: 2, });
        fse.outputJSONSync(PATH1.FILE2 + '.meta', completionMeta({ uuid: PATH1.UUID2 }), { spaces: 2, });

        fse.outputJSONSync(PATH1.FILE3, { a: 1, }, { spaces: 2, });
        fse.outputJSONSync(PATH1.FILE3 + '.meta', completionMeta({ uuid: PATH1.UUID3 }), { spaces: 2, });

        await DB1.start();
    });

    after(async () => {
        await DB1.stop();
        fse.removeSync(PATH1.ROOT);
    });

    it('saveToLibrary - 扩展名', () => {
        const lfile = path.join(PATH1.LIBRARY, PATH1.UUID1.substr(0, 2), PATH1.UUID1);
        expect(fse.existsSync(lfile + '.js')).to.equals(true);
        expect(fse.existsSync(lfile + '.map')).to.equals(true);
        expect(fse.existsSync(lfile + '.js.map')).to.equals(true);

        const asset = queryAsset(PATH1.UUID1);
        expect(asset.meta.files.indexOf('.js')).to.not.equals(-1);
        expect(asset.meta.files.indexOf('.map')).to.not.equals(-1);
        expect(asset.meta.files.indexOf('.js.map')).to.not.equals(-1);
    });

    it('saveToLibrary - 文件名', () => {
        const lfile = path.join(PATH1.LIBRARY, PATH1.UUID2.substr(0, 2), PATH1.UUID2);
        expect(fse.existsSync(lfile + '/a.js')).to.equals(true);
        expect(fse.existsSync(lfile + '/a.map')).to.equals(true);
        expect(fse.existsSync(lfile + '/a.js.map')).to.equals(true);

        const asset = queryAsset(PATH1.UUID2);
        expect(asset.meta.files.indexOf('a.js')).to.not.equals(-1);
        expect(asset.meta.files.indexOf('a.map')).to.not.equals(-1);
        expect(asset.meta.files.indexOf('a.js.map')).to.not.equals(-1);
    });

    it('saveToLibrary - 特殊符号', () => {
        const lfile = path.join(PATH1.LIBRARY, PATH1.UUID3.substr(0, 2), PATH1.UUID3);
        expect(fse.existsSync(lfile + '.js-map')).to.equals(true);

        const asset = queryAsset(PATH1.UUID3);
        expect(asset.meta.files.indexOf('.js-map')).to.not.equals(-1);
    });
});
