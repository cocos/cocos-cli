import { MCPTestClient } from '../../helpers/mcp-client';
import { createTestProject, E2E_TIMEOUTS } from '../../helpers/test-utils';
import { TestProject } from '../../helpers/project-manager';
import { resolve, join } from 'path';
import { pathExists } from 'fs-extra';

describe('MCP Builder API', () => {
    let testProject: TestProject;
    let mcpClient: MCPTestClient;

    beforeAll(async () => {
        // 创建测试项目（使用新的推荐 API）
        const fixtureProject = resolve(__dirname, '../../../tests/fixtures/projects/asset-operation');
        testProject = await createTestProject(fixtureProject);

        // 创建并启动 MCP 客户端（端口自动分配）
        mcpClient = new MCPTestClient({
            projectPath: testProject.path,
        });

        await mcpClient.start();
        console.log(`MCP server started on port: ${mcpClient.getPort()}`);
    });

    afterAll(async () => {
        // 关闭客户端和服务器
        if (mcpClient) {
            await mcpClient.close();
        }

        // 清理测试项目（使用新的推荐 API）
        await testProject.cleanup();
    });

    describe('builder-build', () => {
        test('should build with custom options', async () => {
            const result = await mcpClient.callTool('builder-build', {
                options: {
                    platform: 'web-desktop',
                    debug: true,
                    md5Cache: false,
                    sourceMaps: true,
                    buildPath: 'project://build-mcp-test',
                    outputName: 'web-desktop',
                },
            });

            expect(result.code).toBe(200);
            // 验证构建输出
            const buildPath = join(testProject.path, 'build-mcp-test', 'web-desktop');
            const buildExists = await pathExists(buildPath);
            expect(buildExists).toBe(true);
            if (result.data) {
                expect(result.data.code).toBe(0);
                expect(result.data.dest).toBe('project://build-mcp-test/web-desktop');
            }
        }, E2E_TIMEOUTS.BUILD_OPERATION);

        test('should build web-mobile project', async () => {
            const result = await mcpClient.callTool('builder-build', {
                options: {
                    platform: 'web-mobile',
                    outputName: 'web-mobile',
                    debug: true,
                    buildPath: 'project://build',
                },
            });

            expect(result.code).toBe(200);
            if (result.data) {
                expect(result.data.code).toBe(0);
                expect(result.data.dest).toBe('project://build/web-mobile');
            }
        }, E2E_TIMEOUTS.BUILD_OPERATION);
    });

    describe('builder-query-default-build-config', () => {
        test('should query web-desktop default config', async () => {
            const result = await mcpClient.callTool('builder-query-default-build-config', {
                platform: 'web-desktop',
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                // 验证返回的配置结构
                expect(result.data).toHaveProperty('platform');
                expect(result.data.platform).toBe('web-desktop');

                // 验证包含基本配置项
                expect(result.data).toHaveProperty('debug');
                expect(result.data).toHaveProperty('md5Cache');

                // 验证构建路径配置
                if (result.data.buildPath) {
                    expect(typeof result.data.buildPath).toBe('string');
                }
            }
        });

        test('should query web-mobile default config', async () => {
            const result = await mcpClient.callTool('builder-query-default-build-config', {
                platform: 'web-mobile',
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.platform).toBe('web-mobile');

                // web-mobile 应该有相同的基本配置
                expect(result.data).toHaveProperty('debug');
                expect(result.data).toHaveProperty('md5Cache');
            }
        });

        test('should return valid config fields', async () => {
            const result = await mcpClient.callTool('builder-query-default-build-config', {
                platform: 'web-desktop',
            });

            if (result.code === 200 && result.data) {
                // 验证配置中的常见字段类型
                if (result.data.debug !== undefined) {
                    expect(typeof result.data.debug).toBe('boolean');
                }

                if (result.data.md5Cache !== undefined) {
                    expect(typeof result.data.md5Cache).toBe('boolean');
                }

                if (result.data.sourceMaps !== undefined) {
                    expect(typeof result.data.sourceMaps).toBe('boolean');
                }

                if (result.data.packAutoAtlas !== undefined) {
                    expect(typeof result.data.packAutoAtlas).toBe('boolean');
                }

                // 验证 packages 数据（重要）
                if (result.data.packages !== undefined) {
                    expect(typeof result.data.packages['web-desktop']).toBe('object');
                    expect(typeof result.data.packages['web-desktop'].resolution).toBe('object');
                    expect(typeof result.data.packages['web-desktop'].resolution.designHeight).toBe('number');
                    expect(typeof result.data.packages['web-desktop'].resolution.designWidth).toBe('number');
                }
            }
        });
    });

    describe('builder-run', () => {
        // 暂时注释，否则 ci 测试机上面一直不停的打开 chrome 页面
        // test('should run built project', async () => {
        //     await mcpClient.callTool('builder-build', {
        //         options: {
        //             platform: 'web-desktop',
        //             outputName: 'web-desktop',
        //             debug: true,
        //             buildPath: 'project://build-run-test',
        //         },
        //     });
        //     // 运行构建结果
        //     const result = await mcpClient.callTool('builder-run', {
        //         dest: 'project://build-run-test/web-desktop',
        //     });

        //     expect(result.code).toBe(200);

        //     if (result.data) {
        //         // 应该返回预览 URL
        //         expect(typeof result.data).toBe('string');
        //         expect(result.data).toMatch(/http/);
        //     }
        // }, E2E_TIMEOUTS.BUILD_OPERATION);

        test('should handle invalid build path', async () => {
            const result = await mcpClient.callTool('builder-run', {
                dest: '/invalid/path/that/does/not/exist',
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });
});
