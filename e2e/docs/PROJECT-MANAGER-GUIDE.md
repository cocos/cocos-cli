# 测试项目管理器使用指南

## 核心特性

- ✅ **统一工作区** - 所有测试项目在 `e2e/.workspace/` 下
- ✅ **共享项目** - 只读测试可以共享同一个项目副本，节省资源
- ✅ **共享 MCP 服务器** - 所有 MCP 测试共享同一个服务器实例
- ✅ **自动清理缓存** - 自动删除 `.gitignore` 忽略的文件和 Cocos 缓存目录
- ✅ **测试隔离** - 每个写入测试使用独立的项目副本

## 使用方式

### 1. MCP 测试（推荐）

所有 MCP 测试共享同一个服务器和项目实例：

```typescript
import { setupMCPTestEnvironment, teardownMCPTestEnvironment, MCPTestContext } from '../helpers/test-utils';

describe('MCP API Test', () => {
    let context: MCPTestContext;

    beforeAll(async () => {
        context = await setupMCPTestEnvironment();
    });

    afterAll(async () => {
        await teardownMCPTestEnvironment(context);
    });

    test('should work', async () => {
        // 使用 context.mcpClient 和 context.testProject
    });
});
```

### 2. Assets MCP 测试

Assets 测试使用扩展的环境设置：

```typescript
import { setupAssetsTestEnvironment, teardownAssetsTestEnvironment, AssetsTestContext } from '../helpers/test-utils';

describe('Assets API Test', () => {
    let context: AssetsTestContext;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    test('should create asset', async () => {
        // 使用 context.mcpClient, context.testRootUrl, context.testRootPath
    });
});
```

### 3. CLI 测试（独立项目）

CLI 测试使用独立的项目实例：

```typescript
import { createTestProject } from '../helpers/test-utils';
import { resolve } from 'path';

describe('CLI Test', () => {
    let testProject: TestProject;

    beforeAll(async () => {
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/test-project');
        testProject = await createTestProject(fixtureProject);
    });

    afterAll(async () => {
        await testProject.cleanup();
    });

    test('should build', async () => {
        // 使用 testProject.path
    });
});
```

## 自动清理的内容

### Cocos 项目缓存目录

以下目录会在复制项目前自动清理：

```text
library/     # 编译缓存
temp/        # 临时文件
local/       # 本地数据
build/       # 构建输出
profiles/    # 旧的配置文件
settings/    # 旧的设置
packages/    # 旧工程支持的插件包
node_modules/  # Node 模块
```

### .gitignore 忽略的文件

项目的 `.gitignore` 中列出的文件和目录也会被清理。

## 调试模式

保留测试工作区用于调试：

```bash
# 设置环境变量
E2E_PRESERVE_WORKSPACE=true npm run test:e2e

# 或使用专用脚本
npm run test:e2e:debug
```

调试完成后手动删除工作区：

```bash
rm -rf e2e/.workspace
```

## 最佳实践

### ✅ 推荐做法

1. **MCP 测试使用共享服务器** - 使用 `setupMCPTestEnvironment()` 或 `setupAssetsTestEnvironment()`
2. **CLI 测试使用独立项目** - 使用 `createTestProject()`
3. **始终调用 cleanup** - 在 `afterAll` 中清理资源

### ❌ 避免做法

1. 不要在 MCP 测试中手动创建 MCP 客户端
2. 不要在测试中修改共享项目的内容
3. 不要忘记调用 cleanup
