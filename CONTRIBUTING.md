# Contributing Guide | 贡献指南

[English](#english) | [中文](#chinese)

---

<a name="english"></a>

## English

Thank you for your interest in contributing to cocos-cli! This guide will help you get started with development, testing, and submitting changes.

### 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Debugging](#debugging)
- [Submitting Changes](#submitting-changes)

### Prerequisites

Before you begin, ensure you have:

- **Node.js** >= 16.x
- **npm** >= 8.x
- **Git**

### Getting Started

1. **Fork and Clone**

```bash
git clone https://github.com/YOUR_USERNAME/cocos-cli.git
cd cocos-cli
```

2. **Install Dependencies**

```bash
npm install
```

3. **Build the Project**

```bash
npm run build
```

This will:

- Clear previous build artifacts
- Compile TypeScript to JavaScript
- Copy `.d.ts` declaration files
- Generate JSON schemas

### Development Workflow

#### 1. Build and Compile

**Full Build** (recommended for first build or after major changes):

```bash
npm run build
# or
npm run compile
```

**Watch Mode** (for active development):

```bash
npm run build:watch
```

This will automatically recompile TypeScript files when you make changes.

**Clear Build Cache**:

```bash
npm run build:clear
```

#### 2. Generate Type Definitions

After modifying MCP API schemas or tools:

```bash
npm run generate:mcp-types
```

This generates type-safe definitions for E2E tests in `e2e/types/mcp-tools.generated.ts`.

### Testing

#### Unit Tests

Run all unit tests:

```bash
npm test
```

Run tests in watch mode (for active development):

```bash
npm run test:watch
```

Run tests with coverage report:

```bash
npm run test:coverage
```

Run tests silently (minimal output):

```bash
npm run test:quiet
```

#### E2E Tests

**Full E2E test suite**:

```bash
npm run test:e2e
```

**E2E tests with debug mode** (preserves test workspace):

```bash
npm run test:e2e:debug
```

The test workspace will be preserved at `.test-workspace` for inspection.

**Check E2E test coverage**:

```bash
# Console output
npm run check:e2e-coverage

# Generate HTML report
npm run check:e2e-coverage:report
```

The coverage report will be saved to `e2e/server/reports/`.

#### Run All Tests

```bash
npm run test:all
```

This runs both unit tests and E2E tests.

### Code Style

This project uses ESLint and Prettier for code formatting.

**Check for linting errors**:

```bash
# Check specific files
npx eslint src/**/*.ts

# Check all TypeScript files
npx tsc --noEmit
```

**Auto-fix formatting** (if configured):

```bash
npx eslint --fix src/**/*.ts
```

### Debugging

#### 1. Debug MCP Server

Start the MCP server with a test project:

```bash
npm run start:mcp-debug
```

This starts the MCP server using the test project at `./tests/fixtures/projects/asset-operation`.

#### 2. MCP Inspector

Use the MCP Inspector to interact with the server:

```bash
npm run start:mcp-inspector
```

This opens a web interface for testing MCP tools.

#### 3. Debug E2E Tests

**Method 1: Preserve Test Workspace**

```bash
npm run test:e2e:debug
```

The test workspace will be kept after tests finish, allowing you to inspect the state.

**Method 2: Debug in VS Code**

Add this configuration to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug E2E Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test:e2e", "--", "--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Unit Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

**Method 3: Debug Specific Test File**

```bash
npx jest path/to/test.test.ts --runInBand
```

#### 4. Debug CLI Commands

```bash
node --inspect-brk ./dist/cli.js [command] [options]
```

Then attach your debugger to the Node.js process.

### Submitting Changes

#### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

#### 2. Make Your Changes

- Write clear, concise commit messages
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

#### 3. Test Your Changes

```bash
# Run all tests
npm run test:all

# Check E2E coverage if you modified APIs
npm run check:e2e-coverage:report
```

#### 4. Commit and Push

```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/your-feature-name
```

#### 5. Create a Pull Request

- Go to the repository on GitHub
- Click "New Pull Request"
- Fill in the PR template with:
  - Description of changes
  - Related issues
  - Test results
  - Screenshots (if UI changes)

### Commit Message Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

**Examples**:

```
feat: add assets-create-asset MCP tool
fix: resolve null reference in asset query
docs: update E2E testing guide
test: add E2E tests for builder API
```

### Additional Resources

- **E2E Testing Guide**: See `e2e/README.md`
- **Type Inference Guide**: See `e2e/docs/TYPE-INFERENCE-EXAMPLE.md`
- **Test Coverage Report**: See `e2e/scripts/README.md`

---

<a name="chinese"></a>

## 中文

感谢您对 cocos-cli 项目的关注！本指南将帮助您开始开发、测试和提交代码变更。

### 📋 目录

- [前置要求](#前置要求)
- [开始使用](#开始使用)
- [开发流程](#开发流程)
- [测试](#测试-1)
- [代码风格](#代码风格-1)
- [调试](#调试-1)
- [提交变更](#提交变更-1)

### 前置要求

开始之前，请确保安装：

- **Node.js** >= 16.x
- **npm** >= 8.x
- **Git**

### 开始使用

1. **Fork 并克隆仓库**

```bash
git clone https://github.com/YOUR_USERNAME/cocos-cli.git
cd cocos-cli
```

2. **安装依赖**

```bash
npm install
```

3. **构建项目**

```bash
npm run build
```

这将：

- 清理之前的构建产物
- 编译 TypeScript 到 JavaScript
- 复制 `.d.ts` 类型声明文件
- 生成 JSON schemas

### 开发流程

#### 1. 构建和编译

**完整构建**（推荐用于首次构建或重大更改后）：

```bash
npm run build
# 或
npm run compile
```

**监听模式**（用于活跃开发）：

```bash
npm run build:watch
```

这会在你修改文件时自动重新编译 TypeScript 文件。

**清理构建缓存**：

```bash
npm run build:clear
```

#### 2. 生成类型定义

修改 MCP API schemas 或工具后：

```bash
npm run generate:mcp-types
```

这会在 `e2e/types/mcp-tools.generated.ts` 中生成 E2E 测试的类型安全定义。

### 测试

#### 单元测试

运行所有单元测试：

```bash
npm test
```

监听模式运行测试（用于活跃开发）：

```bash
npm run test:watch
```

运行测试并生成覆盖率报告：

```bash
npm run test:coverage
```

静默运行测试（最小输出）：

```bash
npm run test:quiet
```

#### E2E 测试

**完整 E2E 测试套件**：

```bash
npm run test:e2e
```

**E2E 测试调试模式**（保留测试工作区）：

```bash
npm run test:e2e:debug
```

测试工作区将保留在 `.test-workspace` 目录中以供检查。

**检查 E2E 测试覆盖率**：

```bash
# 控制台输出
npm run check:e2e-coverage

# 生成 HTML 报告
npm run check:e2e-coverage:report
```

覆盖率报告将保存到 `e2e/server/reports/` 目录。

#### 运行所有测试

```bash
npm run test:all
```

这会同时运行单元测试和 E2E 测试。

### 代码风格

本项目使用 ESLint 和 Prettier 进行代码格式化。

**检查 lint 错误**：

```bash
# 检查特定文件
npx eslint src/**/*.ts

# 检查所有 TypeScript 文件
npx tsc --noEmit
```

**自动修复格式**（如果已配置）：

```bash
npx eslint --fix src/**/*.ts
```

### 调试

#### 1. 调试 MCP 服务器

使用测试项目启动 MCP 服务器：

```bash
npm run start:mcp-debug
```

这会使用 `./tests/fixtures/projects/asset-operation` 测试项目启动 MCP 服务器。

#### 2. MCP 检查器

使用 MCP Inspector 与服务器交互：

```bash
npm run start:mcp-inspector
```

这会打开一个 Web 界面用于测试 MCP 工具。

#### 3. 调试 E2E 测试

**方法 1：保留测试工作区**

```bash
npm run test:e2e:debug
```

测试完成后将保留工作区，允许你检查状态。

**方法 2：在 VS Code 中调试**

在 `.vscode/launch.json` 中添加以下配置：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "调试 E2E 测试",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test:e2e", "--", "--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "调试单元测试",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

**方法 3：调试特定测试文件**

```bash
npx jest path/to/test.test.ts --runInBand
```

#### 4. 调试 CLI 命令

```bash
node --inspect-brk ./dist/cli.js [command] [options]
```

然后将调试器附加到 Node.js 进程。

### 提交变更

#### 1. 创建分支

```bash
git checkout -b feature/your-feature-name
```

#### 2. 进行修改

- 编写清晰、简洁的提交信息
- 遵循现有代码风格
- 为新功能添加测试
- 根据需要更新文档

#### 3. 测试你的修改

```bash
# 运行所有测试
npm run test:all

# 如果修改了 API，检查 E2E 覆盖率
npm run check:e2e-coverage:report
```

#### 4. 提交和推送

```bash
git add .
git commit -m "feat: 添加新功能"
git push origin feature/your-feature-name
```

#### 5. 创建 Pull Request

- 前往 GitHub 上的仓库
- 点击 "New Pull Request"
- 在 PR 模板中填写：
  - 变更描述
  - 相关 issues
  - 测试结果
  - 截图（如果有 UI 变更）

### 提交信息规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档变更
- `style:` 代码风格变更（格式化等）
- `refactor:` 代码重构
- `test:` 添加或更新测试
- `chore:` 维护任务

**示例**：

```
feat: 添加 assets-create-asset MCP 工具
fix: 修复资源查询中的空引用问题
docs: 更新 E2E 测试指南
test: 添加构建器 API 的 E2E 测试
```

### 额外资源

- **E2E 测试指南**：查看 `e2e/README.md`
- **类型推断指南**：查看 `e2e/docs/TYPE-INFERENCE-EXAMPLE.md`
- **测试覆盖率报告**：查看 `e2e/scripts/README.md`

---

## 🤝 Questions and Support | 问题和支持

If you have questions or need help:

- Open an issue on GitHub
- Check existing documentation in the `docs/` directory
- Review E2E testing guides in `e2e/docs/`

如果您有问题或需要帮助：

- 在 GitHub 上提出 issue
- 查看 `docs/` 目录中的现有文档
- 查看 `e2e/docs/` 中的 E2E 测试指南
