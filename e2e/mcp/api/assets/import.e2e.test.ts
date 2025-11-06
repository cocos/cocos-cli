import { join } from 'path';
import { outputFile, remove, readFileSync } from 'fs-extra';
import { AssetsTestContext, generateTestId, setupAssetsTestEnvironment, teardownAssetsTestEnvironment } from '../../../helpers/test-utils';

// 导入共享的测试数据和辅助函数
import {
    generateTestFileName,
    TEST_ASSET_CONTENTS,
} from '../../../../tests/shared/asset-test-data';
import {
    validateImportAssetResult,
} from '../../../../tests/shared/asset-test-helpers';

describe('MCP Assets API - Import', () => {
    let context: AssetsTestContext;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    describe('asset-import', () => {
        test('should import external file', async () => {
            // 创建一个临时文件
            const tempFileName = `temp-${generateTestId()}.txt`;
            const tempFilePath = join(context.testProject.path, tempFileName);
            await outputFile(tempFilePath, TEST_ASSET_CONTENTS.text);

            const targetName = `imported-${generateTestId()}.txt`;
            const targetPath = join(context.testRootPath, targetName);
            const result = await context.mcpClient.callTool('assets-import-asset', {
                source: tempFilePath,
                target: targetPath,
            });
            // const result2 = await context.mcpClient.callTool('scene-create-scene', {
            //     options: {}
            // });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            validateImportAssetResult({
                assets: Array.isArray(result.data) ? result.data : [result.data],
                targetPath,
                expectedCount: 1,
            });

            const content = readFileSync(targetPath, 'utf8');
            expect(content).toEqual(TEST_ASSET_CONTENTS.text);

            // 清理临时文件
            await remove(tempFilePath);
        });

        test('should import and overwrite existing file', async () => {
            const fileName = `overwrite-${generateTestId()}.txt`;
            const fileUrl = `${context.testRootUrl}/${fileName}`;
            const filePath = join(context.testRootPath, fileName);

            // 先创建一个文件
            await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'original',
                },
            });

            // 创建临时源文件
            const tempFilePath = join(context.testProject.path, `temp-${generateTestId()}.txt`);
            await outputFile(tempFilePath, 'new content');

            // 导入并覆盖
            const result = await context.mcpClient.callTool('assets-import-asset', {
                source: tempFilePath,
                target: filePath,
                options: {
                    overwrite: true,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            const content = readFileSync(filePath, 'utf8');
            expect(content).toEqual('new content');

            // 清理
            await remove(tempFilePath);
        });
    });

    describe('asset-reimport', () => {
        test('should reimport asset', async () => {
            // 创建一个资源
            const fileName = generateTestFileName('reimport-test', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            expect(createResult.code).toBe(200);
            expect(createResult.data).toBeDefined();

            const reimportResult = await context.mcpClient.callTool('assets-reimport-asset', {
                pathOrUrlOrUUID: createResult.data.uuid,
            });

            expect(reimportResult.code).toBe(200);
        });
    });
});

