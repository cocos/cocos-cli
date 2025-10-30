# Cocos CLI 命令

本目录包含 Cocos CLI 的所有命令实现。

## 可用命令

### `cocos create`

创建一个新的 Cocos 项目

**用法:**

```bash
cocos create --path <target-path> [options]
```

**必需参数:**

- `--path <path>` - 目标项目目录（将创建到该路径）

**可选参数:**

- `-t, --type <type>` - 项目类型 (`2d` 或 `3d`，默认: `3d`)

**示例:**

```bash
cocos create --path /path/to/MyGame --type 3d
cocos create --path ./My2dGame --type 2d
```

### `cocos build`

构建 Cocos 项目

**用法:**

```bash
cocos build --project <project-path> [options]
```

**必需参数:**

- `--project <path>` - Cocos 项目路径

**可选参数:**

- `-p, --platform <platform>` - 目标平台 (web-desktop, web-mobile, android, ios, 等)
- `--config <path>` - 指定配置文件路径
- `--log-dest <path>` - 指定日志文件路径
- `--skip-check` - 跳过选项验证
- `--stage <stage>` - 构建阶段 (compile, bundle, 等)

**示例:**

```bash
cocos build --project /path/to/project --platform web-desktop
```

### `cocos start-mcp-server`

启动 MCP (Model Context Protocol) 服务器

**用法:**

```bash
cocos start-mcp-server --project <project-path> [options]
```

**必需参数:**

- `--project <path>` - Cocos 项目路径

**可选参数:**

- `-p, --port <number>` - MCP 服务器端口号 (默认: 3000)

**示例:**

```bash
cocos start-mcp-server --project /path/to/project --port 3000
```

### `cocos wizard`

启动交互式向导

**用法:**

```bash
cocos wizard
```

**描述:**
启动交互式向导，引导你完成项目设置和操作。提供友好的用户界面来执行各种 CLI 操作。

**功能:**

- 🏗️ 构建项目向导
- 🚀 启动 MCP 服务器向导
- ❓ 帮助信息查看

**示例:**

```bash
cocos wizard
```

## 全局选项

所有命令都支持以下全局选项：

- `--config <path>` - 指定配置文件路径
- `--debug` - 启用调试模式
- `--no-interactive` - 禁用交互模式（用于 CI，默认启用交互模式）
