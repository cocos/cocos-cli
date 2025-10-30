# 🚀 快速开始指南

本指南将帮助您快速上手 Cocos CLI，从安装到基本使用。

## 🛠️ 安装

### 1. 📋 环境要求

- Node.js 22.17.0 或更高版本
- Git

### 2. 📦 安装步骤

```bash
# 克隆仓库
git clone <repository-url>
cd cocos-cli

# 安装依赖
npm run init
npm install

# 下载开发工具（首次运行）
npm run download-tools

# 构建并链接到全局
npm run build
npm link
```

### 3. ✅ 验证安装

```bash
# 检查命令是否可用
cocos --help
cocos --version
```

## 📚 基本使用

### 🏗️ 创建项目

```bash
# 创建新的 Cocos 项目
cocos create --project ./my-game

# 指定项目类型（默认：3d）
cocos create --project ./my-game --type 2d
```

### ⚡ 构建项目

```bash
# 构建到 Web 桌面平台
cocos build --project ./my-game --platform web-desktop

# 构建到 Web 移动平台
cocos build --project ./my-game --platform web-mobile

# 调试模式构建
cocos build --project ./my-game --platform web-desktop --debug
```

## 🎨 交互式向导

使用交互式向导可以更轻松地完成各种操作：

```bash
# 启动向导
cocos wizard
```

向导将引导您完成：

- 项目构建
- 启动 MCP 服务器
- 查看帮助信息

## 🔌 MCP 服务器

启动 MCP 服务器以支持 AI 工具集成：

```bash
# 启动 MCP 服务器
cocos start-mcp-server --project ./my-game --port 9527
```

## ⚙️ 常用选项

### 🚫 非交互模式

在 CI 环境或自动化脚本中使用：

```bash
cocos --no-interactive build --project ./my-game
```

### 🐛 调试模式

获取详细的执行信息：

```bash
cocos --debug build --project ./my-game
```

## 🔧 故障排除

### ❌ 命令找不到

```bash
# 检查全局链接
npm list -g --depth=0

# 重新链接
npm unlink -g cocos-cli
npm link
```

### ⚠️ 构建错误

```bash
# 清理并重新构建
npm run build:clear
npm run build
```

### 📁 项目路径问题

- 使用绝对路径
- 确保项目目录存在且可访问
- 检查项目是否包含必要的配置文件

## 🎯 下一步

- 查看 [Commands 文档](src/commands/readme.md) 了解所有可用命令
- 阅读 [API 文档](docs/core/ConstantOptions-zh.md) 了解配置选项
- 查看 [工具下载指南](docs/download-tools.md) 了解开发工具

## ❓ 获取帮助

```bash
# 显示帮助信息
cocos --help

# 显示特定命令的帮助
cocos build --help
cocos create --help
```
