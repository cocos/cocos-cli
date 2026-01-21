import { AssetsTestContext, generateTestId, setupAssetsTestEnvironment, teardownAssetsTestEnvironment } from '../../helpers/test-utils';
import { ReloadResult } from '../../../src/core/scene/common/editor/type';

/**
 * 测试打开预制体文件后，使用场景 API 对预制体内部进行操作
 * 
 * 测试流程：
 * 1. 创建预制体资源 (.prefab 文件)
 * 2. 使用 scene-open 打开预制体
 * 3. 对预制体内部节点和组件进行各种操作
 * 4. 保存预制体
 */
describe('MCP Editor Prefab API - Scene Operations on Prefab Assets', () => {
    let context: AssetsTestContext;
    let testSceneUrl: string;
    let testFolderPath: string;

    beforeAll(async () => {
        // 使用共享的 Assets 测试环境
        context = await setupAssetsTestEnvironment();

        // 设置测试场景路径（用于创建初始预制体）
        testSceneUrl = 'db://assets/scene-2d.scene';

        // 统一的测试文件夹路径
        testFolderPath = context.testRootUrl;
    });

    afterAll(async () => {
        // 清理测试环境（不关闭服务器）
        await teardownAssetsTestEnvironment(context);
    });

    // 每个测试后确保预制体/场景关闭
    afterEach(async () => {
        try {
            await context.mcpClient.callTool('scene-close', {});
        } catch {
            // 忽略关闭失败
        }
    });

    /**
     * 辅助函数：创建一个预制体资源
     */
    async function createTestPrefab(prefabName?: string): Promise<string> {
        const name = prefabName || `test-prefab-${generateTestId()}`;
        const prefabUrl = `${testFolderPath}/${name}.prefab`;

        // 先打开场景创建节点
        await context.mcpClient.callTool('scene-open', {
            dbURLOrUUID: testSceneUrl,
        });

        // 创建一个节点
        const nodeName = `node-${generateTestId()}`;
        const createNodeResult = await context.mcpClient.callTool('scene-create-node-by-type', {
            options: {
                path: '/',
                name: nodeName,
                nodeType: 'Empty',
            }
        });

        if (createNodeResult.code !== 200 || !createNodeResult.data) {
            throw new Error('Failed to create node for prefab');
        }

        // 将节点转换为预制体
        const createPrefabResult = await context.mcpClient.callTool('create-prefab-from-node', {
            options: {
                nodePath: createNodeResult.data.path,
                dbURL: prefabUrl,
            }
        });

        if (createPrefabResult.code !== 200) {
            throw new Error('Failed to create prefab');
        }

        // 关闭场景
        await context.mcpClient.callTool('scene-close', {});

        return prefabUrl;
    }

    describe('Prefab File Operations', () => {
        describe('scene-open (Prefab)', () => {
            test('should open prefab file by URL', async () => {
                // 1. 创建预制体
                const prefabUrl = await createTestPrefab();

                // 2. 打开预制体
                const result = await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: prefabUrl,
                });

                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();
            });

            test('should open prefab file by UUID', async () => {
                // 1. 创建预制体
                const prefabUrl = await createTestPrefab();

                // 2. 先通过 URL 打开获取 UUID
                const openResult = await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: prefabUrl,
                });

                expect(openResult.code).toBe(200);
                expect(openResult.data).toBeDefined();

                // 3. 关闭预制体
                await context.mcpClient.callTool('scene-close', {});

                const queryData = await context.mcpClient.callTool('assets-query-uuid', {
                    urlOrPath: prefabUrl
                });

                expect(queryData.code).toBe(200);
                expect(queryData.data).toBeDefined();

                // 4. 通过 UUID 重新打开
                const reopenResult = await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: queryData.data,
                });

                expect(reopenResult.code).toBe(200);
                expect(openResult.data).toBeDefined();
            });

            test('should handle opening non-existent prefab', async () => {
                const result = await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: `${testFolderPath}/non-existent-${generateTestId()}.prefab`,
                });

                expect(result.code).not.toBe(200);
                expect(result.reason).toBeDefined();
            });
        });

        describe('scene-query-current (Prefab)', () => {
            test('should return current prefab info', async () => {
                // 1. 创建并打开预制体
                const prefabUrl = await createTestPrefab();
                await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: prefabUrl,
                });

                // 2. 查询当前打开的资源
                const result = await context.mcpClient.callTool('scene-query-current', {});

                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();
            });

            test('should return null when no prefab is open', async () => {
                // 确保没有打开的资源
                await context.mcpClient.callTool('scene-close', {});

                const result = await context.mcpClient.callTool('scene-query-current', {});

                expect(result.code).toBe(200);
                expect(result.data).toBeNull();
            });
        });

        describe('scene-close (Prefab)', () => {
            test('should close currently open prefab', async () => {
                // 1. 创建并打开预制体
                const prefabUrl = await createTestPrefab();
                await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: prefabUrl,
                });

                // 2. 关闭预制体
                const result = await context.mcpClient.callTool('scene-close', {});

                expect(result.code).toBe(200);
                expect(result.data).toBe(true);

                // 3. 验证预制体已关闭
                const queryResult = await context.mcpClient.callTool('scene-query-current', {});
                expect(queryResult.data).toBeNull();
            });
        });

        describe('scene-save (Prefab)', () => {
            test('should save prefab after modifications', async () => {
                // 1. 创建并打开预制体
                const prefabUrl = await createTestPrefab();
                await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: prefabUrl,
                });

                // 2. 修改预制体（添加子节点）
                const childNodeResult = await context.mcpClient.callTool('scene-create-node-by-type', {
                    options: {
                        path: '/',
                        name: `child-${generateTestId()}`,
                        nodeType: 'Empty',
                    }
                });

                expect(childNodeResult.code).toBe(200);

                // 3. 保存预制体
                const result = await context.mcpClient.callTool('scene-save', {});

                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();
            });

            test('should handle saving when no prefab is open', async () => {
                // 确保没有打开的资源
                await context.mcpClient.callTool('scene-close', {});

                const result = await context.mcpClient.callTool('scene-save', {});

                expect(result.code).not.toBe(200);
                expect(result.reason).toBeDefined();
            });
        });

        describe('scene-reload (Prefab)', () => {
            test('should reload currently open prefab', async () => {
                // 1. 创建并打开预制体
                const prefabUrl = await createTestPrefab();
                await context.mcpClient.callTool('scene-open', {
                    dbURLOrUUID: prefabUrl,
                });

                // 2. 重新加载预制体
                const result = await context.mcpClient.callTool('scene-reload', {});

                expect(result.data).toBe(ReloadResult.SUCCESS); // ReloadResult.SUCCESS
                expect(result.code).toBe(200);
            });

            test('should handle reloading when no prefab is open', async () => {
                await context.mcpClient.callTool('scene-close', {});

                const result = await context.mcpClient.callTool('scene-reload', {});

                expect(result.data).toBe(ReloadResult.NO_EDITOR); // ReloadResult.NO_EDITOR
                expect(result.code).toBe(200);
            });
        });
    });
});
