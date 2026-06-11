import {
    type ICreateByAssetParams,
    type ICreateByNodeTypeParams,
    type IDeleteNodeParams,
    type IQueryNodeParams,
    type IQueryNodeTreeParams,
    type IUpdateNodeParams,
    type INodeInfo,
    NodeType,
    MobilityMode,
} from '../common';
import { IVec3 } from '../common/value-types';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { SceneTestEnv } from './scene-test-env';
import { EditorProxy } from '../main-process/proxy/editor-proxy';

describe('Node Proxy 测试', () => {
    let createdNode: INodeInfo | null = null;
    const testNodePath = '/TestNode';
    const testPosition: IVec3 = { x: 1, y: 2, z: 0 };

    beforeAll(async () => {
        await EditorProxy.open({
            urlOrUUID: SceneTestEnv.sceneURL
        });
    });

    afterAll(async () => {
        await EditorProxy.close({
            urlOrUUID: SceneTestEnv.sceneURL
        });
    });

    describe('1. 基础节点操作', () => {
        it('createByType - 创建多级父节点的节点', async () => {
            const multiParentPath = 'Canvas/TestNode/TestNode2/TestNode3';
            const params: ICreateByNodeTypeParams = {
                path: multiParentPath,
                name: 'TestNode',
                nodeType: NodeType.SPRITE,
                position: testPosition
            };

            createdNode = await NodeProxy.createByType(params);
            expect(createdNode).toBeDefined();
            expect(createdNode?.name).toBe('TestNode');
            expect(createdNode?.path).toBe(multiParentPath + '/TestNode');
        });


        it('createByAsset - 创建带预制体的节点', async () => {

            const params: ICreateByAssetParams = {
                dbURL: 'db://internal/default_prefab/ui/Label.prefab',
                path: testNodePath,
                name: 'PrefabNode',
            };

            const prefabNode = await NodeProxy.createByAsset(params);
            expect(prefabNode).toBeDefined();
            expect(prefabNode?.name).toBe('PrefabNode');
            console.log('Created prefab node path=', prefabNode?.path);
        });

        it('createByType - 创建新节点', async () => {
            const params: ICreateByNodeTypeParams = {
                path: testNodePath,
                name: 'TestNode',
                nodeType: NodeType.SPRITE,
                position: testPosition
            };

            createdNode = await NodeProxy.createByType(params);
            expect(createdNode).toBeDefined();
            expect(createdNode?.name).toBe('TestNode');
            // 会在根节点下先创建 TestNode 再创建 Canvas/TestNode (SPRITE 节点会在 Canvas 下创建， 节点重名为 'TestNode')
            expect(createdNode?.path).toBe('TestNode/Canvas/TestNode');
            expect(createdNode?.properties.position).toEqual(testPosition);
            console.log('Created node original path=', testNodePath, ' dest path=', createdNode?.path);
        });
    });

    describe('2. 节点查询操作（依赖创建的节点）', () => {
        it('query - 查询节点基本信息', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: true
                };

                const result = await NodeProxy.query(params) as INodeInfo | null;
                expect(result).toBeDefined();
                expect(result?.path).toBe('TestNode/Canvas/TestNode');
                expect(result?.name).toBe('TestNode');
            }
        });

        it('query - 查询节点及子节点信息', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: true,
                    queryComponent: false
                };

                const result = await NodeProxy.query(params) as INodeInfo | null;
                expect(result).toBeDefined();
            }
        });

        it('query - 不传参数返回场景根节点 INodeInfo', async () => {
            const result = await NodeProxy.query();
            expect(result).not.toBeNull();
            const node = result as INodeInfo;
            expect(node.nodeId).toBeDefined();
            expect(node.path).toBe('/');
            expect(node.properties).toBeDefined();
            expect(node.children).toBeDefined();
            expect(Array.isArray(node.children)).toBe(true);
        });

        it('query - 传入 "/" 返回场景根节点 INodeInfo', async () => {
            const result = await NodeProxy.query({ path: '/', queryChildren: false, queryComponent: false });
            expect(result).not.toBeNull();
            const node = result as INodeInfo;
            expect(node.nodeId).toBeDefined();
            expect(node.path).toBe('/');
            expect(node.properties).toBeDefined();
        });

        it('query - queryComponent:true 返回组件详细信息', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const result = await NodeProxy.query({
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: true,
                }) as INodeInfo | null;
                expect(result).toBeDefined();
                expect(result?.components).toBeDefined();
                expect(Array.isArray(result?.components)).toBe(true);
                expect(result!.components!.length).toBeGreaterThan(0);
                for (const comp of result!.components!) {
                    // component_path 正确写入并经 DumpConverter 转换为 path
                    expect(comp.path).toBeTruthy();
                    expect(comp.path.startsWith(createdNode.path)).toBe(true);
                }
            }
        });

        it('query - queryChildren:true queryComponent:true 同时查询', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const result = await NodeProxy.query({
                    path: createdNode.path,
                    queryChildren: true,
                    queryComponent: true,
                }) as INodeInfo | null;
                expect(result).toBeDefined();
                expect(result?.components).toBeDefined();
                expect(result!.components!.length).toBeGreaterThan(0);
                for (const comp of result!.components!) {
                    expect(comp.path).toBeTruthy();
                    expect(comp.path.startsWith(createdNode.path)).toBe(true);
                }
            }
        });
    });


    describe('3. 节点更新操作（依赖创建的节点）', () => {
        it('update - 更新节点位置', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const newPosition: IVec3 = { x: 5, y: 5, z: 5 };
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    name: 'TestNode',
                    properties: {
                        position: newPosition
                    }
                };

                const result = await NodeProxy.update(params);
                expect(result).toBeDefined();
                expect(result?.path).toBe(createdNode.path);

                // 验证更新是否生效
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: true
                };
                const updatedNode = await NodeProxy.query(queryParams) as INodeInfo | null;
                expect(updatedNode?.properties.position).toEqual(newPosition);
            }
        });

        it('update - 更新节点激活状态', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    name: 'TestNode',
                    properties: {
                        active: false
                    }
                };

                const result = await NodeProxy.update(params);
                expect(result).toBeDefined();

                // 验证更新是否生效
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: true
                };
                const updatedNode = await NodeProxy.query(queryParams) as INodeInfo | null;
                expect(updatedNode?.properties.active).toBe(false);
            }
        });

        it('update - 更新节点旋转和缩放', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const newScale: IVec3 = { x: 2, y: 2, z: 2 };
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    name: 'TestNode',
                    properties: {
                        scale: newScale,
                        rotation: { x: 0, y: 45, z: 0 }
                    }
                };

                const result = await NodeProxy.update(params);
                expect(result).toBeDefined();

                // 验证更新是否生效
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: true
                };
                const updatedNode = await NodeProxy.query(queryParams) as INodeInfo | null;
                expect(updatedNode?.properties.scale).toEqual(newScale);
            }
        });

        it('update - 更新节点名称', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    name: 'RenamedTestNode',
                };

                const result = await NodeProxy.update(params);
                expect(result).toBeDefined();

                const queryParams: IQueryNodeParams = {
                    path: result.path,
                    queryChildren: false,
                    queryComponent: false,
                };
                const updatedNode = await NodeProxy.query(queryParams) as INodeInfo | null;
                expect(updatedNode?.name).toBe('RenamedTestNode');
                createdNode = updatedNode;
            }
        });

        it('update - 更新节点 mobility', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    properties: {
                        mobility: MobilityMode.Movable,
                    },
                };

                const result = await NodeProxy.update(params);
                expect(result).toBeDefined();

                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: false,
                };
                const updatedNode = await NodeProxy.query(queryParams) as INodeInfo | null;
                expect(updatedNode?.properties.mobility).toBe(MobilityMode.Movable);
            }
        });

        it('update - 更新节点 layer', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const targetLayer = 1 << 25;
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    properties: {
                        layer: targetLayer,
                    },
                };

                const result = await NodeProxy.update(params);
                expect(result).toBeDefined();

                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: false,
                };
                const updatedNode = await NodeProxy.query(queryParams) as INodeInfo | null;
                expect(updatedNode?.properties.layer).toBe(targetLayer);
            }
        });
    });

    describe('4. 节点删除操作（依赖创建的节点）', () => {
        it('delete - 删除节点（不保持世界变换）', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IDeleteNodeParams = {
                    path: createdNode.path,
                    keepWorldTransform: false
                };

                const result = await NodeProxy.delete(params);
                expect(result).toBeDefined();
                expect(result?.path).toBe(createdNode.path);

                // 验证节点是否已被删除
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false,
                    queryComponent: true
                };
                const deletedNode = await NodeProxy.query(queryParams) as INodeInfo | null;
                expect(deletedNode).toBeNull();

                createdNode = null;
            }
        });

        it('delete - 删除节点（保持世界变换）', async () => {
            // 先创建一个新节点用于删除测试
            const createParams: ICreateByNodeTypeParams = {
                path: 'NodeToDelete',
                name: 'NodeToDelete',
                nodeType: NodeType.SPHERE,
                workMode: '3d'
            };

            const tempNode = await NodeProxy.createByType(createParams);
            expect(tempNode).toBeDefined();

            // 删除该节点
            const deleteParams: IDeleteNodeParams = {
                path: tempNode!.path,
                keepWorldTransform: true
            };

            const result = await NodeProxy.delete(deleteParams);
            expect(result).toBeDefined();
            expect(result?.path).toBe('NodeToDelete/NodeToDelete');
        });
    });

    describe('5. 边界情况测试', () => {
        it('query - 查询不存在的节点应返回null', async () => {
            const params: IQueryNodeParams = {
                path: '/NonExistentNode',
                queryChildren: false,
                queryComponent: false
            };

            const result = await NodeProxy.query(params) as INodeInfo | null;
            expect(result).toBeNull();
        });

        it('update - 更新不存在的节点应抛异常', async () => {
            const params: IUpdateNodeParams = {
                path: '/NonExistentNode',
                name: 'NonExistentNode',
                properties: {
                    position: { x: 1, y: 1, z: 1 }
                }
            };

            await expect(NodeProxy.update(params)).rejects.toThrow();
        });

        it('delete - 删除不存在的节点应返回null', async () => {
            const params: IDeleteNodeParams = {
                path: '/NonExistentNode',
                keepWorldTransform: false
            };

            const result = await NodeProxy.delete(params);
            expect(result).toBeNull();
        });
    });

    describe('6. 添加所有内置的节点', () => {
        const allNodes: INodeInfo[] = [];
        afterAll(async () => {
            try {
                for (const node of allNodes) {
                    // 删除该节点
                    const deleteParams: IDeleteNodeParams = {
                        path: node!.path,
                        keepWorldTransform: true
                    };

                    const result = await NodeProxy.delete(deleteParams);
                    expect(result).toBeDefined();
                    expect(result?.path).toBe(node!.path);
                };
            } catch (e) {
                console.log(`添加所有内置的节点 - 错误 ${e}`);
                throw e;
            }
        });
        it('createByType - 创建所有内置节点', async () => {
            const addCanvas: NodeType[] =
                [
                    NodeType.SPRITE,
                    NodeType.SPRITE_SPLASH,
                    NodeType.GRAPHICS,
                    NodeType.LABEL,
                    NodeType.MASK,
                    NodeType.BUTTON,
                    NodeType.EDIT_BOX,
                    NodeType.LAYOUT,
                    NodeType.PAGE_VIEW,
                    NodeType.PROGRESS_BAR,
                    NodeType.RICH_TEXT,
                    NodeType.SCROLL_VIEW,
                    NodeType.SLIDER,
                    NodeType.TOGGLE,
                    NodeType.TOGGLE_GROUP,
                    NodeType.VIDEO_PLAYER,
                    NodeType.WEB_VIEW,
                    NodeType.WIDGET,
                    NodeType.TILED_MAP,
                ];
            const nodeTypes = Object.values(NodeType);
            for (const nodeType of nodeTypes) {
                const params: ICreateByNodeTypeParams = {
                    path: '/',
                    nodeType: nodeType,
                    position: testPosition,
                };
                if (nodeType === NodeType.CANVAS) {
                    continue;
                }
                try {
                    createdNode = await NodeProxy.createByType(params);

                    expect(createdNode).toBeDefined();
                    allNodes.push(createdNode!);
                    if (nodeType === NodeType.EMPTY) {
                        expect(createdNode?.name).toBe('New Node');
                        expect(createdNode?.path).toBe('New Node');
                    } else if (nodeType === NodeType.PARTICLE) {
                        expect(createdNode?.name).toBe('ParticleSystem2D');
                        expect(createdNode?.path).toBe('Canvas/ParticleSystem2D');
                    } else if (nodeType === NodeType.DIRECTIONAL_LIGHT) {
                        expect(createdNode?.name).toBe('Directional Light');
                        expect(createdNode?.path).toBe('Directional Light');
                    } else if (nodeType === NodeType.SPHERE_LIGHT) {
                        expect(createdNode?.name).toBe('Sphere Light');
                        expect(createdNode?.path).toBe('Sphere Light');
                    } else if (nodeType === NodeType.SPOT_LIGHT) {
                        expect(createdNode?.name).toBe('Spot Light');
                        expect(createdNode?.path).toBe('Spot Light');
                    } else if (nodeType === NodeType.PROBE_LIGHT) {
                        expect(createdNode?.name).toBe('Light Probe Group');
                        expect(createdNode?.path).toBe('Light Probe Group');
                    } else if (nodeType === NodeType.REFLECTION_LIGHT) {
                        expect(createdNode?.name).toBe('Reflection Probe');
                        expect(createdNode?.path).toBe('Reflection Probe');
                    } else if (nodeType === NodeType.PAGE_VIEW) {
                        expect(createdNode?.name).toBe('pageView');
                        expect(createdNode?.path).toBe('Canvas/pageView');
                    } else if (nodeType === NodeType.TOGGLE_GROUP) {
                        expect(createdNode?.name).toBe('ToggleContainer');
                        expect(createdNode?.path).toBe('Canvas/ToggleContainer');
                    } else {
                        expect(createdNode?.name).toBe(nodeType);
                        if (addCanvas.includes(nodeType)) {
                            expect(createdNode?.path).toBe(`Canvas/${nodeType}`);
                        } else {
                            expect(createdNode?.path).toBe(nodeType);
                        }
                    }
                    if (nodeType == NodeType.PAGE_VIEW) {
                        expect(createdNode?.components?.at(0)?.path).toBe('Canvas/pageView/cc.UITransform');
                        expect(createdNode?.components?.at(1)?.path).toBe('Canvas/pageView/cc.Sprite');
                        expect(createdNode?.components?.at(2)?.path).toBe('Canvas/pageView/cc.PageView');
                    }
                    if (nodeType == NodeType.TERRAIN) {
                        expect(Array.isArray(createdNode?.children)).toBe(true);
                    }
                    expect(createdNode?.properties.position).toEqual(testPosition);
                    console.log('Created node original path=', testNodePath, ' dest path=', createdNode?.path);
                } catch (e) {
                    console.log(`测试所有内置节点 错误： ${e}`);
                    throw e;
                }
            };

        });
    });

    describe('7. queryNodeTree - 查询节点树', () => {
        it('queryNodeTree - 查询整棵场景树', async () => {
            const params: IQueryNodeTreeParams = {};
            const tree = await NodeProxy.queryNodeTree(params);
            expect(tree).toBeDefined();
            expect(tree).not.toBeNull();
            expect(tree!.isScene).toBe(true);
            expect(tree!.name).toBeDefined();
            expect(Array.isArray(tree!.children)).toBe(true);
            expect(Array.isArray(tree!.components)).toBe(true);
        });

        it('queryNodeTree - 返回的节点包含必要字段', async () => {
            const tree = await NodeProxy.queryNodeTree({});
            expect(tree).not.toBeNull();

            const checkFields = (item: typeof tree) => {
                if (!item) return;
                expect(typeof item.name).toBe('string');
                expect(typeof item.active).toBe('boolean');
                expect(typeof item.locked).toBe('boolean');
                expect(typeof item.type).toBe('string');
                expect(typeof item.path).toBe('string');
                expect(typeof item.isScene).toBe('boolean');
                expect(typeof item.readonly).toBe('boolean');
                expect(typeof item.parent).toBe('string');
                expect(item.prefab).toBeDefined();
                expect(Array.isArray(item.children)).toBe(true);
                expect(Array.isArray(item.components)).toBe(true);
            };
            checkFields(tree);
            if (tree!.children.length > 0) {
                checkFields(tree!.children[0]);
            }
        });

        it('queryNodeTree - 通过 path 查询子树', async () => {
            // 先创建一个节点用于查询
            const createParams: ICreateByNodeTypeParams = {
                path: '/',
                name: 'TreeTestNode',
                nodeType: NodeType.EMPTY,
            };
            const created = await NodeProxy.createByType(createParams);
            expect(created).toBeDefined();

            const params: IQueryNodeTreeParams = { path: created!.path };
            const subtree = await NodeProxy.queryNodeTree(params);
            expect(subtree).not.toBeNull();
            expect(subtree!.name).toBe('TreeTestNode');
            expect(subtree!.isScene).toBe(false);

            // 清理
            await NodeProxy.delete({ path: created!.path, keepWorldTransform: false });
        });

        it('queryNodeTree - 查询不存在的路径应返回 null', async () => {
            const params: IQueryNodeTreeParams = { path: '/NonExistentTreeNode' };
            const result = await NodeProxy.queryNodeTree(params);
            expect(result).toBeNull();
        });

        it('queryNodeTree - 组件信息包含 type 和 extends', async () => {
            // 创建一个带组件的节点
            const createParams: ICreateByNodeTypeParams = {
                path: '/',
                name: 'CompTreeTestNode',
                nodeType: NodeType.SPRITE,
            };
            const created = await NodeProxy.createByType(createParams);
            expect(created).toBeDefined();

            const tree = await NodeProxy.queryNodeTree({ path: created!.path });
            expect(tree).not.toBeNull();
            expect(tree!.components.length).toBeGreaterThan(0);

            for (const comp of tree!.components) {
                expect(typeof comp.type).toBe('string');
                expect(typeof comp.isCustom).toBe('boolean');
                expect(typeof comp.value).toBe('string');
                expect(Array.isArray(comp.extends)).toBe(true);
            }

            // 清理
            await NodeProxy.delete({ path: created!.path, keepWorldTransform: false });
        });
    });

    describe('8. 节点命名规则测试 - 同名节点自动添加后缀', () => {
        const createdNodes: INodeInfo[] = [];
        const parentPath = '/';

        afterAll(async () => {
            for (const node of createdNodes.reverse()) {
                try {
                    await NodeProxy.delete({ path: node.path, keepWorldTransform: false });
                } catch (e) {
                    console.log(`删除节点失败: ${node.path}, ${e}`);
                }
            }
        });

        it('createByType - 唯一名称不添加后缀', async () => {
            const params: ICreateByNodeTypeParams = {
                path: parentPath,
                name: 'UniqueNode',
                nodeType: NodeType.EMPTY,
            };
            const node = await NodeProxy.createByType(params);
            expect(node).toBeDefined();
            expect(node!.name).toBe('UniqueNode');
            expect(node!.path).toBe('UniqueNode');
            createdNodes.push(node!);
        });

        it('createByType - 第二个同名节点添加_001后缀', async () => {
            const params: ICreateByNodeTypeParams = {
                path: parentPath,
                name: 'DupNode',
                nodeType: NodeType.EMPTY,
            };
            const node1 = await NodeProxy.createByType(params);
            expect(node1).toBeDefined();
            expect(node1!.name).toBe('DupNode');
            expect(node1!.path).toBe('DupNode');
            createdNodes.push(node1!);

            const node2 = await NodeProxy.createByType(params);
            expect(node2).toBeDefined();
            expect(node2!.name).toBe('DupNode_001');
            expect(node2!.path).toBe('DupNode_001');
            createdNodes.push(node2!);
        });

        it('createByType - 多个同名节点依次添加_001,_002,...后缀', async () => {
            const totalCount = 5;
            const baseName = 'MultiDupNode';
            for (let i = 0; i < totalCount; i++) {
                const params: ICreateByNodeTypeParams = {
                    path: parentPath,
                    name: baseName,
                    nodeType: NodeType.EMPTY,
                };
                const node = await NodeProxy.createByType(params);
                expect(node).toBeDefined();
                const expectedName = i === 0 ? baseName : `${baseName}_${String(i).padStart(3, '0')}`;
                expect(node!.name).toBe(expectedName);
                expect(node!.path).toBe(expectedName);
                createdNodes.push(node!);
            }
        });

        it('createByType - 删除中间节点后新增应复用已删除的名称', async () => {
            const baseName = 'GapNode';

            // 添加3个同名节点: GapNode, GapNode_001, GapNode_002
            const node0 = await NodeProxy.createByType({ path: parentPath, name: baseName, nodeType: NodeType.EMPTY });
            const node1 = await NodeProxy.createByType({ path: parentPath, name: baseName, nodeType: NodeType.EMPTY });
            const node2 = await NodeProxy.createByType({ path: parentPath, name: baseName, nodeType: NodeType.EMPTY });
            expect(node0!.path).toBe(baseName);
            expect(node1!.path).toBe(`${baseName}_001`);
            expect(node2!.path).toBe(`${baseName}_002`);

            // 删除 _001
            const deleteResult = await NodeProxy.delete({ path: node1!.path, keepWorldTransform: false });
            expect(deleteResult).toBeDefined();

            // 再添加2个，第一个应复用 _001，第二个为 _003
            const node3 = await NodeProxy.createByType({ path: parentPath, name: baseName, nodeType: NodeType.EMPTY });
            const node4 = await NodeProxy.createByType({ path: parentPath, name: baseName, nodeType: NodeType.EMPTY });
            expect(node3!.path).toBe(`${baseName}_001`);
            expect(node4!.path).toBe(`${baseName}_003`);

            // 清理
            await NodeProxy.delete({ path: node4!.path, keepWorldTransform: false });
            await NodeProxy.delete({ path: node3!.path, keepWorldTransform: false });
            await NodeProxy.delete({ path: node2!.path, keepWorldTransform: false });
            await NodeProxy.delete({ path: node0!.path, keepWorldTransform: false });
        });
    });
});
