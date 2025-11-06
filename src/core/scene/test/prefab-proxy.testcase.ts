import { SceneTestEnv } from './scene-test-env';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { PrefabProxy } from '../main-process/proxy/prefab-proxy';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import type {
    ICreatePrefabFromNodeParams,
    IApplyPrefabChangesParams,
    IRevertToPrefabParams,
    IUnpackPrefabInstanceParams,
    IIsPrefabInstanceParams,
    IGetPrefabInfoParams,
    ICreateByNodeTypeParams,
    ICreateByAssetParams,
    INode,
    IPrefabInfo
} from '../common';
import { NodeType } from '../common';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import * as fse from 'fs-extra';
import * as path from 'path';
import { assetManager } from '../../assets';

describe('Prefab Proxy In Scene 测试', () => {

    const testDirName = 'prefab-proxy-in-scene';
    const testDir = path.join(SceneTestEnv.cacheDirectory, testDirName);
    const testDirURL = `${SceneTestEnv.targetDirectoryURL}/${testDirName}`;
    const SceneBaseName = 'prefab-proxy-in-scene';
    const SceneURL = getURL(SceneBaseName, '.scene');

    function getURL(name: string, ext: string): string {
        return `${testDirURL}/${name}${ext}`;
    }

    let testNodePath = '';
    let testNodePrefabNode: INode | null = null;// TestPrefabNode 转换成的 prefab node
    let duplicateURL = '';

    const prefabAssetName = 'TestPrefab';
    const prefabAssetURL = getURL(prefabAssetName, '.prefab');

    const position = {
        x: 9,
        y: 9,
        z: 9
    };
    const contentSize = {
        width: 100,
        height: 100
    };

    beforeAll(async () => {
        if (!fse.existsSync(testDir)) {
            fse.ensureDirSync(testDir);
            await assetManager.refreshAsset(testDir);
        }

        await EditorProxy.create({
            type: 'scene',
            baseName: SceneBaseName,
            targetDirectory: testDirURL
        });
        await EditorProxy.open({
            urlOrUUID: SceneURL
        });
    });

    afterAll(async () => {
        await EditorProxy.close({
            urlOrUUID: SceneURL
        });
        try {
            fse.removeSync(testDir);
            fse.removeSync(testDir + '.meta');
        } catch (e) { }
    });

    describe('1. 预制体创建测试', () => {
        it('createPrefabFromNode - 创建普通节点用于转换为预制体', async () => {
            const createParams: ICreateByNodeTypeParams = {
                path: '/TestPrefabNode',
                name: 'TestPrefabNode',
                nodeType: NodeType.SPRITE,
                position: { x: 10, y: 20, z: 0 }
            };

            const testNode = await NodeProxy.createNodeByType(createParams);
            expect(testNode).toBeDefined();
            expect(testNode?.name).toBe('TestPrefabNode');
            if (testNode) {
                testNodePath = testNode.path;
            }
        });

        it('createPrefabFromNode - 参数验证测试', async () => {
            // 测试空节点路径
            const invalidParams1: ICreatePrefabFromNodeParams = {
                nodePath: '',
                dbURL: prefabAssetURL
            };

            await expect(PrefabProxy.createPrefabFromNode(invalidParams1)).rejects.toThrow();

            // 测试空资源URL
            const invalidParams2: ICreatePrefabFromNodeParams = {
                nodePath: testNodePath || '',
                dbURL: ''
            };

            await expect(PrefabProxy.createPrefabFromNode(invalidParams2)).rejects.toThrow();

            // 测试无效的资源 URL 格式
            const invalidParams3: ICreatePrefabFromNodeParams = {
                nodePath: testNodePath || '',
                dbURL: 'invalid-url'
            };

            await expect(PrefabProxy.createPrefabFromNode(invalidParams3)).rejects.toThrow();
        });

        it('createPrefabFromNode - 将节点转换为预制体资源', async () => {
            expect(testNodePath).toBeTruthy();

            const params: ICreatePrefabFromNodeParams = {
                nodePath: testNodePath,
                dbURL: prefabAssetURL,
                overwrite: true
            };

            testNodePrefabNode = await PrefabProxy.createPrefabFromNode(params);
            expect(testNodePrefabNode).toBeDefined();
            expect(testNodePrefabNode?.prefab).toBeDefined();
            // 最终节点名，是根据 url 的名字来的
            expect(testNodePrefabNode?.name).toBe(prefabAssetName);
        });
    });

    describe('2. 预制体实例测试', () => {
        it('是否能通过 createPrefabFromNode 创建的预制体资源进程创建节点', async () => {
            const createParams: ICreateByAssetParams = {
                dbURL: prefabAssetURL,
                path: '',
                name: 'PrefabInstanceNode-CreatePrefabFromNode'
            };

            const prefabInstanceNode = await NodeProxy.createNodeByAsset(createParams);
            expect(prefabInstanceNode).toBeDefined();
            expect(prefabInstanceNode?.prefab).toBeDefined();
            expect(prefabInstanceNode?.prefab?.asset).toBeDefined();
            expect(prefabInstanceNode?.name).toBe('PrefabInstanceNode-CreatePrefabFromNode');
        });

        it('isPrefabInstance - 检查节点是否为预制体实例', async () => {
            expect(testNodePrefabNode).toBeTruthy();
            if (testNodePrefabNode) {
                const params: IIsPrefabInstanceParams = {
                    nodePath: testNodePrefabNode.path
                };

                const isPrefab = await PrefabProxy.isPrefabInstance(params);
                expect(isPrefab).toBe(true);
            }

            // 测试普通节点
            const createParams: ICreateByNodeTypeParams = {
                path: '',
                name: 'TestPrefabNode-isPrefabInstance',
                nodeType: NodeType.SPRITE,
                position: { x: 10, y: 20, z: 0 }
            };

            const normalNode = await NodeProxy.createNodeByType(createParams);
            expect(normalNode).toBeTruthy();

            const params: IIsPrefabInstanceParams = {
                nodePath: normalNode?.path as string
            };

            const isPrefab = await PrefabProxy.isPrefabInstance(params);
            expect(isPrefab).toBe(false);
        });

        it('isPrefabInstance - 参数验证测试', async () => {
            const invalidParams: IIsPrefabInstanceParams = {
                nodePath: ''
            };

            await expect(PrefabProxy.isPrefabInstance(invalidParams)).rejects.toThrow();

        });

        it('getPrefabInfo - 获取节点的预制体信息', async () => {
            expect(testNodePrefabNode).toBeTruthy();
            if (testNodePrefabNode) {
                const params: IGetPrefabInfoParams = {
                    nodePath: testNodePrefabNode.path
                };

                const prefabInfo: IPrefabInfo | null = await PrefabProxy.getPrefabInfo(params);
                expect(prefabInfo).toBeDefined();
                if (prefabInfo) {
                    expect(prefabInfo.fileId).toBeDefined();
                }
            }

            // 测试普通节点
            const createParams: ICreateByNodeTypeParams = {
                path: '',
                name: 'TestPrefabNode-getPrefabInfo',
                nodeType: NodeType.SPRITE,
                position: { x: 10, y: 20, z: 0 }
            };

            const normalNode = await NodeProxy.createNodeByType(createParams);
            expect(normalNode).toBeTruthy();

            const params: IGetPrefabInfoParams = {
                nodePath: normalNode?.path as string
            };

            const prefabInfo = await PrefabProxy.getPrefabInfo(params);
            expect(prefabInfo).toBeNull();
        });

        it('getPrefabInfo - 参数验证测试', async () => {
            const invalidParams: IGetPrefabInfoParams = {
                nodePath: ''
            };

            await expect(PrefabProxy.getPrefabInfo(invalidParams)).rejects.toThrow();

        });
    });

    describe('3. 预制体修改和应用测试', () => {
        it('修改预制体实例与身上组件的属性', async () => {
            expect(testNodePrefabNode).toBeTruthy();
            if (testNodePrefabNode) {
                const uNode = await NodeProxy.updateNode({
                    path: testNodePrefabNode.path,
                    properties: {
                        position: position
                    },
                });

                expect(uNode).toBeTruthy();
                const node = await NodeProxy.queryNode({ path: uNode?.path as string, queryChildren: false });

                expect(node).toBeTruthy();
                expect(node?.components?.length).toBeGreaterThan(0);

                const path = node && node.components && node.components[0].path || '';
                expect(path).toBeTruthy();

                const done = await ComponentProxy.setProperty({
                    componentPath: path,
                    properties: {
                        contentSize: contentSize
                    }
                });

                expect(done).toBe(true);
            }
        });

        it('applyPrefabChanges - 参数验证测试', async () => {
            const invalidParams: IApplyPrefabChangesParams = {
                nodePath: ''
            };

            await expect(PrefabProxy.applyPrefabChanges(invalidParams)).rejects.toThrow();

            // 测试普通节点
            const createParams: ICreateByNodeTypeParams = {
                path: '',
                name: 'TestPrefabNode-applyPrefabChanges',
                nodeType: NodeType.SPRITE,
                position: { x: 10, y: 20, z: 0 }
            };

            const normalNode = await NodeProxy.createNodeByType(createParams);
            expect(normalNode).toBeTruthy();
            if (normalNode) {
                const params: IApplyPrefabChangesParams = {
                    nodePath: normalNode.path
                };

                await expect(PrefabProxy.applyPrefabChanges(params)).rejects.toThrow();
            }
        });

        it('applyPrefabChanges - 将节点的修改应用回预制体资源', async () => {
            expect(testNodePrefabNode).toBeTruthy();
            if (testNodePrefabNode) {
                const params: IApplyPrefabChangesParams = {
                    nodePath: testNodePrefabNode.path
                };

                const result = await PrefabProxy.applyPrefabChanges(params);
                expect(result).toBe(true);

                const createParams: ICreateByAssetParams = {
                    dbURL: prefabAssetURL,
                    path: '',
                    name: 'PrefabInstanceNode-applyPrefabChanges'
                };

                const prefabInstanceNode = await NodeProxy.createNodeByAsset(createParams);
                expect(prefabInstanceNode).toBeTruthy();
                expect(prefabInstanceNode?.properties.position).toEqual(position);
                expect(prefabInstanceNode?.components?.length).toBeGreaterThan(0);

                const path = prefabInstanceNode && prefabInstanceNode.components && prefabInstanceNode.components[0].path || '';
                expect(path).toBeTruthy();

                const component = await ComponentProxy.queryComponent({
                    path: path,
                });

                expect(prefabInstanceNode).toBeTruthy();
                expect(component?.properties.contentSize.value).toEqual(contentSize);
            }
        });

        it('revertToPrefab - 参数验证测试', async () => {
            const invalidParams: IRevertToPrefabParams = {
                nodePath: ''
            };

            await expect(PrefabProxy.revertToPrefab(invalidParams)).rejects.toThrow();

            // 测试普通节点
            const createParams: ICreateByNodeTypeParams = {
                path: '',
                name: 'TestPrefabNode-revertToPrefab',
                nodeType: NodeType.SPRITE,
                position: { x: 10, y: 20, z: 0 }
            };

            const normalNode = await NodeProxy.createNodeByType(createParams);
            expect(normalNode).toBeTruthy();
            if (normalNode) {
                const params: IRevertToPrefabParams = {
                    nodePath: normalNode.path
                };

                const done = await PrefabProxy.revertToPrefab(params);
                expect(done).toBe(false);
            }
        });

        it('revertToPrefab - 重置节点到预制体原始状态', async () => {
            expect(testNodePrefabNode).toBeTruthy();
            if (testNodePrefabNode) {

                const node = await NodeProxy.queryNode({ path: testNodePrefabNode.path, queryChildren: false });
                expect(node).toBeTruthy();
                if (!node) return;

                const uNode = await NodeProxy.updateNode({
                    path: testNodePrefabNode.path,
                    properties: {
                        position: position
                    },
                });
                expect(uNode).toBeTruthy();

                const path = uNode?.path || '';
                expect(path).toBeTruthy();

                const params: IRevertToPrefabParams = {
                    nodePath: path
                };

                const result = await PrefabProxy.revertToPrefab(params);
                expect(result).toBe(true);

                const node2 = await NodeProxy.queryNode({ path: path, queryChildren: false });
                expect(node.properties.position).toEqual(node2?.properties.position);
            }
        });
    });

    describe('4. 预制体解耦测试', () => {
        it('unpackPrefabInstance - 解耦预制体实例，使其成为普通节点', async () => {
            expect(testNodePrefabNode).toBeTruthy();
            if (testNodePrefabNode) {
                const params: IUnpackPrefabInstanceParams = {
                    nodePath: testNodePrefabNode.path,
                    recursive: true
                };

                const unpackedNode: INode | null = await PrefabProxy.unpackPrefabInstance(params);
                expect(unpackedNode).toBeTruthy();
                if (!unpackedNode) return;

                expect(unpackedNode.path).toBe(testNodePrefabNode.path);

                // 验证解耦后不再是预制体实例
                const isPrefabAfterUnpack = await PrefabProxy.isPrefabInstance({
                    nodePath: unpackedNode.path
                });
                expect(isPrefabAfterUnpack).toBe(false);
            }
        });

        it('unpackPrefabInstance - 参数验证测试', async () => {
            const invalidParams: IUnpackPrefabInstanceParams = {
                nodePath: ''
            };
            await expect(PrefabProxy.unpackPrefabInstance(invalidParams)).rejects.toThrow();
        });

        it('unpackPrefabInstance - 非递归解耦测试', async () => {
            // 创建另一个预制体实例用于非递归测试
            if (testNodePrefabNode) {
                const createParams: ICreateByAssetParams = {
                    dbURL: prefabAssetURL,
                    path: '/PrefabInstance2',
                    name: 'PrefabInstanceNode2'
                };

                const prefabInstance2 = await NodeProxy.createNodeByAsset(createParams);
                expect(prefabInstance2).toBeDefined();

                if (prefabInstance2) {
                    const params: IUnpackPrefabInstanceParams = {
                        nodePath: prefabInstance2.path,
                        recursive: false
                    };

                    const unpackedNode = await PrefabProxy.unpackPrefabInstance(params);
                    expect(unpackedNode).toBeDefined();
                }
            }
        });
    });

    describe('5. 边界情况和错误处理测试', () => {
        it('测试不存在的节点路径', async () => {
            const nonExistentPath = '/NonExistentNode';

            await expect(PrefabProxy.isPrefabInstance({ nodePath: nonExistentPath }))
                .rejects.toThrow();

            await expect(PrefabProxy.getPrefabInfo({ nodePath: nonExistentPath }))
                .rejects.toThrow();

            await expect(PrefabProxy.applyPrefabChanges({ nodePath: nonExistentPath }))
                .rejects.toThrow();

            await expect(PrefabProxy.revertToPrefab({ nodePath: nonExistentPath }))
                .rejects.toThrow();

            await expect(PrefabProxy.unpackPrefabInstance({ nodePath: nonExistentPath }))
                .rejects.toThrow();
        });

        it('测试无效的预制体URL格式', async () => {
            expect(testNodePrefabNode).toBeTruthy();

            const invalidURLs = [
                'invalid-url',
                'db://invalid.txt',
                'http://example.com/test.prefab',
                'db://assets/test', // 缺少.prefab后缀
            ];

            for (const invalidURL of invalidURLs) {
                const params: ICreatePrefabFromNodeParams = {
                    nodePath: testNodePrefabNode?.path as string,
                    dbURL: invalidURL
                };
                await expect(PrefabProxy.createPrefabFromNode(params)).rejects.toThrow();
            }
        });

        it('测试重复创建预制体（覆盖测试）', async () => {
            const node = await NodeProxy.createNodeByType({
                path: '',
                nodeType: NodeType.EMPTY,
                name: 'Duplicate-Node'
            });
            expect(node).toBeTruthy();
            if (!node) return;

            duplicateURL = getURL(node.name, '.prefab');
            // 第一次创建
            const params1: ICreatePrefabFromNodeParams = {
                nodePath: node.path,
                dbURL: duplicateURL,
                overwrite: false
            };
            const result1 = await PrefabProxy.createPrefabFromNode(params1);
            expect(result1).toBeTruthy();
            if (!result1) return;

            // 允许覆盖，成功并同名
            const params2: ICreatePrefabFromNodeParams = {
                nodePath: node.path,
                dbURL: duplicateURL,
                overwrite: true
            };
            const result3 = await PrefabProxy.createPrefabFromNode(params2);
            expect(result3).toBeTruthy();
            if (!result3) return;

            expect(result3.name).toBe(result1.name);

            // 不覆盖，成功会改名 -001
            const result2 = await PrefabProxy.createPrefabFromNode(params1);
            expect(result2).toBeTruthy();
            if (!result2) return;

            expect(result2.name).toBe(`${result1.name}-001`);
        });
    });
});