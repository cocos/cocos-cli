import { MCPTestClient } from '../../helpers/mcp-client';
import { createTestProject, generateTestId } from '../../helpers/test-utils';
import { TestProject } from '../../helpers/project-manager';
import { resolve } from 'path';

describe('MCP Component API', () => {
    let testProject: TestProject;
    let mcpClient: MCPTestClient;
    let testSceneUrl: string;
    let testFolderPath: string;
    let testNodePath: string;

    beforeAll(async () => {
        // 创建测试项目（使用asset-operation项目，因为它包含场景文件）
        const fixtureProject = resolve(__dirname, '../../../tests/fixtures/projects/asset-operation');
        testProject = await createTestProject(fixtureProject);

        // 创建并启动 MCP 客户端
        mcpClient = new MCPTestClient({
            projectPath: testProject.path,
        });

        await mcpClient.start();
        console.log(`MCP server started on port: ${mcpClient.getPort()}`);

        // 设置测试路径
        testFolderPath = 'db://assets/__test__';
        testSceneUrl = `${testFolderPath}/scene-2d.scene`;

        // 创建测试文件夹
        try {
            await mcpClient.callTool('assets-create-asset-by-type', {
                ccType: 'directory',
                dirOrUrl: 'db://assets',
                baseName: '__test__',
                options: {
                    overwrite: false,
                    rename: true,
                },
            });

            // 创建测试场景
            await mcpClient.callTool('scene-create-scene', {
                options: {
                    dbURL: testFolderPath,
                    baseName: 'scene-2d',
                    templateType: '2d',
                },
            });

            // 打开测试场景
            await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: testSceneUrl,
            });
        } catch (error) {
            // 文件夹可能已存在，忽略错误
            console.log('Test folder may already exist, continuing...');
        }
    });

    afterAll(async () => {
        // 清理测试文件夹 - 使用Cocos资源API
        if (testFolderPath && mcpClient) {
            try {
                await mcpClient.callTool('assets-delete-asset', {
                    dbPath: testFolderPath,
                });
                console.log(`Cleaned up test folder: ${testFolderPath}`);
            } catch (error) {
                console.warn(`Failed to clean up test folder: ${error}`);
            }
        }

        // 关闭客户端和服务器
        if (mcpClient) {
            await mcpClient.close();
        }

        // 清理测试项目
        if (testProject) {
            await testProject.cleanup();
        }
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
});