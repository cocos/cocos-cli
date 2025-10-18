# 🎮 Cocos CLI

[![Node.js](https://img.shields.io/badge/Node.js-22.17.0-green.svg)](https://nodejs.org/)
[![Cocos Engine](https://img.shields.io/badge/Cocos-Engine-orange.svg)](https://github.com/cocos/cocos-engine)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![cli logo](./static/image.png)
> 🚀 专为 Cocos Engine 开发设计的强大命令行界面工具

## 📖 概述

Cocos CLI 是为 [Cocos Engine](https://github.com/cocos/cocos-engine) 设计的综合命令行界面工具。它提供了现代化的交互式体验，让开发者能够便捷地管理 Cocos 项目，包括导入导出资源、项目初始化、资源处理、多平台导出和其他自动化任务。通过智能向导和直观的界面，即使是新手也能快速上手。

## ✨ 功能特性

- 🏗️ **项目管理**：初始化和管理 Cocos 项目
- 📦 **资源导入/导出**：将外部资源导入项目或导出项目资源
- 🔧 **自动化工具**：批处理操作和自动化工作流
- 🌐 **跨平台支持**：支持 Cocos Creator 3.x 项目
- 🎯 **资源处理**：高级纹理打包、效果编译和资源优化
- ⚡ **构建系统**：多平台构建支持，可自定义选项
- 🎨 **交互式界面**：现代化的命令行交互体验
- 🧙 **智能向导**：引导式操作流程，降低使用门槛

## 🛠️ 开发环境配置

### 环境要求

- **Node.js**：版本 22.17.0（必需）
- **Cocos Engine**：本地安装路径
- **Git**：用于克隆仓库

### 快速开始

1. **克隆仓库**

   ```bash
   git clone <repository-url>
   cd cocos-cli
   ```

2. **安装依赖**
   
   ```bash
   npm run init
   npm install
   ```

#### 原生依赖与 node-gyp（用于安装 gl 等需要编译的包）

安装 `gl` 等原生模块时需要使用 `node-gyp` 编译 C++ addon，请先完成以下准备：

- 全局安装 node-gyp（建议）

  ```bash
  npm i -g node-gyp
  ```

- Windows
  - 安装 [Visual Studio Build Tools]（勾选「C++ 生成工具」）
  - 安装 Python 3（并确保加入 PATH）
  - 重新打开终端后再执行依赖安装

- macOS
  - 安装 Xcode Command Line Tools：`xcode-select --install`
  - 确保已安装 Python 3

- Linux（Debian/Ubuntu 示例）
  - `sudo apt update && sudo apt install -y build-essential python3 make gcc g++`

完成以上准备后，再执行 `npm install` 安装依赖。

3. **下载开发工具**（首次运行）

   ```bash
   npm run download-tools
   ```

4. **链接到全局**（可选，用于 CLI 使用）

   ```bash
   # 先构建项目
   npm run build
   
   # 链接到全局
   npm link
   
   # 现在可以在任何地方使用 'cocos' 命令
   cocos --help
   ```

5. **启动应用**

   ```bash
   npm start
   ```

## 🚀 使用方法

### 基本命令

```bash
# 导入/打开 Cocos 项目
cocos import --project ./my-project

# 构建 Cocos 项目
cocos build --project ./my-project --platform web-desktop

# 显示项目信息
cocos info --project ./my-project

# 启动 MCP 服务器
cocos start-mcp-server --project ./my-project --port 9527

# 启动交互式向导
cocos wizard

# 显示帮助
cocos --help
cocos build --help
```

> 📖 **详细命令说明**: 查看 [Commands 文档](src/commands/readme.md) 获取完整的命令参数和使用示例。

## 📚 命令说明

Cocos CLI 提供以下主要命令：

- **`import`** - 导入/打开 Cocos 项目
- **`build`** - 构建 Cocos 项目
- **`info`** - 显示项目信息
- **`start-mcp-server`** - 启动 MCP 服务器
- **`wizard`** - 启动交互式向导

> 📖 **完整命令文档**: 查看 [Commands 文档](src/commands/readme.md) 获取详细的命令参数、选项和使用示例。

## 🎨 交互式功能

Cocos CLI 提供了现代化的交互式体验，让命令行操作更加直观和友好。

### 智能向导

使用 `cocos wizard` 命令启动交互式向导，它会引导你完成各种操作：

```bash
# 启动交互式向导
cocos wizard
```

**向导功能包括：**

- 🏗️ **构建项目向导** - 选择平台和构建选项
- 📂 **导入项目向导** - 引导项目导入流程
- ℹ️ **查看项目信息向导** - 显示项目详细信息
- 🚀 **启动 MCP 服务器向导** - 配置和启动服务器
- ❓ **帮助信息查看** - 显示命令帮助和示例

### 交互模式控制

CLI 支持两种运行模式：

**交互模式（默认）：**

- 显示彩色 banner 和欢迎信息
- 使用加载动画和进度条
- 提供交互式对话框和选择列表
- 支持实时状态更新

**非交互模式（CI 环境）：**

- 简化的文本输出
- 适合自动化脚本和 CI/CD 环境
- 使用 `--no-interactive` 参数启用

```bash
# 交互模式（默认）
cocos wizard
cocos build --project ./my-project

# 非交互模式（CI 环境）
cocos --no-interactive wizard
cocos --no-interactive build --project ./my-project
```

### 视觉特性

- 🌈 **渐变 Banner** - 彩色 ASCII 艺术字
- ⏳ **加载动画** - 实时状态指示
- 📊 **进度条** - 长时间操作的进度显示
- 🎯 **状态图标** - 成功、错误、警告等状态提示
- 📋 **表格显示** - 结构化的信息展示

## 🛠️ 开发与测试

### 开发设置

对于开发和测试，你有以下几种选择：

#### 方案一：使用 npm link（推荐）

1. **先构建项目：**

   ```bash
   npm run build
   ```

2. **链接到全局：**

   ```bash
   npm link
   ```

3. **现在可以在任何地方使用 `cocos` 命令：**

   ```bash
   # 测试命令
   cocos --help
   cocos --version
   
   # 使用所有可用命令
   cocos build --project ./my-project --platform web-desktop
   cocos import --project ./my-project
   cocos info --project ./my-project
   cocos start-mcp-server --project ./my-project --port 9527
   cocos wizard
   ```

4. **完成后取消链接：**

   ```bash
   npm unlink -g cocos-cli
   ```

5. **验证链接：**

   ```bash
   # 检查命令是否可用
   which cocos
   
   # 检查全局包
   npm list -g --depth=0 | grep cocos
   ```

#### 方案二：直接执行

```bash
# 使用编译版本（需要先执行 npm run build）
node ./dist/cli.js --help
node ./dist/cli.js build --project ./my-project --platform web-desktop
node ./dist/cli.js import --project ./my-project
node ./dist/cli.js info --project ./my-project
node ./dist/cli.js start-mcp-server --project ./my-project --port 9527
node ./dist/cli.js wizard
```

### 测试命令

#### 测试基本功能

```bash
# 测试帮助命令
cocos --help
cocos build --help
cocos import --help
cocos info --help
cocos wizard --help

# 测试版本
cocos --version
```

#### 使用示例项目测试

```bash
# 测试导入命令
cocos import --project ./tests/fixtures/projects/asset-operation

# 测试构建命令
cocos build --project ./tests/fixtures/projects/asset-operation --platform web-desktop

# 测试信息命令
cocos info --project ./tests/fixtures/projects/asset-operation

# 测试 MCP 服务器
cocos start-mcp-server --project ./tests/fixtures/projects/asset-operation --port 9527

# 测试交互式向导
cocos wizard
```

#### 使用调试模式测试

```bash
# 启用调试模式获取详细输出
cocos --debug build --project ./my-project --platform web-desktop
```

### 开发工作流

1. **修改代码**
2. **构建项目：**

   ```bash
   npm run build
   ```

3. **测试修改：**

   ```bash
   cocos --help  # 测试命令是否工作
   ```

4. **运行特定测试：**

   ```bash
   npm test
   ```

### 故障排除

#### 常见问题

1. **npm link 后找不到命令：**

   ```bash
   # 检查链接是否创建
   npm list -g --depth=0
   
   # 如需要重新链接
   npm unlink -g cocos-cli
   npm link
   ```

2. **TypeScript 编译错误：**

   ```bash
   # 清理并重新构建
   npm run build:clear
   npm run build
   ```

3. **项目路径问题：**
   - 确保项目路径正确且可访问
   - 使用绝对路径以获得更好的可靠性
   - 检查项目目录是否包含必要的文件

4. **交互式功能问题：**
   - 如果终端不支持颜色，使用 `--no-interactive` 参数
   - 在 CI 环境中建议使用非交互模式
   - 确保终端支持 Unicode 字符显示

#### 调试模式

启用调试模式以获取更详细的输出：

```bash
cocos --debug build --project ./my-project --platform web-desktop
```

这将提供额外的日志信息来帮助诊断问题。

## 🔧 开发工具

### 下载开发工具

本项目包含各种开发工具，需要单独下载。使用以下命令下载所有必需的工具：

```bash
npm run download-tools
```

这将下载适用于 Windows、macOS 和 Linux 的平台特定工具。有关工具的详细信息和故障排除，请参阅：

📖 [工具下载指南](docs/download-tools.md)

### 更新仓库依赖

项目使用外部仓库（如 Cocos Engine）需要定期更新。使用仓库更新命令来管理这些依赖：

#### 使用步骤

1. **配置仓库设置**

   确保根目录的 `repo.json` 文件已正确配置要管理的仓库：

   ```json
   {
     "engine": {
       "repo": "git@github.com:cocos/cocos-engine.git",
       "dist": "packages/engine",
       "branch": "v3.8.8"
     },
     "external": {
       "repo": "git@github.com:cocos/cocos-engine-external.git",
       "dist": "packages/engine/native/external"
     }
   }
   ```

2. **执行更新命令**

   ```bash
   npm run update:repos
   ```

3. **命令作用说明**

   - **智能仓库检测**：自动检测已存在的仓库并提示更新
   - **交互式更新**：提供 3 秒倒计时和用户确认（默认：自动更新）
   - **安全重置**：仅重置已跟踪的文件（`git reset --hard HEAD`），保留未跟踪的文件
   - **分支/标签切换**：自动切换到指定的分支或标签
   - **错误处理**：全面的错误处理，更新失败时回退到重新克隆

   该命令将：
   - 检查 `repo.json` 中定义的每个仓库
   - 提示您确认更新已存在的仓库
   - 重置已跟踪文件的本地更改
   - 从远程获取最新更新
   - 切换到指定的分支/标签
   - 更新到最新代码

## 📖 API 说明

- [ConstantOptions](docs/core/ConstantOptions-zh.md) - 配置选项和常量说明

## 🧪 测试

运行测试套件以验证一切正常工作：

```bash
npm run test
```

## 🤝 贡献

欢迎贡献代码！在提交拉取请求之前，请阅读我们的贡献指南。

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Cocos Engine](https://github.com/cocos/cocos-engine) - 出色的游戏引擎
- [Node.js](https://nodejs.org/) - JavaScript 运行时
- 所有帮助改进此项目的贡献者

---

<div align="center">

**用 ❤️ 为 Cocos 社区打造**

[⭐ 给这个仓库点星](https://github.com/SUD-GLOBAL/cocos-cli) | [🐛 报告 Bug](https://github.com/SUD-GLOBAL/cocos-cli/issues) | [💡 请求功能](https://github.com/SUD-GLOBAL/cocos-cli/issues)

</div>
