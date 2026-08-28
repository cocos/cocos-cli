'use strict';

const { expect } = require('chai');

const fse = require('fs-extra');
const path = require('path');

const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');
const { create } = require('../dist')

describe('数据库资源依赖关系', () => {

    const PATH1 = {
        ROOT: path.join(__dirname, './asset-db-1'),
        TARGET: path.join(__dirname, './asset-db-1/target'),
        LIBRARY: path.join(__dirname, './asset-db-1/library'),
        TEMP: path.join(__dirname, './asset-db-1/temp'),
    };

    const PATH2 = {
        ROOT: path.join(__dirname, './asset-db-2'),
        TARGET: path.join(__dirname, './asset-db-2/target'),
        LIBRARY: path.join(__dirname, './asset-db-2/library'),
        TEMP: path.join(__dirname, './asset-db-2/temp'),
    };

    const UUID = 'a4f93b38-e32f-43fc-8a56-6fc5964f6eae';

    describe('基础依赖测试', async function() {
        // 记录导入元素
        const record = [];

        class TestAImporter extends Importer {
            get name() {
                return 'test-a';
            }

            async import(asset) {
                asset.depend(UUID);
                asset.depend(asset.source + '.depend');
                asset.depend('db://test1/url.depend');
                asset.depend('db://test2/url.depend');
                record.push('a');
            }
        }

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
            DB1.importerManager.add(TestAImporter, ['.test1']);
            fse.outputJSONSync(path.join(PATH1.TARGET, '1.test1'), { a: 1, }, { spaces: 2, });
            await DB1.start();
        });

        after(async () => {
            await DB1.stop();
            await new Promise((resolve) => {
                setTimeout(resolve, 600);
            });

            // 清空测试数据
            fse.removeSync(PATH1.ROOT);
            fse.removeSync(PATH2.ROOT);
        });

        it('依赖 uuid', async () => {
            expect(record).to.deep.equals(['a']);

            fse.outputJSONSync(path.join(PATH1.TARGET, '1.a'), { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(path.join(PATH1.TARGET, '1.a.meta'), completionMeta({ uuid: UUID }), { spaces: 2, });
            await DB1.refresh(path.join(PATH1.TARGET, '1.a'));
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            expect(record).to.deep.equals(['a', 'a']);
        });

        it('依赖绝对路径', async () => {
            fse.outputJSONSync(path.join(PATH1.TARGET, '1.test1.depend'), { a: 1, }, { spaces: 2, });
            await DB1.refresh(path.join(PATH1.TARGET, '1.test1.depend'));

            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            expect(record).to.deep.equals(['a', 'a', 'a']);
        });

        it('依赖 URL', async () => {
            fse.outputJSONSync(path.join(PATH1.TARGET, 'url.depend'), { a: 1, }, { spaces: 2, });
            await DB1.refresh(path.join(PATH1.TARGET, 'url.depend'));

            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            expect(record).to.deep.equals(['a', 'a', 'a', 'a']);
        });

        it('重启 database', async () => {
            record.splice(0, record.length);

            await DB1.stop();
            await DB1.start();

            // 第二次启动因为之前导入成功，所以不会进入 importer 流程
            expect(record).to.deep.equals([]);

            fse.outputJSONSync(path.join(PATH1.TARGET, '1.a'), { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(path.join(PATH1.TARGET, '1.a.meta'), completionMeta({ uuid: UUID }), { spaces: 2, });
            await DB1.refresh(path.join(PATH1.TARGET, '1.a'));
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            // reimport 触发依赖项目重新导入
            expect(record).to.deep.equals(['a']);

            fse.outputJSONSync(path.join(PATH1.TARGET, '1.test1.depend'), { a: 1, }, { spaces: 2, });
            await DB1.refresh(path.join(PATH1.TARGET, '1.test1.depend'));
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            // reimport 触发依赖项目重新导入
            expect(record).to.deep.equals(['a', 'a']);
        });

    });

    describe('跨数据库的资源依赖', () => {
        // 记录导入元素
        const record = [];

        class TestAImporter extends Importer {
            get name() {
                return 'test-a';
            }

            async import(asset) {
                asset.depend('db://test2/url.depend');
                asset.depend(path.join(PATH2.TARGET, 'path.depend'));
                asset.depend(UUID);
                asset.depend(path.join(asset.source + '.depend'));
                record.push('a');
            }
        }

        let DB1;
        let DB2;

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
            DB2 = create({
                name: 'test2',
                target: PATH2.TARGET,
                library: PATH2.LIBRARY,
                temp: PATH2.TEMP,
                level: 0,
            });
            DB1.importerManager.add(TestAImporter, ['.test1']);
            DB2.importerManager.add(TestAImporter, ['.test1']);

            fse.outputJSONSync(path.join(PATH1.TARGET, '1.test1'), { a: 1, }, { spaces: 2, });

            await DB1.start();
            await DB2.start();
        });

        after(async () => {
            await DB1.stop();
            await DB2.stop();
            await new Promise((resolve) => {
                setTimeout(resolve, 600);
            });

            // 清空测试数据
            fse.removeSync(PATH1.ROOT);
            fse.removeSync(PATH2.ROOT);
        });

        it('依赖 uuid', async () => {
            expect(record).to.deep.equals(['a']);

            fse.outputJSONSync(path.join(PATH2.TARGET, '1.a'), { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(path.join(PATH2.TARGET, '1.a.meta'), completionMeta({ uuid: UUID }), { spaces: 2, });
            await DB2.refresh(path.join(PATH2.TARGET, '1.a'));
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            expect(record).to.deep.equals(['a', 'a']);
        });

        it('依赖绝对路径', async () => {
            fse.outputJSONSync(path.join(PATH2.TARGET, 'path.depend'), { a: 1, }, { spaces: 2, });
            await DB2.refresh(path.join(PATH2.TARGET, 'path.depend'));

            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            expect(record).to.deep.equals(['a', 'a', 'a']);
        });

        it('重启 database', async () => {
            record.splice(0, record.length);

            await DB1.stop();
            await DB1.start();
            DB2;

            // 第二次启动因为之前导入成功，所以不会进入 importer 流程
            expect(record).to.deep.equals([]);

            // 检查 uuid 依赖，和 DB2 冲突，这个资源的 uuid 需要被替换
            fse.outputJSONSync(path.join(PATH1.TARGET, '1.a'), { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(path.join(PATH1.TARGET, '1.a.meta'), completionMeta({ uuid: UUID }), { spaces: 2, });

            await DB1.refresh(path.join(PATH1.TARGET, '1.a'));
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            const asset = DB1.path2asset.get(path.join(PATH1.TARGET, '1.a'));
            expect(asset && asset.uuid).to.not.equals(UUID);
            // 资源 uuid 被替换，所以没有重新导入
            expect(record).to.deep.equals([]);

            // 检查 path 依赖
            fse.outputJSONSync(path.join(PATH1.TARGET, '1.test1.depend'), { a: 1, }, { spaces: 2, });
            await DB1.refresh(path.join(PATH1.TARGET, '1.test1.depend'));
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
            // reimport 触发依赖项目重新导入
            expect(record).to.deep.equals(['a']);
        });
    });
});
