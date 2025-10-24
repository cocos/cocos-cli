# 🎮 Cocos CLI

[![Node.js](https://img.shields.io/badge/Node.js-22.17.0-green.svg)](https://nodejs.org/)
[![Cocos Engine](https://img.shields.io/badge/Cocos-Engine-orange.svg)](https://github.com/cocos/cocos-engine)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![cli logo](./static/image.png)
> 🚀 A powerful command-line interface tool for Cocos Engine development

## ✨ Features

- 🏗️ **Project Management**: Create, import, and build Cocos projects
- 📦 **Resource Management**: Import/export resources, batch processing
- ⚡ **Build System**: Multi-platform build support
- 🎨 **Interactive Interface**: Wizard-guided operations

## 📋 Prerequisites

- Node.js 22.17.0
- Git

## 🛠️ Installation

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

3. **Build and link globally**

   ```bash
   npm run build
   npm link
   ```

## 🚀 Quick Start

See [Quick Start Guide](docs/en/quick-start.md) for detailed usage steps.

## 📚 Commands

```bash
# Create project
cocos create --project ./my-project

# Build project
cocos build --project ./my-project --platform web-desktop

# Import project
cocos import --project ./my-project

# Show project information
cocos info --project ./my-project

# Start MCP server
cocos start-mcp-server --project ./my-project --port 9527

# Interactive wizard
cocos wizard

# Display help
cocos --help
```

For detailed command documentation, see [Commands Documentation](docs/en/commands.md).

## 🛠️ Development

### Development Mode

```bash
# Build project
npm run build

# Link globally
npm link

# Test command
cocos --help
```

### Troubleshooting

1. **Command not found**

   ```bash
   npm list -g --depth=0
   npm unlink -g cocos-cli
   npm link
   ```

2. **Compilation errors**

   ```bash
   npm run build:clear
   npm run build
   ```

3. **Debug mode**

   ```bash
   cocos --debug build --project ./my-project
   ```

## 🔧 Development Tools

```bash
# Download development tools
npm run download-tools

# Update repository dependencies
npm run update:repos
```

## 🧪 Testing

```bash
npm test
```

## 📖 Documentation

- [Quick Start Guide](docs/en/quick-start.md)
- [Tool Download Guide](docs/en/download-tools.md)
- [Commands Documentation](docs/en/commands.md)

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.
