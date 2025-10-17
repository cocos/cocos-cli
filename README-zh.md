# 🎮 Cocos CLI

[![Node.js](https://img.shields.io/badge/Node.js-22.17.0-green.svg)](https://nodejs.org/)
[![Cocos Engine](https://img.shields.io/badge/Cocos-Engine-orange.svg)](https://github.com/cocos/cocos-engine)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> 🚀 专为 Cocos Engine 开发设计的强大命令行界面工具

## 📖 概述

Cocos CLI 是为 [Cocos Engine](https://github.com/cocos/cocos-engine) 设计的综合命令行界面工具。它为开发者提供了便捷的方式来管理 Cocos 项目，包括导入导出资源、项目初始化、资源处理、多平台导出和其他自动化任务。

## ✨ 功能特性

- 🏗️ **项目管理**：初始化和管理 Cocos 项目
- 📦 **资源导入/导出**：将外部资源导入项目或导出项目资源
- 🔧 **自动化工具**：批处理操作和自动化工作流
- 🌐 **跨平台支持**：支持 Cocos Creator 3.x 项目
- 🎯 **资源处理**：高级纹理打包、效果编译和资源优化
- ⚡ **构建系统**：多平台构建支持，可自定义选项

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

2. **配置环境**

   在根目录创建 `.user.json` 文件：

   ```json
   {
     "engine": "/path/to/your/cocos/engine",
     "project": "/path/to/your/project (可选，默认使用 tests 目录)"
   }
   ```

   示例：

   ```json
   {
     "engine": "F:\\code\\editor-3d-dev\\resources\\3d\\engine",
     "project": "F:\\code\\cocos-cli\\tests\\fixtures\\projects\\asset-operation"
   }
   ```

3. **安装依赖**

   ```bash
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

4. **下载开发工具**（首次运行）

   ```bash
   npm run download-tools
   ```

5. **启动应用**

   ```bash
   npm run start
   ```

### 📋 配置说明

- **`engine`**：本地 Cocos Engine 安装路径（必需）
- **`project`**：测试项目路径（可选，默认为 `tests` 目录）

## 🚀 使用方法

```bash
# 初始化新 Cocos 项目
cocos init my-project

# 导入资源到项目
cocos import --project ./my-project --source ./assets

# 导出项目资源
cocos export --project ./my-project --config-path ./config.json --output ./exported-assets

# 在 Cocos Creator 中打开项目
cocos open ./my-project
```

## 📚 命令说明

| 命令 | 描述 | 示例 |
|------|------|------|
| `init` | 创建新的 Cocos 项目 | `cocos init my-project` |
| `import` | 导入资源到项目 | `cocos import --project ./my-project --source ./assets` |
| `export` | 导出项目资源 | `cocos export --project ./my-project --output ./exported-assets` |
| `open` | 在 Cocos Creator 中打开项目 | `cocos open ./my-project` |
| `build` | 构建项目用于部署 | `cocos build --platform web-mobile` |
| `help` | 显示帮助信息 | `cocos help` |

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
