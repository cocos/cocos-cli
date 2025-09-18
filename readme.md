# Cocos CLI

## Overview

Cocos CLI is a command-line interface tool designed for the [Cocos Engine](https://github.com/cocos/cocos-engine). It provides developers with convenient ways to manage Cocos projects, including importing and exporting resources, project initialization, and other automation tasks.

## Features

- **Project Management**: Initialize and manage Cocos projects
- **Resource Import/Export**: Import external resources into projects or export project resources
- **Automation Tools**: Batch operations and automated workflows
- **Cross-platform Support**: Works with Cocos Creator and Cocos Engine projects

## Installation

```bash
npm install -g cocos-cli
```

## Usage

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

## Commands

- `init` - Create a new Cocos project
- `import` - Import resources into project
- `export` - Export project resources
- `open` - Open project in Cocos Creator
- `build` - Build project for deployment
- `help` - Display help information

## Development Tools

### Download Development Tools

This project includes various development tools that need to be downloaded separately. Use the following command to download all required tools:

```bash
npm run download-tools
```

This will download platform-specific tools for Windows, macOS, and Linux. For detailed information about the tools and troubleshooting, see:

📖 [Tool Download Guide](docs/download-tools.md)

## API Documentation

[ConstantOptions](docs/core/ConstantOptions.md)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

---
