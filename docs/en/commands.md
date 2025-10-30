# Cocos CLI Commands

This directory contains all command implementations for Cocos CLI.

## Available Commands

### `cocos create`

Create a new Cocos **project**

**Usage:**

```bash
cocos create --project <target-path> [options]
```

**Required Parameters:**

- `--project <path>` - Target project directory (will be created at this path)

**Optional Parameters:**

- `-t, --type <type>` - Project type (`2d` or `3d`, default: `3d`)

**Examples:**

```bash
cocos create --project /path/to/MyGame --type 3d
cocos create --project ./My2dGame --type 2d
```

### `cocos build`

Build Cocos project

**Usage:**

```bash
cocos build --project <project-path> [options]
```

**Required Parameters:**

- `--project <path>` - Cocos project path

**Optional Parameters:**

- `-p, --platform <platform>` - Target platform (web-desktop, web-mobile, android, ios, etc.)
- `--config <path>` - Specify configuration file path
- `--log-dest <path>` - Specify log file path
- `--skip-check` - Skip option validation
- `--stage <stage>` - Build stage (compile, bundle, etc.)

**Examples:**

```bash
cocos build --project /path/to/project --platform web-desktop
```

### `cocos start-mcp-server`

Start MCP (Model Context Protocol) server

**Usage:**

```bash
cocos start-mcp-server --project <project-path> [options]
```

**Required Parameters:**

- `--project <path>` - Cocos project path

**Optional Parameters:**

- `-p, --port <number>` - MCP server port number (default: 3000)

**Examples:**

```bash
cocos start-mcp-server --project /path/to/project --port 3000
```

### `cocos wizard`

Start interactive wizard

**Usage:**

```bash
cocos wizard
```

**Description:**
Start interactive wizard to guide you through project setup and operations. Provides a friendly user interface to perform various CLI operations.

**Features:**

- 🏗️ Build project wizard
- 🚀 Start MCP server wizard
- ❓ Help information viewer

**Examples:**

```bash
cocos wizard
```

## Global Options

All commands support the following global options:

- `--config <path>` - Specify configuration file path
- `--debug` - Enable debug mode
- `--no-interactive` - Disable interactive mode (for CI, interactive mode enabled by default)
