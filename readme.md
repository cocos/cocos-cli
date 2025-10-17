# 🎮 Cocos CLI

[![Node.js](https://img.shields.io/badge/Node.js-22.17.0-green.svg)](https://nodejs.org/)
[![Cocos Engine](https://img.shields.io/badge/Cocos-Engine-orange.svg)](https://github.com/cocos/cocos-engine)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> 🚀 A powerful command-line interface tool for Cocos Engine development

## 📖 Overview

Cocos CLI is a comprehensive command-line interface tool designed for the [Cocos Engine](https://github.com/cocos/cocos-engine). It provides developers with convenient ways to manage Cocos projects, including importing and exporting resources, project initialization, asset processing, and other automation tasks.

## ✨ Features

- 🏗️ **Project Management**: Initialize and manage Cocos projects
- 📦 **Resource Import/Export**: Import external resources into projects or export project resources
- 🔧 **Automation Tools**: Batch operations and automated workflows
- 🌐 **Cross-platform Support**: Works with Cocos Creator and Cocos Engine projects
- 🎯 **Asset Processing**: Advanced texture packing, effect compilation, and asset optimization
- ⚡ **Build System**: Multi-platform build support with customizable options

## 🛠️ Development Environment Setup

### Prerequisites

- **Node.js**: Version 22.17.0 (required)
- **Cocos Engine**: Local installation path
- **Git**: For cloning the repository

### Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd cocos-cli
   ```

2. **Configure environment**

   Create a `.user.json` file in the root directory:

   ```json
   {
     "engine": "/path/to/your/cocos/engine",
     "project": "/path/to/your/project (optional, defaults to tests directory)"
   }
   ```

   Example:

   ```json
   {
     "engine": "F:\\code\\editor-3d-dev\\resources\\3d\\engine",
     "project": "F:\\code\\cocos-cli\\tests\\fixtures\\projects\\asset-operation"
   }
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

#### Native dependencies and node-gyp (required for packages like gl)

When installing native modules such as `gl`, the build uses `node-gyp` to compile C++ addons. Please prepare the environment first:

- Install node-gyp globally (recommended)

  ```bash
  npm i -g node-gyp
  ```

- Windows
  - Install Visual Studio Build Tools (select "C++ build tools")
  - Install Python 3 and ensure it is available in PATH
  - Reopen your terminal before running installation

- macOS
  - Install Xcode Command Line Tools: `xcode-select --install`
  - Ensure Python 3 is installed

- Linux (Debian/Ubuntu example)
  - `sudo apt update && sudo apt install -y build-essential python3 make gcc g++`

After completing the above, run `npm install` again to install dependencies.

4. **Download development tools** (first time only)

   ```bash
   npm run download-tools
   ```

5. **Start the application**

   ```bash
   npm start
   ```

### 📋 Configuration Details

- **`engine`**: Path to your local Cocos Engine installation (required)
- **`project`**: Path to your test project (optional, defaults to `tests` directory)

## 🚀 Usage

### Basic Commands

```bash
# Import/open a Cocos project
cocos import --project ./my-project

# Build a Cocos project
cocos build --project ./my-project --platform web-desktop

# Show project information
cocos info --project ./my-project

# Start MCP server
cocos start-mcp-server --project ./my-project --port 9527

# Display help
cocos --help
cocos build --help
```

> 📖 **详细命令说明**: 查看 [Commands 文档](src/commands/readme.md) 获取完整的命令参数和使用示例。

## 📚 Commands

Cocos CLI 提供以下主要命令：

- **`import`** - 导入/打开 Cocos 项目
- **`build`** - 构建 Cocos 项目
- **`info`** - 显示项目信息
- **`start-mcp-server`** - 启动 MCP 服务器

> 📖 **完整命令文档**: 查看 [Commands 文档](src/commands/readme.md) 获取详细的命令参数、选项和使用示例。

## 🛠️ Development & Testing

### Development Setup

For development and testing, you have several options:

#### Option 1: Using npm link (Recommended)

1. **Link the package globally:**

   ```bash
   npm link
   ```

2. **Now you can use `cocos` command anywhere:**

   ```bash
   cocos --help
   cocos build --project ./my-project --platform web-desktop
   ```

3. **To unlink when done:**

   ```bash
   npm unlink -g cocos-cli
   ```

#### Option 2: Using npm scripts

```bash
# Run CLI directly with ts-node
npm run cli -- --help
npm run cli -- build --project ./my-project --platform web-desktop

# Build and run compiled version
npm run cli:build -- --help
npm run cli:build -- build --project ./my-project --platform web-desktop
```

#### Option 3: Direct execution

```bash
# Using ts-node directly
npx ts-node src/cli.ts --help
npx ts-node src/cli.ts build --project ./my-project --platform web-desktop

# Using compiled version
node dist/cli.js --help
node dist/cli.js build --project ./my-project --platform web-desktop
```

### Testing Commands

#### Test Basic Functionality

```bash
# Test help commands
cocos --help
cocos build --help
cocos import --help
cocos info --help

# Test version
cocos --version
```

#### Test with Sample Project

```bash
# Test import command
cocos import --project ./tests/fixtures/projects/asset-operation

# Test build command
cocos build --project ./tests/fixtures/projects/asset-operation --platform web-desktop

# Test info command
cocos info --project ./tests/fixtures/projects/asset-operation

# Test MCP server
cocos start-mcp-server --project ./tests/fixtures/projects/asset-operation --port 9527
```

#### Test with Debug Mode

```bash
# Enable debug mode for detailed output
cocos --debug build --project ./my-project --platform web-desktop
```

### Development Workflow

1. **Make changes to the code**
2. **Build the project:**

   ```bash
   npm run build
   ```

3. **Test your changes:**

   ```bash
   cocos --help  # Test if command works
   ```

4. **Run specific tests:**

   ```bash
   npm test
   ```

### Troubleshooting

#### Common Issues

1. **Command not found after npm link:**

   ```bash
   # Check if the link was created
   npm list -g --depth=0
   
   # Re-link if needed
   npm unlink -g cocos-cli
   npm link
   ```

2. **TypeScript compilation errors:**

   ```bash
   # Clean and rebuild
   npm run build:clear
   npm run build
   ```

3. **Engine path issues:**
   - Make sure the engine path is correct and accessible
   - Use absolute paths for better reliability
   - Check that the engine directory contains the necessary files

#### Debug Mode

Enable debug mode to get more detailed output:

```bash
cocos --debug build --project ./my-project --platform web-desktop
```

This will provide additional logging information to help diagnose issues.

## 🔧 Development Tools

### Download Development Tools

This project includes various development tools that need to be downloaded separately. Use the following command to download all required tools:

```bash
npm run download-tools
```

This will download platform-specific tools for Windows, macOS, and Linux. For detailed information about the tools and troubleshooting, see:

📖 [Tool Download Guide](docs/download-tools.md)

## 📖 API Documentation

- [ConstantOptions](docs/core/ConstantOptions.md) - Configuration options and constants

## 🧪 Testing

Run the test suite to verify everything is working correctly:

```bash
npm run test
```

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Cocos Engine](https://github.com/cocos/cocos-engine) - The amazing game engine
- [Node.js](https://nodejs.org/) - The JavaScript runtime
- All contributors who help make this project better

---

<div align="center">

**Made with ❤️ for the Cocos community**

[⭐ Star this repo](https://github.com/SUD-GLOBAL/cocos-cli) | [🐛 Report Bug](https://github.com/SUD-GLOBAL/cocos-cli/issues) | [💡 Request Feature](https://github.com/SUD-GLOBAL/cocos-cli/issues)

</div>
