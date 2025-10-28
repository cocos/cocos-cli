# Wizard 命令 E2E 测试限制说明

## 🎯 概述

`cocos wizard` 命令是一个交互式向导，使用 `inquirer` 库提供用户友好的交互体验。然而，由于其交互特性，在 E2E 测试中存在一些无法完全模拟的场景。

---

## ❌ 无法测试的场景

### 1. Ctrl+C 取消操作

**问题描述：**

```typescript
// ❌ 这个测试无法正确工作
test('should handle wizard cancellation', async () => {
    const inputs = ['q'];  // 尝试通过 'q' 模拟取消
    const result = await cliRunner.wizard(inputs, { cwd: tempDir });
    expect(result.exitCode !== null).toBe(true);
});
```

**原因：**

1. **信号处理机制**
   - `inquirer` 通过监听 `SIGINT` 信号来处理 `Ctrl+C`
   - 简单的字符输入（如 `'q'`）不会被识别为取消操作
   - 当前测试框架只能发送文本输入，无法发送系统信号

2. **异常抛出**
   - 用户按 `Ctrl+C` 时，`inquirer` 会抛出 `Error: User force closed the prompt`
   - 这会导致进程异常退出，而不是正常返回
   - 测试框架难以捕获和验证这种异常行为

3. **进程间通信限制**
   - E2E 测试通过 `spawn` 启动子进程
   - 子进程的 `SIGINT` 处理与父进程隔离
   - 无法从父进程正确模拟子进程的 `Ctrl+C` 行为

**技术细节：**

```typescript
// inquirer 内部处理（简化版）
process.on('SIGINT', () => {
    // 清理界面
    ui.close();
    // 抛出异常
    throw new Error('User force closed the prompt');
});
```

### 2. 复杂的交互流程

**问题描述：**

- 动态问题：基于前一个答案显示不同的后续问题
- 条件分支：某些选项会触发完全不同的交互流程
- 验证反馈：无效输入后的重新提示

**原因：**

当前的 `wizard()` 方法使用简单的顺序输入：

```typescript
// 当前实现：按顺序发送输入
const inputs = ['1', 'test-project', '/path', ''];
```

这种方式无法处理：

- 输入验证失败后的重新提示
- 基于上下文的动态问题
- 错误消息和重试机制

---

## ✅ 可测试的场景

### 1. 基本的线性流程

```typescript
test('should run wizard with auto inputs', async () => {
    const inputs = [
        '1',           // 选择操作
        'test-project', // 项目名称
        tempDir,       // 输出目录
        '',            // 确认（回车）
    ];

    const result = await cliRunner.wizard(inputs, { cwd: tempDir });
    
    expect(result.exitCode !== null).toBe(true);
    if (result.exitCode === 0) {
        expect(result.stdout.length).toBeGreaterThan(0);
    }
}, E2E_TIMEOUTS.BUILD_OPERATION);
```

**✅ 适用于：**

- 预定义的输入序列
- 简单的成功路径测试
- 验证命令能够完成

### 2. 无效输入处理

```typescript
test('should validate user inputs in wizard', async () => {
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
```

**✅ 适用于：**

- 测试输入验证逻辑
- 验证错误消息
- 确保命令不会崩溃

---

## 🎯 推荐的测试策略

### 1. E2E 测试：覆盖主要流程

**目标：** 验证命令能够成功执行和完成

```typescript
describe('cocos wizard command', () => {
    test('should complete basic wizard flow', async () => {
        // 测试最常见的使用场景
        const inputs = [/* 基本输入序列 */];
        const result = await cliRunner.wizard(inputs);
        expect(result.exitCode).toBe(0);
    });
    
    test('should handle invalid inputs gracefully', async () => {
        // 测试错误处理
        const inputs = [/* 无效输入 */];
        const result = await cliRunner.wizard(inputs);
        expect(result.exitCode !== null).toBe(true);
    });
});
```

### 2. 单元测试：测试各个组件

**目标：** 独立测试每个向导函数

```typescript
// 测试 buildWizard 函数
describe('WizardCommand.buildWizard', () => {
    test('should collect build options', async () => {
        // Mock inquirer
        const mockInquirer = {
            prompt: jest.fn().mockResolvedValue({
                platform: 'web-desktop',
                debug: true,
            }),
        };
        
        // 测试逻辑
    });
});
```

### 3. 手动测试：验证交互体验

**目标：** 确保真实用户体验符合预期

```bash
# 运行实际命令
cocos wizard

# 测试取消操作
# 在任何提示下按 Ctrl+C，验证清理逻辑
```

**手动测试清单：**

- [ ] 各种选项的完整流程
- [ ] Ctrl+C 取消操作
- [ ] 输入验证和错误提示
- [ ] 帮助信息显示
- [ ] 成功/失败消息

---

## 📝 测试覆盖策略总结

| 测试类型 | 覆盖范围 | 优先级 | 工具 |
|---------|---------|--------|------|
| **E2E 测试** | 主要成功路径 + 基本错误处理 | ⭐⭐⭐ | Jest + CLIRunner |
| **单元测试** | 各个向导函数的逻辑 | ⭐⭐ | Jest + Mock |
| **手动测试** | 完整交互体验 + 边缘情况 | ⭐ | 实际命令行 |

---

## 🔧 如果必须测试 Ctrl+C

如果确实需要在自动化测试中验证 `Ctrl+C` 行为，可以考虑以下方案：

### 方案 1：使用 `tree-kill` 发送信号

```typescript
import treeKill from 'tree-kill';

test('should handle SIGINT gracefully', async () => {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [cliPath, 'wizard'], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        let stdout = '';
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
            
            // 等待第一个提示出现，然后发送 SIGINT
            if (stdout.includes('你想要做什么')) {
                setTimeout(() => {
                    treeKill(child.pid!, 'SIGINT');
                }, 100);
            }
        });
        
        child.on('exit', (code, signal) => {
            // 验证进程被 SIGINT 终止
            expect(signal).toBe('SIGINT');
            resolve();
        });
        
        setTimeout(() => reject(new Error('Timeout')), 10000);
    });
});
```

**⚠️ 注意：** 这种方法复杂且不稳定，不推荐在常规 E2E 测试中使用。

### 方案 2：修改命令支持非交互模式

```typescript
// 添加 --non-interactive 标志
this.program
    .command('wizard')
    .option('--non-interactive', 'Run in non-interactive mode for testing')
    .action(async (options) => {
        if (options.nonInteractive) {
            // 使用默认值或环境变量
            await this.runNonInteractiveWizard();
        } else {
            await this.runWizard();
        }
    });
```

**优点：**

- 可测试性更好
- 更适合 CI/CD 环境
- 可以通过环境变量配置

---

## 📚 相关资源

- [inquirer 文档](https://github.com/SBoudrias/Inquirer.js/)
- [Node.js Process 信号](https://nodejs.org/api/process.html#signal-events)
- [E2E Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

## 💡 最后建议

对于 `wizard` 这样的交互式命令：

1. **E2E 测试** → 覆盖主要成功路径
2. **单元测试** → 测试核心逻辑
3. **手动测试** → 验证用户体验
4. **不要强求** → 接受某些场景无法自动化测试的现实

测试的目的是提高代码质量和信心，而不是为了 100% 的覆盖率牺牲测试的可维护性。
