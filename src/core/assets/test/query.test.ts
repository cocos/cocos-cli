'use strict';

import { basename } from 'path';
import { assetManager, assetDBManager } from '..';
import { globalSetup, testInfo } from './utils';
import assetOperation from '../manager/operation';
import { ICreateMenuInfo } from '../@types/protected';

const { join, extname } = require('path');
const { existsSync, remove } = require('fs-extra');

const invalidParams = [
    { name: 'undefined', value: undefined },
    { name: 'null', value: null },
    { name: 'number - 0', value: 0 },
    { name: 'number - 2', value: 2 },
    { name: 'string - empty', value: '' },
    { name: 'string - str', value: 'str' },
    { name: 'boolean - true', value: true },
    { name: 'boolean- false', value: false },
    { name: 'array', value: [] },
    { name: 'object', value: {} },
];

const internalSpriteUuid = '951249e0-9f16-456d-8b85-a6ca954da16b@f9941';
const internalSpriteImageUuid = '951249e0-9f16-456d-8b85-a6ca954da16b';
const assetTestRoot = testInfo.testRoot;

describe('测试 db 的查询接口', function () {
    const name = `__${Date.now()}__.test`;
    let uuid = '';
    // 测试前的准备工作
    beforeAll(async () => {
        await globalSetup();
        const asset = await assetOperation.createAsset({
            target: `db://assets/${name}`,
            overwrite: true,
            content: 'test',
        });
        uuid = asset && asset.uuid || '';
    });


    afterAll(async function () {
        await assetManager.removeAsset(`db://assets/${name}`);
    });

    describe('query-create-list', () => {
        let result: ICreateMenuInfo[] = [];
        beforeAll(async function () {
            result = await assetManager.getCreateMap();
        });
        it('正常查询到资源创建列表', () => {
            expect(Array.isArray(result)).toBe(true);
            expect(result.length > 0).toBe(true);
        });

        it('所有数据都包含必要信息', () => {
            const keys = ['handler', 'label', 'fullFileName'];
            const hasAllKeys = result.every((info) => {
                // 存在子菜单时，根节点的信息只需要包含 Label 即可
                if (info.submenu) {
                    return 'label' in info;
                }
                return keys.every((key) => key in info);
            });
            expect(hasAllKeys).toBe(true);
        });

        it('艺术字菜单数据正常', () => {
            const atlasMenu = result.find((info) => info.handler === 'label-atlas');
            expect(atlasMenu).not.toBeNull();
            const value = {
                fullFileName: 'label-atlas.labelatlas',
                handler: 'label-atlas',
                label: 'i18n:ENGINE.assets.newLabelAtlas',
                template: 'db://internal/default_file_content/label-atlas/default.labelatlas',
                name: 'default',
            };
            expect(atlasMenu).toEqual(value);
        });

        // test.each(result.map((info) => {
        //     return {}
        // }))
        function testCreate(info: ICreateMenuInfo) {
            if (!info.fullFileName) {
                // 目前创建菜单可能存在一些非资源创建接口比如：管理模板入口
                return;
            }
            const label = info.label;
            console.log(info.label);
            it(`测试创建 ${label || info.label}(${info.fullFileName})`, async () => {
                const target = join(assetTestRoot, info.fullFileName);
                try {
                    const targetUrl = `${testInfo.testRootUrl}/${info.fullFileName}`;
                    const assetInfo = await assetManager.createAsset({
                        ...info,
                        target: targetUrl,
                        overwrite: true,
                    });
                    if (info.label.startsWith('i18n:')) {
                        it('创建菜单 i18n 正常', () => {
                            expect(label).toBeDefined();
                        });
                    }
                    if (assetInfo) {
                        it('创建后返回新建资源信息', () => {
                            expect(typeof assetInfo.uuid).toBe('string');
                            expect(assetInfo.source).toBe(targetUrl);
                        });
                        it('创建文件存在', () => {
                            expect(existsSync(target)).toBe(true);
                        });
                        it(`创建文件使用的 importer(${assetInfo.importer}) 类型与预期的 ${info.handler}符合`, () => {
                            expect(assetInfo.importer).toBe(info.handler);
                        });
                        it(`创建文件的资源后缀与预期 ${extname(info.fullFileName)} 一致`, () => {
                            expect(extname(assetInfo.file)).toBe(extname(info.fullFileName));
                        });
                    } else {
                        it('创建失败', () => {
                            expect(assetInfo).toBeNull();
                        });
                    }
                } catch (error) {
                    console.error(error);
                }
            });
        }
        for (const info of result) {
            if (info.submenu) {
                for (const subInfo of info.submenu) {
                    testCreate(subInfo);
                }
            } else {
                testCreate(info);
            }
        }
    });

    describe('query-path', function () {
        it('查询 assets 数据库', async function () {
            const path = await assetManager.queryPath('db://assets');
            const exists = existsSync(path);
            expect(exists).toBe(true);
        });
        it('查询 internal 数据库', async function () {
            const path = await assetManager.queryPath('db://internal');
            expect(path).not.toBeNull();
            const exists = existsSync(path);
            expect(exists).toBe(true);
        });
        it('查询不存在的数据库', async function () {
            const path = await assetManager.queryPath('db://不存在');
            expect(path).toBe('');
        });
        it('查询 assets 数据库里测试生成的临时资源', async function () {
            const path = await assetManager.queryPath(`db://assets/${name}`);
            expect(path).not.toBeNull();
            const exists = existsSync(path);
            expect(exists).toBe(true);
        });
        it('查询 assets 数据库里不存在的资源', async function () {
            const path = await assetManager.queryPath(`db://assets/${name}.xxx`);
            expect(path).not.toBeNull();
            const exists = existsSync(path);
            expect(exists).toBe(false);
        });
    });

    describe('query-url', function () {
        const assetsPath = join(testInfo.projectRoot, 'assets');
        // const internalPath = join(__dirname, '../static/internal/assets');
        it('查询 assets 数据库', async function () {
            const url = await assetManager.queryUrl(assetsPath);
            expect(url).toBe('db://assets');
        });
        // it('查询 internal 数据库', async function() {
        //     const url = await assetManager.queryUrl(internalPath);
        //     expect(url).toBe('db://internal');
        // });
        it('查询不存在的数据库', async function () {
            const url = await assetManager.queryUrl(__dirname);
            expect(url).toBe('');
        });
        it('查询 assets 数据库里测试生成的临时资源', async function () {
            const url = await assetManager.queryUrl(join(assetsPath, name));
            expect(url).toBe(`db://assets/${name}`);
        });
        it('查询 assets 数据库里不存在的资源', async function () {
            const url = await assetManager.queryUrl(join(assetsPath, name + '.xxx'));
            expect(url).toBe(`db://assets/${name}.xxx`);
        });
    });

    describe('query-uuid', function () {
        it('查询 assets 数据库', async function () {
            const id = await assetManager.queryUUID('db://assets');
            expect(id).toBe('db://assets');
        });
        it('查询 internal 数据库', async function () {
            const id = await assetManager.queryUUID('db://internal');
            expect(id).toBe('db://internal');
        });
        it('查询不存在的数据库', async function () {
            const id = await assetManager.queryUUID('db://不存在');
            expect(id).toBe('');
        });
        it('查询 assets 数据库里测试生成的临时资源', async function () {
            const id = await assetManager.queryUUID(`db://assets/${name}`);
            expect(id).toBe(uuid);
        });
        it('查询 assets 数据库里不存在的资源', async function () {
            const id = await assetManager.queryUUID(`db://assets/${name}.xxx`);
            expect(id).toBe('');
        });
        it('查询 assets 数据库里不存在的资源', async function () {
            const id = await assetManager.queryUUID(`db://assets/${name}.xxx`);
            expect(id).toBe('');
        });
        it('查询 assets 数据库里不存在的资源2', async function () {
            const id = await assetManager.queryUUID('db://internal/default_file_content/abc.xxx');
            expect(id).toBe('');
        });
    });

    describe('query-asset-info 消息接口测试', function () {
        const values = {
            displayName: 'string',
            file: 'string',
            imported: 'boolean',
            importer: 'string',
            invalid: 'boolean',
            isDirectory: 'boolean',
            library: 'object',
            name: 'string',
            path: 'string',
            readonly: 'boolean',
            source: 'string',
            subAssets: 'object',
            type: 'string',
            url: 'string',
            uuid: 'string',
            visible: 'boolean',
        };
        const keys = Object.keys(values);

        it('查询 assets 数据库', async function () {
            const info = await assetManager.queryAssetInfo('db://assets');
            expect(info && Object.keys(info).sort()).toEqual(keys.sort());
        });
        it('查询 internal 数据库', async function () {
            const info = await assetManager.queryAssetInfo('db://internal');
            expect(info && Object.keys(info).sort()).toEqual(keys.sort());
        });
        it('查询不存在的数据库', async function () {
            const info = await assetManager.queryAssetInfo('db://不存在');
            expect(info).toBeNull();
        });
        it('查询 assets 数据库里测试生成的临时资源', async function () {
            const info = await assetManager.queryAssetInfo(uuid);
            expect(info).not.toBeNull();
            expect(info && Object.keys(info).sort()).toEqual([...keys, 'extends'].sort());
        });
        it('查询 assets 数据库里测试生成的临时资源', async function () {
            const info = await assetManager.queryAssetInfo(`db://assets/${name}`);
            expect(info).not.toBeNull();
            expect(info && Object.keys(info).sort()).toEqual([...keys, 'extends'].sort());
        });
        it('查询 assets 数据库里不存在的资源', async function () {
            const info = await assetManager.queryAssetInfo(uuid + '@xxx');
            expect(info).toBeNull();
        });

        it('dataKeys: 查询 depends 信息', async function () {
            const info = await assetManager.queryAssetInfo('d032ac98-05e1-4090-88bb-eb640dcb5fc1@b47c0', ['depends']);
            expect(info && info.depends!.length).toBe(6);
        });
        it('dataKeys: 查询 meta 信息', async function () {
            const info = await assetManager.queryAssetInfo('d032ac98-05e1-4090-88bb-eb640dcb5fc1@b47c0', ['meta']);
            expect(typeof (info && info.meta) === 'object').toBe(true);
        });
        it('dataKeys: 查询 mtime 信息', async function () {
            const info = await assetManager.queryAssetInfo('d032ac98-05e1-4090-88bb-eb640dcb5fc1', ['mtime']);
            expect(typeof (info && info.mtime) === 'number').toBe(true);
        });
    });
    describe('query-asset-meta', function () {
        const values = {
            ver: 'string',
            importer: 'string',
            imported: 'boolean',
            // name: 'string',
            // id: 'string',
            uuid: 'string',
            // displayName: 'string',
            files: 'array',
            subMetas: 'object',
            userData: 'object',
        };
        const keys = Object.keys(values);

        it('查询 assets 数据库', async function () {
            const info = await assetManager.queryAssetMeta('db://assets');
            expect(info && Object.keys(info).sort()).toEqual(keys.sort());
        });
        it('查询 internal 数据库', async function () {
            const info = await assetManager.queryAssetMeta('db://internal');
            expect(info && Object.keys(info).sort()).toEqual(keys.sort());
        });
        it('查询不存在的数据库', async function () {
            const info = await assetManager.queryAssetMeta('db://不存在');
            expect(info).toBeNull();
        });
        it('查询 assets 数据库里测试生成的临时资源', async function () {
            const info = await assetManager.queryAssetMeta(uuid);
            expect(info).not.toBeNull();
            expect(info && Object.keys(info).sort()).toEqual(keys.sort());
        });
        it('查询 assets 数据库里不存在的资源', async function () {
            const info = await assetManager.queryAssetMeta(uuid + '@xxx');
            expect(info).toBeNull();
        });
    });

    describe('query-assets', function () {
        let all: any[];
        let allAssets: any[];
        let allInternal: any[];

        beforeAll(async () => {
            all = await assetManager.queryAssetInfos();
            allAssets = await assetManager.queryAssetInfos({ pattern: 'db://assets' });
            allInternal = await assetManager.queryAssetInfos({ pattern: 'db://internal' });
        });

        describe('验证 query-assets 的返回值', () => {
            it('查询所有资源', () => {
                expect(all).not.toBeNull();
                expect(all.length).not.toBe(0);
            });
            it('查询 assets 数据库内的资源', () => {
                expect(allAssets).not.toBeNull();
                expect(allAssets.length).not.toBe(0);
                expect(allAssets.length).not.toBe(all.length);
            });
            it('查询 internal 数据库内的资源', () => {
                expect(allInternal).not.toBeNull();
                expect(allInternal.length).not.toBe(all.length);
            });
        });

        it('查询 internal 目录下 ccType = cc.SceneAsset 资源', async () => {
            const allScenes = await assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset', pattern: 'db://internal/**/*' });
            expect(allScenes.length).toBe(3);
        });
        it('查询 internal 目录下 extname = mp4资源', async () => {
            const allMP4 = await assetManager.queryAssetInfos({ extname: '.mp4', pattern: 'db://internal/**/*' });
            expect(allMP4.length).toBe(1);
        });
        it('查询 internal 目录下 importer = video-clip 资源', async () => {
            const allMP4 = await assetManager.queryAssetInfos({ importer: 'video-clip', pattern: 'db://internal/**/*' });
            expect(allMP4.length).toBe(1);
        });
        it('通过 pattern 精准查询 internal 下指定地址的 spriteFrame 资源', async () => {
            const sprites = await assetManager.queryAssetInfos({ pattern: 'db://internal/default_ui/default_editbox_bg.png/spriteFrame' });
            expect(sprites.length).toBe(1);
        });
        if (basename(testInfo.projectRoot) === 'build-example') {
            it('查询 assets 目录下 userData.isPlugin = true 的插件脚本资源', async () => {
                const allPlugins = await assetManager.queryAssetInfos({ userData: { isPlugin: true }, pattern: 'db://assets/**/*' });
                expect(allPlugins.length).toBe(3);
            });
        }
    });

    describe('query-asset-mtime', function () {
        it('查询 assets 数据库', async function () {
            const mtime = await assetManager.queryAssetMtime('db://assets');
            expect(mtime).toBeNull();
        });
        it('查询 assets 数据库里测试生成的临时资源', async function () {
            const mtime = await assetManager.queryAssetMtime(uuid);
            expect(typeof mtime).toBe('number');
        });
        it('查询 assets 数据库里不存在的资源', async function () {
            const mtime = await assetManager.queryAssetMtime(uuid + '@xxx');
            expect(mtime).toBeNull();
        });
    });

    if (basename(testInfo.projectRoot) === 'build-example') {
        // db://assets/asset-depends/test.ts
        const scriptUuid = 'e26cd737-d346-4c64-9c6b-b50792fa8ba7';
        // db://assets/atlas-compress/atlas-compress.scene
        const sceneUuid = '4437972c-9b71-4af0-aae3-251f640ee42a';
        // db://assets/asset-depends/testScriptDepend.prefab
        const prefabUuid = '2fbecd81-cbb4-47d1-8d97-7ec9961df865';
        // db://assets/atlas-compress/atlas/sheep_jump_4.png/spriteFrame
        const spriteUuid = '05a0ccff-8e54-44dc-93ea-69c1e783f56a@f9941';
        const imageUuid = '05a0ccff-8e54-44dc-93ea-69c1e783f56a@f9941';
        // db://assets/asset-depends/testScriptDepend.ts required by db://assets/asset-depends/test.ts
        const scriptRequired = 'b02a8776-6b86-4f1a-8ecf-93bcc1a55bea';
        // db://internal/effects/legacy/standard.effect required by test-texture
        const internalEffect = '1baf0fc9-befa-459c-8bdd-af1a450a0319';
        // db://assets/atlas/test-texture.mtl
        const material = 'b58097d1-e862-45dd-8f04-5ae4704761cf';

        describe('query-asset-users', function () {
            it('脚本 uuid, asset -> 使用此脚本 uuid 的资源列表', async () => {
                const assetUuids = await assetManager.queryAssetUsers(scriptRequired);
                expect(assetUuids).toContain(prefabUuid);
            });
            it('脚本 uuid, script -> 使用此脚本 uuid 的脚本列表', async () => {
                const assetUuids = await assetManager.queryAssetUsers(scriptRequired, 'script');
                expect(assetUuids).toContain(scriptUuid);
            });
            it('资源 uuid, asset -> 使用此资源 uuid 的资源列表', async () => {
                const assetUuids = await assetManager.queryAssetUsers(spriteUuid);
                expect(assetUuids).toContain(sceneUuid);
                expect(assetUuids).toContain(prefabUuid);
            });
            it('image 资源 uuid, asset -> 使用此资源 uuid 的资源列表', async () => {
                const assetUuids = await assetManager.queryAssetUsers(imageUuid);
                expect(assetUuids).toContain(sceneUuid);
                expect(assetUuids).toContain(prefabUuid);
                expect(assetUuids).not.toContain(spriteUuid);
            });
            it('资源 uuid, asset -> 使用此资源 uuid 的资源列表(跨数据库依赖）', async () => {
                const assetUuids = await assetManager.queryAssetUsers(internalEffect);
                expect(assetUuids).toContain(material);
            });
            it('脚本 uuid, all -> 使用此脚本 uuid 的prefab/脚本列表', async () => {
                const assetUuids = await assetManager.queryAssetUsers(scriptRequired, 'all');
                expect(assetUuids).toContain(scriptUuid);
                expect(assetUuids).toContain(prefabUuid);
            });
        });

        describe('query-asset-dependencies', function () {
            it('脚本 uuid, asset -> 脚本使用的资源列表', async () => {
                const assetUuids = await assetManager.queryAssetDependencies(scriptUuid);
                expect(assetUuids.length).toBe(0);
            });
            it('场景 uuid, asset -> 场景使用的资源列表', async () => {
                const assetUuids = await assetManager.queryAssetDependencies(sceneUuid);
                expect(assetUuids).toContain(spriteUuid);
            });
            it('场景 uuid, script -> 场景使用的脚本列表', async () => {
                const uuids = await assetManager.queryAssetDependencies(sceneUuid, 'script');
                // db://assets/atlas-compress/atlas/test-compress.ts
                expect(uuids).toContain('f14e1127-f4ff-418d-a54a-5d7daaa942c8');
            });
            it('脚本 uuid, script -> 脚本依赖的脚本列表', async () => {
                const uuids = await assetManager.queryAssetDependencies(scriptUuid, 'script');
                expect(uuids).toContain(scriptRequired);
            });
            it('prefab uuid, all -> prefab 内使用的脚本与资源 uuid', async () => {
                const uuids = await assetManager.queryAssetDependencies(prefabUuid, 'all');
                expect(uuids.length).toBe(2);
                expect(uuids.includes(scriptRequired)).toBe(true);
                expect(uuids.includes(spriteUuid)).toBe(true);
            });
        });
    }
});