# 🎮 Cocos CLI

[![Node.js](https://img.shields.io/badge/Node.js-22.17.0-green.svg)](https://nodejs.org/)
[![Cocos Engine](https://img.shields.io/badge/Cocos-Engine-orange.svg)](https://github.com/cocos/cocos4)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![cli logo](./static/image.png)
> 🚀 专为 Cocos Engine 开发设计的强大命令行界面工具

## ✨ 功能

- 🏗️ **项目管理**：创建、导入、构建 Cocos 项目
- 📦 **资源管理**：导入导出资源，批量处理
- ⚡ **构建系统**：多平台构建支持
- 🖥️ **模拟器预览**：从 CLI 构建并启动 Cocos 模拟器
- 🎨 **交互式界面**：向导式操作流程

## 📋 环境要求

- Node.js 22.17.0
- Git
- Visual Studio with C++ build tools (Windows 系统)
- Xcode (macOS 系统)

原生开发请参考 [原生开发环境搭建指南](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/setup-native-development.html) 获取详细的搭建说明。

## 🛠️ 安装

1. **克隆仓库**

   ```bash
   git clone <repository-url>
   cd cocos-cli
   ```

2. **安装依赖**

   ```bash
   npm install -g node-gyp
   npm run init
   npm install
   ```

3. **构建并链接到全局**

   ```bash
   npm run build
   npm link
   ```

## 🚀 快速开始

查看 [快速开始指南](docs/zh/quick-start.md) 了解详细使用步骤。

## 📚 基本命令

```bash
# 创建项目
cocos create --project ./my-project

# 构建项目
cocos build --project ./my-project --platform web-mobile

# 导入项目
cocos import --project ./my-project

# 显示项目信息
cocos info --project ./my-project

# 启动 MCP 服务器
cocos start-mcp-server --project ./my-project --port 9527

# 交互式向导
cocos wizard

# 显示帮助
cocos --help
```

详细命令说明请查看 [Commands 文档](docs/zh/commands.md)。

## 🖥️ 模拟器预览

模拟器构建不在 `npm run build` 内 —— `npm run release` 会自动构建，也可以单独构建：

```bash
# 构建模拟器 native 可执行程序 + runtime 产物
npm run build:simulator

# 只构建 native 可执行程序
npm run build:simulator:native

# 只构建 runtime 产物
npm run build:simulator:runtime
```

对外接口在 `src/lib/simulator/simulator.ts`（类型声明生成在 `packages/cocos-cli-types/simulator.d.ts`）。简介见 [docs/zh/simulator.md](docs/zh/simulator.md)。

## 🛠️ 开发

### 开发模式

```bash
# 构建项目
npm run build

# 链接到全局
npm link

# 测试命令
cocos --help
```

### 故障排除

1. **命令找不到**

   ```bash
   npm list -g --depth=0
   npm unlink -g cocos-cli
   npm link
   ```

2. **编译错误**

   ```bash
   npm run build:clear
   npm run build
   ```

3. **调试模式**

   ```bash
   cocos --debug build --project ./my-project
   ```

## 🔧 开发工具

```bash
# 下载开发工具
npm run download-tools

# 更新仓库依赖
npm run update:repos
```

## 🧪 测试

### 单元测试

```bash
# 运行所有单元测试
npm test

# 运行 asset-db workspace 测试
npm run test:asset-db

# 监听模式运行测试
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# 静默运行测试
npm run test:quiet
```

### E2E 测试

```bash
# 运行 E2E 测试
npm run test:e2e

# 调试模式运行 E2E 测试（保留测试项目）
npm run test:e2e:debug

# 检查 E2E 测试覆盖率
npm run check:e2e-coverage

# 生成 E2E 覆盖率 HTML 报告
npm run check:e2e-coverage:report
```

### 运行所有测试

```bash
# 运行所有测试（单元 + E2E）
npm run test:all
```

查看更多测试详情：

- [单元测试文档](tests/README.md)
- [E2E 测试文档](e2e/README.md)

## 📖 文档

- [快速开始指南](docs/zh/quick-start.md)
- [工具下载指南](docs/zh/download-tools.md)
- [Commands 文档](docs/zh/commands.md)
- [构建平台适配包开发指南](docs/zh/build-platform.md)

## 🤝 贡献代码

我们欢迎贡献！请查看我们的[贡献指南](CONTRIBUTING.md)开始参与。

该指南涵盖：

- 开发工作流和项目构建
- 运行和编写测试
- 代码风格和格式化
- 调试技巧
- 提交 Pull Request

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。
