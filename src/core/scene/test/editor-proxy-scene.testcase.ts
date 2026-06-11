import { IBaseIdentifier, INodeInfo, ISceneInfo, INodeIdentifier, NodeType, ReloadResult } from '../common';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { readFileSync } from 'fs-extra';
import { assetManager } from '../../assets';

describe('EditorProxy Scene 测试', () => {
    describe('场景操作', () => {
        let identifier: IBaseIdentifier | null = null;
        let entity: ISceneInfo | INodeInfo | null = null;
        let currentSceneFile = '';

        it('create - 创建新场景', async () => {
            identifier = await EditorProxy.create({
                type: 'scene',
                baseName: SceneTestEnv.sceneName,
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });
            expect(identifier).toBeTruthy();
            expect(identifier?.assetName).toBe(`${SceneTestEnv.sceneName}.scene`);
        });

        it('open - 通过 UUID 打开场景', async () => {
            expect(identifier).toBeTruthy();
            if (!identifier) return;

            const result = await EditorProxy.open({
                urlOrUUID: identifier.assetUuid
            }) as ISceneInfo;
            expect(result).toBeDefined();
            expect(result.assetUuid).toBe(identifier.assetUuid);
        });

        it('save - 通过 UUID 保存场景', async () => {
            expect(identifier).toBeTruthy();
            if (!identifier) return;

            await NodeProxy.createByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'scene-test-node-uuid',
            });
            const result = await EditorProxy.save({
                urlOrUUID: identifier.assetUuid,
            });
            expect(result).not.toBeNull();
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('scene-test-node-uuid');
        });

        it('reload - 通过 UUID 重载场景', async () => {
            expect(identifier).toBeTruthy();
            if (!identifier) return;

            const result = await EditorProxy.reload({
                urlOrUUID: identifier.assetUuid,
            });
            expect(result).toBe(ReloadResult.SUCCESS);
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前场景应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('scene-test-node-uuid');
        });

        it('close - 通过 UUID 关闭场景', async () => {
            expect(identifier).toBeTruthy();
            if (!identifier) return;

            const result = await EditorProxy.close({
                urlOrUUID: identifier.assetUuid
            });
            expect(result).toBe(true);
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前场景应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).toBeNull();
        });

        it('open - 通过 URL 打开场景', async () => {
            expect(identifier).toBeTruthy();
            if (!identifier) return;

            entity = await EditorProxy.open({
                urlOrUUID: identifier.assetUrl
            }) as ISceneInfo;
            expect(entity).toBeDefined();
            expect(entity.assetUrl).toBe(identifier.assetUrl);
        });

        it('save - 通过 URL 保存场景', async () => {
            await EditorProxy.open({
                urlOrUUID: SceneTestEnv.sceneURL,
            });
            await NodeProxy.createByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'scene-test-node-url',
            });
            const result = await EditorProxy.save({
                urlOrUUID: SceneTestEnv.sceneURL,
            });
            expect(result).not.toBeNull();
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('scene-test-node-url');
        });

        it('reload - 通过 URL 重载场景', async () => {
            expect(identifier).toBeTruthy();
            if (!identifier) return;

            const result = await EditorProxy.reload({
                urlOrUUID: identifier.assetUrl,
            });
            expect(result).toBe(ReloadResult.SUCCESS);
        });

        it('queryCurrent - 通过 URL 关闭后获取当前场景应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('scene-test-node-url');
        });

        it('close - 通过 URL 关闭场景', async () => {
            const result = await EditorProxy.close({
                urlOrUUID: SceneTestEnv.sceneURL
            });
            expect(result).toBe(true);
        });

        it('queryCurrent - 通过 URL 关闭后获取当前场景应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).toBeNull();
        });

        it('save - 保存当前场景', async () => {
            await EditorProxy.open({
                urlOrUUID: SceneTestEnv.sceneURL,
            });
            await NodeProxy.createByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'current-scene-test-node',
            });
            const result = await EditorProxy.save({});
            expect(result).not.toBeNull();
            currentSceneFile = result.file;
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('current-scene-test-node');
        });

        it('reload - 重载当前场景', async () => {
            const result = await EditorProxy.reload({});
            expect(result).toBe(ReloadResult.SUCCESS);
        });

        it('queryCurrent - 获取当前场景', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('current-scene-test-node');
        });

        it('close - 不保存地关闭当前场景', async () => {
            await NodeProxy.createByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'discard-current-scene-test-node',
            });

            const result = await EditorProxy.close({
                save: false,
            });

            expect(result).toBe(true);
            const content = readFileSync(currentSceneFile, 'utf-8');
            expect(content).not.toContain('discard-current-scene-test-node');
        });

        it('close - 关闭当前场景', async () => {
            const result = await EditorProxy.close({});
            expect(result).toBe(true);
        });

        it('queryCurrent - 关闭后获取当前场景应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).toBeNull();
        });
    });

    describe('删除场景资源后创建新场景测试', () => {
        let identifierA: IBaseIdentifier | null = null;
        let identifierB: IBaseIdentifier | null = null;

        it('create - 创建 A 场景', async () => {
            identifierA = await EditorProxy.create({
                type: 'scene',
                baseName: 'scene-a',
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });
            expect(identifierA).toBeTruthy();
            expect(identifierA?.assetName).toBe('scene-a.scene');
        });

        it('open - 打开 A 场景', async () => {
            expect(identifierA).toBeTruthy();
            if (!identifierA) return;

            const result = await EditorProxy.open({
                urlOrUUID: identifierA.assetUuid
            }) as ISceneInfo;
            expect(result).toBeDefined();
            expect(result.assetUuid).toBe(identifierA.assetUuid);
        });

        it('assetDeleted - 删除 A 场景资源', async () => {
            expect(identifierA).toBeTruthy();
            if (!identifierA) return;

            await assetManager.removeAsset(identifierA.assetUuid);
            // 验证资源已从 assetManager 中删除
            const url = assetManager.queryUrl(identifierA.assetUuid);
            expect(url).toBe('');
        });

        it('create - 创建 B 场景', async () => {
            identifierB = await EditorProxy.create({
                type: 'scene',
                baseName: 'scene-b',
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });
            expect(identifierB).toBeTruthy();
            expect(identifierB?.assetName).toBe('scene-b.scene');
        });

        it('open - 打开 B 场景验证正常打开', async () => {
            expect(identifierB).toBeTruthy();
            if (!identifierB) return;

            const result = await EditorProxy.open({
                urlOrUUID: identifierB.assetUuid
            }) as ISceneInfo;
            expect(result).toBeDefined();
            expect(result.assetUuid).toBe(identifierB.assetUuid);
        });

        it('close - 关闭 B 场景', async () => {
            expect(identifierB).toBeTruthy();
            if (!identifierB) return;

            const result = await EditorProxy.close({
                urlOrUUID: identifierB.assetUuid
            });
            expect(result).toBe(true);
        });
    });

    describe('open - includeChildren / includeComponents 参数测试', () => {
        beforeAll(async () => {
            await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL });
        });

        afterAll(async () => {
            await EditorProxy.close({ urlOrUUID: SceneTestEnv.sceneURL });
        });

        it('open - includeChildren:true 时 children 有数据', async () => {
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeChildren: true }) as ISceneInfo;
            expect(result.children).toBeDefined();
            expect(Array.isArray(result.children)).toBe(true);
            if (result.children && result.children.length > 0) {
                const child: INodeIdentifier = result.children[0];
                expect(child.nodeId).toBeDefined();
                expect(child.nodeId).not.toBe('');
                expect(child.path).toBeDefined();
                expect(child.name).toBeDefined();
            }
        });

        it('open - includeChildren:false 时 children 为 undefined', async () => {
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeChildren: false }) as ISceneInfo;
            expect(result.children).toBeUndefined();
        });

        it('open - scene 节点无组件，includeComponents:true 时 components 仍为 undefined', async () => {
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeComponents: true }) as ISceneInfo;
            expect(result.components).toBeUndefined();
        });

        it('open - scene 节点无组件，includeComponents:false 时 components 仍为 undefined', async () => {
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeComponents: false }) as ISceneInfo;
            expect(result.components).toBeUndefined();
        });
    });

    describe('reload - _lastOpenOptions 保持（open 选项在 reload 后保持一致）', () => {
        beforeAll(async () => {
            await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL });
        });

        afterAll(async () => {
            await EditorProxy.close({ urlOrUUID: SceneTestEnv.sceneURL });
        });

        it('reload 后以 includeChildren:false re-open，children 仍为 undefined', async () => {
            // 以 includeChildren:false 打开
            const before = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeChildren: false }) as ISceneInfo;
            expect(before.children).toBeUndefined();

            // reload 内部以 _lastOpenOptions({ includeChildren:false }) 调用 encode，不应崩溃
            const reloadResult = await EditorProxy.reload({ urlOrUUID: SceneTestEnv.sceneURL });
            expect(reloadResult).toBe(ReloadResult.SUCCESS);

            // reload 后 re-open 同 URL（已打开则直接 encode），形状应与 reload 前一致
            const after = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeChildren: false }) as ISceneInfo;
            expect(after.children).toBeUndefined();
        });

        it('reload 后以 includeChildren:true re-open，children 有数据', async () => {
            const before = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeChildren: true }) as ISceneInfo;
            expect(before.children).toBeDefined();

            const reloadResult = await EditorProxy.reload({ urlOrUUID: SceneTestEnv.sceneURL });
            expect(reloadResult).toBe(ReloadResult.SUCCESS);

            const after = await EditorProxy.open({ urlOrUUID: SceneTestEnv.sceneURL, includeChildren: true }) as ISceneInfo;
            expect(after.children).toBeDefined();
            expect(Array.isArray(after.children)).toBe(true);
        });
    });
});
