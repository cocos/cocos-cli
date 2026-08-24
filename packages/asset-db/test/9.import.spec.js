'use strict';

const { expect } = require('chai');

const path = require('path');
const fse = require('fs-extra');

const { create } = require('../dist');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');

describe('资源导入以及刷新等', () => {

    const PATH = {
        ROOT: path.join(__dirname, './operation'),
        TARGET: path.join(__dirname, './operation/target'),
        LIBRARY: path.join(__dirname, './operation/library'),
        TEMP: path.join(__dirname, './operation/temp'),

        FILE: path.join(__dirname, './operation/target', '1.test'),
    };

    // 记录导入元素
    let record = [];
    let VERSION = '0.0.1';
    let VERSION_CODE = 0;

    let flag = 0;

    class TestAImporter extends Importer {
        get version() {
            return VERSION;
        }
        get versionCode() {
            return VERSION_CODE;
        }

        get name() {
            return 'test';
        }

        async import(asset) {
            record.push('a');

            if (flag === 1) {
                flag = 0;
                return false;
            } else if (flag === 2) {
                flag = 0;
                throw '模拟错误';
            }

            if (asset.meta.userData.dirty) {
                asset.meta.userData.dirty = false;
            }
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
        fse.outputJSONSync(path.join(PATH.TARGET, '1.test'), { a: 1, }, { spaces: 2, });
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

    it('刷新现有没有更改的资源', async () => {
        record = [];
        await DB.refresh(PATH.FILE);
        expect(record).to.deep.equals([]);
    });

    it('重新导入现有资源', async () => {
        record = [];
        await DB.reimport(PATH.FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('刷新导入报错导致失败的资源，不会重新导入', async () => {
        record = [];
        flag = 2;
        await DB.reimport(PATH.FILE);
        expect(record).to.deep.equals(['a']);
        await DB.refresh(PATH.FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('刷新导入数据主动标记失败的资源，不会重新导入', async () => {
        record = [];
        flag = 1;
        await DB.reimport(PATH.FILE);
        expect(record).to.deep.equals(['a']);
        await DB.refresh(PATH.FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('refresh 被更改的资源', async () => {
        record.length = 0;
        fse.outputJSONSync(path.join(PATH.TARGET, '1.test'), { a: 1, }, { spaces: 2, });
        await DB.refresh(PATH.FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('更改 meta 并重新导入', async () => {
        record.length = 0;
        fse.outputJSONSync(path.join(PATH.TARGET, '1.test'), { a: 1, }, { spaces: 2, });
        fse.outputJSONSync(path.join(PATH.TARGET, '1.test.meta'), completionMeta({
            userData: {
                dirty: true,
            },
        }), { spaces: 2, });
        await DB.reimport(PATH.FILE);
        const json = fse.readJSONSync(path.join(PATH.TARGET, '1.test.meta'));
        expect(record).to.deep.equals(['a']);
        expect(json.userData.dirty).to.deep.equals(false);
    });

    it('重启 db，不导入已经导入过的资源', async () => {
        record.length = 0;
        await DB.stop(PATH.FILE);
        await DB.start(PATH.FILE);
        expect(record).to.deep.equals([]);
    });

    it('重启 db，重新导入被修改过的资源', async () => {
        record.length = 0;
        await DB.stop(PATH.FILE);
        fse.outputJSONSync(path.join(PATH.TARGET, '1.test'), { a: 1, }, { spaces: 2, });
        await DB.start(PATH.FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('重启 db，重新导入 meta 被修改过的资源', async () => {
        record.length = 0;
        await DB.stop(PATH.FILE);
        const meta = fse.readJSONSync(path.join(PATH.TARGET, '1.test.meta'));
        fse.outputJSONSync(path.join(PATH.TARGET, '1.test.meta'), meta, { spaces: 2, });
        await DB.start(PATH.FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('文件扩展名为大写的情况', async () => {
        record.length = 0;
        const FILE = path.join(PATH.TARGET, '2.TEST');
        fse.outputJSONSync(FILE, {}, { spaces: 2, });
        await DB.refresh(FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('文件扩展名大小写混用的情况', async () => {
        record.length = 0;
        const FILE = path.join(PATH.TARGET, '3.TesT');
        fse.outputJSONSync(FILE, {}, { spaces: 2, });
        await DB.refresh(FILE);
        expect(record).to.deep.equals(['a']);
    });

    it('已经导入成功的文件导入器 meta 版本号更新后重新导入', async () => {
        record.length = 0;
        const length = DB.path2asset.size;
        await DB.stop();
        VERSION = '0.0.2';
        await DB.start();
        expect(record.length).to.deep.equals(length);
    });
    it('已经导入成功的文件 VERSION_CODE 更新后重新导入', async () => {
        record.length = 0;
        const length = DB.path2asset.size;
        await DB.stop();
        VERSION_CODE = 2;
        await DB.start();
        expect(record.length).to.deep.equals(length);
    });

    it('UUID 冲突的情况下，分配新的 id', async () => {
        record.length = 0;
        // 2.TEST already exists above and is the same Windows filesystem path as 2.test.
        const file = path.join(__dirname, './operation/target', '4.test');
        fse.copyFileSync(PATH.FILE, file);
        fse.copyFileSync(PATH.FILE + '.meta', file + '.meta');
        await DB.refresh(file);
        expect(record.length).to.deep.equals(1);
    });
});
