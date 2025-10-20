# 🎮 Cocos CLI

[![Node.js](https://img.shields.io/badge/Node.js-22.17.0-green.svg)](https://nodejs.org/)
[![Cocos Engine](https://img.shields.io/badge/Cocos-Engine-orange.svg)](https://github.com/cocos/cocos-engine)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![cli logo](./static/image.png)
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
- **Git**: For cloning the repository

### Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd cocos-cli
   ```

2. **Install dependencies**

   ```bash
   npm run init
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

3. **Download development tools** (first time only)

   ```bash
   npm run download-tools
   ```

4. **Link to global (optional, for CLI usage)**

   ```bash
   # Build the project first
   npm run build
   
   # Link to global
   npm link
   
   # Now you can use 'cocos' command anywhere
   cocos --help
   ```

5. **Start the application**

   ```bash
   npm start
   ```

## 🚀 Usage

### 📚 Commands

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

> 📖 **Detailed Command Documentation**: See [Commands Documentation](src/commands/readme.md) for complete command parameters and usage examples.

## 🛠️ Development

### Development Setup

For development and testing, you have several options:

#### Option 1: Using npm link (Recommended)

1. **Build the project first:**

   ```bash
   npm run build
   ```

2. **Link the package globally:**

   ```bash
   npm link
   ```

3. **Now you can use `cocos` command anywhere:**

   ```bash
   # Test the command
   cocos --help
   cocos --version
   
   # Use all available commands
   cocos build --project ./my-project --platform web-desktop
   cocos import --project ./my-project
   cocos info --project ./my-project
   cocos start-mcp-server --project ./my-project --port 9527
   ```

4. **To unlink when done:**

   ```bash
   npm unlink -g cocos-cli
   ```

5. **Verify the link:**

   ```bash
   # Check if the command is available
   which cocos
   
   # Check global packages
   npm list -g --depth=0 | grep cocos
   ```

#### Option 2: Direct execution

```bash
# Using compiled version (after npm run build)
node ./dist/cli.js --help
node ./dist/cli.js build --project ./my-project --platform web-desktop
node ./dist/cli.js import --project ./my-project
node ./dist/cli.js info --project ./my-project
node ./dist/cli.js start-mcp-server --project ./my-project --port 9527
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

3. **Project path issues:**
   - Make sure the project path is correct and accessible
   - Use absolute paths for better reliability
   - Check that the project directory contains the necessary files

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

### Update Repository Dependencies

The project uses external repositories (like Cocos Engine) that need to be updated periodically. Use the repository update command to manage these dependencies:

#### Setup Steps

1. **Configure repository settings**

   Ensure the `repo.json` file in the root directory is properly configured with the repositories you want to manage:

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

2. **Run the update command**

   ```bash
   npm run update:repos
   ```

3. **What this command does**

   - **Smart Repository Detection**: Automatically detects existing repositories and prompts for updates
   - **Interactive Updates**: Provides a 3-second countdown with user confirmation (default: auto-update)
   - **Safe Reset**: Only resets tracked files (`git reset --hard HEAD`) while preserving untracked files
   - **Branch/Tag Switching**: Automatically switches to the specified branch or tag
   - **Error Handling**: Comprehensive error handling with fallback to re-cloning if updates fail

   The command will:
   - Check each repository defined in `repo.json`
   - Prompt you to confirm updates for existing repositories
   - Reset any local changes to tracked files
   - Fetch the latest updates from remote
   - Switch to the specified branch/tag
   - Update to the latest code

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
