'use strict';

const { expect } = require('chai');

const path = require('path');
const fse = require('fs-extra');

const { create } = require('../dist');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');

describe('资源迁移', () => {

    const PATH = {
        ROOT: path.join(__dirname, './operation'),
        TARGET: path.join(__dirname, './operation/target'),
        LIBRARY: path.join(__dirname, './operation/library'),
        TEMP: path.join(__dirname, './operation/temp'),

        FILE: path.join(__dirname, './operation/target', '1.test'),
    };

    class TestAImporter extends Importer {

        get version() {
            return '3.3.3.3';
        }

        get migrations() {
            return [
                {
                    version: '0.0.0.3',
                    migrate(asset) {
                        const swap = asset.getSwapSpace();
                        swap.json.a = true;
                    },
                },
                {
                    version: '0.0.3.3',
                    migrate(asset) {
                        const swap = asset.getSwapSpace();
                        swap.json.b = true;
                    },
                },
                {
                    version: '0.3.3.3',
                    migrate(asset) {
                        const swap = asset.getSwapSpace();
                        swap.json.c = true;
                    },
                },
                {
                    version: '3.3.3.3',
                    migrate(asset) {
                        const swap = asset.getSwapSpace();
                        swap.json.d = true;
                    },
                },
            ];
        }

        get migrationHook() {
            return {
                async pre(asset) {
                    const swap = asset.getSwapSpace();
                    swap.json = await fse.readJSON(asset.source);
                },
                async post(asset, num) {
                    const swap = asset.getSwapSpace();
                    swap.json.migrateNum = num;
                    await fse.writeJSON(asset.source, swap.json, {
                        spaces: 2,
                    });
                    delete swap.json;
                },
            };
        }

        get name() {
            return 'test';
        }
    }

    let DB;

    before(async () => {
        fse.ensureDirSync(PATH.LIBRARY);
        DB = create({
            name: 'test1',
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
        await new Promise((resolve) => {
            setTimeout(resolve, 600);
        });

        // 清空测试数据
        fse.removeSync(PATH.ROOT);
    });

    it('不需要迁移', async () => {
        const FILE = path.join(PATH.FILE, '0.test');
        fse.outputJSONSync(FILE, {}, { spaces: 2, });
        fse.outputJSONSync(FILE + '.meta', completionMeta({
            ver: '3.3.3.3',
            importer: 'test',
        }), { spaces: 2, });
        await DB.refresh(FILE);

        const json = fse.readJSONSync(FILE);

        expect(json.a).to.equal(undefined);
        expect(json.b).to.equal(undefined);
        expect(json.c).to.equal(undefined);
        expect(json.d).to.equal(undefined);
        expect(json.migrateNum).to.deep.equal(undefined);
    });

    it('需要迁移 1 次', async () => {
        const FILE = path.join(PATH.FILE, '1.test');
        fse.outputJSONSync(FILE, {}, { spaces: 2, });
        fse.outputJSONSync(FILE + '.meta', completionMeta({
            ver: '0.3.3.3',
            importer: 'test',
        }), { spaces: 2, });
        await DB.refresh(FILE);

        const json = fse.readJSONSync(FILE);

        expect(json.a).to.equal(undefined);
        expect(json.b).to.equal(undefined);
        expect(json.c).to.equal(undefined);
        expect(json.d).to.equal(true);
        expect(json.migrateNum).to.deep.equal(1);
    });

    it('需要迁移 2 次', async () => {
        const FILE = path.join(PATH.FILE, '2.test');
        fse.outputJSONSync(FILE, {}, { spaces: 2, });
        fse.outputJSONSync(FILE + '.meta', completionMeta({
            ver: '0.0.3.3',
            importer: 'test',
        }), { spaces: 2, });
        await DB.refresh(FILE);

        const json = fse.readJSONSync(FILE);

        expect(json.a).to.equal(undefined);
        expect(json.b).to.equal(undefined);
        expect(json.c).to.equal(true);
        expect(json.d).to.equal(true);
        expect(json.migrateNum).to.deep.equal(2);
    });

    it('需要迁移 3 次', async () => {
        const FILE = path.join(PATH.FILE, '3.test');
        fse.outputJSONSync(FILE, {}, { spaces: 2, });
        fse.outputJSONSync(FILE + '.meta', completionMeta({
            ver: '0.0.0.3',
            importer: 'test',
        }), { spaces: 2, });
        await DB.refresh(FILE);

        const json = fse.readJSONSync(FILE);

        expect(json.a).to.equal(undefined);
        expect(json.b).to.equal(true);
        expect(json.c).to.equal(true);
        expect(json.d).to.equal(true);
        expect(json.migrateNum).to.deep.equal(3);
    });

    it('需要迁移 4 次', async () => {
        const FILE = path.join(PATH.FILE, '4.test');
        fse.outputJSONSync(FILE, {}, { spaces: 2, });
        fse.outputJSONSync(FILE + '.meta', completionMeta({
            ver: '0.0.0.2',
            importer: 'test',
        }), { spaces: 2, });
        await DB.refresh(FILE);

        const json = fse.readJSONSync(FILE);

        expect(json.a).to.equal(true);
        expect(json.b).to.equal(true);
        expect(json.c).to.equal(true);
        expect(json.d).to.equal(true);
        expect(json.migrateNum).to.deep.equal(4);
    });

});
