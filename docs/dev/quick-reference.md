# Developer Quick Reference | 开发者快速参考

Quick reference for common development tasks.
开发常用任务快速参考。

## 🛠️ Build & Compile | 构建和编译

```bash
# Full build | 完整构建
npm run build

# Watch mode | 监听模式
npm run build:watch

# Clear build cache | 清理构建缓存
npm run build:clear

# Generate MCP types | 生成 MCP 类型定义
npm run generate:mcp-types
```

## 🧪 Testing | 测试

### Unit Tests | 单元测试

```bash
npm test                    # Run all unit tests | 运行所有单元测试
npm run test:watch          # Watch mode | 监听模式
npm run test:coverage       # With coverage | 带覆盖率
npm run test:quiet          # Silent mode | 静默模式
```

### E2E Tests | E2E 测试

```bash
npm run test:e2e            # Run E2E tests | 运行 E2E 测试
npm run test:e2e:debug      # Debug mode (preserve workspace) | 调试模式（保留工作区）
npm run test:all            # Run all tests | 运行所有测试
```

### Coverage | 覆盖率

```bash
npm run check:e2e-coverage         # Console output | 控制台输出
npm run check:e2e-coverage:report  # HTML report | HTML 报告
```

## 🐛 Debugging | 调试

### MCP Server | MCP 服务器

```bash
npm run start:mcp-debug      # Start MCP server with test project | 启动带测试项目的 MCP 服务器
npm run start:mcp-inspector  # MCP Inspector UI | MCP 检查器界面
```

### CLI Commands | CLI 命令

```bash
# Debug any CLI command | 调试任何 CLI 命令
node --inspect-brk ./dist/cli.js [command] [options]

# Example | 示例
node --inspect-brk ./dist/cli.js build --project ./my-project
```

### VS Code Debug Configurations | VS Code 调试配置

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug E2E Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test:e2e", "--", "--runInBand"],
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Unit Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--runInBand"],
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug CLI",
      "program": "${workspaceFolder}/dist/cli.js",
      "args": ["build", "--project", "./tests/fixtures/projects/asset-operation"],
      "console": "integratedTerminal"
    }
  ]
}
```

## 📝 Code Quality | 代码质量

```bash
# Type checking | 类型检查
npx tsc --noEmit

# Lint files | 代码检查
npx eslint src/**/*.ts

# Auto-fix | 自动修复
npx eslint --fix src/**/*.ts
```

## 🔧 Maintenance | 维护

```bash
# Download development tools | 下载开发工具
npm run download-tools

# Update repositories | 更新仓库
npm run update:repos

# Rebuild native modules | 重新构建原生模块
npm run rebuild
```

## 📊 Reports & Logs | 报告和日志

### Test Reports | 测试报告

- **E2E Test Reports**: `e2e/reports/test-report-*.html`
- **Coverage Reports**: `e2e/reports/coverage-report-*.html`

### Opening Reports | 打开报告

After running tests with reports, the path will be printed:

```
📊 报告地址: e2e/reports/test-report-2025-10-28-09-30.html

快速打开命令:
  Windows: start e2e/reports/test-report-2025-10-28-09-30.html
  macOS:   open e2e/reports/test-report-2025-10-28-09-30.html
  Linux:   xdg-open e2e/reports/test-report-2025-10-28-09-30.html
```

## 🚀 Quick Workflow | 快速工作流

### Making Changes | 进行修改

```bash
# 1. Create feature branch | 创建功能分支
git checkout -b feature/my-feature

# 2. Start watch mode | 启动监听模式
npm run build:watch

# 3. Make changes and test | 修改并测试
npm test                    # Test unit tests | 测试单元测试
npm run test:e2e           # Test E2E | 测试 E2E

# 4. Generate types if needed | 如需要生成类型
npm run generate:mcp-types

# 5. Check coverage | 检查覆盖率
npm run check:e2e-coverage:report
```

### Before Committing | 提交前

```bash
# Run all tests | 运行所有测试
npm run test:all

# Type check | 类型检查
npx tsc --noEmit

# Build | 构建
npm run build

# Check everything passes | 确保一切通过
echo "All checks passed!" | 完成！
```

## 📚 Documentation | 文档

- **Contributing Guide**: [CONTRIBUTING.md](../../CONTRIBUTING.md)
- **E2E Testing**: [e2e/README.md](../../e2e/README.md)
- **Type Inference**: [e2e/docs/TYPE-INFERENCE-EXAMPLE.md](../../e2e/docs/TYPE-INFERENCE-EXAMPLE.md)
- **Test Coverage**: [e2e/scripts/README.md](../../e2e/scripts/README.md)

## 💡 Tips | 技巧

### Faster Development | 更快的开发

1. Use watch mode during active development | 活跃开发时使用监听模式
2. Run only affected tests | 只运行受影响的测试
3. Use `--preserve` flag to inspect test workspaces | 使用 `--preserve` 标志检查测试工作区
4. Keep MCP types updated after schema changes | schema 更改后保持 MCP 类型更新

### Debugging Test Failures | 调试测试失败

1. Use `npm run test:e2e:debug` to preserve workspace | 使用调试模式保留工作区
2. Check test reports in `e2e/reports/` | 检查 `e2e/reports/` 中的测试报告
3. Use VS Code debugger with breakpoints | 使用 VS Code 调试器和断点
4. Run specific test files: `npx jest path/to/test.ts` | 运行特定测试文件

### Performance | 性能

- Build is cached - only changed files recompile | 构建有缓存 - 只重新编译更改的文件
- Use `--runInBand` for debugging to run tests serially | 使用 `--runInBand` 串行运行测试以便调试
- Clear build cache if experiencing issues | 如遇问题清理构建缓存

---

**Need more help?** See [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed information.

**需要更多帮助？**查看 [CONTRIBUTING.md](../../CONTRIBUTING.md) 获取详细信息。
