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

```bash
# Initialize a new Cocos project
cocos init my-project

# Import resources into project
cocos import --project ./my-project --source ./assets

# Export project resources
cocos export --project ./my-project --output ./exported-assets

# Open project in Cocos Creator
cocos open ./my-project
```

## 📚 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Create a new Cocos project | `cocos init my-project` |
| `import` | Import resources into project | `cocos import --project ./my-project --source ./assets` |
| `export` | Export project resources | `cocos export --project ./my-project --output ./exported-assets` |
| `open` | Open project in Cocos Creator | `cocos open ./my-project` |
| `build` | Build project for deployment | `cocos build --platform web-mobile` |
| `help` | Display help information | `cocos help` |

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
