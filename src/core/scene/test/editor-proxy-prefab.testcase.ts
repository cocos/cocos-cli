import { IBaseIdentifier, INodeInfo, INodeIdentifier, IComponentIdentifier, NodeType, ReloadResult } from '../common';
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
        let entity: INodeInfo | null = null;
        let currentPrefabFile = '';

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

            const result = await EditorProxy.open({ urlOrUUID: instanceAssetURL }) as INodeInfo;

            expect(result).toBeTruthy();
            expect(result?.prefab).toBeTruthy();
            expect(result?.prefab?.asset).toBeTruthy();
            expect(result.prefab?.asset?.uuid).toBe(identifier?.assetUuid);
        });

        it('save - 通过 UUID 保存预制体', async () => {
            expect(identifier).toBeTruthy();

            await NodeProxy.createByType({
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


            entity = await EditorProxy.open({ urlOrUUID: instanceAssetURL }) as INodeInfo;

            expect(entity).toBeTruthy();
            expect(entity?.prefab).toBeTruthy();
            expect(entity?.prefab?.asset).toBeTruthy();

            const url = assetManager.queryUrl(entity.prefab?.asset?.uuid as string);

            expect(url).toBe(instanceAssetURL);
        });

        it('save - 通过 URL 保存预制体', async () => {
            expect(instanceAssetURL).toBeTruthy();

            await NodeProxy.createByType({
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

            const node = await NodeProxy.createByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'current-prefab-test-node',
            });

            expect(node).not.toBeNull();

            const label = await ComponentProxy.add({
                nodePath: node?.path as string,
                component: 'cc.Label'
            });
            // 预制体内组件的 prefab 字段应由 encodeComponent 写入，不为 null
            expect(label.prefab).not.toBeNull();
            await ComponentProxy.setProperty({
                componentPath: label.path,
                properties: {
                    string: 'abc-prefab'
                }
            });

            const result = await EditorProxy.save({});

            expect(result).not.toBeNull();
            currentPrefabFile = result.file;

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

        it('close - 不保存地关闭当前预制体', async () => {
            await NodeProxy.createByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'discard-current-prefab-test-node',
            });

            const result = await EditorProxy.close({
                save: false,
            });

            expect(result).toBe(true);

            const content = readFileSync(currentPrefabFile, 'utf-8');
            expect(content).not.toContain('discard-current-prefab-test-node');
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

    describe('open - includeChildren / includeComponents 参数测试', () => {
        beforeAll(async () => {
            await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL });
        });

        afterAll(async () => {
            await EditorProxy.close({ urlOrUUID: SceneTestEnv.prefabURL });
        });

        it('open - includeChildren:true 时 children 有数据', async () => {
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeChildren: true }) as INodeInfo;
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
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeChildren: false }) as INodeInfo;
            expect(result.children).toBeUndefined();
        });

        it('open - includeComponents:true 时 components 有数据', async () => {
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeComponents: true }) as INodeInfo;
            expect(result.components).toBeDefined();
            expect(Array.isArray(result.components)).toBe(true);
            if (result.components && result.components.length > 0) {
                const comp: IComponentIdentifier = result.components[0];
                expect(comp.type).toBeDefined();
                expect(comp.type).not.toBe('');
                expect(comp.uuid).toBeDefined();
                expect(comp.name).toBeDefined();
                expect(comp.cid).toBeDefined();
                expect(typeof comp.enabled).toBe('boolean');
            }
        });

        it('open - includeComponents:false 时 components 为 undefined', async () => {
            const result = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeComponents: false }) as INodeInfo;
            expect(result.components).toBeUndefined();
        });
    });

    describe('reload - _lastOpenOptions 保持（open 选项在 reload 后保持一致）', () => {
        beforeAll(async () => {
            await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL });
        });

        afterAll(async () => {
            await EditorProxy.close({ urlOrUUID: SceneTestEnv.prefabURL });
        });

        it('reload 后以 includeChildren:false re-open，children 仍为 undefined', async () => {
            const before = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeChildren: false }) as INodeInfo;
            expect(before.children).toBeUndefined();

            const reloadResult = await EditorProxy.reload({ urlOrUUID: SceneTestEnv.prefabURL });
            expect(reloadResult).toBe(ReloadResult.SUCCESS);

            const after = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeChildren: false }) as INodeInfo;
            expect(after.children).toBeUndefined();
        });

        it('reload 后以 includeComponents:true re-open，components 有数据', async () => {
            const before = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeComponents: true }) as INodeInfo;
            expect(before.components).toBeDefined();
            expect(Array.isArray(before.components)).toBe(true);

            // reload 内部以 _lastOpenOptions({ includeComponents:true }) 调用 encode，不应崩溃
            const reloadResult = await EditorProxy.reload({ urlOrUUID: SceneTestEnv.prefabURL });
            expect(reloadResult).toBe(ReloadResult.SUCCESS);

            const after = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeComponents: true }) as INodeInfo;
            expect(after.components).toBeDefined();
            expect(Array.isArray(after.components)).toBe(true);
        });

        it('reload 后以 includeComponents:false re-open，components 为 undefined', async () => {
            const before = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeComponents: false }) as INodeInfo;
            expect(before.components).toBeUndefined();

            const reloadResult = await EditorProxy.reload({ urlOrUUID: SceneTestEnv.prefabURL });
            expect(reloadResult).toBe(ReloadResult.SUCCESS);

            const after = await EditorProxy.open({ urlOrUUID: SceneTestEnv.prefabURL, includeComponents: false }) as INodeInfo;
            expect(after.components).toBeUndefined();
        });
    });
});
