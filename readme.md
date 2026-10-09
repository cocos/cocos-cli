# 🎮 COCOS CLI

[![Node.js](https://img.shields.io/badge/Node.js-22.17.0-green.svg)](https://nodejs.org/)
[![Cocos Engine](https://img.shields.io/badge/Cocos-Engine-orange.svg)](https://github.com/cocos/cocos4)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![cli logo](./static/image.png)
> 🚀 A powerful command-line interface tool for Cocos Engine development

## ✨ Features

- 🏗️ **Project Management**: Create, import, and build Cocos projects
- 📦 **Resource Management**: Import/export resources, batch processing
- ⚡ **Build System**: Multi-platform build support
- 🖥️ **Simulator Preview**: Build and launch the Cocos simulator from the CLI
- 🎨 **Interactive Interface**: Wizard-guided operations

## 📋 Prerequisites

- Node.js 22.17.0
- Git
- Visual Studio with C++ build tools (for Windows)
- Xcode (for macOS)

For native development, please refer to the [Native Development Setup Guide](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/setup-native-development.html) for detailed setup instructions.

## 🛠️ Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd cocos-cli
   ```

2. **Install dependencies**

   ```bash
   npm install -g node-gyp
   npm install
   ```

3. **Select an engine, prepare the CLI and link globally**

   Put a prepared Engine SDK in `packages/engine`, or set `enginePath` in the CLI root's ignored `config.local.json`:

   ```json
   {
     "project": "D:/Demo/cocos/NewProject",
     "enginePath": "D:/Cocos/code/cocos-cli/packages/engine"
   }
   ```

   Relative engine paths resolve from the CLI root, regardless of the current working directory. Omit `enginePath` to use `packages/engine`. Preserve your existing `project` value.

   ```bash
   npm run setup:cli
   npm link
   ```

   For engine source development, explicitly run `npm run fetch:engine` (only when source is missing), `npm run install:engine`, then `npm run setup:dev` instead of `setup:cli`. A custom engine is managed separately; skip `fetch:engine` for it.

`npm install` / `npm ci` install dependencies without compiling or downloading the engine. `setup:cli` builds the CLI and downloads development tools using a prepared engine; `setup:dev` also compiles engine source. `npm run init` is a compatibility alias for `setup:cli`. See [environment setup](docs/dev/environment-setup.md) for CI and update behavior.

## 🚀 Quick Start

See [Quick Start Guide](docs/en/quick-start.md) for detailed usage steps.

Use `--engine-path "D:/engines/custom engine"` to override the runtime engine. Precedence: command line > `engineSdk.path` in the project's `settings/cocos.config.json` > the CLI's local `enginePath` > `packages/engine`. Optional project `engineSdk.version` / `revision` pin the exact SDK identity. See [environment setup](docs/dev/environment-setup.md).

## 📚 Commands

```bash
# Create project
cocos create --project ./my-project

# Build project
cocos build --project ./my-project --platform web-mobile

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

## 🖥️ Simulator Preview

The simulator is not part of `npm run build` — `npm run release` builds it automatically, or you can build it directly:

```bash
# Build the native simulator executable + runtime artifacts
npm run build:simulator

# Build only the native executable
npm run build:simulator:native

# Build only the runtime artifacts
npm run build:simulator:runtime
```

The public API lives in `src/lib/simulator/simulator.ts` (generated types in `packages/cocos-cli-types/simulator.d.ts`). See [docs/en/simulator.md](docs/en/simulator.md) for an overview.

## 🧪 Testing

### Unit Tests

```bash
# Run all unit tests (core)
npm test

# Run asset-db workspace tests
npm run test:asset-db

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
