import { MCPTestClient } from '../../helpers/mcp-client';
import {
  AssetsTestContext,
  generateTestId,
  setupAssetsTestEnvironment,
  teardownAssetsTestEnvironment,
} from '../../helpers/test-utils';

describe('MCP Component API', () => {
    let context: AssetsTestContext;
    let mcpClient: MCPTestClient;
    let testSceneUrl: string;
    let testFolderPath: string;
    let testNodePath: string;

    beforeAll(async () => {
        // 使用共享的 Assets 测试环境（与 scene/import 测试一致）
        context = await setupAssetsTestEnvironment();
        mcpClient = context.mcpClient;

        // 统一的测试文件夹路径与场景 URL
        testFolderPath = context.testRootUrl;
        testSceneUrl = `${testFolderPath}/scene-2d.scene`;

        // 创建并打开 2D 场景（若已存在则忽略创建）
        try {
            await mcpClient.callTool('scene-create-scene', {
                options: {
                    dbURL: testFolderPath,
                    baseName: 'scene-2d',
                    templateType: '2d',
                },
            });
        } catch (error) {
            // 场景可能已存在，忽略创建错误
            console.warn('Scene creation failed (ignored if exists):', error);
        }

        await mcpClient.callTool('scene-open-scene', {
            dbURLOrUUID: testSceneUrl,
        });
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    beforeEach(async () => {
        // 为每个测试创建一个测试节点
        const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
            options: {
                path: '',  // 空字符串表示根节点
                name: `TestNode_${generateTestId()}`,
                nodeType: 'Empty',
            },
        });
        expect(createNodeResult.code).toBe(200);
        testNodePath = createNodeResult.data.path;
    });

    afterEach(async () => {
        // 清理测试节点
        if (testNodePath) {
            try {
                await mcpClient.callTool('scene-delete-node', {
                    options: {
                        path: testNodePath,
                    },
                });
            } catch (error) {
                console.warn('Failed to cleanup test node:', error);
            }
        }
    });

    describe('基础组件操作', () => {
        it('should add component successfully', async () => {
            // 添加Label组件
            const addResult = await mcpClient.callTool('scene-add-component', {
                addComponentInfo: {
                    nodePath: testNodePath,
                    component: 'cc.Label',
                },
            });
            expect(addResult.code).toBe(200);
            expect(addResult.data).toBeDefined();
            expect(addResult.data.path).toContain(testNodePath);
            expect(addResult.data.path).toContain('cc.Label');
        });

        it('should query component successfully', async () => {
            // 先添加组件
            const addResult = await mcpClient.callTool('scene-add-component', {
                addComponentInfo: {
                    nodePath: testNodePath,
                    component: 'cc.Label',
                },
            });
            expect(addResult.code).toBe(200);

            const componentPath = addResult.data.path;

            // 查询组件
            const queryResult = await mcpClient.callTool('scene-query-component', {
                component: { path: componentPath }
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toBeDefined();
            expect(queryResult.data.type).toBe('cc.Label');
            expect(queryResult.data.properties).toBeDefined();
        });

        it('should set component property successfully', async () => {
            // 先添加组件
            const addResult = await mcpClient.callTool('scene-add-component', {
                addComponentInfo: {
                    nodePath: testNodePath,
                    component: 'cc.Label',
                },
            });
            expect(addResult.code).toBe(200);

            const componentPath = addResult.data.path;

            // 查询组件初始属性
            const queryResult = await mcpClient.callTool('scene-query-component', {
                component: { path: componentPath }
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data.properties.string.value).toBe('label');

            // 设置组件属性
            const setResult = await mcpClient.callTool('scene-set-component-property', {
                setPropertyOptions: {
                    componentPath: componentPath,
                    properties: {
                        string: 'Hello World'
                    }
                }
            });
            expect(setResult.code).toBe(200);

            // 验证属性已更改
            const queryAfterSet = await mcpClient.callTool('scene-query-component', {
                component: { path: componentPath }
            });
            expect(queryAfterSet.code).toBe(200);
            expect(queryAfterSet.data.properties.string.value).toBe('Hello World');
        });

        it('should delete component successfully', async () => {
            // 先添加组件
            const addResult = await mcpClient.callTool('scene-add-component', {
                addComponentInfo: {
                    nodePath: testNodePath,
                    component: 'cc.Label',
                },
            });
            expect(addResult.code).toBe(200);

            const componentPath = addResult.data.path;

            // 删除组件
            const deleteResult = await mcpClient.callTool('scene-delete-component', {
                component: { path: componentPath }
            });
            expect(deleteResult.code).toBe(200);

            // 验证组件已删除 - 查询应该返回null或失败
            const queryAfterDelete = await mcpClient.callTool('scene-query-component', {
                component: { path: componentPath }
            });
            // 组件删除后查询应该失败或返回null
            expect(queryAfterDelete.code).not.toBe(200);
        });
    });

    describe('多组件操作', () => {
        it('should add multiple different components', async () => {
            const componentTypes = ['cc.Label', 'cc.AudioSource'];
            const addedComponents: string[] = [];

            // 添加多个不同类型的组件
            for (const componentType of componentTypes) {
                const addResult = await mcpClient.callTool('scene-add-component', {
                    addComponentInfo: {
                        nodePath: testNodePath,
                        component: componentType,
                    },
                });
                expect(addResult.code).toBe(200);
                expect(addResult.data.path).toContain(componentType);
                addedComponents.push(addResult.data.path);

                // 验证组件已添加
                const queryResult = await mcpClient.callTool('scene-query-component', {
                    component: { path: addResult.data.path }
                });
                expect(queryResult.code).toBe(200);
                expect(queryResult.data.type).toBe(componentType);
            }

            // 清理添加的组件
            for (const componentPath of addedComponents) {
                await mcpClient.callTool('scene-delete-component', {
                    component: { path: componentPath }
                });
            }
        });
    });

    describe('组件集合查询', () => {
        it('should query all components successfully', async () => {
            const allResult = await mcpClient.callTool('scene-query-all-component', {});
            expect(allResult.code).toBe(200);
            expect(Array.isArray(allResult.data)).toBe(true);
            expect(allResult.data.length).toBeGreaterThan(0);
            // 常见内置组件应存在于集合中
            expect(allResult.data).toEqual(expect.arrayContaining(['cc.Label']));
        });
    });
});
