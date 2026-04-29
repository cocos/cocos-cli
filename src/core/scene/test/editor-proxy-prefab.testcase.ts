import { IBaseIdentifier, INode, NodeType, ReloadResult, TEditorEntity, } from '../common';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { readFileSync } from 'fs-extra';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { assetManager } from '../../assets';

describe('EditorProxy Prefab 测试', () => {
    describe('预制体操作', () => {
        let identifier: IBaseIdentifier | null = null;
        let instanceAssetURL = '';
        let entity: TEditorEntity | null = null;

        it('create - 创建新预制体', async () => {
            identifier = await EditorProxy.create({
                type: 'prefab',
                baseName: SceneTestEnv.prefabName,
                targetDirectory: SceneTestEnv.targetDirectoryURL,
            });

            expect(identifier).toBeTruthy();

            instanceAssetURL = assetManager.queryUrl(identifier.assetUuid);

            expect(instanceAssetURL).toBe(SceneTestEnv.prefabURL);
        });

        it('open - 通过 UUID 打开预制体', async () => {
            expect(instanceAssetURL).toBeTruthy();
            expect(identifier).toBeTruthy();

            const result = await EditorProxy.open({ urlOrUUID: instanceAssetURL }) as INode;

            expect(result).toBeTruthy();
            expect(result?.prefab).toBeTruthy();
            expect(result?.prefab?.asset).toBeTruthy();
            expect(result.prefab?.asset?.uuid).toBe(identifier?.assetUuid);
        });

        it('save - 通过 UUID 保存预制体', async () => {
            expect(identifier).toBeTruthy();

            await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'prefab-test-node-uuid',
            });

            const result = await EditorProxy.save({
                urlOrUUID: identifier?.assetUuid,
            });

            expect(result).not.toBeNull();

            const content = readFileSync(result.file, 'utf-8');

            expect(content).toContain('prefab-test-node-uuid');
        });

        it('reload - 通过 UUID 重载预制体', async () => {
            expect(identifier).toBeTruthy();

            const result = await EditorProxy.reload({
                urlOrUUID: identifier?.assetUuid,
            });

            expect(result).toBe(ReloadResult.SUCCESS);
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();

            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('prefab-test-node-uuid');
        });

        it('close - 通过 UUID 关闭预制体', async () => {
            expect(identifier).toBeTruthy();

            const result = await EditorProxy.close({
                urlOrUUID: identifier?.assetUuid,
            });

            expect(result).toBe(true);
        });

        it('queryCurrent - 通过 UUID 关闭后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();

            expect(result).toBeNull();
        });

        it('open - 通过 URL 打开预制体', async () => {
            expect(instanceAssetURL).toBeTruthy();


            entity = await EditorProxy.open({ urlOrUUID: instanceAssetURL }) as INode;

            expect(entity).toBeTruthy();
            expect(entity?.prefab).toBeTruthy();
            expect(entity?.prefab?.asset).toBeTruthy();

            const url = assetManager.queryUrl(entity.prefab?.asset?.uuid as string);

            expect(url).toBe(instanceAssetURL);
        });

        it('save - 通过 URL 保存预制体', async () => {
            expect(instanceAssetURL).toBeTruthy();

            await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'prefab-test-node-url',
            });

            const result = await EditorProxy.save({
                urlOrUUID: instanceAssetURL
            });

            expect(result).not.toBeNull();

            const content = readFileSync(result.file, 'utf-8');

            expect(content).toContain('prefab-test-node-url');
        });

        it('reload - 通过 URL 重载预制体', async () => {
            expect(instanceAssetURL).toBeTruthy();

            const result = await EditorProxy.reload({
                urlOrUUID: instanceAssetURL
            });

            expect(result).toBe(ReloadResult.SUCCESS);
        });

        it('queryCurrent - 通过 URL 关闭后获取当前预制体应该为空', async () => {
            const result = await EditorProxy.queryCurrent();

            expect(result).not.toBeNull();
            expect(JSON.stringify(result)).toContain('prefab-test-node-url');
        });

        it('close - 通过 URL 关闭预制体', async () => {
            expect(instanceAssetURL).toBeTruthy();

            const result = await EditorProxy.close({
                urlOrUUID: instanceAssetURL
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

            const label = await ComponentProxy.addComponent({
                nodePath: node?.path as string,
                component: 'cc.Label'
            });
            await ComponentProxy.setProperty({
                componentPath: label.path,
                properties: {
                    string: 'abc-prefab'
                }
            });

            const result = await EditorProxy.save({});

            expect(result).not.toBeNull();

            const content = readFileSync(result.file, 'utf-8');

            expect(content).toContain('current-prefab-test-node');
            expect(content).toContain('abc-prefab');
        });

        it('reload - 重载当前预制体', async () => {
            const result = await EditorProxy.reload({});

            expect(result).toBe(ReloadResult.SUCCESS);
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
