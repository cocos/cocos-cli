# 🚀 Quick Start Guide

This guide will help you get started with Cocos CLI, from installation to basic usage.

## 🛠️ Installation

### 1. 📋 Prerequisites

- Node.js 22.17.0 or higher
- Git

### 2. 📦 Installation Steps

```bash
# Clone repository
git clone <repository-url>
cd cocos-cli

# Install dependencies
npm run init
npm install

# Download development tools (first time only)
npm run download-tools

# Build and link globally
npm run build
npm link
```

### 3. ✅ Verify Installation

```bash
# Check if command is available
cocos --help
cocos --version
```

## 📚 Basic Usage

### 🏗️ Create Project

```bash
# Create new Cocos project
cocos create --project ./my-game

# Specify project type (default: 3d)
cocos create --project ./my-game --type 2d
```

### ⚡ Build Project

```bash
# Build to Web Desktop platform
cocos build --project ./my-game --platform web-desktop

# Build to Web Mobile platform
cocos build --project ./my-game --platform web-mobile

# Debug mode build
cocos build --project ./my-game --platform web-desktop --debug
```

### 📂 Import Project

```bash
# Import existing project
cocos import --project ./my-game
```

### ℹ️ View Project Information

```bash
# Display project details
cocos info --project ./my-game
```

## 🎨 Interactive Wizard

Use the interactive wizard to easily complete various operations:

```bash
# Start wizard
cocos wizard
```

The wizard will guide you through:

- Project building
- Project importing
- Viewing project information
- Starting MCP server

## 🔌 MCP Server

Start MCP server to support AI tool integration:

```bash
# Start MCP server
cocos start-mcp-server --project ./my-game --port 9527
```

## ⚙️ Common Options

### 🚫 Non-interactive Mode

Use in CI environments or automated scripts:

```bash
cocos --no-interactive build --project ./my-game
```

### 🐛 Debug Mode

Get detailed execution information:

```bash
cocos --debug build --project ./my-game
```

## 🔧 Troubleshooting

### ❌ Command Not Found

```bash
# Check global link
npm list -g --depth=0

# Re-link
npm unlink -g cocos-cli
npm link
```

### ⚠️ Build Errors

```bash
# Clean and rebuild
npm run build:clear
npm run build
```

### 📁 Project Path Issues

- Use absolute paths
- Ensure project directory exists and is accessible
- Check if project contains necessary configuration files

## 🎯 Next Steps

- View [Commands Documentation](src/commands/readme.md) to learn all available commands
- Read [API Documentation](docs/core/ConstantOptions.md) to understand configuration options
- Check [Tool Download Guide](docs/download-tools.md) to learn about development tools

## ❓ Get Help

```bash
# Display help information
cocos --help

# Display help for specific command
cocos build --help
cocos create --help
```
