import { MCPTestClient } from '../../helpers/mcp-client';
import { createTestProject, generateTestId } from '../../helpers/test-utils';
import { TestProject } from '../../helpers/project-manager';
import { resolve } from 'path';

describe('MCP Scene API', () => {
    let testProject: TestProject;
    let mcpClient: MCPTestClient;
    let testSceneUrl: string;
    let testFolderPath: string;

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

        // 设置测试场景路径
        testSceneUrl = 'db://assets/scene-2d.scene';
        
        // 设置统一的测试文件夹路径
        testFolderPath = 'db://assets/__test__';
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
        await testProject.cleanup();
    });

    describe('scene-query-current-scene', () => {
        test('should return null when no scene is open', async () => {
            const result = await mcpClient.callTool('scene-query-current-scene', {});

            expect(result.code).toBe(200);
            expect(result.data).toBeNull();
        });

        test('should return current scene info after opening a scene', async () => {
            // 先打开一个场景
            await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: testSceneUrl,
            });

            // 查询当前场景
            const result = await mcpClient.callTool('scene-query-current-scene', {});

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(result.data).not.toBeNull();

            if (result.data) {
                expect(result.data.assetUrl).toBe(testSceneUrl);
                expect(result.data.assetName).toBe('scene-2d.scene');
                expect(result.data.assetType).toBe('cc.SceneAsset');
                expect(result.data.assetUuid).toBeDefined();
                expect(result.data.name).toBeDefined();
                expect(result.data.children).toBeDefined();
                expect(result.data.components).toBeDefined();
            }
        });
    });

    describe('scene-open-scene', () => {
        test('should open scene by URL', async () => {
            const result = await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: testSceneUrl,
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.assetUrl).toBe(testSceneUrl);
                expect(result.data.assetName).toBe('scene-2d.scene');
                expect(result.data.assetType).toBe('cc.SceneAsset');
                expect(result.data.assetUuid).toBeDefined();
                expect(result.data.name).toBeDefined();
                expect(result.data.children).toBeDefined();
                expect(result.data.components).toBeDefined();
            }
        });

        test('should open scene by UUID', async () => {
            // 先通过URL打开场景获取UUID
            const openResult = await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: testSceneUrl,
            });

            if (openResult.code === 200 && openResult.data) {
                const uuid = openResult.data.assetUuid;

                // 关闭场景
                await mcpClient.callTool('scene-close-scene', {});

                // 通过UUID重新打开
                const result = await mcpClient.callTool('scene-open-scene', {
                    dbURLOrUUID: uuid,
                });

                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();

                if (result.data) {
                    expect(result.data.assetUuid).toBe(uuid);
                    expect(result.data.assetUrl).toBe(testSceneUrl);
                }
            }
        });

        test('should handle opening non-existent scene', async () => {
            const result = await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: `db://assets/non-existent-${generateTestId()}.scene`,
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });

        test('should handle invalid scene URL format', async () => {
            const result = await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: 'invalid-url-format',
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });

    describe('scene-close-scene', () => {
        test('should close currently open scene', async () => {
            // 先打开一个场景
            await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: testSceneUrl,
            });

            // 关闭场景
            const result = await mcpClient.callTool('scene-close-scene', {});

            expect(result.code).toBe(200);
            expect(result.data).toBe(true);

            // 验证场景已关闭
            const queryResult = await mcpClient.callTool('scene-query-current-scene', {});
            expect(queryResult.data).toBeNull();
        });

        test('should handle closing when no scene is open', async () => {
            // 确保没有场景打开
            await mcpClient.callTool('scene-close-scene', {});

            // 再次尝试关闭
            const result = await mcpClient.callTool('scene-close-scene', {});

            // 应该成功或返回适当的状态
             expect(result.code).toBe(200);
        });
    });

    describe('scene-save-scene', () => {
        test('should save currently open scene', async () => {
            // 先打开一个场景
            await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: testSceneUrl,
            });

            // 保存场景
            const result = await mcpClient.callTool('scene-save-scene', {});

            expect(result.code).toBe(200);
            expect(result.data).toBe(true);
        });

        test('should handle saving when no scene is open', async () => {
            // 确保没有场景打开
            await mcpClient.callTool('scene-close-scene', {});

            // 尝试保存
            const result = await mcpClient.callTool('scene-save-scene', {});

            // 应该失败或返回适当的错误
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });

    describe('scene-create-scene', () => {
        test('should create new 2D scene', async () => {
            const sceneName = `test-scene-2d-${generateTestId()}`;

            const result = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: testFolderPath,
                    templateType: '2d',
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.assetName).toBe(`${sceneName}.scene`);
                expect(result.data.assetType).toBe('cc.SceneAsset');
                expect(result.data.assetUuid).toBeDefined();
                expect(result.data.assetUrl).toContain(sceneName);

                // 验证资源URL包含正确的路径
                expect(result.data.assetUrl).toContain('__test__');
            }
        });

        test('should create new 3D scene', async () => {
            const sceneName = `test-scene-3d-${generateTestId()}`;

            const result = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: testFolderPath,
                    templateType: '3d',
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.assetName).toBe(`${sceneName}.scene`);
                expect(result.data.assetType).toBe('cc.SceneAsset');
                expect(result.data.assetUuid).toBeDefined();
                expect(result.data.assetUrl).toContain(sceneName);

                // 验证资源URL包含正确的路径
                expect(result.data.assetUrl).toContain('__test__');
            }
        });

        test('should create scene with quality template', async () => {
            const sceneName = `test-scene-quality-${generateTestId()}`;

            const result = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: testFolderPath,
                    templateType: 'quality',
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.assetName).toBe(`${sceneName}.scene`);
                expect(result.data.assetType).toBe('cc.SceneAsset');
            }
        });

        test('should create scene without template type (default)', async () => {
            const sceneName = `test-scene-default-${generateTestId()}`;

            const result = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: testFolderPath,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.assetName).toBe(`${sceneName}.scene`);
                expect(result.data.assetType).toBe('cc.SceneAsset');
            }
        });

        test('should handle creating scene with duplicate name', async () => {
            const sceneName = `duplicate-scene-${generateTestId()}`;

            // 创建第一个场景
            const firstResult = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: testFolderPath,
                    templateType: '2d',
                },
            });

            expect(firstResult.code).toBe(200);

            // 尝试创建同名场景
            const secondResult = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: testFolderPath,
                    templateType: '2d',
                },
            });

            // 应该失败或自动重命名
            if (secondResult.code !== 200) {
                expect(secondResult.reason).toBeDefined();
            } else {
                // 如果成功，应该是自动重命名了
                expect(secondResult.data?.assetName).not.toBe(sceneName);
            }
        });

        test('should handle invalid target directory', async () => {
            const sceneName = `test-scene-invalid-${generateTestId()}`;
            const invalidDir = 'db://invalid/path';

            const result = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: invalidDir,
                    templateType: '2d',
                },
            });

            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });

    describe('scene-soft-reload-scene', () => {
        test('should reload currently open scene', async () => {
            // 先打开一个场景
            await mcpClient.callTool('scene-open-scene', {
                dbURLOrUUID: testSceneUrl,
            });

            // 重新加载场景
            const result = await mcpClient.callTool('scene-soft-reload-scene', {});

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.assetUrl).toBe(testSceneUrl);
                expect(result.data.assetName).toBe('scene-2d.scene');
                expect(result.data.assetType).toBe('cc.SceneAsset');
                expect(result.data.assetUuid).toBeDefined();
                expect(result.data.name).toBeDefined();
                expect(result.data.children).toBeDefined();
                expect(result.data.components).toBeDefined();
            }
        });

        test('should handle reloading when no scene is open', async () => {
            // 确保没有场景打开
            await mcpClient.callTool('scene-close-scene', {});

            // 尝试重新加载
            const result = await mcpClient.callTool('scene-soft-reload-scene', {});

            // 应该失败或返回适当的错误
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });

    describe('Scene workflow integration tests', () => {
        test('should support complete scene workflow', async () => {
            const sceneName = `workflow-scene-${generateTestId()}`;

            // 1. 创建新场景
            const createResult = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: sceneName,
                    dbURL: testFolderPath,
                    templateType: '2d',
                },
            });

            expect(createResult.code).toBe(200);
            expect(createResult.data).toBeDefined();

            if (createResult.data) {
                const sceneUrl = createResult.data.assetUrl;

                // 2. 打开创建的场景
                const openResult = await mcpClient.callTool('scene-open-scene', {
                    dbURLOrUUID: sceneUrl,
                });

                expect(openResult.code).toBe(200);
                expect(openResult.data).toBeDefined();

                // 3. 验证当前场景
                const queryResult = await mcpClient.callTool('scene-query-current-scene', {});
                expect(queryResult.code).toBe(200);
                expect(queryResult.data).not.toBeNull();
                expect(queryResult.data?.assetUrl).toBe(sceneUrl);

                // 4. 保存场景
                const saveResult = await mcpClient.callTool('scene-save-scene', {});
                expect(saveResult.code).toBe(200);
                expect(saveResult.data).toBe(true);

                // 5. 重新加载场景
                const reloadResult = await mcpClient.callTool('scene-soft-reload-scene', {});
                expect(reloadResult.code).toBe(200);
                expect(reloadResult.data).toBeDefined();

                // 6. 关闭场景
                const closeResult = await mcpClient.callTool('scene-close-scene', {});
                expect(closeResult.code).toBe(200);
                expect(closeResult.data).toBe(true);

                // 7. 验证场景已关闭
                const finalQueryResult = await mcpClient.callTool('scene-query-current-scene', {});
                expect(finalQueryResult.data).toBeNull();
            }
        });

        test('should handle multiple scene operations', async () => {
            const scene1Name = `multi-scene-1-${generateTestId()}`;
            const scene2Name = `multi-scene-2-${generateTestId()}`;

            // 创建两个场景
            const create1Result = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: scene1Name,
                    dbURL: testFolderPath,
                    templateType: '2d',
                },
            });

            const create2Result = await mcpClient.callTool('scene-create-scene', {
                options: {
                    baseName: scene2Name,
                    dbURL: testFolderPath,
                    templateType: '3d',
                },
            });

            expect(create1Result.code).toBe(200);
            expect(create2Result.code).toBe(200);

            if (create1Result.data && create2Result.data) {
                const scene1Url = create1Result.data.assetUrl;
                const scene2Url = create2Result.data.assetUrl;

                // 打开第一个场景
                await mcpClient.callTool('scene-open-scene', {
                    dbURLOrUUID: scene1Url,
                });

                let queryResult = await mcpClient.callTool('scene-query-current-scene', {});
                expect(queryResult.data?.assetUrl).toBe(scene1Url);

                // 切换到第二个场景
                await mcpClient.callTool('scene-open-scene', {
                    dbURLOrUUID: scene2Url,
                });

                queryResult = await mcpClient.callTool('scene-query-current-scene', {});
                expect(queryResult.data?.assetUrl).toBe(scene2Url);

                // 关闭当前场景
                await mcpClient.callTool('scene-close-scene', {});

                queryResult = await mcpClient.callTool('scene-query-current-scene', {});
                expect(queryResult.data).toBeNull();
            }
        });
    });

    describe('Error handling and edge cases', () => {
        test('should handle malformed scene URLs', async () => {
            const malformedUrls = [
                '',
                'not-a-url',
                'db://',
                'db://assets/',
                'http://invalid.com/scene.scene',
                'file:///path/to/scene.scene',
            ];

            for (const url of malformedUrls) {
                const result = await mcpClient.callTool('scene-open-scene', {
                    dbURLOrUUID: url,
                });

                expect(result.code).not.toBe(200);
                expect(result.reason).toBeDefined();
            }
        });

        test('should handle invalid scene names for creation', async () => {
            const invalidNames = [
                '',
                '   ',
                'name with spaces',
                'name/with/slashes',
                'name\\with\\backslashes',
                'name:with:colons',
                'name*with*asterisks',
                'name?with?questions',
                'name"with"quotes',
                'name<with>brackets',
                'name|with|pipes',
            ];

            for (const name of invalidNames) {
                const result = await mcpClient.callTool('scene-create-scene', {
                    options: {
                        baseName: name,
                        dbURL: testFolderPath,
                        templateType: '2d',
                    },
                });

                // 应该失败或自动清理名称
                if (result.code === 200) {
                    // 如果成功，名称应该被清理过
                    expect(result.data?.assetName).not.toBe(name);
                } else {
                    expect(result.reason).toBeDefined();
                }
            }
        });

        test('should handle concurrent scene operations', async () => {
            // 并发创建多个场景
            const promises = Array.from({ length: 3 }, (_, i) =>
                mcpClient.callTool('scene-create-scene', {
                    options: {
                        baseName: `concurrent-scene-${i}-${generateTestId()}`,
                        dbURL: testFolderPath,
                        templateType: '2d',
                    },
                })
            );

            const results = await Promise.all(promises);
            console.log('Concurrent scene creation results:', results);
            // 所有操作都应该成功
            results.forEach((result: any, index: number) => {
                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();
                expect(result.data?.assetName).toContain(`concurrent-scene-${index}`);
            });
        });
    });
});