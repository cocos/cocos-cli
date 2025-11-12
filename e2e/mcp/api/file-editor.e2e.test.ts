import { MCPTestClient } from '../../helpers/mcp-client';
import {
    AssetsTestContext,
    generateTestId,
    setupAssetsTestEnvironment,
    teardownAssetsTestEnvironment,
} from '../../helpers/test-utils';

describe('MCP File Editor API', () => {
    let context: AssetsTestContext;
    let mcpClient: MCPTestClient;
    let testFileUrl: string;
    let testFileName: string;

    beforeAll(async () => {
        // 使用共享的 Assets 测试环境
        context = await setupAssetsTestEnvironment();
        mcpClient = context.mcpClient;
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    beforeEach(async () => {
        // 为每个测试创建一个测试文件
        testFileName = `file-editor-test-${generateTestId()}.ts`;
        testFileUrl = `${context.testRootUrl}/${testFileName}`;

        // 创建初始测试文件
        const createResult = await mcpClient.callTool('assets-create-asset', {
            options: {
                target: testFileUrl,
                content: `// Line 1
// Line 2
// Line 3
const test = 'original';
// Line 5
`,
            },
        });
        expect(createResult.code).toBe(200);
    });

    afterEach(async () => {
        // 清理测试文件
        if (testFileUrl) {
            try {
                await mcpClient.callTool('assets-delete-asset', {
                    dbPath: testFileUrl,
                });
            } catch (error) {
                console.warn('Failed to cleanup test file:', error);
            }
        }
    });

    describe('file-insert-text', () => {
        it('should insert text at the beginning of file', async () => {
            const insertResult = await mcpClient.callTool('file-insert-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    lineNumber: 1,
                    text: '// Inserted at line 1',
                },
            });

            expect(insertResult.code).toBe(200);
            expect(insertResult.data).toBe(true);

            // 验证插入结果：查询文件内容
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: 5,
                },
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toBeDefined();
            expect(queryResult.data).toContain('// Inserted at line 1');
            expect(queryResult.data).toContain('// Line 1');
            
            // 解析查询结果（格式：行号\t内容）
            const lines = queryResult.data.split('\n').filter((line: string) => line.trim());
            const lineMap = new Map<number, string>();
            lines.forEach((line: string) => {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    const lineNum = parseInt(parts[0], 10);
                    const content = parts.slice(1).join('\t');
                    lineMap.set(lineNum, content);
                }
            });
            
            // 验证插入的文本在第1行
            expect(lineMap.get(1)).toBe('// Inserted at line 1');
            // 验证原来的第1行现在在第2行
            expect(lineMap.get(2)).toBe('// Line 1');
            // 验证原来的第2行现在在第3行
            expect(lineMap.get(3)).toBe('// Line 2');
        });

        it('should insert text at middle of file', async () => {
            const insertResult = await mcpClient.callTool('file-insert-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    lineNumber: 3,
                    text: '// Inserted at line 3',
                },
            });

            expect(insertResult.code).toBe(200);
            expect(insertResult.data).toBe(true);

            // 验证插入结果：查询文件内容
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: 6,
                },
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toBeDefined();
            expect(queryResult.data).toContain('// Inserted at line 3');
            expect(queryResult.data).toContain('// Line 2');
            expect(queryResult.data).toContain('// Line 3');
            
            // 解析查询结果（格式：行号\t内容）
            const lines = queryResult.data.split('\n').filter((line: string) => line.trim());
            const lineMap = new Map<number, string>();
            lines.forEach((line: string) => {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    const lineNum = parseInt(parts[0], 10);
                    const content = parts.slice(1).join('\t');
                    lineMap.set(lineNum, content);
                }
            });
            
            // 验证插入的文本在第3行
            expect(lineMap.get(3)).toBe('// Inserted at line 3');
            // 验证原来的第3行现在在第4行
            expect(lineMap.get(4)).toBe('// Line 3');
            // 验证第2行没有被影响
            expect(lineMap.get(2)).toBe('// Line 2');
            // 验证第1行没有被影响
            expect(lineMap.get(1)).toBe('// Line 1');
        });

        it('should insert text at the end when line number exceeds file length', async () => {
            // 先查询原始文件的行数
            const initialQueryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(initialQueryResult.code).toBe(200);
            const initialLines = initialQueryResult.data.split('\n').filter((line: string) => line.trim());
            const initialLineCount = initialLines.length;
            // 获取最后一行内容
            const lastInitialLine = initialLines[initialLines.length - 1];
            const lastInitialLineNumber = parseInt(lastInitialLine.split('\t')[0], 10);

            const insertResult = await mcpClient.callTool('file-insert-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    lineNumber: 100,
                    text: '// Inserted at end',
                },
            });

            expect(insertResult.code).toBe(200);
            expect(insertResult.data).toBe(true);

            // 验证插入结果：查询所有行，验证文本被插入到文件末尾
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toBeDefined();
            expect(queryResult.data).toContain('// Inserted at end');
            expect(queryResult.data).toContain('// Line 5');
            expect(queryResult.data).toContain('original');
            
            // 验证插入的文本在文件末尾
            const lines = queryResult.data.split('\n').filter((line: string) => line.trim());
            const insertedLine = lines.find((line: string) => line.includes('// Inserted at end'));
            expect(insertedLine).toBeDefined();
            if (insertedLine) {
                // 验证插入的行号应该大于原始文件的最后一行
                const insertedLineNumber = parseInt(insertedLine.split('\t')[0], 10);
                expect(insertedLineNumber).toBeGreaterThan(lastInitialLineNumber);
                // 验证内容是插入的文本
                expect(insertedLine.split('\t')[1]).toBe('// Inserted at end');
            }
            // 验证文件行数增加了
            expect(lines.length).toBeGreaterThan(initialLineCount);
        });
    });

    describe('file-query-text', () => {
        it('should query specific lines from file', async () => {
            // 注意：file-query-text 可能还没有类型定义，使用类型断言
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: 2,
                },
            });

            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toBeDefined();
            expect(typeof queryResult.data).toBe('string');
            expect(queryResult.data).toContain('// Line 1');
            expect(queryResult.data).toContain('// Line 2');
        });

        it('should query all lines when lineCount is -1', async () => {
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });

            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toBeDefined();
            expect(queryResult.data).toContain('// Line 1');
            expect(queryResult.data).toContain('// Line 5');
            expect(queryResult.data).toContain('original');
        });

        it('should query from middle of file', async () => {
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 3,
                    lineCount: 2,
                },
            });

            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toBeDefined();
            expect(queryResult.data).toContain('// Line 3');
            expect(queryResult.data).toContain('const test');
        });
    });

    describe('file-replace-text', () => {
        it('should replace text successfully', async () => {
            const replaceResult = await mcpClient.callTool('file-replace-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    targetText: 'original',
                    replacementText: 'replaced',
                },
            });

            expect(replaceResult.code).toBe(200);
            expect(replaceResult.data).toBe(true);
            // 使用 file-query-text 验证替换结果
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toContain("const test = 'replaced';");
            expect(queryResult.data).not.toContain("const test = 'original';");
        });

        it('should fail when multiple occurrences exist', async () => {
            // 先添加另一个 'original' 文本
            await mcpClient.callTool('file-insert-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    lineNumber: 6,
                    text: "const another = 'original';",
                },
            });

            // 尝试替换应该失败，因为有多个匹配
            const replaceResult = await mcpClient.callTool('file-replace-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    targetText: 'original',
                    replacementText: 'replaced',
                },
            });

            expect(replaceResult.code).not.toBe(200);
            // 使用 file-query-text 验证未发生错误替换（应包含两个 original，且不包含 replaced）
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            const content: string = queryResult.data;
            const originalCount = (content.match(/original/g) || []).length;
            const replacedCount = (content.match(/replaced/g) || []).length;
            expect(originalCount).toBeGreaterThanOrEqual(2);
            expect(replacedCount).toBe(0);
        });

        it('should support regex pattern in target text', async () => {
            const replaceResult = await mcpClient.callTool('file-replace-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    targetText: 'const test = \'[^\']+\';',
                    replacementText: "const test = 'regex-replaced';",
                },
            });

            expect(replaceResult.code).toBe(200);
            expect(replaceResult.data).toBe(true);
            // 使用 file-query-text 验证正则替换结果
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toContain("const test = 'regex-replaced';");
            expect(queryResult.data).not.toContain("const test = 'original';");
        });
    });

    describe('file-delete-text', () => {
        it('should delete lines in range successfully', async () => {
            const deleteResult = await mcpClient.callTool('file-delete-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 2,
                    endLine: 3,
                },
            });

            expect(deleteResult.code).toBe(200);
            expect(deleteResult.data).toBe(true);

            // 使用 file-query-text 验证删除结果：第2、3行应被删除
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            // 不应包含第2、3行的内容
            expect(queryResult.data).not.toContain('// Line 2');
            expect(queryResult.data).not.toContain('// Line 3');
            // 仍应包含第1、5行以及代码行
            expect(queryResult.data).toContain('// Line 1');
            expect(queryResult.data).toContain('// Line 5');
            expect(queryResult.data).toContain("const test = 'original';");
        });

        it('should delete single line', async () => {
            const deleteResult = await mcpClient.callTool('file-delete-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 4,
                    endLine: 4,
                },
            });

            expect(deleteResult.code).toBe(200);
            expect(deleteResult.data).toBe(true);

            // 使用 file-query-text 验证删除结果：第4行（代码行）应被删除
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            // 不应包含第4行的代码
            expect(queryResult.data).not.toContain("const test = 'original';");
            // 其他行仍应存在
            expect(queryResult.data).toContain('// Line 1');
            expect(queryResult.data).toContain('// Line 2');
            expect(queryResult.data).toContain('// Line 3');
            expect(queryResult.data).toContain('// Line 5');
        });

        it('should delete from start to end', async () => {
            const deleteResult = await mcpClient.callTool('file-delete-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    endLine: 3,
                },
            });

            expect(deleteResult.code).toBe(200);
            expect(deleteResult.data).toBe(true);

            // 使用 file-query-text 验证删除结果：第1-3行应被删除
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            // 不应包含第1-3行的内容
            expect(queryResult.data).not.toContain('// Line 1');
            expect(queryResult.data).not.toContain('// Line 2');
            expect(queryResult.data).not.toContain('// Line 3');
            // 应仍包含剩余的代码行和第5行
            expect(queryResult.data).toContain("const test = 'original';");
            expect(queryResult.data).toContain('// Line 5');
        });
    });

    describe('综合操作测试', () => {
        it('should perform multiple operations in sequence', async () => {
            // 1. 插入文本
            const insertResult = await mcpClient.callTool('file-insert-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    lineNumber: 1,
                    text: '// Header comment',
                },
            });
            expect(insertResult.code).toBe(200);

            // 2. 替换文本
            const replaceResult = await mcpClient.callTool('file-replace-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    targetText: 'original',
                    replacementText: 'modified',
                },
            });
            expect(replaceResult.code).toBe(200);

            // 3. 删除行
            const deleteResult = await mcpClient.callTool('file-delete-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 2,
                    endLine: 2,
                },
            });
            expect(deleteResult.code).toBe(200);

            // 4. 查询最终结果
            const queryResult = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: -1,
                },
            });
            expect(queryResult.code).toBe(200);
            expect(queryResult.data).toContain('// Header comment');
            expect(queryResult.data).toContain('modified');
            expect(queryResult.data).not.toContain('// Line 1');
        });
    });

    describe('错误处理', () => {
        it('should fail when file does not exist', async () => {
            const nonExistentFile = `${context.testRootUrl}/non-existent-${generateTestId()}.ts`;
            const result = await mcpClient.callTool('file-query-text', {
                param: {
                    dbURL: nonExistentFile,
                    fileType: 'ts',
                    startLine: 1,
                    lineCount: 1,
                },
            });

            expect(result.code).not.toBe(200);
        });

        it('should fail when file type mismatch', async () => {
            const result = await mcpClient.callTool('file-insert-text', {
                param: {
                    dbURL: testFileUrl,
                    fileType: 'js', // 错误：文件是 ts 类型
                    lineNumber: 1,
                    text: 'test',
                },
            });

            expect(result.code).not.toBe(200);
        });
    });
});

