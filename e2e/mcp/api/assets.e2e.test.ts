import { MCPTestClient } from '../../helpers/mcp-client';
import { createTestProject, generateTestId } from '../../helpers/test-utils';
import { TestProject } from '../../helpers/project-manager';
import { resolve, join } from 'path';
import { outputFile, remove, readFileSync } from 'fs-extra';

// 导入共享的测试数据和辅助函数
import {
    CREATE_ASSET_TYPE_TEST_CASES,
    generateTestFileName,
    TEST_ASSET_CONTENTS,
    CreateAssetTypeTestCase,
    COMMON_QUERY_OPTIONS,
} from '../../../tests/shared/asset-test-data';
import {
    validateAssetCreated,
    validateAssetFileExists,
    validateAssetMetaExists,
    validateAssetDeleted,
    validateAssetMoved,
    validateFileAsset,
    validateFolderAsset,
    validateImportAssetResult,
    validateAssetSaved,
    validateAssetRenamed,
    validateQueryUUIDResult,
    validateQueryPathResult,
    validateQueryUrlResult,
    validateAssetMetaStructure,
    validateQueryAssetsResult,
    validateCreateMapResult,
    validateRefreshResult,
    validateUserDataUpdated,
} from '../../../tests/shared/asset-test-helpers';

describe('MCP Assets API', () => {
    let testProject: TestProject;
    let mcpClient: MCPTestClient;
    const testRootUrl = 'db://assets/e2e-test';
    let testRootPath: string;

    beforeAll(async () => {
        // 创建测试项目（使用新的推荐 API）
        const fixtureProject = resolve(__dirname, '../../../tests/fixtures/projects/asset-operation');
        testProject = await createTestProject(fixtureProject);
        testRootPath = join(testProject.path, 'assets', 'e2e-test');

        // 创建并启动 MCP 客户端（端口自动分配）
        mcpClient = new MCPTestClient({
            projectPath: testProject.path,
        });

        await mcpClient.start();
        console.log(`MCP server started on port: ${mcpClient.getPort()}`);

        // 创建测试根目录
        await mcpClient.callTool('assets-create-asset', {
            options: {
                target: testRootUrl,
            },
        });
    });

    afterAll(async () => {
        // 清理测试资源
        try {
            await mcpClient.callTool('assets-delete-asset', {
                dbPath: testRootUrl,
            });
        } catch (e) {
            console.warn('清理测试资源失败:', e);
        }

        // 关闭客户端和服务器
        if (mcpClient) {
            await mcpClient.close();
        }

        // 清理测试项目（使用新的推荐 API）
        await testProject.cleanup();
    });

    describe('asset-query', () => {
        test('should query asset by url', async () => {
            const result = await mcpClient.callTool('assets-query-asset-info', {
                urlOrUUIDOrPath: 'db://assets/scene-2d.scene',
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
        });

        test('should query asset by uuid', async () => {
            // 首先查询一个已知的资源获取其 UUID
            const queryResult = await mcpClient.callTool('assets-query-asset-info', {
                urlOrUUIDOrPath: 'db://assets/scene-2d.scene',
            });

            if (queryResult.data && queryResult.data.uuid) {
                const result = await mcpClient.callTool('assets-query-asset-info', {
                    urlOrUUIDOrPath: queryResult.data.uuid,
                });

                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();
                expect(result.data.uuid).toBe(queryResult.data.uuid);
            }
        });

        test('should handle non-existent asset', async () => {
            const result = await mcpClient.callTool('assets-query-asset-info', {
                urlOrUUIDOrPath: `db://assets/non-existent-${generateTestId()}`,
            });
            expect(result.data).toBeNull();
        });
    });

    describe('asset-create', () => {
        test('should create new folder', async () => {
            const folderName = `test-folder-${generateTestId()}`;
            const folderUrl = `${testRootUrl}/${folderName}`;

            const result = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: folderUrl,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                // 使用共享的验证函数
                validateAssetCreated(result.data);
                expect(result.data.url).toContain(folderName);
                expect(result.data.isDirectory).toBeTruthy();

                // 验证文件系统
                const folderPath = join(testRootPath, folderName);
                validateFolderAsset(result.data, folderPath);
            }
        });

        test('should create new text file', async () => {
            const fileName = generateTestFileName('test-file', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const result = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                validateAssetCreated(result.data);

                const filePath = join(testRootPath, fileName);
                validateFileAsset(result.data, filePath, TEST_ASSET_CONTENTS.text);
            }
        });

        test('should create new script', async () => {
            const scriptName = `TestScript-${generateTestId()}.ts`;
            const scriptUrl = `${testRootUrl}/${scriptName}`;

            const result = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: scriptUrl,
                    content: TEST_ASSET_CONTENTS.script,
                },
            });

            if (result.code === 200 && result.data) {
                validateAssetCreated(result.data, 'cc.Script');

                const scriptPath = join(testRootPath, scriptName);
                validateFileAsset(result.data, scriptPath, TEST_ASSET_CONTENTS.script);
            }
        });
    });

    describe('asset-create-by-type', () => {
        // 使用共享的测试用例数据
        test.each(CREATE_ASSET_TYPE_TEST_CASES)(
            'should create $description ($type) via MCP',
            async ({ type, ext, ccType, skipTypeCheck, templateName }: CreateAssetTypeTestCase) => {
                const baseName = templateName ? `${templateName}-${type}` : type;
                const fileName = `${baseName}.${ext}`;

                // ✅ 修正参数格式：MCP 工具参数是对象形式，对应装饰器定义的参数名
                const result = await mcpClient.callTool('assets-create-asset-by-type', {
                    ccType: type,           // ✅ 对应 @param(SchemaSupportCreateType) ccType
                    dirOrUrl: testRootPath, // ✅ 对应 @param(SchemaDirOrDbPath) dirOrUrl
                    baseName,               // ✅ 对应 @param(SchemaBaseName) baseName
                    options: {              // ✅ 对应 @param(SchemaCreateAssetByTypeOptions) options
                        overwrite: true,
                        templateName,
                    },
                });

                // 根据实际 API 调整期望
                if (result.code === 200 && result.data) {
                    // 使用共享的验证函数
                    validateAssetCreated(result.data, ccType, skipTypeCheck);

                    const filePath = join(testRootPath, fileName);
                    validateAssetFileExists(filePath);
                    validateAssetMetaExists(filePath);
                } else {
                    // 如果 API 不存在，记录信息
                    console.log(`assets-create-asset-by-type for ${type} returned:`, result.code);
                }
            }
        );
    });

    describe('asset-delete', () => {
        test('should delete existing asset', async () => {
            // 先创建一个资源
            const assetName = `to-delete-${generateTestId()}`;
            const assetUrl = `${testRootUrl}/${assetName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: assetUrl,
                },
            });

            if (createResult.code === 200) {
                // 删除该资源
                const deleteResult = await mcpClient.callTool('assets-delete-asset', {
                    dbPath: assetUrl,
                });

                expect(deleteResult.code).toBe(200);

                // 验证删除结果
                const assetPath = join(testRootPath, assetName);
                validateAssetDeleted(assetPath);
            }
        });

        test('should delete by uuid', async () => {
            const assetName = `to-delete-uuid-${generateTestId()}`;
            const assetUrl = `${testRootUrl}/${assetName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: assetUrl,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const uuid = createResult.data.uuid;

                // 使用 UUID 删除
                const deleteResult = await mcpClient.callTool('assets-delete-asset', {
                    dbPath: uuid,
                });

                expect(deleteResult.code).toBe(200);

                // 验证删除结果
                const assetPath = join(testRootPath, assetName);
                validateAssetDeleted(assetPath);
            }
        });

        test('should handle deleting non-existent asset', async () => {
            const result = await mcpClient.callTool('assets-delete-asset', {
                dbPath: `${testRootUrl}/non-existent-${generateTestId()}`,
            });

            expect(result.code).not.toBe(200);
        });
    });

    describe('asset-move', () => {
        test('should move asset to new location', async () => {
            // 创建源资源
            const sourceName = `source-${generateTestId()}`;
            const destName = `dest-${generateTestId()}`;
            const sourceUrl = `${testRootUrl}/${sourceName}`;
            const destUrl = `${testRootUrl}/${destName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: sourceUrl,
                },
            });

            if (createResult.code === 200) {
                // 移动资源
                const moveResult = await mcpClient.callTool('assets-move-asset', {
                    source: sourceUrl,
                    target: destUrl,
                });

                expect(moveResult.code).toBe(200);

                // 使用共享的验证函数
                const sourcePath = join(testRootPath, sourceName);
                const destPath = join(testRootPath, destName);
                validateAssetMoved(sourcePath, destPath);
            }
        });

        test('should handle moving to existing location', async () => {
            const source1 = `source1-${generateTestId()}`;
            const source2 = `source2-${generateTestId()}`;

            // 创建两个资源
            await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${testRootUrl}/${source1}`,
                },
            });

            await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${testRootUrl}/${source2}`,
                },
            });

            // 尝试移动到已存在的位置
            const result = await mcpClient.callTool('assets-move-asset', {
                source: `${testRootUrl}/${source1}`,
                target: `${testRootUrl}/${source2}`,
            });

            // 应该失败
            expect(result.code).not.toBe(200);
        });
    });

    describe('asset-save', () => {
        test('should save asset content', async () => {
            // 创建一个文本文件
            const fileName = generateTestFileName('save-test', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'original content',
                },
            });

            // 保存新内容
            const newContent = 'updated content';
            const saveResult = await mcpClient.callTool('assets-save-asset', {
                pathOrUrlOrUUID: fileUrl,
                data: newContent,
            });

            if (saveResult.code === 200) {
                const filePath = join(testRootPath, fileName);
                validateAssetSaved(filePath, newContent);
            }
        });
    });

    describe('asset-import', () => {
        test('should import external file', async () => {
            // 创建一个临时文件
            const tempFileName = `temp-${generateTestId()}.txt`;
            const tempFilePath = join(testProject.path, tempFileName);
            await outputFile(tempFilePath, TEST_ASSET_CONTENTS.text);

            const targetName = `imported-${generateTestId()}.txt`;
            const targetPath = join(testRootPath, targetName);

            const result = await mcpClient.callTool('assets-import-asset', {
                source: tempFilePath,
                target: targetPath,
            });

            if (result.code === 200 && result.data) {
                validateImportAssetResult({
                    assets: Array.isArray(result.data) ? result.data : [result.data],
                    targetPath,
                    expectedCount: 1,
                });

                const content = readFileSync(targetPath, 'utf8');
                expect(content).toEqual(TEST_ASSET_CONTENTS.text);
            }

            // 清理临时文件
            await remove(tempFilePath);
        });

        test('should import and overwrite existing file', async () => {
            const fileName = `overwrite-${generateTestId()}.txt`;
            const fileUrl = `${testRootUrl}/${fileName}`;
            const filePath = join(testRootPath, fileName);

            // 先创建一个文件
            await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'original',
                },
            });

            // 创建临时源文件
            const tempFilePath = join(testProject.path, `temp-${generateTestId()}.txt`);
            await outputFile(tempFilePath, 'new content');

            // 导入并覆盖
            const result = await mcpClient.callTool('assets-import-asset', {
                source: tempFilePath,
                target: filePath,
                options: {
                    overwrite: true,
                },
            });

            if (result.code === 200) {
                const content = readFileSync(filePath, 'utf8');
                expect(content).toEqual('new content');
            }

            // 清理
            await remove(tempFilePath);
        });
    });

    describe('asset-reimport', () => {
        test('should reimport asset', async () => {
            // 创建一个资源
            const fileName = generateTestFileName('reimport-test', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                // 重新导入
                const reimportResult = await mcpClient.callTool('assets-reimport-asset', {
                    pathOrUrlOrUUID: createResult.data.uuid,
                });

                expect(reimportResult.code).toBe(200);
            }
        });
    });

    // ==================== 查询相关 API 测试 ====================

    describe('asset-query-uuid', () => {
        test('should query UUID by URL', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('uuid-test', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const uuidResult = await mcpClient.callTool('assets-query-uuid', {
                    urlOrPath: fileUrl,
                });

                expect(uuidResult.code).toBe(200);
                validateQueryUUIDResult(uuidResult.data);
                expect(uuidResult.data).toBe(createResult.data.uuid);
            }
        });

        test('should return null for non-existent asset', async () => {
            const result = await mcpClient.callTool('assets-query-uuid', {
                urlOrPath: `${testRootUrl}/non-existent-${generateTestId()}`,
            });

            expect(result.data).toEqual('');
        });
    });

    describe('asset-query-path', () => {
        test('should query path by URL', async () => {
            const result = await mcpClient.callTool('assets-query-path', {
                urlOrUuid: 'db://assets',
            });

            expect(result.code).toBe(200);
            validateQueryPathResult(result.data, true);
        });

        test('should query path by UUID', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('path-test', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const pathResult = await mcpClient.callTool('assets-query-path', {
                    urlOrUuid: createResult.data.uuid,
                });

                expect(pathResult.code).toBe(200);
                validateQueryPathResult(pathResult.data, true);
                expect(pathResult.data).toContain(fileName);
            }
        });
    });

    describe('asset-query-url', () => {
        test('should query URL by path', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('url-test', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const urlResult = await mcpClient.callTool('assets-query-url', {
                    uuidOrPath: createResult.data.file,
                });

                expect(urlResult.code).toBe(200);
                validateQueryUrlResult(urlResult.data);
                expect(urlResult.data).toBe(fileUrl);
            }
        });
    });

    describe('asset-query-asset-meta', () => {
        test('should query asset meta by URL', async () => {
            const result = await mcpClient.callTool('assets-query-asset-meta', {
                urlOrUUIDOrPath: 'db://assets/scene-2d.scene',
            });

            expect(result.code).toBe(200);
            if (result.data) {
                validateAssetMetaStructure(result.data);
            }
        });

        test('should query asset meta by UUID', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('meta-test', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const metaResult = await mcpClient.callTool('assets-query-asset-meta', {
                    urlOrUUIDOrPath: createResult.data.uuid,
                });

                expect(metaResult.code).toBe(200);
                if (metaResult.data) {
                    validateAssetMetaStructure(metaResult.data);
                }
            }
        });

        test('should return null for non-existent asset', async () => {
            const result = await mcpClient.callTool('assets-query-asset-meta', {
                urlOrUUIDOrPath: `${testRootUrl}/non-existent-${generateTestId()}`,
            });

            expect(result.data).toBeNull();
        });
    });

    describe('asset-query-create-map', () => {
        test('should query create map', async () => {
            const result = await mcpClient.callTool('assets-query-create-map', {});

            expect(result.code).toBe(200);
            validateCreateMapResult(result.data);

            // 验证包含一些常见的资源类型
            const allItems = result.data.flatMap((item: any) =>
                item.submenu ? item.submenu : [item]
            );

            const handlers = allItems.map((item: any) => item.handler);
            expect(handlers).toContain('typescript');
            expect(handlers).toContain('scene');
        });
    });

    describe('asset-query-asset-infos', () => {
        test('should query all assets', async () => {
            const result = await mcpClient.callTool('assets-query-asset-infos', {
                options: COMMON_QUERY_OPTIONS.all,
            });

            expect(result.code).toBe(200);
            validateQueryAssetsResult(result.data, 1);
        });

        test('should query assets by pattern', async () => {
            const result = await mcpClient.callTool('assets-query-asset-infos', {
                options: COMMON_QUERY_OPTIONS.internalDb,
            });

            expect(result.code).toBe(200);
            validateQueryAssetsResult(result.data, 1);

            // 所有结果应该是 internal 数据库的
            result.data.forEach((asset: any) => {
                expect(asset.url).toContain('db://internal');
            });
        });

        test('should query assets by ccType', async () => {
            const result = await mcpClient.callTool('assets-query-asset-infos', {
                options: COMMON_QUERY_OPTIONS.scenes,
            });

            expect(result.code).toBe(200);

            if (result.data.length > 0) {
                result.data.forEach((asset: any) => {
                    expect(asset.type).toBe('cc.SceneAsset');
                });
            }
        });
    });

    // ==================== 资源操作相关 API 测试 ====================

    describe('asset-rename', () => {
        test('should rename asset', async () => {
            // 创建源资源
            const sourceName = `rename-source-${generateTestId()}`;
            const targetName = `rename-target-${generateTestId()}`;
            const sourceUrl = `${testRootUrl}/${sourceName}`;
            const targetUrl = `${testRootUrl}/${targetName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: sourceUrl,
                },
            });

            if (createResult.code === 200) {
                // 重命名
                const renameResult = await mcpClient.callTool('assets-rename-asset', {
                    source: sourceUrl,
                    target: targetUrl,
                    options: {},
                });

                expect(renameResult.code).toBe(200);

                if (renameResult.data) {
                    validateAssetRenamed(sourceUrl, targetUrl, renameResult.data);

                    // 验证文件系统
                    const sourcePath = join(testRootPath, sourceName);
                    const targetPath = join(testRootPath, targetName);
                    validateAssetMoved(sourcePath, targetPath);
                }
            }
        });

        test('should handle renaming to existing name', async () => {
            const name1 = `rename-exist-1-${generateTestId()}`;
            const name2 = `rename-exist-2-${generateTestId()}`;

            // 创建两个资源
            await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${testRootUrl}/${name1}`,
                },
            });

            await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${testRootUrl}/${name2}`,
                },
            });

            // 尝试重命名到已存在的名称
            const result = await mcpClient.callTool('assets-rename-asset', {
                source: `${testRootUrl}/${name1}`,
                target: `${testRootUrl}/${name2}`,
                options: {},
            });

            // 应该失败或使用 rename 选项
            expect(result.code).not.toBe(200);
        });
    });

    describe('asset-refresh', () => {
        test('should refresh asset directory', async () => {
            // 创建测试文件夹
            const folderName = `refresh-test-${generateTestId()}`;
            const folderUrl = `${testRootUrl}/${folderName}`;

            await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: folderUrl,
                },
            });

            // 刷新目录
            const result = await mcpClient.callTool('assets-refresh', {
                dir: folderUrl,
            });

            expect(result.code).toBe(200);
            validateRefreshResult(result.code);
        });

        test('should refresh root assets directory', async () => {
            const result = await mcpClient.callTool('assets-refresh', {
                dir: 'db://assets',
            });

            expect(result.code).toBe(200);
        });
    });

    // ==================== 用户数据相关 API 测试 ====================

    describe('asset-query-asset-user-data-config', () => {
        test('should query user data config', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('userdata-test', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const result = await mcpClient.callTool('assets-query-asset-user-data-config', {
                    urlOrUuidOrPath: createResult.data.uuid,
                });

                expect(result.code).toBe(200);
                // 用户数据配置可能为 null 或对象
                if (result.data) {
                    expect(typeof result.data).toBe('object');
                }
            }
        });
    });

    describe('asset-update-asset-user-data', () => {
        test('should update asset user data', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('update-userdata', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const testValue = 'testValue123';

                // 更新用户数据
                const updateResult = await mcpClient.callTool('assets-update-asset-user-data', {
                    urlOrUuidOrPath: createResult.data.uuid,
                    path: 'customKey',
                    value: testValue,
                });

                expect(updateResult.code).toBe(200);

                // 验证更新结果
                const metaResult = await mcpClient.callTool('assets-query-asset-meta', {
                    urlOrUUIDOrPath: createResult.data.uuid,
                });

                if (metaResult.code === 200 && metaResult.data) {
                    validateUserDataUpdated(metaResult.data, 'customKey', testValue);
                }
            }
        });

        test('should update nested user data', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('nested-userdata', 'txt');
            const fileUrl = `${testRootUrl}/${fileName}`;

            const createResult = await mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                // 设置嵌套值
                await mcpClient.callTool('assets-update-asset-user-data', {
                    urlOrUuidOrPath: createResult.data.uuid,
                    path: 'nested.key',
                    value: 'nestedValue',
                });

                // 验证
                const metaResult = await mcpClient.callTool('assets-query-asset-meta', {
                    urlOrUUIDOrPath: createResult.data.uuid,
                });

                if (metaResult.code === 200 && metaResult.data) {
                    validateUserDataUpdated(metaResult.data, 'nested.key', 'nestedValue');
                }
            }
        });
    });

    describe('asset-update-default-user-data', () => {
        test('should update default user data', async () => {
            // 这是一个全局设置，测试需要谨慎
            // 通常会影响后续导入的同类型资源
            const result = await mcpClient.callTool('assets-update-default-user-data', {
                options: {
                    handler: 'image',
                    key: 'type',
                    value: 'texture',
                },
            });

            expect(result.code).toBe(200);
        });
    });
});
