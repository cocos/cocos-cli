import { AssetsTestContext, setupAssetsTestEnvironment, teardownAssetsTestEnvironment } from '../../../helpers/test-utils';

// 导入共享的测试数据和辅助函数
import {
    generateTestFileName,
    TEST_ASSET_CONTENTS,
} from '../../../../tests/shared/asset-test-data';
import {
    validateUserDataUpdated,
} from '../../../../tests/shared/asset-test-helpers';

describe('MCP Assets API - User Data', () => {
    let context: AssetsTestContext;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    describe('asset-query-asset-user-data-config', () => {
        test('should query user data config', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('userdata-test', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const result = await context.mcpClient.callTool('assets-query-asset-user-data-config', {
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
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                const testValue = 'testValue123';

                // 更新用户数据
                const updateResult = await context.mcpClient.callTool('assets-update-asset-user-data', {
                    urlOrUuidOrPath: createResult.data.uuid,
                    path: 'customKey',
                    value: testValue,
                });

                expect(updateResult.code).toBe(200);

                // 验证更新结果
                const metaResult = await context.mcpClient.callTool('assets-query-asset-meta', {
                    urlOrUUIDOrPath: createResult.data.uuid,
                });

                expect(metaResult.code).toBe(200);
                validateUserDataUpdated(metaResult.data, 'customKey', testValue);
            }
        });

        test('should update nested user data', async () => {
            // 创建测试资源
            const fileName = generateTestFileName('nested-userdata', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            if (createResult.code === 200 && createResult.data) {
                // 设置嵌套值
                await context.mcpClient.callTool('assets-update-asset-user-data', {
                    urlOrUuidOrPath: createResult.data.uuid,
                    path: 'nested.key',
                    value: 'nestedValue',
                });

                // 验证
                const metaResult = await context.mcpClient.callTool('assets-query-asset-meta', {
                    urlOrUUIDOrPath: createResult.data.uuid,
                });

                expect(metaResult.code).toBe(200);
                validateUserDataUpdated(metaResult.data, 'nested.key', 'nestedValue');
            }
        });
    });

    describe('asset-update-default-user-data', () => {
        test('should update default user data', async () => {
            // 这是一个全局设置，测试需要谨慎
            // 通常会影响后续导入的同类型资源
            const result = await context.mcpClient.callTool('assets-update-default-user-data', {
                handler: 'image',
                path: 'type',
                value: 'texture',
            });

            expect(result.code).toBe(200);
        });
    });
});

