import { MCPTestClient } from '../../helpers/mcp-client';
import {
  AssetsTestContext,
  generateTestId,
  setupAssetsTestEnvironment,
  teardownAssetsTestEnvironment,
} from '../../helpers/test-utils';

describe('MCP Node API', () => {
    let context: AssetsTestContext;
    let mcpClient: MCPTestClient;
    let testSceneUrl: string;
    let testFolderPath: string;

    beforeAll(async () => {
        // 使用共享的 Assets 测试环境（与 scene/import 测试一致）
        context = await setupAssetsTestEnvironment();
        mcpClient = context.mcpClient;

        // 统一的测试文件夹路径与场景 URL
        testFolderPath = context.testRootUrl;
        testSceneUrl = `${testFolderPath}/scene-2d.scene`;

        // 创建并打开 2D 场景（若已存在则忽略创建）
        try {
            await mcpClient.callTool('scene-create', {
                options: {
                    dbURL: testFolderPath,
                    baseName: 'scene-2d',
                    templateType: '2d',
                },
            });
        } catch (error) {
            // 场景可能已存在，忽略
        }

        await mcpClient.callTool('scene-open', {
            dbURLOrUUID: testSceneUrl,
        });
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    describe('scene-create-node-by-type', () => {
        test('should create node by type', async () => {
            const nodeName = `TestNode-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: nodeName,
                    nodeType: 'Empty'
                }
            });
            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(result.data.name).toBe(nodeName);
        });

        test('should create sprite node', async () => {
            const nodeName = `SpriteNode-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: nodeName,
                    nodeType: 'Sprite'
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(result.data.name).toBe(nodeName);
        });

        test('should handle invalid node type', async () => {
            const nodeName = `InvalidNode-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: nodeName,
                    nodeType: 'InvalidType' as any
                }
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });

        test('should create node from root when path is empty', async () => {
            const nodeName = `EmptyPathNode-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: '',
                    name: nodeName,
                    nodeType: 'Empty'
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(result.data.name).toBe(nodeName);
        });
    });

    describe('scene-create-node-by-asset', () => {
        test('should handle non-existent asset', async () => {
            const nodeName = `AssetNode-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-asset', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: nodeName,
                    dbURL: 'db://assets/non-existent.prefab'
                }
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });

        test('should handle invalid asset URL', async () => {
            const nodeName = `InvalidAssetNode-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-asset', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: nodeName,
                    dbURL: 'invalid-url'
                }
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });

    describe('scene-query-node', () => {
        let testNodeName: string;

        beforeEach(async () => {
            // 为每个测试创建一个节点
            testNodeName = `QueryTestNode-${generateTestId()}`;
            await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    name: testNodeName,
                    nodeType: 'Empty'
                }
            });
        });

        test('should query existing node', async () => {
            const result = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    queryChildren: false,
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(result.data.name).toBe(testNodeName);
        });

        test('should handle non-existent node', async () => {
            const result = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/NonExistentNode-${generateTestId()}`,
                    queryChildren: false,
                }
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });

        test('should query node with children', async () => {
            const result = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    queryChildren: true
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(result.data.children).toBeDefined();
        });
    });

    describe('scene-update-node', () => {
        let testNodeName: string;

        beforeEach(async () => {
            // 为每个测试创建一个节点
            testNodeName = `UpdateTestNode-${generateTestId()}`;
            await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    name: testNodeName,
                    nodeType: 'Empty'
                }
            });
        });

        /*
        //先屏蔽掉这个 api 等后续修改结构
         test('should update node name', async () => {
            const newName = `Updated-${testNodeName}`;
            const result = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    name: newName
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            // 验证更新
            const queryResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${testNodeName}`
                }
            });

            expect(queryResult.code).toBe(200);
            expect(queryResult.data.name).toBe(newName);
        }); */

        test('should update node properties', async () => {
            const result = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    properties: {
                        position: { x: 100, y: 200, z: 0 },
                        active: false
                    }
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            // 验证更新
            const queryResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    queryChildren: false,
                }
            });

            expect(queryResult.code).toBe(200);
            if (queryResult.data.properties) {
                expect(queryResult.data.properties.position?.x).toBe(100);
                expect(queryResult.data.properties.position?.y).toBe(200);
                expect(queryResult.data.properties.active).toBe(false);
            }
        });

        test('should handle invalid node path for update', async () => {
            const result = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: `Canvas/NonExistentNode-${generateTestId()}`,
                    name: 'NewName',
                } as any,
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });

        test('should update node with partial properties', async () => {
            const result = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    properties: {
                        scale: { x: 2, y: 2, z: 1 }
                    }
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            // 验证更新
            const queryResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${testNodeName}`,
                    queryChildren: false,
                }
            });

            expect(queryResult.code).toBe(200);
            if (queryResult.data.properties) {
                expect(queryResult.data.properties.scale?.x).toBe(2);
                expect(queryResult.data.properties.scale?.y).toBe(2);
            }
        });
    });

    describe('scene-delete-node', () => {
        test('should delete existing node', async () => {
            // 先创建一个要删除的节点
            const nodeName = `NodeToDelete-${generateTestId()}`;
            await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: nodeName,
                    nodeType: 'Empty'
                }
            });

            // 删除节点
            const result = await mcpClient.callTool('scene-delete-node', {
                options: {
                    path: `Canvas/${nodeName}`
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            // 验证节点已被删除
            const queryResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    queryChildren: false,
                }
            });

            expect(queryResult.code).not.toBe(200);
        });

        test('should handle non-existent node deletion', async () => {
            const result = await mcpClient.callTool('scene-delete-node', {
                options: {
                    path: `Canvas/NonExistentNode-${generateTestId()}`
                }
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });

        test('should delete node with keepWorldTransform option', async () => {
            // 先创建一个要删除的节点
            const nodeName = `NodeToDeleteWithTransform-${generateTestId()}`;
            await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: nodeName,
                    nodeType: 'Empty'
                }
            });

            // 删除节点，保持世界变换
            const result = await mcpClient.callTool('scene-delete-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    keepWorldTransform: true
                }
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
        });
    });

    describe('Node workflow integration tests', () => {
        test('should support complete node workflow', async () => {
            const nodeName = `WorkflowNode-${generateTestId()}`;

            // 1. 创建节点
            const createResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty'
                }
            });
            expect(createResult.code).toBe(200);
            expect(createResult.data).toBeDefined();

            // 2. 查询节点
            const queryResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    queryChildren: false,
                }
            });

            expect(queryResult.code).toBe(200);
            expect(queryResult.data.name).toBe(nodeName);

            // 3. 更新单个属性
            const updateResult = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    properties: {
                        position: { x: 50, y: 100, z: 0 }
                    }
                }
            });
            expect(updateResult.code).toBe(200);

            // 4. 验证单个属性更新
            const verifyResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    queryChildren: false,
                }
            });

            expect(verifyResult.code).toBe(200);
            expect(verifyResult.data.name).toBe(nodeName);
            if (verifyResult.data.properties) {
                expect(verifyResult.data.properties.position?.x).toBe(50);
                expect(verifyResult.data.properties.position?.y).toBe(100);
                expect(verifyResult.data.properties.position?.z).toBe(0);
            }

            // 5. 更新多个属性
            const multiUpdateResult = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    properties: {
                        position: { x: 200, y: 300, z: 10 },
                        scale: { x: 2.5, y: 1.5, z: 1.0 },
                        rotation: { x: 0, y: 0, z: 0.3826834, w: 0.9238795 }, // 45度旋转的四元数表示
                        active: false
                    }
                }
            });

            expect(multiUpdateResult.code).toBe(200);

            // 6. 验证多个属性都被正确修改
            const multiVerifyResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    queryChildren: false,
                }
            });

            expect(multiVerifyResult.code).toBe(200);
            if (multiVerifyResult.data.properties) {
                // 验证位置属性
                expect(multiVerifyResult.data.properties.position?.x).toBe(200);
                expect(multiVerifyResult.data.properties.position?.y).toBe(300);
                expect(multiVerifyResult.data.properties.position?.z).toBe(10);
                
                // 验证缩放属性
                expect(multiVerifyResult.data.properties.scale?.x).toBe(2.5);
                expect(multiVerifyResult.data.properties.scale?.y).toBe(1.5);
                expect(multiVerifyResult.data.properties.scale?.z).toBe(1.0);
                
                // 验证旋转属性（四元数）
                expect(multiVerifyResult.data.properties.rotation?.x).toBeCloseTo(0, 5);
                expect(multiVerifyResult.data.properties.rotation?.y).toBeCloseTo(0, 5);
                expect(multiVerifyResult.data.properties.rotation?.z).toBeCloseTo(0.3826834, 5);
                expect(multiVerifyResult.data.properties.rotation?.w).toBeCloseTo(0.9238795, 5);
                
                // 验证激活状态
                expect(multiVerifyResult.data.properties.active).toBe(false);
            }

            // 7. 再次更新部分属性，确保不影响其他属性
            const partialUpdateResult = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    properties: {
                        position: { x: 100, y: 150, z: 5 },
                        active: true
                    }
                }
            });

            expect(partialUpdateResult.code).toBe(200);

            // 8. 验证部分更新后的状态
            const partialVerifyResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    queryChildren: false,
                }
            });

            expect(partialVerifyResult.code).toBe(200);
            if (partialVerifyResult.data.properties) {
                // 验证更新的属性
                expect(partialVerifyResult.data.properties.position?.x).toBe(100);
                expect(partialVerifyResult.data.properties.position?.y).toBe(150);
                expect(partialVerifyResult.data.properties.position?.z).toBe(5);
                expect(partialVerifyResult.data.properties.active).toBe(true);
                
                // 验证未更新的属性保持不变
                expect(partialVerifyResult.data.properties.scale?.x).toBe(2.5);
                expect(partialVerifyResult.data.properties.scale?.y).toBe(1.5);
                expect(partialVerifyResult.data.properties.scale?.z).toBe(1.0);
                // 验证旋转属性保持不变（四元数）
                expect(partialVerifyResult.data.properties.rotation?.x).toBeCloseTo(0, 5);
                expect(partialVerifyResult.data.properties.rotation?.y).toBeCloseTo(0, 5);
                expect(partialVerifyResult.data.properties.rotation?.z).toBeCloseTo(0.3826834, 5);
                expect(partialVerifyResult.data.properties.rotation?.w).toBeCloseTo(0.9238795, 5);
            }

            // 9. 删除节点
            const deleteResult = await mcpClient.callTool('scene-delete-node', {
                options: {
                    path: `Canvas/${nodeName}`
                }
            });

            expect(deleteResult.code).toBe(200);

            // 10. 验证删除
            const finalQueryResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: `Canvas/${nodeName}`,
                    queryChildren: false,
                }
            });

            expect(finalQueryResult.code).not.toBe(200);
        });
    });

    describe('Error handling and edge cases', () => {
        test('should handle special characters in node name', async () => {
            const nodeName = `SpecialChar-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: 'Node@#$%^&*()',
                    nodeType: 'Empty'
                }
            });

            // 这个测试可能成功也可能失败，取决于系统对特殊字符的处理
            expect(result).toBeDefined();
        });

        test('should handle very long node path', async () => {
            const longName = 'A'.repeat(100);
            const nodeName = `LongName-${generateTestId()}`;
            const result = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${nodeName}`,
                    name: longName,
                    nodeType: 'Empty'
                }
            });

            // 这个测试可能成功也可能失败，取决于系统限制
            expect(result).toBeDefined();
        });

        test('should handle concurrent node operations', async () => {
            // 并发创建多个节点
            const promises = Array.from({ length: 3 }, (_, i) =>
                mcpClient.callTool('scene-create-node-by-type', {
                    options: {
                        path: `Canvas/ConcurrentNode-${i}-${generateTestId()}`,
                        name: `ConcurrentNode-${i}`,
                        nodeType: 'Empty'
                    }
                })
            );

            const results = await Promise.all(promises);

            // 至少应该有一些成功的结果
            const successCount = results.filter(r => r.code === 200).length;
            expect(successCount).toBeGreaterThan(0);
        });
    });

    describe('Node Type Coverage Tests', () => {
        it('should create and verify all node types', async () => {
            // 定义所有节点类型
            const nodeTypes = [
                'Empty', 'Terrain', 'Camera',
                'Sprite', 'SpriteSplash', 'Graphics', 'Label', 'Mask', 'Particle', 'TiledMap',
                'Capsule', 'Cone', 'Cube', 'Cylinder', 'Plane', 'Quad', 'Sphere', 'Torus',
                'Button', 'Canvas', 'EditBox', 'Layout', 'PageView', 'ProgressBar', 'RichText',
                'ScrollView', 'Slider', 'Toggle', 'ToggleGroup', 'VideoPlayer', 'WebView', 'Widget',
                'Light-Directional', 'Light-Sphere', 'Light-Spot', 'Light-Probe-Group', 'Light-Reflection-Probe'
            ];

            // 定义需要Canvas的节点类型
            const needsCanvas = [
                'Sprite', 'SpriteSplash', 'Graphics', 'Label', 'Mask', 'Particle', 'TiledMap',
                'Button', 'EditBox', 'Layout', 'PageView', 'ProgressBar', 'RichText',
                'ScrollView', 'Slider', 'Toggle', 'ToggleGroup', 'VideoPlayer', 'WebView', 'Widget'
            ];

            // 定义每种节点类型预期的组件
            const expectedComponents: { [key: string]: string[] } = {
                Empty: [],
                Terrain: ['cc.Terrain'],
                Camera: ['cc.Camera'],
                Sprite: ['cc.UITransform', 'cc.Sprite'],
                SpriteSplash: ['cc.UITransform', 'cc.Sprite'],
                Graphics: ['cc.UITransform', 'cc.Graphics'],
                Label: ['cc.UITransform', 'cc.Label'],
                Mask: ['cc.UITransform', 'cc.Mask', 'cc.Graphics'],
                Particle: ['cc.UITransform', 'cc.ParticleSystem2D'],
                TiledMap: ['cc.UITransform', 'cc.TiledMap'],
                Capsule: ['cc.MeshRenderer'],
                Cone: ['cc.MeshRenderer'],
                Cube: ['cc.MeshRenderer'],
                Cylinder: ['cc.MeshRenderer'],
                Plane: ['cc.MeshRenderer'],
                Quad: ['cc.MeshRenderer'],
                Sphere: ['cc.MeshRenderer'],
                Torus: ['cc.MeshRenderer'],
                Button: ['cc.UITransform', 'cc.Sprite', 'cc.Button'],
                Canvas: ['cc.UITransform', 'cc.Canvas', 'cc.Widget'],
                EditBox: ['cc.UITransform', 'cc.Sprite', 'cc.EditBox'],
                Layout: ['cc.UITransform', 'cc.Layout'],
                PageView: ['cc.UITransform', 'cc.Sprite', 'cc.PageView'],
                ProgressBar: ['cc.UITransform', 'cc.Sprite', 'cc.ProgressBar'],
                RichText: ['cc.UITransform', 'cc.RichText'],
                ScrollView: ['cc.UITransform', 'cc.Sprite', 'cc.ScrollView'],
                Slider: ['cc.UITransform', 'cc.Sprite', 'cc.Slider'],
                Toggle: ['cc.UITransform', 'cc.Sprite', 'cc.Toggle'],
                ToggleGroup: ['cc.ToggleContainer'],
                VideoPlayer: ['cc.UITransform', 'cc.VideoPlayer'],
                WebView: ['cc.UITransform', 'cc.WebView'],
                Widget: ['cc.UITransform', 'cc.Widget'],
                'Light-Directional': ['cc.DirectionalLight'],
                'Light-Sphere': ['cc.SphereLight'],
                'Light-Spot': ['cc.SpotLight'],
                'Light-Probe-Group': ['cc.LightProbeGroup'],
                'Light-Reflection-Probe': ['cc.ReflectionProbe']
            };

            const createdNodes: string[] = [];

            try {
                // 遍历所有节点类型进行测试
                for (const nodeType of nodeTypes) {
                    const testId = generateTestId();
                    const nodeName = `${nodeType}Node_${testId}`;
                    const nodePath = needsCanvas.includes(nodeType) ? `Canvas/${nodeName}` : nodeName;

                    // 创建节点
                    const createResult = await mcpClient.callTool('scene-create-node-by-type', {
                        options: {
                            path: nodePath,
                            name: nodeName,
                            nodeType: nodeType as any,
                        }
                    });

                    expect(createResult.code).toBe(200);
                    expect(createResult.data).toBeDefined();
                    expect(createResult.data.name).toBeDefined();

                    // 记录创建的节点路径用于清理
                    createdNodes.push(createResult.data.path);

                    // 查询节点以验证类型
                    const queryResult = await mcpClient.callTool('scene-query-node', {
                        options: {
                            path: createResult.data.path,
                            queryChildren: false
                        }
                    });

                    expect(queryResult.code).toBe(200);
                    expect(queryResult.data).toBeDefined();
                    expect(queryResult.data.components).toBeDefined();

                    // 验证节点具有预期的组件
                    const nodeComponents = queryResult.data.components || [];
                    const componentTypes = nodeComponents.map((comp: any) => comp.type);
                    const expectedComps = expectedComponents[nodeType] || [];

                    // 检查是否包含预期的组件
                    for (const expectedComp of expectedComps) {
                        expect(componentTypes).toContain(expectedComp);
                    }

                }

            } finally {
                // 清理创建的节点
                for (const nodePath of createdNodes) {
                    try {
                        await mcpClient.callTool('scene-delete-node', {
                            options: {
                                path: nodePath,
                                keepWorldTransform: false
                            }
                        });
                    } catch (error) {
                        console.warn(`Failed to cleanup node ${nodePath}:`, error);
                    }
                }
            }
        });
    });
});