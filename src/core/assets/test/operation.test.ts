'use strict';
import { join } from 'path';
import { existsSync, statSync, readJSONSync, writeJSONSync, readFileSync, remove, outputFile } from 'fs-extra';
import { globalSetup, testInfo } from './utils';
import assetOperation from '../manager/operation';
import { assetManager } from '..';


describe('测试 db 的操作接口', function () {
    const name = `__${Date.now()}__`;
    const testName = 'test-asset.txt';
    const databasePath = testInfo.testRoot;

    beforeAll(async () => {
        // 创建一些资源供测试
        await globalSetup();
    });
    beforeEach(async () => {
        await assetOperation.createAsset({
            target: join(databasePath, testName),
            content: 'test',
            overwrite: true,
        });
    });

    describe('create-asset', function () {
        it('创建文件夹', async function () {
            const asset = await assetOperation.createAsset({
                target: join(databasePath, `${name}.directory`),
            });
            expect(asset).not.toBeNull();
            const exists = existsSync(join(databasePath, `${name}.directory`));
            console.log(join(databasePath, `${name}.directory`));
            expect(exists).toBeTruthy();

            const stat = statSync(join(databasePath, `${name}.directory`));
            expect(stat.isDirectory()).toBeTruthy();

            const meta = readJSONSync(join(databasePath, `${name}.directory.meta`));
            expect(meta.uuid).toEqual(asset!.uuid);
        });

        it('创建普通的文本文件', async function () {
            const asset = await assetOperation.createAsset({
                target: join(databasePath, `${name}-create-asset-normal.txt`),
                content: 'test',
            });
            expect(asset).not.toBeNull();
        });

        it('创建普通的文本文件 overwrite', async function () {
            const dest = join(databasePath, `${name}-create-asset-overwrite.txt`);
            outputFile(dest, 'original content');
            const asset = await assetOperation.createAsset({
                target: dest,
                content: 'createAssetOverwrite',
                overwrite: true,
            });
            expect(asset).not.toBeNull();
            expect(readFileSync(dest, 'utf8')).toEqual('createAssetOverwrite');
        });
    });

    // describe('copy-asset', () => {
    //     it('复制文件夹', async function() {
    //         await assetOperation.copyAsset(
    //             `${testInfo.testRootUrl}/${name}.directory`,
    //             `${testInfo.testRootUrl}/${name}.directory2`,
    //         );

    //         const uuid = await assetManager.queryUUID(`${testInfo.testRootUrl}/${name}.directory2`);

    //         const exists = existsSync(join(databasePath, `${name}.directory`));
    //         expect(exists).toStrictEqual(true);

    //         const exists2 = existsSync(join(databasePath, `${name}.directory2`));
    //         expect(exists2).toStrictEqual(true);

    //         const stat = statSync(join(databasePath, `${name}.directory2`));
    //         expect(stat.isDirectory()).toStrictEqual(true);

    //         const meta = readJSONSync(join(databasePath, `${name}.directory2.meta`));
    //         expect(meta.uuid).toStrictEqual(uuid);
    //     });

    //     it('复制普通资源', async function() {
    //         await assetOperation.copyAsset(
    //             `${testInfo.testRootUrl}/${name}.normal`,
    //             `${testInfo.testRootUrl}/${name}.normal2`,
    //         );

    //         const uuid = await assetManager.queryUUID(`${testInfo.testRootUrl}/${name}.normal2`);

    //         const exists = existsSync(join(databasePath, `${name}.normal`));
    //         expect(exists).toStrictEqual(true);

    //         const exists2 = existsSync(join(databasePath, `${name}.normal2`));
    //         expect(exists2).toStrictEqual(true);

    //         const stat = statSync(join(databasePath, `${name}.normal2`));
    //         expect(stat.isDirectory()).toStrictEqual(false);

    //         const meta = readJSONSync(join(databasePath, `${name}.normal2.meta`));
    //         expect(meta.uuid).toStrictEqual(uuid);

    //         const content = readFileSync(join(databasePath, `${name}.normal2`), 'utf8');
    //         expect(content).toStrictEqual('test');
    //     });
    // });

    // describe('move-asset', () => {
    //     it('移动文件夹', async function() {
    //         await assetOperation.moveAsset(
    //             `${testInfo.testRootUrl}/${name}.directory2`,
    //             `${testInfo.testRootUrl}/${name}.directory3`,
    //         );

    //         const exists = existsSync(join(databasePath, `${name}.directory2`));
    //         expect(exists).toStrictEqual(false);

    //         const exists2 = existsSync(join(databasePath, `${name}.directory3`));
    //         expect(exists2).toStrictEqual(true);

    //         const stat = statSync(join(databasePath, `${name}.directory3`));
    //         expect(stat.isDirectory()).toStrictEqual(true);

    //         // move 传出的是一个 bool，不是预期的 uuid
    //         // const meta = readJSONSync(join(databasePath, `${name}.directory3.meta`));
    //         // expect(meta.uuid).toStrictEqual(uuid);
    //     });

    //     it('移动普通资源', async function() {
    //         await assetOperation.moveAsset(
    //             `${testInfo.testRootUrl}/${name}.normal2`,
    //             `${testInfo.testRootUrl}/${name}.normal3`,
    //         );

    //         const exists = existsSync(join(databasePath, `${name}.normal2`));
    //         expect(exists).toStrictEqual(false);

    //         const exists2 = existsSync(join(databasePath, `${name}.normal3`));
    //         expect(exists2).toStrictEqual(true);

    //         const stat = statSync(join(databasePath, `${name}.normal3`));
    //         expect(stat.isDirectory()).toStrictEqual(false);

    //         // move 传出的是一个 bool，不是预期的 uuid
    //         // const meta = readJSONSync(join(databasePath, `${name}.normal3.meta`));
    //         // expect(meta.uuid).toStrictEqual(uuid);

    //         const content = readFileSync(join(databasePath, `${name}.normal3`), 'utf8');
    //         expect(content).toStrictEqual('test');
    //     });

    //     it('普通的移动重命名资源', async function() {
    //         const testName1 = name;
    //         const testName2 = name + 'A';
    //         await assetOperation.moveAsset(
    //             `${testInfo.testRootUrl}/${testName1}.normal3`,
    //             `${testInfo.testRootUrl}/${testName2}.normal3`,
    //         );

    //         const exists = existsSync(join(databasePath, `${testName1}.normal3`));
    //         expect(exists).toStrictEqual(false);

    //         const exists2 = existsSync(join(databasePath, `${testName2}.normal3`));
    //         expect(exists2).toStrictEqual(true);

    //         const content = readFileSync(join(databasePath, `${testName2}.normal3`), 'utf8');
    //         expect(content).toStrictEqual('test');
    //     });

    //     it('大小写差异的重命名资源', async function() {
    //         const testName1 = name + 'A';
    //         const testName2 = name + 'a';
    //         await assetOperation.moveAsset(
    //             `${testInfo.testRootUrl}/${testName1}.normal3`,
    //             `${testInfo.testRootUrl}/${testName2}.normal3`,
    //         );

    //         const testName1Uuid = await assetManager.queryUUID(join(databasePath, `${testName1}.normal3`));
    //         expect(!!testName1Uuid).toStrictEqual(false);

    //         const testName2Uuid = await assetManager.queryUUID(join(databasePath, `${testName2}.normal3`));
    //         expect(!!testName2Uuid).toStrictEqual(true);

    //         const metaExist = existsSync(join(databasePath, `${testName2}.normal3.meta`));
    //         expect(metaExist).toStrictEqual(true);

    //         const content = readFileSync(join(databasePath, `${testName2}.normal3`), 'utf8');
    //         expect(content).toStrictEqual('test');
    //     });
    // });

    describe('delete-asset', () => {
        describe('删除文件夹', function () {

            it('删除文件夹后源文件不存在', async () => {
                await assetManager.removeAsset(`${testInfo.testRootUrl}/${testName}`);
                const exists = existsSync(join(databasePath, `${testName}`));
                expect(exists).toStrictEqual(false);
                const metaExists = existsSync(join(databasePath, `${testName}`));
                console.log(Date.now());
                expect(metaExists).toStrictEqual(false);
            });
        });

        it('使用 url 删除普通资源', async function () {
            await assetManager.removeAsset(`${testInfo.testRootUrl}/${testName}`);

            const exists = existsSync(join(databasePath, `${testName}`));
            expect(exists).toStrictEqual(false);

            const metaExists = existsSync(join(databasePath, `${testName}.meta`));
            expect(metaExists).toStrictEqual(false);
        });

        it('使用 uuid 删除普通资源', async function () {
            const testName = `${name}_delete.normal`;
            const asset = await assetOperation.createAsset({
                target: join(databasePath, testName),
                content: 'test',
            });
            await assetManager.removeAsset(asset!.uuid);

            const exists = existsSync(join(databasePath, `${testName}`));
            expect(exists).toStrictEqual(false);

            const metaExists = existsSync(join(databasePath, `${testName}.meta`));
            expect(metaExists).toStrictEqual(false);
        });
    });

    describe('save-asset', () => {
        it('保存普通资源', async function () {
            await assetManager.saveAsset(`${testInfo.testRootUrl}/${testName}`, 'test2');

            const filePath = join(testInfo.testRoot, testName);
            expect(existsSync(filePath)).toStrictEqual(true);

            const content = readFileSync(filePath, 'utf8');
            expect(content).toStrictEqual('test2');
        });
        // 保存场景、prefab、材质、动画
    });

    describe('reimport-asset', () => {
        it('普通资源 uuid 的 reimport', async () => {
            const uuid = await assetManager.queryUUID(`${testInfo.testRootUrl}/${testName}`);

            const metaJson = readJSONSync(join(testInfo.testRoot, `${testName}.meta`));
            metaJson.userData.testReimport = true;
            writeJSONSync(join(databasePath, `${testName}.meta`), metaJson);

            await assetOperation.reimportAsset(uuid!);
            const assetMeta = await assetManager.queryAssetMeta(uuid!);
            expect(assetMeta!.userData.testReimport).toStrictEqual(true);
        });

        it('子资源 url 的 reimport', async () => {
            const parentUrl = 'db://internal/default_ui/default_toggle_disabled.png';
            const subAssetUrl = `${parentUrl}/texture`;
            await assetOperation.reimportAsset(subAssetUrl);
            expect(true).toBeTruthy();
        });
    });
    describe('save-asset-meta', () => {
        it('保存资源的 meta', async function () {
            const uuid = await assetManager.queryUUID(`${testInfo.testRootUrl}/${testName}`);

            const metaJson = readJSONSync(join(databasePath, `${testName}.meta`));
            metaJson.userData.test = true;

            await await assetManager.saveAssetMeta(uuid!, metaJson);
            const meta = await assetManager.queryAssetMeta(uuid!);

            expect(meta!.userData.test).toStrictEqual(true);
        });
    });

    describe('create-asset-by-type', () => {
        // 定义所有支持创建的资源类型测试数据
        const createTestCases = [
            { type: 'animation-clip', ext: 'anim', ccType: 'cc.AnimationClip', description: '动画剪辑' },
            { type: 'typescript', ext: 'ts', ccType: 'cc.Script', description: 'TypeScript 脚本' },
            { type: 'auto-atlas', ext: 'pac', ccType: 'cc.SpriteAtlas', description: '自动图集' },
            { type: 'effect', ext: 'effect', ccType: 'cc.EffectAsset', description: '着色器效果' },
            { type: 'scene', ext: 'scene', ccType: 'cc.SceneAsset', description: '3d 场景', templateName: '3d' },
            { type: 'scene', ext: 'scene', ccType: 'cc.SceneAsset', description: '2d 场景', templateName: '2d' },
            { type: 'scene', ext: 'scene', ccType: 'cc.SceneAsset', description: 'quality 场景', templateName: 'quality' },
            { type: 'prefab', ext: 'prefab', ccType: 'cc.Prefab', description: '预制体' },
            { type: 'material', ext: 'mtl', ccType: 'cc.Material', description: '材质' },
            // { type: 'texture-cube', ext: 'cubemap', ccType: 'cc.TextureCube', description: '立方体贴图' },
            { type: 'terrain', ext: 'terrain', ccType: 'cc.TerrainAsset', description: '地形' },
            { type: 'physics-material', ext: 'pmtl', ccType: 'cc.PhysicsMaterial', description: '物理材质' },
            { type: 'label-atlas', ext: 'labelatlas', ccType: 'cc.LabelAtlas', description: '标签图集' },
            // { type: 'render-texture', ext: 'rt', ccType: 'cc.RenderTexture', description: '渲染纹理' },
            // { type: 'animation-graph', ext: 'animgraph', ccType: 'cc.AnimationGraph', description: '动画图' },
            // { type: 'animation-mask', ext: 'mask', ccType: 'cc.AnimationMask', description: '动画遮罩' },
            // { type: 'animation-graph-variant', ext: 'animgraphvariant', ccType: 'cc.AnimationGraphVariant', description: '动画图变体' },
            { type: 'effect-header', ext: 'chunk', ccType: '', description: '着色器头文件', skipTypeCheck: true },
        ];

        // 使用 test.each 批量测试所有资源类型
        test.each(createTestCases)(
            '创建 $description ($type)',
            async ({ type, ext, ccType, skipTypeCheck, templateName }) => {
                const fileName = `${type}.${ext}`;
                const assetInfo = await assetManager.createAssetByType(
                    type as any,
                    join(databasePath, fileName),
                    {
                        overwrite: true,
                        templateName,
                    }
                );

                expect(assetInfo).not.toBeNull();

                // 验证资源类型（某些特殊类型可能不需要验证）
                if (!skipTypeCheck && ccType) {
                    expect(assetInfo!.type).toEqual(ccType);
                }

                // 验证文件存在
                const exists = existsSync(join(databasePath, fileName));
                expect(exists).toBeTruthy();

                // 验证 meta 文件存在
                const metaExists = existsSync(join(databasePath, `${fileName}.meta`));
                expect(metaExists).toBeTruthy();
            }
        );

    });

    describe('import-asset', () => {
        it('导入外部文件到项目中', async function () {
            // 创建一个临时测试文件
            const tempFilePath = join(databasePath, `${name}_temp.txt`);
            await outputFile(tempFilePath, 'import test content');

            const targetName = `${name}_imported.txt`;
            const assets = await assetManager.importAsset(tempFilePath, join(databasePath, targetName));

            // 验证返回的是数组且包含一个资源
            expect(Array.isArray(assets)).toBeTruthy();
            expect(assets.length).toBeGreaterThan(0);

            const asset = assets[0];
            expect(asset).not.toBeNull();
            expect(asset.isDirectory).toBeFalsy();

            const targetPath = join(databasePath, targetName);
            expect(existsSync(targetPath)).toBeTruthy();

            const content = readFileSync(targetPath, 'utf8');
            expect(content).toEqual('import test content');

            // 清理临时文件
            await remove(tempFilePath);
        });

        it('导入文件并覆盖已存在的资源', async function () {
            // 先创建一个资源
            const targetName = `${name}_overwrite.txt`;
            await assetOperation.createAsset({
                target: join(databasePath, targetName),
                content: 'original content',
                overwrite: true,
            });

            // 创建临时源文件
            const tempFilePath = join(databasePath, `${name}_temp2.txt`);
            await outputFile(tempFilePath, 'new content');

            // 导入并覆盖
            const assets = await assetManager.importAsset(tempFilePath, join(databasePath, targetName));

            // 验证返回的是数组
            expect(Array.isArray(assets)).toBeTruthy();
            expect(assets.length).toBeGreaterThan(0);

            const targetPath = join(databasePath, targetName);
            const content = readFileSync(targetPath, 'utf8');
            expect(content).toEqual('new content');

            // 清理临时文件
            await remove(tempFilePath);
        });

        it('导入图片资源', async function () {
            // 从 internal 复制一张图片作为源
            const sourceImage = await assetManager.url2path('db://internal/default_ui/default_btn_normal.png');

            const targetName = `${name}_imported.png`;
            const assets = await assetManager.importAsset(sourceImage, join(databasePath, targetName));

            // 验证返回的是数组且包含资源
            expect(Array.isArray(assets)).toBeTruthy();
            expect(assets.length).toBeGreaterThan(0);

            const asset = assets[0];
            expect(asset).not.toBeNull();
            expect(asset.type).toEqual('cc.ImageAsset');

            const targetPath = join(databasePath, targetName);
            expect(existsSync(targetPath)).toBeTruthy();

            const metaExists = existsSync(join(databasePath, `${targetName}.meta`));
            expect(metaExists).toBeTruthy();
        });

        it('导入文件夹', async function () {
            // 创建一个临时文件夹和文件
            const tempDirPath = join(databasePath, `${name}_temp_dir`);
            await outputFile(join(tempDirPath, 'file1.txt'), 'content1');
            await outputFile(join(tempDirPath, 'file2.txt'), 'content2');

            const targetDirName = `${name}_imported_dir`;
            const assets = await assetManager.importAsset(tempDirPath, join(databasePath, targetDirName));

            // 验证返回的是数组，包含文件夹和所有子文件
            expect(Array.isArray(assets)).toBeTruthy();
            expect(assets.length).toBeGreaterThan(0);

            const targetPath = join(databasePath, targetDirName);
            expect(existsSync(targetPath)).toBeTruthy();
            expect(existsSync(join(targetPath, 'file1.txt'))).toBeTruthy();
            expect(existsSync(join(targetPath, 'file2.txt'))).toBeTruthy();

            // 清理临时文件夹
            await remove(tempDirPath);
        });
    });

    // it('refresh-all-database', async () => {
    //     let resultResolve: null | Function = null;
    //     function test() {
    //         resultResolve && resultResolve(true);
    //         assetDBManager.removeListener('asset-db:refresh-finish', test);
    //     }
    //     const result = new Promise((resolve) => {
    //         resultResolve = resolve;
    //     });
    //     assetDBManager.on('asset-db:refresh-finish', test);
    //     // 删除 effect.bin 的缓存
    //     const effectBin = join(testInfo.projectRoot, 'temp', 'asset-db', 'effect/effect.bin');
    //     removeSync(effectBin);
    //     await assetDBManager.refresh();
    //     // 刷新资源后，需要重新生成 effect.bin

    //     expect(await result).toBeTruthy();
    //     expect(existsSync(effectBin)).toBeTruthy();
    // });

    // describe('rename-asset', () => {
    //     it('重命名文件夹', async function() {
    //         await await assetManager.renameAsset(
    //             `${testInfo.testRootUrl}/${name}.directory`,
    //             `${testInfo.testRootUrl}/${name}rename.directory`,
    //         );

    //         const exists = existsSync(join(databasePath, `${name}.directory`));
    //         expect(exists).toStrictEqual(false);

    //         const exists2 = existsSync(join(databasePath, `${name}rename.directory`));
    //         expect(exists2).toStrictEqual(true);

    //         const stat = statSync(join(databasePath, `${name}rename.directory`));
    //         expect(stat.isDirectory()).toStrictEqual(true);
    //     });

    //     it('重命名普通资源', async function() {
    //         await await assetManager.renameAsset(
    //             `${testInfo.testRootUrl}/${name}.normal`,
    //             `${testInfo.testRootUrl}/${name}.normal2`,
    //         );

    //         const exists = existsSync(join(databasePath, `${name}.normal`));
    //         expect(exists).toStrictEqual(false);

    //         const exists2 = existsSync(join(databasePath, `${name}.normal2`));
    //         expect(exists2).toStrictEqual(true);

    //         const stat = statSync(join(databasePath, `${name}.normal2`));
    //         expect(stat.isDirectory()).toStrictEqual(false);

    //         // move 传出的是一个 bool，不是预期的 uuid
    //         // const meta = readJSONSync(join(databasePath, `${name}.normal3.meta`));
    //         // expect(meta.uuid).toStrictEqual(uuid);

    //         const content = readFileSync(join(databasePath, `${name}.normal2`), 'utf8');
    //         expect(content).toStrictEqual('test2');
    //     });

    //     it('大小写差异的重命名资源', async function() {
    //         const testName1 = name;
    //         const testName2 = name + 'a';
    //         await await assetManager.renameAsset(
    //             `${testInfo.testRootUrl}/${testName1}.normal2`,
    //             `${testInfo.testRootUrl}/${testName2}.normal2`,
    //         );

    //         const testName1Uuid = await assetManager.queryUUID(join(databasePath, `${testName1}.normal2`));
    //         expect(!!testName1Uuid).toStrictEqual(false);

    //         const testName2Uuid = await assetManager.queryUUID(join(databasePath, `${testName2}.normal2`));
    //         expect(!!testName2Uuid).toStrictEqual(true);

    //         const metaExist = existsSync(join(databasePath, `${testName2}.normal2.meta`));
    //         expect(metaExist).toStrictEqual(true);

    //         const content = readFileSync(join(databasePath, `${testName2}.normal2`), 'utf8');
    //         expect(content).toStrictEqual('test2');
    //     });

    //     it('重命名资源但实际为移动文件', async function() {
    //         const testName1 = name + 'a';
    //         const testName2 = name;
    //         await await assetManager.renameAsset(
    //             `${testInfo.testRootUrl}/${testName1}.normal2`,
    //             `${testInfo.testRootUrl}/move/${testName2}.normal2`,
    //         );

    //         const exists = existsSync(join(databasePath, `${testName1}.normal2`));
    //         expect(exists).toStrictEqual(false);

    //         const exists2 = existsSync(join(databasePath, `move/${testName2}.normal2`));
    //         expect(exists2).toStrictEqual(true);

    //         const content = readFileSync(join(databasePath, `move/${testName2}.normal2`), 'utf8');
    //         expect(content).toStrictEqual('test2');
    //     });
    // });

    // TODO 
    // describe('new-asset', () => {
    //     // 1. 验证所有开放出去的新建菜单可以正常创建（已在 query.spec 内验证），主要验证包含模板的相关功能
    //     // 2. 验证 url + content 的创建，(已在 create-asset 处验证)
    //     // 3. 验证传递 userData/uuid/overwrite/rename 等附加参数的生效情况

    //     it('创建普通资源 overwrite', async function() {
    //         const uuid = utils.UUID.generate(false);
    //         const assetUrl = `${testInfo.testRootUrl}/${name}.normal`;
    //         const asset = await assetOperation.createAsset({
    //             target: assetUrl,
    //             content: 'new-asset',
    //             overwrite: true,
    //             uuid,
    //             userData: {
    //                 test: 2,
    //             },
    //         });

    //         // UUID 需要与指定的一致
    //         expect(asset && asset.uuid).toStrictEqual(uuid);

    //         // 指定 userData 生效
    //         const meta = readJSONSync(join(databasePath, `${name}.normal.meta`));
    //         expect(meta.userData.test).toEqual(2);

    //         // overwrite 生效，正确修改文件内容
    //         const content = readFileSync(join(databasePath, `${name}.normal`), 'utf8');
    //         expect(content).toStrictEqual('new-asset');
    //     });

    //     it('创建空文件 cubemap', async () => {
    //         const assetUrl = `${testInfo.testRootUrl}/${name}.cubemap`;
    //         const asset = await assetOperation.createAsset({
    //             target: assetUrl,
    //             content: '',
    //         });

    //         expect(asset && asset.type).toEqual('cc.TextureCube');
    //     });

    //     it('创建空文件夹', async () => {
    //         const assetUrl = `${testInfo.testRootUrl}/${name}_folder`;
    //         const asset = await assetOperation.createAsset({
    //             target: assetUrl,
    //         });
    //         expect(asset && asset.isDirectory).toBeTruthy();
    //     });

    //     it('同时传递 content 与 template 时，优先使用 content', async () => {
    //         const assetUrl = `${testInfo.testRootUrl}/${name}.custom`;
    //         const asset = await assetOperation.createAsset({
    //             target: assetUrl,
    //             content: 'test',
    //             template: 'db://internal/default_file_content/auto-atlas/default.pac',
    //         });
    //         expect(asset && extname(asset.file)).toEqual('.custom');
    //         expect(asset && readFileSync(asset.file, 'utf-8')).toEqual('test');
    //     });

    // });

    // describe('import-asset', () => {
    //     // 把外部文件拷贝到 assets 指定目录下，并且导入刷新
    //     // 导入文件
    //     // 导入文件夹
    // });

    // describe('generate-available-url', () => {
    //     // 类似 getName 的作用

    //     it('db://internal/default_ui 作为目标路径自动更名', async () => {
    //         const testUrl = 'db://internal/default_ui';
    //         const validUrl = await assetManager.generateAvailableURL(testUrl);
    //         expect(testUrl).not.toEqual(validUrl);
    //     });
    // });

    // describe('update-default-user-data', () => {
    //     const defaultMetaPath = join(testInfo.projectRoot, '.creator/default-meta.json');
    //     let testImageType = 'texture';
    //     let testTrimType = 'none';
    //     if (existsSync(defaultMetaPath)) {
    //         it('获取用户本地导入配置数据，验证接口查询结果适合正常', async () => {
    //             const info = readJsonSync(defaultMetaPath);
    //             const assetConfigMap = await assetManager.queryAssetConfigMap();
    //             Object.keys(info).forEach((assetHandlerName) => {
    //                 if (!assetConfigMap[assetHandlerName] || !Object.keys(info[assetHandlerName])) {
    //                     return;
    //                 }
    //                 Object.keys(info[assetHandlerName]).forEach((type) => {
    //                     const { userDataConfig } = assetConfigMap[assetHandlerName];
    //                     it(`验证 ${assetHandlerName} ${type} 的默认值 ${userDataConfig![type].default} 是否与用户文件内容 ${info[assetHandlerName][type]}一致 `, (() => {
    //                         expect(userDataConfig![type].default).toEqual(info[assetHandlerName][type]);
    //                     }));
    //                 });
    //             });

    //             // 根据用户本地配置，修改类型，方便验证是否正确修改
    //             if (info.image?.type === testImageType) {
    //                 testImageType = 'sprite-frame';
    //             }
    //             if (info['sprite-frame']?.trimType === testTrimType) {
    //                 testTrimType = 'custom';
    //             }
    //         });
    //     }

    //     it(`更新 image 的默认导入类型为 ${testImageType}`, async () => {
    //         await assetManager.updateDefaultUserData('image', 'type', testImageType);

    //         test.each([
    //           `验证拷贝的 image 的导入类型为 ${testImageType}`, async () => {
    //                 // 拷贝一张图到编辑器内并导入，获取到的导入类型与配置的一致
    //                 const testImage = await assetManager.url2path('db://internal/default_ui/default_btn_disabled.png');
    //                 const testImageDest = join(databasePath, 'testImage.png');
    //                 await copy(testImage, testImageDest);
    //                 await assetOperation.refreshAsset(testImageDest);
    //                 const assetMeta = await assetManager.queryAssetMeta(testImageDest);
    //                 expect(assetMeta!.userData.type).toEqual(testImageType);
    //             }, 
    //             '验证实际写入文件的内容修改正常', () => {
    //                 expect(readJSONSync(defaultMetaPath).image.type).toEqual(testImageType);
    //             },
    //         ]);

    //     });

    //     it(`更新 sprite-frame 的 trim type 类型为 ${testTrimType}`, async () => {
    //         await assetManager.updateDefaultUserData('sprite-frame', 'trimType', testTrimType);
    //         expect(readJSONSync(defaultMetaPath)['sprite-frame'].trimType).toEqual(testTrimType);
    //     });
    // });

    // 旧版本使用，新版本已不再使用
    // describe('refresh-default-user-data-config', () => {

    // });

    // init-asset create-asset-dialog
    // update-config

    afterAll(async () => {
        // 先通过资源数据库 API 删除资源（会正确处理异步任务）
        try {
            await assetManager.removeAsset(testInfo.testRootUrl);
        } catch (e) {
            console.error('清理测试资源失败:', e);
        }

        // 等待一小段时间确保所有异步任务完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 最后清理残留文件
        if (existsSync(testInfo.testRoot)) {
            await remove(testInfo.testRoot);
        }
        if (existsSync(testInfo.testRoot + '.meta')) {
            await remove(testInfo.testRoot + '.meta');
        }
    });
});