# Cocos CLI 命令

本目录包含 Cocos CLI 的所有命令实现。

## 可用命令

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

### `cocos import`

导入/打开 Cocos 项目

**用法:**

```bash
cocos import --project <project-path> [options]
```

**必需参数:**

- `--project <path>` - Cocos 项目路径

**可选参数:**

- `--wait` - 导入后保持进程运行（用于开发）

**示例:**

```bash
cocos import --project /path/to/project --wait
```

### `cocos info`

显示项目信息

**用法:**

```bash
cocos info --project <project-path>
```

**必需参数:**

- `--project <path>` - Cocos 项目路径

**示例:**

```bash
cocos info --project /path/to/project
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

## 全局选项

所有命令都支持以下全局选项：

- `--config <path>` - 指定配置文件路径
- `--debug` - 启用调试模式
- `--no-interactive` - 禁用交互模式（用于 CI）

## 引擎路径配置

引擎路径通过以下方式配置（按优先级排序）：

`.user.json` 文件中的 `engine` 字段

**示例 .user.json:**

```json
{
  "engine": "/path/to/cocos/engine"
}
```
