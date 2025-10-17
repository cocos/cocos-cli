import type {
    ICreateNodeParams,
    IDeleteNodeParams,
    IDeleteNodeResult,
    IQueryNodeParams,
    IUpdateNodeParams,
    IUpdateNodeResult,
    INode,
    INodeProperties,
} from '../common';
import { IVec3 } from '../common/value-types';
import { NodeProxy } from '../main-process/proxy/node-proxy';

// 设置测试超时时间
jest.setTimeout(24 * 60 * 60 * 1000); // 24 小时，单位毫秒

describe('Node Proxy 测试', () => {
    let createdNode: INode | null = null;
    let testNodePath = '/TestNode';
    const testPosition: IVec3 = { x: 1, y: 2, z: 0 };

    describe('1. 基础节点操作', () => {
        it('createNode - 创建带预制体的节点', async () => {
            const params: ICreateNodeParams = {
                assetPath: 'db://internal/default_prefab/ui/Sprite.prefab',
                path: '/PrefabNode',
                name: 'PrefabNode',
                nodeType: 'Empty',
                workMode: '2d'
            };

            const prefabNode = await NodeProxy.createNode(params);
            expect(prefabNode).toBeDefined();
            expect(prefabNode?.name).toBe('PrefabNode');
            console.log("Created prefab node path=", prefabNode?.path);
        });

        it('createNode - 创建新节点', async () => {
            const params: ICreateNodeParams = {
                path: testNodePath,
                name: 'TestNode',
                nodeType: 'Sprite',
                position: testPosition,
                workMode: '2d'
            };

            createdNode = await NodeProxy.createNode(params);
            expect(createdNode).toBeDefined();
            expect(createdNode?.name).toBe('TestNode');
            expect(createdNode?.path).toBe(testNodePath);
            expect(createdNode?.properties.position).toEqual(testPosition);
            console.log("Created node original path=", testNodePath, " dest path=", createdNode?.path);
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
                expect(result?.path).toBe(testNodePath);
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
                expect(Array.isArray(result?.children)).toBe(true);
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
                expect(result?.path).toBe(testNodePath);

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
                expect(result?.path).toBe(testNodePath);

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
            const createParams: ICreateNodeParams = {
                path: '/NodeToDelete',
                name: 'NodeToDelete',
                nodeType: 'Sphere',
                workMode: '3d'
            };

            const tempNode = await NodeProxy.createNode(createParams);
            expect(tempNode).toBeDefined();

            // 删除该节点
            const deleteParams: IDeleteNodeParams = {
                path: tempNode!.path,
                keepWorldTransform: true
            };

            const result = await NodeProxy.deleteNode(deleteParams);
            expect(result).toBeDefined();
            expect(result?.path).toBe('/NodeToDelete');
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
});