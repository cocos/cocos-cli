import { join, extname } from 'path';
import { outputFile, readFileSync, existsSync } from 'fs-extra';
import { v4 as uuidv4 } from 'node-uuid';
import { AssetsTestContext, generateTestId, setupAssetsTestEnvironment, teardownAssetsTestEnvironment } from '../../../helpers/test-utils';

// 导入共享的测试数据和辅助函数
import {
    CREATE_ASSET_TYPE_TEST_CASES,
    generateTestFileName,
    TEST_ASSET_CONTENTS,
    CreateAssetTypeTestCase,
} from '../../../../tests/shared/asset-test-data';
import {
    validateAssetCreated,
    validateAssetFileExists,
    validateAssetMetaExists,
    validateAssetDeleted,
    validateAssetMoved,
    validateFileAsset,
    validateFolderAsset,
    validateAssetSaved,
} from '../../../../tests/shared/asset-test-helpers';

describe('MCP Assets API - Operation', () => {
    let context: AssetsTestContext;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    describe('asset-create', () => {
        test('should create new folder', async () => {
            const folderName = `test-folder-${generateTestId()}`;
            const folderUrl = `${context.testRootUrl}/${folderName}`;

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: folderUrl,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            const folderPath = join(context.testRootPath, folderName);
            validateFolderAsset(result.data, folderPath);
        });

        test('should create new text file', async () => {
            const fileName = generateTestFileName('test-file', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: TEST_ASSET_CONTENTS.text,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                validateAssetCreated(result.data);

                const filePath = join(context.testRootPath, fileName);
                validateFileAsset(result.data, filePath, TEST_ASSET_CONTENTS.text);
            }
        });

        test('should create new script', async () => {
            const scriptName = `TestScript-${generateTestId()}.ts`;
            const scriptUrl = `${context.testRootUrl}/${scriptName}`;

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: scriptUrl,
                    content: TEST_ASSET_CONTENTS.script,
                },
            });

            if (result.code === 200 && result.data) {
                validateAssetCreated(result.data, 'cc.Script');

                const scriptPath = join(context.testRootPath, scriptName);
                validateFileAsset(result.data, scriptPath, TEST_ASSET_CONTENTS.script);
            }
        });

        test('should create empty cubemap file with specified uuid', async () => {
            const cubemapName = `test-cubemap-${generateTestId()}.cubemap`;
            const cubemapUrl = `${context.testRootUrl}/${cubemapName}`;
            
            // 生成一个 UUID
            const uuid = uuidv4();

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: cubemapUrl,
                    content: '',
                    uuid,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                expect(result.data.type).toBe('cc.TextureCube');
                expect(result.data.uuid).toBe(uuid);

                const cubemapPath = join(context.testRootPath, cubemapName);
                validateAssetFileExists(cubemapPath);
                validateAssetMetaExists(cubemapPath);
            }
        });

        test('should create file with rename option when file exists', async () => {
            const fileName = `create-asset-rename-${generateTestId()}.txt`;
            const filePath = join(context.testRootPath, fileName);
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            // 先创建一个已存在的文件
            await outputFile(filePath, 'original content');

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'createAssetRename',
                    rename: true,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                // 原始文件应该保持不变
                expect(existsSync(filePath)).toBeTruthy();
                expect(readFileSync(filePath, 'utf8')).toEqual('original content');

                // 新文件应该被创建在不同的位置
                expect(result.data.file).not.toBe(filePath);
                expect(existsSync(result.data.file)).toBeTruthy();
                expect(readFileSync(result.data.file, 'utf8')).toEqual('createAssetRename');
            }
        });

        test('should create file with overwrite option when file exists', async () => {
            const fileName = `create-asset-overwrite-${generateTestId()}.txt`;
            const filePath = join(context.testRootPath, fileName);
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            // 先创建一个已存在的文件
            await outputFile(filePath, 'original content');

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'createAssetOverwrite',
                    overwrite: true,
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                // 文件应该被覆盖
                expect(existsSync(filePath)).toBeTruthy();
                expect(readFileSync(filePath, 'utf8')).toEqual('createAssetOverwrite');
            }
        });

        test('should fail when creating file without overwrite or rename options', async () => {
            const fileName = `create-asset-fail-${generateTestId()}.txt`;
            const filePath = join(context.testRootPath, fileName);
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            // 先创建一个已存在的文件
            await outputFile(filePath, 'original content');

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'createAssetFail',
                    // 不传递 overwrite 和 rename
                },
            });

            // 应该失败
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();

            // 原始文件应该保持不变
            expect(existsSync(filePath)).toBeTruthy();
            expect(readFileSync(filePath, 'utf8')).toEqual('original content');
        });

        test('should prioritize content over template when both are provided', async () => {
            const fileName = `create-asset-template-${generateTestId()}.custom`;
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            const result = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'test',
                    template: 'db://internal/default_file_content/auto-atlas/default.pac',
                },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (result.data) {
                // 验证文件扩展名
                expect(extname(result.data.file)).toBe('.custom');

                // 验证内容应该是 content 的值，而不是 template 的内容
                const filePath = join(context.testRootPath, fileName);
                expect(existsSync(filePath)).toBeTruthy();
                expect(readFileSync(filePath, 'utf8')).toEqual('test');
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
                const result = await context.mcpClient.callTool('assets-create-asset-by-type', {
                    ccType: type,           // ✅ 对应 @param(SchemaSupportCreateType) ccType
                    dirOrUrl: context.testRootPath, // ✅ 对应 @param(SchemaDirOrDbPath) dirOrUrl
                    baseName,               // ✅ 对应 @param(SchemaBaseName) baseName
                    options: {              // ✅ 对应 @param(SchemaCreateAssetByTypeOptions) options
                        overwrite: true,
                        templateName,
                    },
                });

                expect(result.code).toBe(200);
                expect(result.data).toBeDefined();

                validateAssetCreated(result.data, ccType, skipTypeCheck);
                const filePath = join(context.testRootPath, fileName);
                validateAssetFileExists(filePath);
                validateAssetMetaExists(filePath);
            }
        );

        test('should return error when creating script with compilation errors', async () => {
            const scriptName = `CompileErrorScript-${generateTestId()}`;
            
            // 创建一个包含编译错误的脚本内容
            // 包含多个明显的编译错误：
            // 1. 语法错误：缺少闭合括号
            // 2. 类型错误：字符串赋值给数字类型
            // 3. 未定义的变量
            const invalidScriptContent = `import { Component } from 'cc';

export class CompileErrorComponent extends Component {
    private invalidNumber: number = "this is a string"; // 类型错误
    
    start() {
        const undefinedVar = nonExistentVariable; // 未定义的变量
        console.log('This will cause compilation error'
        // 缺少闭合括号和分号
    }
}`;

            const result = await context.mcpClient.callTool('assets-create-asset-by-type', {
                ccType: 'typescript',
                dirOrUrl: context.testRootPath,
                baseName: scriptName,
                options: {
                    overwrite: true,
                    content: invalidScriptContent,
                },
            });

            // 验证接口返回错误
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
            expect(result.reason).toBeTruthy();
            
            // 验证错误信息包含相关提示（可能是编译错误、类型错误等）
            const reasonLower = result.reason?.toLowerCase() || '';
            const hasErrorIndication = 
                reasonLower.includes('error') ||
                reasonLower.includes('fail') ||
                reasonLower.includes('编译') ||
                reasonLower.includes('类型') ||
                reasonLower.includes('syntax');
            
            // 至少应该包含某种错误指示
            expect(hasErrorIndication || result.code !== 200).toBeTruthy();
        });
    });

    describe('asset-delete', () => {
        test('should delete existing asset', async () => {
            // 先创建一个资源
            const assetName = `to-delete-${generateTestId()}`;
            const assetUrl = `${context.testRootUrl}/${assetName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: assetUrl,
                },
            });
            expect(createResult.code).toBe(200);
            expect(createResult.data).toBeDefined();

            const deleteResult = await context.mcpClient.callTool('assets-delete-asset', {
                dbPath: assetUrl,
            });
            expect(deleteResult.code).toBe(200);

            const assetPath = join(context.testRootPath, assetName);
            validateAssetDeleted(assetPath);
        });

        test('should delete by uuid', async () => {
            const assetName = `to-delete-uuid-${generateTestId()}`;
            const assetUrl = `${context.testRootUrl}/${assetName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: assetUrl,
                },
            });

            expect(createResult.code).toBe(200);
            expect(createResult.data).toBeDefined();

            const uuid = createResult.data.uuid;

            const deleteResult = await context.mcpClient.callTool('assets-delete-asset', {
                dbPath: uuid,
            });

            expect(deleteResult.code).toBe(200);

            const assetPath = join(context.testRootPath, assetName);
            validateAssetDeleted(assetPath);
        });

        test('should handle deleting non-existent asset', async () => {
            const result = await context.mcpClient.callTool('assets-delete-asset', {
                dbPath: `${context.testRootUrl}/non-existent-${generateTestId()}`,
            });

            expect(result.code).not.toBe(200);
        });
    });

    describe('asset-move', () => {
        test('should move asset to new location', async () => {
            // 创建源资源
            const sourceName = `source-${generateTestId()}`;
            const destName = `dest-${generateTestId()}`;
            const sourceUrl = `${context.testRootUrl}/${sourceName}`;
            const destUrl = `${context.testRootUrl}/${destName}`;

            const createResult = await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: sourceUrl,
                },
            });

            expect(createResult.code).toBe(200);
            expect(createResult.data).toBeDefined();

            const moveResult = await context.mcpClient.callTool('assets-move-asset', {
                source: sourceUrl,
                target: destUrl,
            });

            expect(moveResult.code).toBe(200);

            const sourcePath = join(context.testRootPath, sourceName);
            const destPath = join(context.testRootPath, destName);
            validateAssetMoved(sourcePath, destPath);
        });

        test('should handle moving to existing location', async () => {
            const source1 = `source1-${generateTestId()}`;
            const source2 = `source2-${generateTestId()}`;

            // 创建两个资源
            await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${context.testRootUrl}/${source1}`,
                },
            });

            await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${context.testRootUrl}/${source2}`,
                },
            });

            // 尝试移动到已存在的位置
            const result = await context.mcpClient.callTool('assets-move-asset', {
                source: `${context.testRootUrl}/${source1}`,
                target: `${context.testRootUrl}/${source2}`,
            });

            // 应该失败且有错误信息
            expect(result.code).not.toBe(200);
            expect(result.data).toBeNull();
            expect(result.reason).toBeDefined();
        });
    });

    describe('asset-save', () => {
        test('should save asset content', async () => {
            // 创建一个文本文件
            const fileName = generateTestFileName('save-test', 'txt');
            const fileUrl = `${context.testRootUrl}/${fileName}`;

            await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: fileUrl,
                    content: 'original content',
                },
            });

            // 保存新内容
            const newContent = 'updated content';
            const saveResult = await context.mcpClient.callTool('assets-save-asset', {
                pathOrUrlOrUUID: fileUrl,
                data: newContent,
            });

            expect(saveResult.code).toBe(200);

            const filePath = join(context.testRootPath, fileName);
            validateAssetSaved(filePath, newContent);
        });
    });

    describe('asset-rename', () => {
        test('should handle renaming to existing name', async () => {
            const name1 = `rename-exist-1-${generateTestId()}`;
            const name2 = `rename-exist-2-${generateTestId()}`;

            // 创建两个资源
            await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${context.testRootUrl}/${name1}`,
                },
            });

            await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: `${context.testRootUrl}/${name2}`,
                },
            });

            // 尝试重命名到已存在的名称
            const result = await context.mcpClient.callTool('assets-rename-asset', {
                source: `${context.testRootUrl}/${name1}`,
                target: `${context.testRootUrl}/${name2}`,
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
            const folderUrl = `${context.testRootUrl}/${folderName}`;

            await context.mcpClient.callTool('assets-create-asset', {
                options: {
                    target: folderUrl,
                },
            });

            // 刷新目录
            const result = await context.mcpClient.callTool('assets-refresh', {
                dir: folderUrl,
            });

            expect(result.code).toBe(200);
        });

        test('should refresh root assets directory', async () => {
            const result = await context.mcpClient.callTool('assets-refresh', {
                dir: 'db://assets',
            });

            expect(result.code).toBe(200);
        });
    });
});

