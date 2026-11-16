'use strict';

const { expect } = require('chai');

const fse = require('fs-extra');
const { tmpdir } = require('os');
const path = require('path');

const { AssetDB } = require('../dist/libs/asset-db');
const { Importer } = require('../dist/libs/importer');
const { completionMeta } = require('../dist/libs/meta');
const { VirtualAsset } = require('../dist/libs/asset');
const { nameToId } = require('../dist/libs/utils');

describe('AssetDB', () => {

    describe('prebuilt read-only snapshot', () => {
        let root;
        let runtimeDB;
        let options;
        let snapshot;
        let uuid;

        before(async () => {
            root = await fse.mkdtemp(path.join(tmpdir(), 'asset-db-snapshot-'));
            options = {
                name: 'snapshot',
                target: path.join(root, 'source'),
                library: path.join(root, 'library'),
                temp: path.join(root, 'temp'),
                readonly: true,
                level: 0,
            };
            const buildDB = new AssetDB(options);
            try {
                await fse.outputFile(path.join(options.target, 'dir/file.txt'), 'prebuilt');
                await buildDB.start();
                uuid = buildDB.pathToUuid(path.join(options.target, 'dir/file.txt'));
                buildDB.getAsset(uuid).setData('test', 42);
                await buildDB.saveSnapshot();
                snapshot = await fse.readFile(buildDB.cachePath, 'utf8');
            } finally {
                await buildDB.stop();
            }
            // Keep the artifact and deliberately point the runtime at a different, missing root.
            options.target = path.join(root, 'relocated');
        });

        afterEach(async () => {
            await runtimeDB?.stop();
            runtimeDB = undefined;
        });

        after(async () => {
            if (root) await fse.remove(root);
        });

        it('restores usable assets without scanning or rewriting the source or snapshot', async () => {
            runtimeDB = new AssetDB(options);
            await runtimeDB.startFromSnapshot();
            const asset = runtimeDB.getAsset(uuid);
            await asset.waitInit();
            expect(asset.source).to.equal(path.join(options.target, 'dir/file.txt'));
            expect(asset.url).to.equal('db://snapshot/dir/file.txt');
            expect(asset.imported).to.equal(true);
            expect(asset.getData('test')).to.equal(42);
            expect(await fse.readFile(asset.library + '.txt', 'utf8')).to.equal('prebuilt');
            expect(await runtimeDB.refresh(options.target)).to.equal(0);
            expect(await runtimeDB.reimport(uuid)).to.equal(asset);
            const dataPath = path.join(options.library, '.snapshot-data.json');
            const data = await fse.readFile(dataPath, 'utf8');
            asset.setData('runtimeMemo', true);
            expect(asset.getData('runtimeMemo')).to.equal(true);
            runtimeDB.dataManager.saveImmediate();
            expect(await fse.readFile(dataPath, 'utf8')).to.equal(data);
            await runtimeDB.save();
            await runtimeDB.stop();
            runtimeDB = undefined;
            expect(await fse.pathExists(options.target)).to.equal(false);
            expect(await fse.readFile(path.join(options.library, '.snapshot'), 'utf8')).to.equal(snapshot);
        });

        it('rejects a missing or invalid artifact without scanning source', async () => {
            runtimeDB = new AssetDB({ ...options, library: path.join(root, 'missing') });
            await runtimeDB.startFromSnapshot().then(
                () => { throw new Error('Missing snapshot was accepted'); },
                error => expect(error.code).to.equal('ENOENT'),
            );
            await runtimeDB.stop();

            runtimeDB = new AssetDB(options);
            await fse.writeJSON(runtimeDB.cachePath, { ...JSON.parse(snapshot), version: 'invalid' });
            try {
                await runtimeDB.startFromSnapshot().then(
                    () => { throw new Error('Invalid snapshot was accepted'); },
                    error => expect(error.message).to.include('Invalid prebuilt Asset DB index'),
                );
            } finally {
                await fse.writeFile(runtimeDB.cachePath, snapshot);
            }
        });
    });

    const PATH = {
        ROOT: path.join(__dirname, './asset-db'),
        TARGET: path.join(__dirname, './asset-db/target'),
        LIBRARY: path.join(__dirname, './asset-db/library'),
        TEMP: path.join(__dirname, './asset-db/temp'),
    };

    describe('数据库基础功能', async function() {

        class TestAImporter extends Importer {
            get name() {
                return 'test-a';
            }

            get version() {
                return '0.0.3';
            }

            get migrations() {
                return [
                    {
                        version:  '0.0.2',
                        async migrate(asset) {
                            if (fse.existsSync(asset.source)) {
                                const json = await fse.readJSON(asset.source);
                                json.migration1 = true;
                                await fse.outputJSON(asset.source, json, { spaces: 2 });
                            }
                            asset.meta.userData.migration1 = Date.now();
                        },
                    }, {
                        version: '0.0.3',
                        async migrate(asset) {
                            if (fse.existsSync(asset.source)) {
                                const json = await fse.readJSON(asset.source);
                                json.migration2 = true;
                                await fse.outputJSON(asset.source, json, { spaces: 2 });
                            }
                            asset.meta.userData.migration2 = Date.now();
                        },
                    },
                ];
            }

            get migrationHook() {
                return {
                    async pre(asset) {
                        if (fse.existsSync(asset.source)) {
                            const json = await fse.readJSON(asset.source);
                            json.migrationHookPre = true;
                            await fse.outputJSON(asset.source, json, { spaces: 2 });
                        }
                    },
                    async post(asset) {
                        if (fse.existsSync(asset.source)) {
                            const json = await fse.readJSON(asset.source);
                            json.migrationHookPost = true;
                            await fse.outputJSON(asset.source, json, { spaces: 2 });
                        }
                    },
                };
            }

            async validate(asset) {
                if (asset instanceof VirtualAsset) {
                    return true;
                }
                const name = path.basename(asset.source, '.test');
                return name === '1';
            }

            async force(asset) {}

            async import(asset) {
                asset.depend('db://test/123.json');
                await asset.saveToLibrary('.save', '');
                // deleteFromLibrary('.save')
                // existsInLibrary('.save')
            }
        }

        class TestBImporter extends TestAImporter {
            get name() {
                return 'test-b';
            }

            async validate(asset) {
                const name = path.basename(asset.source, '.test');
                return name !== '1';
            }

            async force(asset) {}

            async import(asset) {
                super.import(asset);
                await asset.copyToLibrary('.copy', asset.source);
                await asset.createSubAsset('name', 'test-a', { displayName: 'displayName' });
            }
        }
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

            // 注册 importer
            DB.importerManager.add(TestAImporter, ['.test']);
            DB.importerManager.add(TestBImporter, ['.test']);
        });

        after(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 600);
            });

            // 清空测试数据
            fse.removeSync(PATH.ROOT);
        });

        it('启动并刷新内容', async () => {
            // 数据内容为空
            expect(DB.path2asset.size).to.equal(0);
            // 模拟数据
            fse.outputJSONSync(path.join(PATH.TARGET, '1.json'), { a: 1, }, { spaces: 2, });
            // 记录 uuid 准备就绪后的资源状态，这时候需要能够查询到对应的资源
            let size = 0;
            DB.once('refresh-uuid-ready', () => {
                size = DB.path2asset.size;
            });
            // 启动刷新数据库
            const num = await DB.start();
            expect(num).to.equal(1);
            // 检查刷新后的数据是否存在
            expect(DB.path2asset.size).to.equal(1);
            expect(size).to.equal(1);
        });

        it('导入新资源', async () => {
            const file = path.join(PATH.TARGET, '2.json');
            // 上一步内容已经生成
            expect(DB.path2asset.size).to.equal(1);
            // 模拟数据
            fse.outputJSONSync(file, { a: 1, }, { spaces: 2, });
            // 导入新数据
            await DB.refresh(file);
            // 检查刷新后的数据是否存在
            expect(DB.path2asset.size).to.equal(2);
        });

        it('自定义 Importer', async () => {
            const file1 = path.join(PATH.TARGET, '1.test');

            // 模拟数据
            fse.outputJSONSync(file1, { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(file1 + '.meta', completionMeta({}), { spaces: 2, });

            // file1 使用 test-a 导入，不走迁移流程
            await DB.refresh(file1);
            const json1 = fse.readJSONSync(file1);
            const meta1 = fse.readJSONSync(file1 + '.meta');
            expect(json1.a).to.equal(1);
            expect(json1.migration1).to.equal(undefined);
            expect(json1.migration2).to.equal(undefined);
            expect(json1.migrationHookPre).to.equal(undefined);
            expect(json1.migrationHookPost).to.equal(undefined);
            expect(meta1.ver).to.equal('0.0.3');
            expect(meta1.importer).to.equal('test-a');

            // test-a 会生成一个 .save 文件
            const lFile = path.join(PATH.LIBRARY, meta1.uuid.substr(0, 2), meta1.uuid + '.save');
            expect(fse.existsSync(lFile)).to.equal(true);
        });

        it('导入器 validate 功能', async () => {
            const file2 = path.join(PATH.TARGET, '2.test');

            // 模拟数据
            fse.outputJSONSync(file2, { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(file2 + '.meta', completionMeta({}), { spaces: 2, });

            // file2 使用 test-b 导入，不走迁移流程
            await DB.refresh(file2);
            const json2 = fse.readJSONSync(file2);
            const meta2 = fse.readJSONSync(file2 + '.meta');
            expect(json2.a).to.equal(1);
            expect(json2.migration1).to.equal(undefined);
            expect(json2.migration2).to.equal(undefined);
            expect(json2.migrationHookPre).to.equal(undefined);
            expect(json2.migrationHookPost).to.equal(undefined);
            expect(meta2.ver).to.equal('0.0.3');
            expect(meta2.importer).to.equal('test-b');

            // test-b 会生成一个 .copy 文件以及一个 test-a 类型的 subAsset
            const lFile = path.join(PATH.LIBRARY, meta2.uuid.substr(0, 2), meta2.uuid + '.copy');
            expect(fse.existsSync(lFile)).to.equal(true);

            const id = nameToId('name');
            const subAsset = meta2.subMetas[id];
            expect(!!subAsset).to.equal(true);
            expect(subAsset.ver).to.equal('0.0.3');
            expect(subAsset.importer).to.equal('test-a');
            expect(subAsset.displayName).to.equal('displayName');
            expect(subAsset.name).to.equal('name');
            expect(subAsset.id).to.equal(id);
            // subAsset 不走迁移流程
            expect(Object.keys(subAsset.userData).length).to.equal(0);
        });

        it('导入器数据迁移功能', async () => {
            const file3 = path.join(PATH.TARGET, '3.test');

            // 模拟数据
            const mMeta = completionMeta({ ver: '0.0.1', importer: 'test-b' });
            mMeta.subMetas[nameToId('name')] = completionMeta({ ver: '0.0.1', importer: 'test-a', name: 'name', displayName: 'displayName' });
            fse.outputJSONSync(file3, { a: 1, }, { spaces: 2, });
            fse.outputJSONSync(file3 + '.meta', mMeta, { spaces: 2, });

            // file3 伪造了 meta 数据，使用 test-b 导入，并且会走迁移流程
            // subAsset 也会走迁移流程
            await DB.refresh(file3);
            const json3 = fse.readJSONSync(file3);
            const meta3 = fse.readJSONSync(file3 + '.meta');
            expect(json3.a).to.equal(1);
            expect(json3.migration1).to.equal(true);
            expect(json3.migration2).to.equal(true);
            expect(json3.migrationHookPre).to.equal(true);
            expect(json3.migrationHookPost).to.equal(true);
            expect(meta3.ver).to.equal('0.0.3');
            expect(meta3.importer).to.equal('test-b');
            expect(meta3.userData.migration1 <= meta3.userData.migration2).to.equal(true);

            const id = nameToId('name');
            const subAsset = meta3.subMetas[id];
            expect(!!subAsset).to.equal(true);
            expect(subAsset.ver).to.equal('0.0.3');
            expect(subAsset.importer).to.equal('test-a');
            expect(subAsset.displayName).to.equal('displayName');
            expect(subAsset.name).to.equal('name');
            expect(subAsset.id).to.equal(id);
            expect(subAsset.userData.migration1 <= subAsset.userData.migration2).to.equal(true);
        });

        it('关闭并清除内容', async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
            // 启动刷新数据库
            await DB.stop();
            // 检查关闭后的数据是否存在
            expect(DB.path2asset.size).to.equal(0);
        });
    });
});
