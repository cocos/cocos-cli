import { IScene, NodeType, TEditorEntity, } from '../common';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { readFileSync } from 'fs-extra';

describe('EditorProxy Scene 测试', () => {
    describe('场景操作', () => {
        let instance: IScene | null = null;
        let entity: TEditorEntity | null = null;

        it('create - 创建新场景', async () => {
            instance = await EditorProxy.create({
                type: 'scene',
                baseName: SceneTestEnv.sceneName,
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            }) as IScene;
            expect(instance).toBeTruthy();
            expect(instance?.assetName).toBe(`${SceneTestEnv.sceneName}.scene`);
        });

        it('open - 通过 UUID 打开场景', async () => {
            expect(instance).toBeTruthy();
            if (!instance) return;

            const result = await EditorProxy.open({
                urlOrUUID: instance.assetUuid
            }) as IScene;
            expect(result).toBeDefined();
            expect(result.assetUuid).toBe(instance.assetUuid);
        });

        it('save - 通过 UUID 保存场景', async () => {
            expect(instance).toBeTruthy();
            if (!instance) return;

            await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'scene-test-node-uuid',
            });
            const result = await EditorProxy.save({
                urlOrUUID: instance.assetUuid,
            });
            expect(result).not.toBeNull();
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('scene-test-node-uuid');
        });

        it('reload - 通过 UUID 重载场景', async () => {
            expect(instance).toBeTruthy();
            if (!instance) return;

            const result = await EditorProxy.reload({
                urlOrUUID: instance.assetUuid,
            }) as IScene;
            expect(result).toBeDefined();
            expect(JSON.stringify(result)).toContain('scene-test-node-uuid');
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前场景应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('scene-test-node-uuid');
        });

        it('close - 通过 UUID 关闭场景', async () => {
            expect(instance).toBeTruthy();
            if (!instance) return;

            const result = await EditorProxy.close({
                urlOrUUID: instance.assetUuid
            });
            expect(result).toBe(true);
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前场景应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).toBeNull();
        });

        it('open - 通过 URL 打开场景', async () => {
            expect(instance).toBeTruthy();
            if (!instance) return;

            entity = await EditorProxy.open({
                urlOrUUID: instance.assetUrl
            }) as IScene;
            expect(entity).toBeDefined();
            expect(entity.assetUrl).toBe(instance.assetUrl);
        });

        it('save - 通过 URL 保存场景', async () => {
            await EditorProxy.open({
                urlOrUUID: SceneTestEnv.sceneURL,
            });
            await NodeProxy.createNodeByType({
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
            expect(instance).toBeTruthy();
            if (!instance) return;

            const result = await EditorProxy.reload({
                urlOrUUID: instance.assetUrl,
            });
            expect(result).toBeDefined();
            expect(JSON.stringify(result)).toContain('scene-test-node-url');
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
            await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'current-scene-test-node',
            });
            const result = await EditorProxy.save({});
            expect(result).not.toBeNull();
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('current-scene-test-node');
        });

        it('reload - 重载当前场景', async () => {
            const result = await EditorProxy.reload({});
            expect(result).toBeDefined();
            expect(JSON.stringify(result)).toContain('current-scene-test-node');
        });

        it('queryCurrent - 获取当前场景', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('current-scene-test-node');
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
});
