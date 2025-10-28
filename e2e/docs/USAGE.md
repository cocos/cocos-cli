# E2E 测试使用指南

## 快速开始

### 1. 安装依赖

如果是第一次运行，需要安装新增的依赖：

```bash
npm install
```

新增的依赖包括：

- `get-port` - 获取可用端口
- `tree-kill` - 清理子进程

### 2. 构建项目

E2E 测试依赖打包后的 `dist/` 目录：

```bash
npm run build
```

### 3. 运行测试

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 调试模式（保留测试工作区）
npm run test:e2e:debug

# 只运行特定部分（使用 Jest 参数）
npm run test:e2e -- --testPathPattern=cli
npm run test:e2e -- --testPathPattern=mcp
```

## 测试场景

### CLI 命令测试

测试打包后的 `cocos` 命令行工具：

```bash
# 测试构建命令
npm run test:e2e -- e2e/cli/build.e2e.test.ts

# 测试信息命令
npm run test:e2e -- e2e/cli/info.e2e.test.ts

# 测试创建命令
npm run test:e2e -- e2e/cli/create.e2e.test.ts

# 测试向导命令
npm run test:e2e -- e2e/cli/wizard.e2e.test.ts
```

### MCP API 测试

测试 MCP 服务器的 API 接口：

```bash
# 测试服务器启动
npm run test:e2e -- e2e/mcp/server.e2e.test.ts

# 测试 Builder API
npm run test:e2e -- e2e/mcp/api/builder.e2e.test.ts

# 测试 Assets API
npm run test:e2e -- e2e/mcp/api/assets.e2e.test.ts

# 测试 Project API
npm run test:e2e -- e2e/mcp/api/project.e2e.test.ts

# 测试 Scene API
npm run test:e2e -- e2e/mcp/api/scene.e2e.test.ts
```

## 常见问题

### Q1: 测试超时怎么办？

构建测试需要较长时间（最多 5 分钟）。如果超时，可以：

1. 检查测试项目是否正常
2. 增加超时时间（在测试文件中修改）
3. 检查系统资源是否充足

### Q2: 端口冲突怎么办？

测试会自动获取可用端口。如果仍然冲突：

1. 确保没有其他 MCP 服务器在运行
2. 检查 `get-port` 是否正常工作
3. 手动指定不同的起始端口

### Q3: 测试失败后临时文件没清理？

测试应该自动清理临时文件。如果没有：

```bash
# 手动清理系统临时目录中的测试文件
# Windows
del /s /q %TEMP%\cocos-e2e-test-*

# Linux/Mac
rm -rf /tmp/cocos-e2e-test-*
```

### Q4: 如何调试单个测试？

```bash
# 使用 --verbose 查看详细输出
npm run test:e2e -- --verbose -t "测试名称"

# 在测试代码中添加 console.log
# 在 beforeAll/afterAll 中添加断点
```

### Q5: 测试在 CI 中失败？

检查 CI 环境：

1. 确保有足够的内存和磁盘空间
2. 确保有写临时文件的权限
3. 确保网络正常（如果需要）
4. 调整超时时间以适应 CI 环境

## 性能优化

### 并行运行（谨慎使用）

默认配置是串行运行（`maxWorkers: 1`）以避免端口冲突。如果要并行：

```typescript
// 修改 e2e/jest.config.e2e.ts
maxWorkers: 4, // 根据 CPU 核心数调整
```

### 跳过慢速测试

```bash
# 只运行快速测试
npm run test:e2e -- --testPathIgnorePatterns=build
```

### 使用缓存

测试会使用临时目录，每次都是全新环境。如果需要复用：

```typescript
// 在 test-utils.ts 中修改临时目录逻辑
// 使用固定路径而不是随机路径
```

## 扩展测试

### 添加新的 CLI 测试

1. 在 `e2e/cli/` 创建新文件：`my-command.e2e.test.ts`
2. 使用 `cliRunner` 执行命令
3. 验证输出和副作用

### 添加新的 MCP API 测试

1. 在 `e2e/mcp/api/` 创建新文件：`my-api.e2e.test.ts`
2. 使用 `MCPTestClient` 调用 API
3. 验证返回结果

### 自定义测试工具

修改 `e2e/helpers/test-utils.ts` 添加通用工具函数。

## 最佳实践

### ✅ 推荐做法

1. **测试隔离**：每个测试使用独立的临时目录
2. **资源清理**：在 `afterAll` 中清理资源
3. **错误处理**：测试正常和异常情况
4. **有意义的断言**：验证关键行为，不只是退出码
5. **使用辅助工具**：利用 `helpers/` 中的工具

### ❌ 避免做法

1. 不要依赖固定路径（除了测试 fixtures）
2. 不要依赖特定端口（使用 `getAvailablePort`）
3. 不要在测试间共享状态
4. 不要忽略清理逻辑
5. 不要使用过短的超时时间

## 持续维护

### 更新测试

当 CLI 或 API 变更时，及时更新对应测试：

1. 检查受影响的测试文件
2. 更新测试用例
3. 运行测试确保通过
4. 更新文档

### 监控测试质量

定期检查：

1. 测试覆盖率
2. 测试执行时间
3. 失败率和不稳定测试
4. CI 通过率

## 参考资料

- [Jest 官方文档](https://jestjs.io/docs/getting-started)
- [MCP SDK 文档](https://github.com/modelcontextprotocol/sdk)
- [项目主文档](../README.md)
