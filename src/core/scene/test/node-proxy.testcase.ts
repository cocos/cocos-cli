import {
    type ICreateByAssetParams,
    type ICreateByNodeTypeParams,
    type IDeleteNodeParams,
    type IQueryNodeParams,
    type IUpdateNodeParams,
    type INode,
    NodeType,
} from '../common';
import { IVec3 } from '../common/value-types';
import { NodeProxy } from '../main-process/proxy/node-proxy';

jest.setTimeout(30 * 60 * 1000); // 半小时（30 分钟）

describe('Node Proxy 测试', () => {
    let createdNode: INode | null = null;
    const testNodePath = '/TestNode';
    const testPosition: IVec3 = { x: 1, y: 2, z: 0 };

    describe('1. 基础节点操作', () => {
        it('createNode - 创建多级父节点的节点', async () => {
            const multiParentPath = 'Canvas/TestNode/TestNode2/TestNode3';
            const params: ICreateByNodeTypeParams = {
                path: multiParentPath,
                name: 'TestNode',
                nodeType: NodeType.SPRITE,
                position: testPosition
            };

            createdNode = await NodeProxy.createNodeByType(params);
            expect(createdNode).toBeDefined();
            expect(createdNode?.name).toBe('TestNode');
            expect(createdNode?.path).toBe(multiParentPath + '/TestNode');
        });


        it('createNode - 创建带预制体的节点', async () => {
            const params: ICreateByAssetParams = {
                dbURL: 'db://internal/default_prefab/ui/Label.prefab',
                path: testNodePath,
                name: 'PrefabNode',
            };

            const prefabNode = await NodeProxy.createNodeByAsset(params);
            expect(prefabNode).toBeDefined();
            expect(prefabNode?.name).toBe('PrefabNode');
            console.log('Created prefab node path=', prefabNode?.path);
        });

        it('createNode - 创建新节点', async () => {
            const params: ICreateByNodeTypeParams = {
                path: testNodePath,
                name: 'TestNode',
                nodeType: NodeType.SPRITE,
                position: testPosition
            };

            createdNode = await NodeProxy.createNodeByType(params);
            expect(createdNode).toBeDefined();
            expect(createdNode?.name).toBe('TestNode');
            // 会在根节点下先创建 TestNode 再创建 Canvas/TestNode (SPRITE 节点会在 Canvas 下创建， 节点重名为 ‘TestNode’)
            expect(createdNode?.path).toBe('TestNode/Canvas/TestNode');
            expect(createdNode?.properties.position).toEqual(testPosition);
            console.log('Created node original path=', testNodePath, ' dest path=', createdNode?.path);
        });
    });

    describe('2. 节点查询操作（依赖创建的节点）', () => {
        it('queryNode - 查询节点基本信息', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false
                };

                const result = await NodeProxy.queryNode(params);
                expect(result).toBeDefined();
                expect(result?.path).toBe('TestNode/Canvas/TestNode');
                expect(result?.name).toBe('TestNode');
            }
        });

        it('queryNode - 查询节点及子节点信息', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: true
                };

                const result = await NodeProxy.queryNode(params);
                expect(result).toBeDefined();
            }
        });
    });

    describe('3. 节点更新操作（依赖创建的节点）', () => {
        it('updateNode - 更新节点位置', async () => {
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

                const result = await NodeProxy.updateNode(params);
                expect(result).toBeDefined();
                expect(result?.path).toBe(createdNode.path);

                // 验证更新是否生效
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false
                };
                const updatedNode = await NodeProxy.queryNode(queryParams);
                expect(updatedNode?.properties.position).toEqual(newPosition);
            }
        });

        it('updateNode - 更新节点激活状态', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    name: 'TestNode',
                    properties: {
                        active: false
                    }
                };

                const result = await NodeProxy.updateNode(params);
                expect(result).toBeDefined();

                // 验证更新是否生效
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false
                };
                const updatedNode = await NodeProxy.queryNode(queryParams);
                expect(updatedNode?.properties.active).toBe(false);
            }
        });

        it('updateNode - 更新节点旋转和缩放', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const newScale: IVec3 = { x: 2, y: 2, z: 2 };
                const params: IUpdateNodeParams = {
                    path: createdNode.path,
                    name: 'TestNode',
                    properties: {
                        scale: newScale,
                        eulerAngles: { x: 0, y: 45, z: 0 }
                    }
                };

                const result = await NodeProxy.updateNode(params);
                expect(result).toBeDefined();

                // 验证更新是否生效
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false
                };
                const updatedNode = await NodeProxy.queryNode(queryParams);
                expect(updatedNode?.properties.scale).toEqual(newScale);
            }
        });
    });

    describe('4. 节点删除操作（依赖创建的节点）', () => {
        it('deleteNode - 删除节点（不保持世界变换）', async () => {
            expect(createdNode).not.toBeNull();
            if (createdNode) {
                const params: IDeleteNodeParams = {
                    path: createdNode.path,
                    keepWorldTransform: false
                };

                const result = await NodeProxy.deleteNode(params);
                expect(result).toBeDefined();
                expect(result?.path).toBe(createdNode.path);

                // 验证节点是否已被删除
                const queryParams: IQueryNodeParams = {
                    path: createdNode.path,
                    queryChildren: false
                };
                const deletedNode = await NodeProxy.queryNode(queryParams);
                expect(deletedNode).toBeNull();

                createdNode = null;
            }
        });

        it('deleteNode - 删除节点（保持世界变换）', async () => {
            // 先创建一个新节点用于删除测试
            const createParams: ICreateByNodeTypeParams = {
                path: 'NodeToDelete',
                name: 'NodeToDelete',
                nodeType: NodeType.SPHERE,
                workMode: '3d'
            };

            const tempNode = await NodeProxy.createNodeByType(createParams);
            expect(tempNode).toBeDefined();

            // 删除该节点
            const deleteParams: IDeleteNodeParams = {
                path: tempNode!.path,
                keepWorldTransform: true
            };

            const result = await NodeProxy.deleteNode(deleteParams);
            expect(result).toBeDefined();
            expect(result?.path).toBe('NodeToDelete/NodeToDelete');
        });
    });

    describe('5. 边界情况测试', () => {
        it('queryNode - 查询不存在的节点应返回null', async () => {
            const params: IQueryNodeParams = {
                path: '/NonExistentNode',
                queryChildren: false
            };

            const result = await NodeProxy.queryNode(params);
            expect(result).toBeNull();
        });

        it('updateNode - 更新不存在的节点应返回null', async () => {
            const params: IUpdateNodeParams = {
                path: '/NonExistentNode',
                name: 'NonExistentNode',
                properties: {
                    position: { x: 1, y: 1, z: 1 }
                }
            };

            const result = await NodeProxy.updateNode(params);
            expect(result).toBeNull();
        });

        it('deleteNode - 删除不存在的节点应返回null', async () => {
            const params: IDeleteNodeParams = {
                path: '/NonExistentNode',
                keepWorldTransform: false
            };

            const result = await NodeProxy.deleteNode(params);
            expect(result).toBeNull();
        });
    });

    describe('6. 添加所有内置的节点', () => {
        const allNodes: INode[] = [];
        afterAll(async () => {
            try {
                for (const node of allNodes) {
                    // 删除该节点
                    const deleteParams: IDeleteNodeParams = {
                        path: node!.path,
                        keepWorldTransform: true
                    };

                    const result = await NodeProxy.deleteNode(deleteParams);
                    expect(result).toBeDefined();
                    expect(result?.path).toBe(node!.path);
                };
            } catch (e) {
                console.log(`添加所有内置的节点 - 错误 ${e}`);
                throw e;
            }
        });
        it('createNode - 创建所有内置节点', async () => {
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
                    createdNode = await NodeProxy.createNodeByType(params);

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
                        expect(createdNode?.components?.at(0)?.path).toBe('Canvas/pageView/cc.UITransform_1');
                        expect(createdNode?.components?.at(1)?.path).toBe('Canvas/pageView/cc.Sprite_1');
                        expect(createdNode?.components?.at(2)?.path).toBe('Canvas/pageView/cc.PageView_1');
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
});