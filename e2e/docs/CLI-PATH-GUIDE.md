# E2E 测试 CLI 路径配置指南

## 优先级规则

CLI 路径的优先级（从高到低）：

1. **命令行参数** `--cli`
2. **默认路径** `./dist/cli.js`

## 使用方式

### 开发阶段（默认）

```bash
npm run build
npm run test:e2e
```

### 指定 CLI 路径

```bash
# 测试特定路径
npm run test:e2e -- --cli ./dist/cli.js

# 测试全局安装的包
npm run test:e2e -- --cli $(which cocos)

# Windows PowerShell
npm run test:e2e -- --cli (Get-Command cocos).Source

# 只测试特定部分
npm run test:e2e -- --cli ./dist/cli.js e2e/cli
```

### 测试发布包

```bash
# 1. 安装包
npm install -g ./cocos-cli-1.0.0.tgz
# 或
npm install -g cocos-cli@latest

# 2. 运行测试
npm run test:e2e -- --cli $(which cocos)
```

## 常见问题

**如何查看使用的 CLI 路径？**

测试开始时会自动打印：

```text
📋 CLI 路径来源: command line argument
📍 最终 CLI 路径: /path/to/cli.js
```

**相对路径 vs 绝对路径？**

- 相对路径会自动转换为绝对路径
- 建议使用相对路径，更灵活
