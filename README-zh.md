# Cocos CLI

## 概述

Cocos CLI 是为 [Cocos Engine](https://github.com/cocos/cocos-engine) 设计的命令行界面工具。它为开发者提供了便捷的方式来管理 Cocos 项目，包括导入导出资源、项目初始化、项目的多平台导出和其他自动化任务。

## 功能特性

- **项目管理**：初始化和管理 Cocos 项目
- **资源导入/导出**：将外部资源导入项目或导出项目资源
- **自动化工具**：批处理操作和自动化工作流
- **跨平台支持**：支持 Cocos Creator 3.x 项目

## 安装

```bash
npm install -g cocos-cli
```

## 使用方法

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

## 命令说明

- `init` - 创建新的 Cocos 项目
- `import` - 导入资源到项目
- `export` - 导出项目资源
- `open` - 在 Cocos Creator 中打开项目
- `build` - 构建项目用于部署
- `help` - 显示帮助信息

## 开发工具

### 下载开发工具

本项目包含各种开发工具，需要单独下载。使用以下命令下载所有必需的工具：

```bash
npm run download-tools
```

这将下载适用于 Windows、macOS 和 Linux 的平台特定工具。有关工具的详细信息和故障排除，请参阅：

📖 [工具下载指南](docs/download-tools.md)

## API 说明

[ConstantOptions](docs/core/ConstantOptions-zh.md)

## 贡献

欢迎贡献代码！在提交拉取请求之前，请阅读我们的贡献指南。
