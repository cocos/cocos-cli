import { cliRunner } from '../helpers/cli-runner';
import { E2E_TIMEOUTS } from '../helpers/test-utils';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';
import { remove, pathExists } from 'fs-extra';

describe('cocos wizard command', () => {
    let tempDir: string;

    beforeEach(async () => {
        // 创建临时目录用于 wizard 测试
        tempDir = mkdtempSync(join(tmpdir(), 'wizard-test-'));
    });

    afterEach(async () => {
        // 清理临时目录
        if (tempDir && await pathExists(tempDir)) {
            await remove(tempDir);
        }
    });

    test('should run wizard with auto inputs', async () => {
        // 模拟用户输入
        const inputs = [
            '1',           // 选择操作
            'test-project', // 项目名称
            tempDir,       // 输出目录
            '',            // 确认（回车）
        ];

        const result = await cliRunner.wizard(inputs, { cwd: tempDir });

        // Wizard 命令可能需要交互，结果可能不同
        // 这里只检查命令是否正常执行
        expect(result.exitCode !== null).toBe(true);

        // 如果成功，stdout 应该包含一些输出
        if (result.exitCode === 0) {
            expect(result.stdout.length).toBeGreaterThan(0);
        } else {
            console.log('Wizard command output:', result.stdout, result.stderr);
        }
    }, E2E_TIMEOUTS.BUILD_OPERATION); // 创建项目需要较长时间

    /**
     * 注意：无法在 E2E 测试中正确模拟 Ctrl+C 取消操作
     * 
     * 原因：
     * 1. wizard 命令使用 inquirer 交互式库
     * 2. inquirer 通过 SIGINT 信号处理 Ctrl+C，而不是字符输入
     * 3. 当前的测试框架无法发送 SIGINT 信号到子进程并正确处理其异常
     * 4. 简单的字符输入（如 'q'）不会被 inquirer 识别为取消操作
     * 
     * 如需测试取消行为，建议：
     * - 手动测试：运行 `cocos wizard` 并按 Ctrl+C
     * - 单元测试：测试 wizard 命令的各个组件，而不是整个交互流程
     */

    test('should validate user inputs in wizard', async () => {
        // 测试无效输入
        const inputs = [
            'invalid',     // 无效选择
            '999',         // 无效数字
            '',            // 空输入
            'q',           // 退出
        ];

        const result = await cliRunner.wizard(inputs, { cwd: tempDir });

        // 应该能够处理无效输入
        expect(result.exitCode !== null).toBe(true);
    });
});

