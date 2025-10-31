import { INode, IPrefab, NodeType, TEditorEntity, } from '../common';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { readFileSync } from 'fs-extra';
import { ComponentProxy } from '../main-process/proxy/component-proxy';

describe('EditorProxy Prefab 测试', () => {
    describe('预制体操作', () => {
        let identifier: IPrefab | null = null;
        let entity: TEditorEntity | null = null;

        it('create - 创建新预制体', async () => {
            identifier = await EditorProxy.create({
                type: 'prefab',
                baseName: SceneTestEnv.prefabName,
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });
            expect(identifier).toBeDefined();
            expect(identifier?.assetName).toBe(`${SceneTestEnv.prefabName}.prefab`);
            expect(identifier?.assetUrl).toBe(SceneTestEnv.prefabURL);
        });

        it('open - 通过 UUID 打开预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            const result = await EditorProxy.open({
                urlOrUUID: identifier.assetUuid
            });
            expect(result).toBeDefined();
            expect(result.assetUuid).toBe(identifier.assetUuid);
        });

        it('save - 通过 UUID 保存预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'prefab-test-node-uuid',
            });
            const result = await EditorProxy.save({
                urlOrUUID: identifier.assetUuid,
            });
            expect(result).not.toBeNull();
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('prefab-test-node-uuid');
        });

        it('reload - 通过 UUID 重载预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            const result = await EditorProxy.reload({
                urlOrUUID: identifier.assetUuid,
            });
            expect(result).toBeDefined();
            expect(JSON.stringify(result)).toContain('prefab-test-node-uuid');
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('prefab-test-node-uuid');
        });

        it('close - 通过 UUID 关闭预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            const result = await EditorProxy.close({
                urlOrUUID: identifier.assetUuid
            });
            expect(result).toBe(true);
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).toBeNull();
        });

        it('open - 通过 URL 打开预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            entity = await EditorProxy.open({
                urlOrUUID: identifier.assetUrl
            });
            expect(entity).toBeDefined();
            expect(entity.assetUrl).toBe(identifier.assetUrl);
        });

        it('save - 通过 URL 保存预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'prefab-test-node-url',
            });
            const result = await EditorProxy.save({
                urlOrUUID: identifier.assetUrl,
            });
            expect(result).not.toBeNull();
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('prefab-test-node-url');
        });

        it('reload - 通过 URL 重载预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            const result = await EditorProxy.reload({
                urlOrUUID: identifier.assetUrl,
            });
            expect(result).toBeDefined();
            expect(JSON.stringify(result)).toContain('prefab-test-node-url');
        });

        it('queryCurrent - 通过 URL 关闭后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('prefab-test-node-url');
        });

        it('close - 通过 URL 关闭预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            const result = await EditorProxy.close({
                urlOrUUID: identifier.assetUrl
            });
            expect(result).toBe(true);
        });

        it('queryCurrent - 通过 URL 关闭后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).toBeNull();
        });

        it('save - 保存当前预制体', async () => {
            await EditorProxy.open({
                urlOrUUID: SceneTestEnv.prefabURL,
            });
            const node = await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'current-prefab-test-node',
            });
            expect(node).not.toBeNull();
            if (node) {
                const label = await ComponentProxy.addComponent({
                    nodePath: node.path,
                    component: 'cc.Label'
                });
                await ComponentProxy.setProperty({
                    componentPath: label.path,
                    properties: {
                        string: 'abc-prefab'
                    }
                });
            }
            const result = await EditorProxy.save({});
            expect(result).not.toBeNull();
            const content = readFileSync(result.file, 'utf-8');
            expect(content).toContain('current-prefab-test-node');
            expect(content).toContain('abc-prefab');
        });

        it('reload - 重载当前预制体', async () => {
            expect(identifier).not.toBeNull();
            if (!identifier) return;
            const result = await EditorProxy.reload({});
            expect(result).toBeDefined();
            expect(JSON.stringify(result)).toContain('current-prefab-test-node');
        });

        it('queryCurrent - 获取当前预制体', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('current-prefab-test-node');
        });

        it('close - 关闭当前预制体', async () => {
            const result = await EditorProxy.close({});
            expect(result).toBe(true);
        });

        it('queryCurrent - 关闭当前预制体后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();
            expect(result).toBeNull();
        });
    });
});
