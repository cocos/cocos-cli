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

## 🧪 Testing

### Unit Tests

```bash
# Run all unit tests (core)
npm test

# Run only core tests
npm run test:core

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### E2E Tests

```bash
# Run E2E tests
npm run test:e2e

# Run E2E tests in debug mode (preserves test projects)
npm run test:e2e:debug

# Check E2E test coverage
npm run check:e2e-coverage

# Generate E2E coverage HTML report
npm run check:e2e-coverage:report
```

### Run All Tests

```bash
# Run all tests (unit + E2E)
npm run test:all
```

For more testing details, see:

- [Unit Tests Documentation](tests/README.md)
- [E2E Tests Documentation](e2e/README.md)

## 📖 Documentation

- [Quick Start Guide](docs/en/quick-start.md)
- [Tool Download Guide](docs/en/download-tools.md)
- [Commands Documentation](docs/en/commands.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) to get started.

The guide covers:

- Development workflow and building the project
- Running and writing tests
- Code style and formatting
- Debugging techniques
- Submitting pull requests

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.
