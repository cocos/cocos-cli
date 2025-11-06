# E2E 测试

这是 cocos-cli 的端到端（E2E）测试套件，用于测试打包后的 CLI 命令和 MCP 服务器 API。

## 📋 特点

- **独立运行**：只依赖 `dist/` 目录和 tests 文件夹，不依赖功能源码
- **真实环境**：测试实际用户使用场景
- **完整覆盖**：包括 CLI 命令和 MCP API 测试
- **并行安全**：使用临时目录和随机端口

## 🚀 快速开始

### 前置条件

确保项目已经构建：

```bash
npm run build
```

### 基本用法

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 调试模式（保留测试工作区，不删除测试文件）
npm run test:e2e:debug

# 或者使用参数方式
npm run test:e2e -- --preserve

# 运行所有测试（单元测试 + E2E）
npm run test:all

# 运行指定测试文件
npm run test:e2e -- tests/cli/build.e2e.test.ts
npm run test:e2e:debug -- tests/cli/build.e2e.test.ts

# 运行指定测试目录
npm run test:e2e -- tests/mcp/api
```

### 查看测试报告

测试完成后会自动生成可视化的 HTML 报告：

```bash
# 测试报告位置（包含本地时间戳）
e2e/reports/test-report-2024-01-15-10-30.html
```

### 自动打印报告路径

测试完成后，会在控制台自动打印报告的完整路径和快速打开命令：

```text
============================================================
📊 测试报告已生成
============================================================

✅ HTML 测试报告路径:
   F:\code\cocos-cli\e2e\reports\test-report-2025-10-28-15-30-00.html

💡 快速打开报告:
   start F:\code\cocos-cli\e2e\reports\test-report-2025-10-28-15-30-00.html
============================================================
```

直接复制快速打开命令即可在浏览器中查看！

### 手动打开报告

```bash
# Windows
start e2e/reports/test-report-*.html

# macOS
open $(ls -t e2e/reports/test-report-*.html | head -1)

# Linux
xdg-open $(ls -t e2e/reports/test-report-*.html | head -1)
```

报告包含：

- ✅ 测试通过/失败统计
- ⏱️ 每个测试的执行时间
- 📋 详细的错误信息和堆栈跟踪
- 📊 按状态排序的测试列表
- 💬 控制台日志输出

### 指定 CLI 路径

```bash
# 测试默认的 dist/ 目录
npm run test:e2e

# 指定特定的 CLI 路径
npm run test:e2e -- --cli ./dist/cli.js

# 测试全局安装的包
npm run test:e2e -- --cli $(which cocos)
```

> 💡 更多测试场景和配置选项，请参考 [CLI 路径配置指南](./docs/CLI-PATH-GUIDE.md)

## 📁 目录结构

```text
e2e/
├── cli/                          # CLI 命令测试
│   ├── build.e2e.test.ts        # 测试 cocos build 命令
│   └── create.e2e.test.ts       # 测试 cocos create 命令
├── mcp/                          # MCP 服务器测试
│   ├── server.e2e.test.ts       # 测试 MCP 服务器启动和错误处理
│   └── api/                      # API 接口测试
│       ├── builder.e2e.test.ts  # 测试构建 API
│       └── assets/              # 资源 API 测试（按功能拆分）
│           ├── operation.e2e.test.ts  # 资源操作（创建、删除、移动、保存、重命名、刷新）
│           ├── query.e2e.test.ts      # 资源查询
│           ├── import.e2e.test.ts     # 资源导入和重新导入
│           └── user-data.e2e.test.ts  # 资源用户数据管理
├── helpers/                      # 测试辅助工具
│   ├── cli-runner.ts            # CLI 命令执行器
│   ├── mcp-client.ts            # MCP 客户端封装
│   ├── project-manager.ts       # 测试项目管理器
│   ├── shared-mcp-server.ts    # 共享 MCP 服务器管理
│   ├── test-utils.ts            # 通用测试工具函数
│   └── report-printer.js        # 测试报告打印工具
├── scripts/                     # 🛠️ 辅助脚本
│   ├── check-coverage.ts        # E2E 测试覆盖率检查脚本
│   ├── generate-mcp-types.ts    # 自动生成 MCP 工具类型定义
│   ├── tool-utils.ts            # MCP 工具扫描共享工具函数
│   ├── prepare-test.js           # 测试准备脚本
│   └── README.md                 # 脚本说明文档
├── docs/                         # 📚 文档
│   ├── CLI-PATH-GUIDE.md        # CLI 路径配置指南
│   ├── USAGE.md                 # 详细使用指南
│   ├── PROJECT-MANAGER-GUIDE.md # 测试项目管理器指南
│   ├── E2E-COVERAGE-CHECK.md    # E2E 测试覆盖率检查
│   ├── WIZARD-TESTING-LIMITATIONS.md # Wizard 测试限制说明
│   ├── README-TSCONFIG.md       # TypeScript 配置说明
│   ├── REPORT-SERVER-SETUP.md   # 测试报告服务器设置
│   └── TYPE-INFERENCE-EXAMPLE.md # 类型推断示例
├── types/                        # 类型定义
│   └── mcp-tools.generated.ts    # 自动生成的 MCP 工具类型定义
├── reports/                      # 测试报告（自动生成）
│   └── test-report-*.html       # HTML 测试报告
├── config.ts                    # ⚙️ 全局配置（超时、端口等）
├── jest.config.e2e.ts           # E2E 测试配置
├── tsconfig.json                # TypeScript 配置（仅类型检查）
├── setup.ts                     # 全局测试前置
├── teardown.ts                  # 全局测试清理
├── jest.setup.ts                # Jest 环境配置
└── README.md                    # 本文档
```

## 🔧 测试辅助工具

### CLIRunner

用于执行 CLI 命令：

```typescript
import { cliRunner } from '../helpers/cli-runner';

