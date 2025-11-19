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

        it('revertToPrefab - 还原 scale 但保留 position 和 rotation overrides', async () => {
            // 创建新节点用于测试
            const nodeName = 'PrefabRevertNode';
            const createParams: ICreateByNodeTypeParams = {
                path: '',
                name: nodeName,
                nodeType: NodeType.EMPTY,
            };

            const testNode = await NodeProxy.createNodeByType(createParams);
            expect(testNode).toBeTruthy();
            if (!testNode) return;

            // 创建预制体
            const revertPrefabURL = getURL('revert-prefab', '.prefab');
            const createPrefabParams: ICreatePrefabFromNodeParams = {
                nodePath: testNode.path,
                dbURL: revertPrefabURL,
            };

            const prefabNode = await PrefabProxy.createPrefabFromNode(createPrefabParams);
            expect(prefabNode).toBeTruthy();
            if (!prefabNode) return;

            const prefabNodePath = prefabNode.path;

            // 获取初始属性
            const initialQuery = await NodeProxy.queryNode({ path: prefabNodePath, queryChildren: false });
            expect(initialQuery).toBeTruthy();
            if (!initialQuery) return;

            const initialProps = initialQuery.properties;
            expect(initialProps).toBeTruthy();
            if (!initialProps) return;

            const originalName = initialQuery.name;

            // 第一步：设置 scale 为 5，并应用更改到预制体资源
            const appliedScale = {
                x: 5,
                y: 5,
                z: 5,
            };
            const appliedPosition = {
                x: 50,
                y: 50,
                z: 50,
            };
            const appliedRotation = {
                x: 0,
                y: 0,
                z: 1,
                w: 1,
            };
            const appliedName = `${originalName}-Renamed`;

            const firstUpdateResult = await NodeProxy.updateNode({
                path: prefabNodePath,
                name: appliedName,
                properties: {
                    position: appliedPosition,
                    rotation: appliedRotation,
                    scale: appliedScale,
                },
            });
            expect(firstUpdateResult).toBeTruthy();
            if (!firstUpdateResult) return;

            const updatedPrefabNodePath = firstUpdateResult.path;

            // 应用更改到预制体资源
            const applyParams: IApplyPrefabChangesParams = {
                nodePath: updatedPrefabNodePath,
            };

            const applyResult = await PrefabProxy.applyPrefabChanges(applyParams);
            expect(applyResult).toBe(true);

            // 第二步：再次设置 scale 为 10（不应用）
            const overriddenScale = {
                x: 10,
                y: 10,
                z: 10,
            };

            const overriddenPos = {
                x: 10,
                y: 10,
                z: 10,
            };

            const overriddenRotation = {
                x: 0,
                y: 0,
                z: 1.2,
                w: 1.2,
            };

            const secondUpdateResult = await NodeProxy.updateNode({
                path: updatedPrefabNodePath,
                properties: {
                    scale: overriddenScale,
                    position: overriddenPos,
                    rotation: overriddenRotation,
                },
            });
            expect(secondUpdateResult).toBeTruthy();
            if (!secondUpdateResult) return;

            // 还原更改
            const revertParams: IRevertToPrefabParams = {
                nodePath: updatedPrefabNodePath,
            };

            const queryNode = await NodeProxy.queryNode({ path: updatedPrefabNodePath, queryChildren: false });
            queryNode && console.log(queryNode.properties);

            const revertResult = await PrefabProxy.revertToPrefab(revertParams);
            expect(revertResult).toBe(true);

            // 验证还原后的属性
            const revertedQuery = await NodeProxy.queryNode({ path: updatedPrefabNodePath, queryChildren: false });
            expect(revertedQuery).toBeTruthy();
            if (!revertedQuery) return;

            const revertedProps = revertedQuery.properties;
            expect(revertedProps).toBeTruthy();
            if (!revertedProps) return;

            // scale 应该被还原到应用后的值（5），而不是当前值（10）或原始值（1）
            expect(revertedProps.scale).toEqual(appliedScale);
            // position 还是 revert 更新的数值
            expect(revertedProps.position).toEqual(overriddenPos);
            // rotation  还是 revert 更新的数值
            expect(revertedProps.rotation).toEqual(overriddenRotation);
            // name 应该保持不变（应用后的值）
            expect(revertedQuery.name).toBe(appliedName);
        });

        it('revertToPrefab - 保证子节点的 path 不变', async () => {
            // 创建父节点
            const parentNodeName = 'ParentNodeForRevert';
            const createParentParams: ICreateByNodeTypeParams = {
                path: '',
                name: parentNodeName,
                nodeType: NodeType.EMPTY,
            };

            const parentNode = await NodeProxy.createNodeByType(createParentParams);
            expect(parentNode).toBeTruthy();
            if (!parentNode) return;

            // 创建子节点
            const childNodeName = 'ChildNodeForRevert';
            const createChildParams: ICreateByNodeTypeParams = {
                path: parentNode.path,
                name: childNodeName,
                nodeType: NodeType.EMPTY,
            };

            const childNode = await NodeProxy.createNodeByType(createChildParams);
            expect(childNode).toBeTruthy();
            if (!childNode) return;

            // 将父节点转换为预制体
            const revertChildPrefabURL = getURL('revert-child-prefab', '.prefab');
            const createPrefabParams: ICreatePrefabFromNodeParams = {
                nodePath: parentNode.path,
                dbURL: revertChildPrefabURL,
            };

            const prefabNode = await PrefabProxy.createPrefabFromNode(createPrefabParams);
            expect(prefabNode).toBeTruthy();
            if (!prefabNode) return;

            const prefabNodePath = prefabNode.path;

            // 查询节点及其子节点，确认子节点存在（创建预制体后，父节点名称已改变，子节点 path 也会改变）
            const beforeRevertQuery = await NodeProxy.queryNode({ 
                path: prefabNodePath, 
                queryChildren: true 
            });
            expect(beforeRevertQuery).toBeTruthy();
            if (!beforeRevertQuery) return;

            expect(beforeRevertQuery.children).toBeDefined();
            expect(beforeRevertQuery.children?.length).toBeGreaterThan(0);

            // 找到子节点并记录其 path（创建预制体后的 path）
            const childBeforeRevert = beforeRevertQuery.children?.find(
                child => child.name === childNodeName
            );
            expect(childBeforeRevert).toBeDefined();
            if (!childBeforeRevert) return;

            // 记录创建预制体后、revert 之前的子节点 path
            const originalChildPath = childBeforeRevert.path;
            expect(originalChildPath).toBeTruthy();
            expect(originalChildPath).not.toBe('');

            // 修改父节点属性
            const updateResult = await NodeProxy.updateNode({
                path: prefabNodePath,
                properties: {
                    position: { x: 100, y: 100, z: 100 },
                },
            });
            expect(updateResult).toBeTruthy();

            // 执行 revertToPrefab
            const revertParams: IRevertToPrefabParams = {
                nodePath: prefabNodePath,
            };

            const revertResult = await PrefabProxy.revertToPrefab(revertParams);
            expect(revertResult).toBe(true);

            // 查询节点及其子节点，验证子节点的 path 保持不变
            const afterRevertQuery = await NodeProxy.queryNode({ 
                path: prefabNodePath, 
                queryChildren: true 
            });
            expect(afterRevertQuery).toBeTruthy();
            if (!afterRevertQuery) return;

            expect(afterRevertQuery.children).toBeDefined();
            expect(afterRevertQuery.children?.length).toBeGreaterThan(0);

            // 验证子节点的 path 保持不变且不为空（使用 path 查找，因为父节点 name 已变为预制体名称）
            const childAfterRevert = afterRevertQuery.children?.find(
                child => child.path === originalChildPath
            );
            expect(childAfterRevert).toBeDefined();
            if (!childAfterRevert) return;

            expect(childAfterRevert.path).toBe(originalChildPath);
            expect(childAfterRevert.path).not.toBe('');
            expect(childAfterRevert.path).toBeTruthy();
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

        it('unpackPrefabInstance - 对非预制体节点进行解包操作', async () => {
            // 创建普通节点（非预制体实例）
            const nodeName = 'NonPrefabUnpackNode';
            const createParams: ICreateByNodeTypeParams = {
                path: '',
                name: nodeName,
                nodeType: NodeType.EMPTY,
            };

            const normalNode = await NodeProxy.createNodeByType(createParams);
            expect(normalNode).toBeTruthy();
            if (!normalNode) return;

            // 对非预制体节点进行解包操作（应该不会抛出异常，会返回节点）
            const params: IUnpackPrefabInstanceParams = {
                nodePath: normalNode.path,
                recursive: false,
            };

            await expect(PrefabProxy.unpackPrefabInstance(params)).rejects.toThrow();
        });
    });

    describe('6. 预制体工作流集成测试', () => {
        it('完整的预制体工作流测试', async () => {
            // 1. 创建节点
            const nodeName = 'WorkflowNode';
            const createNodeParams: ICreateByNodeTypeParams = {
                path: '',
                name: nodeName,
                nodeType: NodeType.EMPTY,
            };

            const testNode = await NodeProxy.createNodeByType(createNodeParams);
            expect(testNode).toBeTruthy();
            if (!testNode) return;

            let nodePath = testNode.path;
            const basePos = testNode.properties.position;
            const baseScale = testNode.properties.scale ?? { x: 1, y: 1, z: 1 };

            // 2. 创建预制体
            const workflowPrefabURL = getURL('workflow-prefab', '.prefab');
            const createPrefabParams: ICreatePrefabFromNodeParams = {
                nodePath: nodePath,
                dbURL: workflowPrefabURL,
            };

            const createPrefabResult = await PrefabProxy.createPrefabFromNode(createPrefabParams);
            expect(createPrefabResult).toBeTruthy();
            if (!createPrefabResult) return;

            nodePath = createPrefabResult.path;

            // 3. 测试覆盖功能
            const overwriteParams: ICreatePrefabFromNodeParams = {
                nodePath: createPrefabResult.path,
                dbURL: workflowPrefabURL,
                overwrite: true,
            };

            const overwriteResult = await PrefabProxy.createPrefabFromNode(overwriteParams);
            expect(overwriteResult).toBeTruthy();

            // 4. 检查节点是否为预制体实例
            const isInstanceParams: IIsPrefabInstanceParams = {
                nodePath: nodePath,
            };

            const isInstanceResult = await PrefabProxy.isPrefabInstance(isInstanceParams);
            expect(isInstanceResult).toBe(true);

            // 5. 检查普通节点
            const anotherNodeName = 'AnotherNode';
            const anotherNodeParams: ICreateByNodeTypeParams = {
                path: '',
                name: anotherNodeName,
                nodeType: NodeType.EMPTY,
            };

            const anotherNode = await NodeProxy.createNodeByType(anotherNodeParams);
            expect(anotherNode).toBeTruthy();
            if (!anotherNode) return;

            const isNotInstanceParams: IIsPrefabInstanceParams = {
                nodePath: anotherNode.path,
            };

            const isNotInstanceResult = await PrefabProxy.isPrefabInstance(isNotInstanceParams);
            expect(isNotInstanceResult).toBe(false);

            // 6. 获取预制体信息
            const getInfoParams: IGetPrefabInfoParams = {
                nodePath: nodePath,
            };

            const getInfoResult = await PrefabProxy.getPrefabInfo(getInfoParams);
            expect(getInfoResult).not.toBeNull();
            if (getInfoResult) {
                expect(typeof getInfoResult.fileId).toBe('string');
            }

            // 7. 修改预制体实例
            const appliedScale = {
                x: baseScale.x + 0.5,
                y: baseScale.y + 0.5,
                z: baseScale.z + 0.5,
            };
            const appliedRotation = {
                x: 0,
                y: 0,
                z: 0.3826834,
                w: 0.9238795,
            };
            const renamedNode = `${nodeName}-Renamed`;

            const initialUpdateResult = await NodeProxy.updateNode({
                path: nodePath,
                name: renamedNode,
                properties: {
                    position: { x: 100, y: basePos.y, z: basePos.z },
                    rotation: appliedRotation,
                    scale: appliedScale,
                },
            });
            expect(initialUpdateResult).toBeTruthy();
            if (!initialUpdateResult) return;

            nodePath = initialUpdateResult.path ?? nodePath;

            // 8. 应用更改到预制体资源
            const applyChangesParams: IApplyPrefabChangesParams = {
                nodePath: nodePath,
            };

            const applyChangesResult = await PrefabProxy.applyPrefabChanges(applyChangesParams);
            expect(applyChangesResult).toBe(true);

            // 9. 再次修改预制体实例
            const changedScale = {
                x: appliedScale.x + 1,
                y: appliedScale.y + 1,
                z: appliedScale.z + 1,
            };
            const changedPosition = { x: 150, y: 200, z: (basePos.z ?? 0) + 25 };
            const changedRotation = {
                x: 0,
                y: 0,
                z: 0.7071068,
                w: 0.7071068,
            };

            const secondUpdateResult = await NodeProxy.updateNode({
                path: nodePath,
                properties: {
                    position: changedPosition,
                    rotation: changedRotation,
                    scale: changedScale,
                },
            });
            expect(secondUpdateResult).toBeTruthy();
            if (!secondUpdateResult) return;

            nodePath = secondUpdateResult.path ?? nodePath;

            // 10. 还原更改
            const revertParams: IRevertToPrefabParams = {
                nodePath: nodePath,
            };

            const revertResult = await PrefabProxy.revertToPrefab(revertParams);
            expect(revertResult).toBe(true);

            // 验证还原后的属性
            const queryNodeResult = await NodeProxy.queryNode({ path: nodePath, queryChildren: false });
            expect(queryNodeResult).not.toBeNull();
            if (queryNodeResult) {
                const props = queryNodeResult.properties;
                expect(props).toBeTruthy();
                if (!props) return;

                // scale 应该被还原为原始值（1）
                expect(props.scale).toEqual(appliedScale);
                // position 不会被 revert
                expect(props.position).toEqual(changedPosition);
                // rotation 不会被 revert
                expect(props.rotation).toEqual(changedRotation);
            }
            expect(queryNodeResult?.name).toBe(renamedNode);

            // 11. 解包预制体实例
            const unpackParams: IUnpackPrefabInstanceParams = {
                nodePath: nodePath,
                recursive: false,
            };

            const unpackResult = await PrefabProxy.unpackPrefabInstance(unpackParams);
            expect(unpackResult).toBeDefined();

            // 12. 验证不再是预制体实例
            const isUnpackedInstanceParams: IIsPrefabInstanceParams = {
                nodePath: nodePath,
            };

            const isUnpackedInstanceResult = await PrefabProxy.isPrefabInstance(isUnpackedInstanceParams);
            expect(isUnpackedInstanceResult).toBe(false);
        });

        it('嵌套预制体操作测试', async () => {
            // 创建父节点
            const parentNodeName = 'ParentNode';
            const parentNodeParams: ICreateByNodeTypeParams = {
                path: '',
                name: parentNodeName,
                nodeType: NodeType.EMPTY,
            };

            const parentNode = await NodeProxy.createNodeByType(parentNodeParams);
            expect(parentNode).toBeTruthy();
            if (!parentNode) return;

            // 创建子节点
            const childNodeName = 'ChildNode';
            const childNodeParams: ICreateByNodeTypeParams = {
                path: parentNode.path,
                name: childNodeName,
                nodeType: NodeType.EMPTY,
            };

            const childNode = await NodeProxy.createNodeByType(childNodeParams);
            expect(childNode).toBeTruthy();

            // 从父节点创建预制体（包含子节点）
            const nestedPrefabURL = getURL('nested-prefab', '.prefab');
            const createPrefabParams: ICreatePrefabFromNodeParams = {
                nodePath: parentNode.path,
                dbURL: nestedPrefabURL,
            };

            const createPrefabResult = await PrefabProxy.createPrefabFromNode(createPrefabParams);
            expect(createPrefabResult).toBeTruthy();
            if (!createPrefabResult) return;

            // 验证父节点是预制体实例
            const isParentInstanceParams: IIsPrefabInstanceParams = {
                nodePath: createPrefabResult.path,
            };

            const isParentInstanceResult = await PrefabProxy.isPrefabInstance(isParentInstanceParams);
            expect(isParentInstanceResult).toBe(true);
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
            await expect(PrefabProxy.createPrefabFromNode(params1)).rejects.toThrow();
        });

        it('测试对已解包的节点进行 applyChanges 操作', async () => {
            // 创建节点
            const nodeName = 'UnpackedNode';
            const createNodeParams: ICreateByNodeTypeParams = {
                path: '',
                name: nodeName,
                nodeType: NodeType.EMPTY,
            };

            const testNode = await NodeProxy.createNodeByType(createNodeParams);
            expect(testNode).toBeTruthy();
            if (!testNode) return;

            // 创建预制体
            const unpackedPrefabURL = getURL('unpacked-prefab', '.prefab');
            const createPrefabParams: ICreatePrefabFromNodeParams = {
                nodePath: testNode.path,
                dbURL: unpackedPrefabURL,
            };

            const prefabNode = await PrefabProxy.createPrefabFromNode(createPrefabParams);
            expect(prefabNode).toBeTruthy();
            if (!prefabNode) return;

            const prefabNodePath = prefabNode.path;

            // 解包预制体
            const unpackParams: IUnpackPrefabInstanceParams = {
                nodePath: prefabNodePath,
                recursive: false,
            };

            const unpackResult = await PrefabProxy.unpackPrefabInstance(unpackParams);
            expect(unpackResult).toBeDefined();

            // 尝试对已解包的节点应用更改（应该失败）
            const applyParams: IApplyPrefabChangesParams = {
                nodePath: prefabNodePath,
            };

            await expect(PrefabProxy.applyPrefabChanges(applyParams)).rejects.toThrow();
        });

        it('测试多次应用和还原操作', async () => {
            // 创建节点
            const nodeName = 'MultiOpNode';
            const createNodeParams: ICreateByNodeTypeParams = {
                path: '',
                name: nodeName,
                nodeType: NodeType.EMPTY,
            };

            const testNode = await NodeProxy.createNodeByType(createNodeParams);
            expect(testNode).toBeTruthy();
            if (!testNode) return;

            const basePos = testNode.properties.position;

            // 创建预制体
            const multiOpPrefabURL = getURL('multi-op-prefab', '.prefab');
            const createPrefabParams: ICreatePrefabFromNodeParams = {
                nodePath: testNode.path,
                dbURL: multiOpPrefabURL,
            };

            const prefabNode = await PrefabProxy.createPrefabFromNode(createPrefabParams);
            expect(prefabNode).toBeTruthy();
            if (!prefabNode) return;

            const prefabNodePath = prefabNode.path;

            // 多次修改和应用
            for (let i = 0; i < 3; i++) {
                const updateResult = await NodeProxy.updateNode({
                    path: prefabNodePath,
                    properties: {
                        position: {
                            x: (basePos.x ?? 0) + 100 + i * 10,
                            y: (basePos.y ?? 0) + i * 10,
                            z: basePos.z ?? 0
                        },
                    },
                });
                expect(updateResult).toBeTruthy();

                const applyParams: IApplyPrefabChangesParams = {
                    nodePath: prefabNodePath,
                };

                const applyResult = await PrefabProxy.applyPrefabChanges(applyParams);
                expect(applyResult).toBe(true);
            }

            // 修改后还原
            const finalUpdateResult = await NodeProxy.updateNode({
                path: prefabNodePath,
                properties: {
                    position: { x: 999, y: 999, z: basePos.z ?? 0 },
                },
            });
            expect(finalUpdateResult).toBeTruthy();

            const revertParams: IRevertToPrefabParams = {
                nodePath: prefabNodePath,
            };

            const revertResult = await PrefabProxy.revertToPrefab(revertParams);
            expect(revertResult).toBe(true);
        });
    });
});
