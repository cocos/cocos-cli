# E2E 测试

这是 cocos-cli 的端到端（E2E）测试套件，用于测试打包后的 CLI 命令和 MCP 服务器 API。

## 📋 特点

- **独立运行**：只依赖 `dist/` 目录，不依赖源码
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
```

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

```
e2e/
├── cli/                          # CLI 命令测试
│   ├── build.e2e.test.ts        # 测试 cocos build 命令
│   ├── create.e2e.test.ts       # 测试 cocos create 命令
│   ├── info.e2e.test.ts         # 测试 cocos info 命令
│   └── wizard.e2e.test.ts       # 测试 cocos wizard 命令
├── mcp/                          # MCP 服务器测试
│   ├── server.e2e.test.ts       # 测试 MCP 服务器启动
│   └── api/                      # API 接口测试
│       ├── builder.e2e.test.ts  # 测试构建 API
│       ├── assets.e2e.test.ts   # 测试资源 API
│       ├── project.e2e.test.ts  # 测试项目 API
│       └── scene.e2e.test.ts    # 测试场景 API
├── helpers/                      # 测试辅助工具
│   ├── cli-runner.ts            # CLI 命令执行器
│   ├── mcp-client.ts            # MCP 客户端封装
│   └── test-utils.ts            # 通用测试工具
├── docs/                         # 📚 文档
│   ├── CLI-PATH-GUIDE.md        # CLI 路径配置指南
│   ├── USAGE.md                 # 详细使用指南
│   └── PROJECT-MANAGER-GUIDE.md # 测试项目管理器指南
├── config.ts                    # ⚙️ 全局配置（超时、端口等）
├── jest.config.e2e.ts           # E2E 测试配置
├── tsconfig.json                # TypeScript 配置（仅类型检查）
├── setup.ts                     # 全局测试前置
├── teardown.ts                  # 全局测试清理
├── jest.setup.ts                # Jest 环境配置
├── README.md                    # 本文档
└── README-TSCONFIG.md           # 配置说明（TS + 全局配置）
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

# 或指定文件名模式
npm run test:e2e -- --testPathPattern=build.e2e.test
```

### 运行单个测试用例

```bash
npm run test:e2e -- -t "should build web-desktop project"

# 或使用正则表达式
npm run test:e2e -- --testNamePattern="web-desktop"
```

### **只测试特定部分**

```bash
# 只测试 CLI
npm run test:e2e -- --testPathPattern=cli

# 只测试 MCP
npm run test:e2e -- --testPathPattern=**mcp**

# 只测试某个 API
npm run test:e2e -- --testPathPattern=mcp/api/assets
```

## 📊 测试覆盖

### CLI 命令

- ✅ `cocos build` - 各平台构建测试
- ✅ `cocos create` - 项目创建测试
- ✅ `cocos info` - 信息显示测试
- ✅ `cocos wizard` - 向导模式测试
- ✅ 错误处理和参数验证

### MCP API

- ✅ **Builder API**
  - `builder-build`
  - `builder-query-default-build-config`
  - `builder-run`
- ✅ **Assets API**
  - `asset-create`
  - `asset-query`
  - `asset-delete`
  - `asset-move`
- ✅ **Project API**
  - `project-query-info`
- ✅ **Scene API**
  - `scene-create-node`
  - `scene-query-node`
  - `scene-update-node`
  - `scene-delete-node`

## 🔄 持续集成

E2E 测试可以集成到 CI/CD 流程中：

```yaml
# .github/workflows/test.yml
- name: Run E2E tests
  run: npm run test:e2e
```

## 📚 文档

### 配置与开发

- **[全局配置说明](./README-TSCONFIG.md)** - E2E 测试的配置文档 ⭐ 推荐阅读
  - **全局配置** (`config.ts`) - 统一管理超时时间、端口号
  - **TypeScript 配置** (`tsconfig.json`) - 类型检查、不参与编译
  - 共享测试工具
  - 路径别名支持

### 使用指南

- **[测试项目管理器指南](./docs/PROJECT-MANAGER-GUIDE.md)** - 统一管理测试项目和自动清理缓存 ⭐ 必读
  - 自动清理 Cocos 缓存目录
  - 自动清理 .gitignore 忽略的文件
  - 统一的测试工作区
  - 调试模式
  - 迁移指南

- **[CLI 路径配置指南](./docs/CLI-PATH-GUIDE.md)** - 如何在不同场景下指定 CLI 路径进行测试
  - 开发阶段测试
  - 测试本地打包
  - 测试全局安装的包
  - 测试已发布的 npm 包
  - Smoke 测试

- **[E2E 测试使用指南](./docs/USAGE.md)** - E2E 测试的详细使用说明
  - 快速开始
  - 测试配置
  - 编写测试
  - 调试技巧
  - CI/CD 集成

- **[Wizard 测试限制说明](./docs/WIZARD-TESTING-LIMITATIONS.md)** - 交互式命令的测试限制和解决方案
  - 无法测试的场景（Ctrl+C 取消等）
  - 可测试的场景
  - 推荐的测试策略
  - 替代方案

### 相关资源

- [单元测试配置](../tests/README.md) - 单元测试的 TypeScript 配置
- [Jest 文档](https://jestjs.io/)
- [MCP SDK 文档](https://github.com/modelcontextprotocol/sdk)
- [Cocos CLI 文档](../docs/)