// 执行构建
const result = await cliRunner.build({
    project: testProjectPath,
    platform: 'web-desktop',
    debug: true,
});
```

### MCPTestClient

用于测试 MCP API：

```typescript
import { MCPTestClient } from '../helpers/mcp-client';

// 创建并启动客户端
const client = new MCPTestClient({
    projectPath: testProjectPath,
    port: 9527,
});
await client.start();

// 调用 API
const result = await client.callTool('builder-build', {
    platform: 'web-desktop',
});

// 关闭客户端
await client.close();
```

### 测试工具函数

```typescript
import {
    createTestProject,
    getSharedTestProject,
    checkPathExists,
    validateBuildOutput,
    E2E_TIMEOUTS,
} from '../helpers/test-utils';
import { resolve } from 'path';

// 创建独立的测试项目（用于写入测试）
const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
const testProject = await createTestProject(fixtureProject);
console.log('测试项目路径:', testProject.path);

// 使用共享测试项目（用于只读测试）
const sharedProject = await getSharedTestProject(fixtureProject, 'readonly-common');
console.log('共享项目路径:', sharedProject.path);

// 验证路径是否存在
const exists = await checkPathExists(testProject.path);

// 验证构建输出
const validation = await validateBuildOutput(buildPath);

// 使用统一的超时配置
test('long operation', async () => {
    // ...
}, E2E_TIMEOUTS.BUILD_OPERATION);
```

## 📝 编写新测试

### CLI 测试示例

```typescript
import { cliRunner } from '../helpers/cli-runner';

describe('my new command', () => {
    test('should execute successfully', async () => {
        const result = await cliRunner.run(['my-command', '--option', 'value']);
        
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('success');
    });
});
```

### MCP API 测试示例

```typescript
import { MCPTestClient } from '../helpers/mcp-client';

describe('my new API', () => {
    let client: MCPTestClient;

    beforeAll(async () => {
        client = new MCPTestClient({ projectPath, port: 9527 });
        await client.start();
    });

    afterAll(async () => {
        await client.close();
    });

    test('should call API successfully', async () => {
        const result = await client.callTool('my-api-name', { arg: 'value' });
        
        expect(result.code).toBe(200);
        expect(result.data).toBeDefined();
    });
});
```

## ⚠️ 注意事项

1. **测试隔离**：每个测试应使用独立的临时目录和端口
2. **资源清理**：测试后必须清理临时文件和关闭服务器进程
3. **超时设置**：构建测试需要较长时间（最多 5 分钟）
4. **错误处理**：测试应该覆盖正常和异常场景
5. **CI 兼容**：测试应该能在 CI 环境中运行

## 🐛 调试

### 保留测试工作区（调试模式）

```bash
# 方式 1：使用快捷脚本
npm run test:e2e:debug

# 方式 2：使用参数
npm run test:e2e -- --preserve

# 方式 3：组合使用（保留工作区 + 运行单个测试）
npm run test:e2e -- --preserve e2e/cli/build.e2e.test.ts
```

**调试模式特性：**

- ✅ 测试后不删除 `e2e/.workspace/` 目录
- ✅ 可以查看测试生成的项目文件
- ✅ 方便排查测试失败原因

### 查看详细输出

```bash
npm run test:e2e -- --verbose
```

### 运行单个测试文件

```bash
npm run test:e2e -- e2e/cli/build.e2e.test.ts
```

### **只测试特定部分**

```bash
# 只测试 CLI
npm run test:e2e -- e2e/cli

# 只测试 MCP
npm run test:e2e -- e2e/mcp
```

## 📚 文档

- **[测试项目管理器指南](./docs/PROJECT-MANAGER-GUIDE.md)** - 统一管理测试项目和共享 MCP 服务器
- **[CLI 路径配置指南](./docs/CLI-PATH-GUIDE.md)** - 指定 CLI 路径进行测试
- **[配置说明](./docs/README-TSCONFIG.md)** - TypeScript 配置和全局配置
