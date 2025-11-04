import { generateTestId } from '../../../helpers/test-utils';

// 导入共享的测试数据和辅助函数
import {
    generateTestFileName,
    TEST_ASSET_CONTENTS,
    COMMON_QUERY_OPTIONS,
} from '../../../../tests/shared/asset-test-data';
import {
    validateQueryUUIDResult,
    validateQueryPathResult,
    validateQueryUrlResult,
    validateAssetMetaStructure,
    validateQueryAssetsResult,
    validateCreateMapResult,
} from '../../../../tests/shared/asset-test-helpers';
import { setupAssetsTestEnvironment, teardownAssetsTestEnvironment, AssetsTestContext } from '../../../helpers/test-utils';

describe('MCP Assets API - Query', () => {
    let context: AssetsTestContext;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    describe('asset-query', () => {
        test('should query asset by url', async () => {
            const result = await context.mcpClient.callTool('assets-query-asset-info', {
                urlOrUUIDOrPath: 'db://assets/scene-2d.scene',
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
        });

        test('should query asset by uuid', async () => {
            // 首先查询一个已知的资源获取其 UUID
            const queryResult = await context.mcpClient.callTool('assets-query-asset-info', {
                urlOrUUIDOrPath: 'db://assets/scene-2d.scene',
            });

            if (queryResult.data && queryResult.data.uuid) {
                const result = await context.mcpClient.callTool('assets-query-asset-info', {
                    urlOrUUIDOrPath: queryResult.data.uuid,
                });

                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();
                expect(result.data.uuid).toBe(queryResult.data.uuid);
            }
        });

        test('should handle non-existent asset', async () => {
            const result = await context.mcpClient.callTool('assets-query-asset-info', {
                urlOrUUIDOrPath: `db://assets/non-existent-${generateTestId()}`,
            });
            expect(result.data).toBeNull();
        });
    });

    describe('asset-query-uuid', () => {
        test('should query UUID by URL', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('uuid-test', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });
            const uuidResult = await context.mcpClient.callTool('assets-query-uuid', {
                urlOrPath: fileUrl,
            });

            expect(uuidResult.code).toBe(200);
            validateQueryUUIDResult(uuidResult.data);
            expect(uuidResult.data).toBe(createResult.data.uuid);
        });

        test('should return null for non-existent asset', async () => {
            const result = await context.mcpClient.callTool('assets-query-uuid', {
                urlOrPath: `${context.testRootUrl}/non-existent-${generateTestId()}`,
            });

            expect(result.data).toEqual('');
        });
    });

    describe('asset-query-path', () => {
        test('should query path by URL', async () => {
            const result = await context.mcpClient.callTool('assets-query-path', {
                urlOrUuid: 'db://assets',
            });

            expect(result.code).toBe(200);
            validateQueryPathResult(result.data, true);
        });

        test('should query path by UUID', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('path-test', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });
            const pathResult = await context.mcpClient.callTool('assets-query-path', {
                urlOrUuid: createResult.data.uuid,
            });

            expect(pathResult.code).toBe(200);
            validateQueryPathResult(pathResult.data, true);
            expect(pathResult.data).toContain(fileName);
        });
    });

    describe('asset-query-url', () => {
        test('should query URL by path', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('url-test', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const urlResult = await context.mcpClient.callTool('assets-query-url', {
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
            const result = await context.mcpClient.callTool('assets-query-asset-meta', {
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
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const metaResult = await context.mcpClient.callTool('assets-query-asset-meta', {
                    urlOrUUIDOrPath: createResult.data.uuid,
                });

                expect(metaResult.code).toBe(200);
                if (metaResult.data) {
                    validateAssetMetaStructure(metaResult.data);
                }
            }
        });

        test('should return null for non-existent asset', async () => {
            const result = await context.mcpClient.callTool('assets-query-asset-meta', {
                urlOrUUIDOrPath: `${context.testRootUrl}/non-existent-${generateTestId()}`,
            });

            expect(result.data).toBeNull();
        });
    });

    describe('asset-query-create-map', () => {
        test('should query create map', async () => {
            const result = await context.mcpClient.callTool('assets-query-create-map', {});

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
            const result = await context.mcpClient.callTool('assets-query-asset-infos', {
                options: COMMON_QUERY_OPTIONS.all,
            });

            expect(result.code).toBe(200);
            validateQueryAssetsResult(result.data, 1);
        });

        test('should query assets by pattern', async () => {
            const result = await context.mcpClient.callTool('assets-query-asset-infos', {
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
            const result = await context.mcpClient.callTool('assets-query-asset-infos', {
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
});

