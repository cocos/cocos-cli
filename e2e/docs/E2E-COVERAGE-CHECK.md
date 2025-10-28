# E2E 测试覆盖率检查

本文档说明如何使用 E2E 测试覆盖率检查工具，确保所有 MCP API 都有对应的 E2E 测试。

## 🎯 目标

确保每个带 `@tool` 装饰器的 MCP API 方法都至少有一个 E2E 测试用例。

## 📊 覆盖率标准

- ✅ **已覆盖**：API 在 E2E 测试中至少被调用一次（通过 `mcpClient.callTool('tool-name', ...)`）
- ❌ **未覆盖**：API 没有在任何 E2E 测试中被调用

**注意**：这个检查比较简单，只要 API 在测试中被调用过一次就算覆盖，不要求多个测试场景。

## 🚀 使用方法

### 本地检查

```bash
# 运行覆盖率检查
npx tsx e2e/scripts/check-coverage.ts
```

**输出示例**：

```
================================================================================
📊 E2E 测试覆盖率报告
================================================================================

✅ 已测试的 API: 38 / 45 (84.44%)
❌ 未测试的 API: 7

================================================================================
⚠️  缺失 E2E 测试的 API 接口
================================================================================

### Assets API (5 个未测试)

- [ ] `assets-query-asset-config-map`
      文件: src/api/assets/assets.ts
      方法: queryAssetConfigMap()

- [ ] `assets-update-default-user-data`
      文件: src/api/assets/assets.ts
      方法: updateDefaultUserData()

...

================================================================================
💡 建议
================================================================================

请为以上 API 添加 E2E 测试用例。测试文件位置：

- Assets API → e2e/mcp/api/assets.e2e.test.ts
- Builder API → e2e/mcp/api/builder.e2e.test.ts
- Scene API → e2e/mcp/api/scene.e2e.test.ts

示例测试代码：

```typescript
test('should call api-tool-name', async () => {
    const result = await mcpClient.callTool('api-tool-name', {
        // 参数
    });
    expect(result).toBeDefined();
});
```

================================================================================
📈 详细统计
================================================================================

按类别统计：

Assets          ████████████████░░░░ 80% (20/25)
Builder         ████████████████████ 100% (3/3)
Scene           ███████████████░░░░░ 75% (6/8)
Node            ████████████░░░░░░░░ 60% (3/5)
Component       ████████░░░░░░░░░░░░ 40% (2/5)

```

### CI 自动检查

E2E 覆盖率检查会在以下情况自动运行：

1. **Push 到 main/develop 分支**
2. **Pull Request**（涉及 API 或 E2E 测试文件变更）

CI 会在 PR 中自动添加覆盖率报告评论。

## 📝 添加 E2E 测试

### 1. 确定测试文件

根据 API 类别选择对应的测试文件：

| API 类别 | 测试文件 |
|---------|---------|
| Assets API | `e2e/mcp/api/assets.e2e.test.ts` |
| Builder API | `e2e/mcp/api/builder.e2e.test.ts` |
| Scene API | `e2e/mcp/api/scene.e2e.test.ts` |
| Node API | `e2e/mcp/api/scene.e2e.test.ts` |
| Component API | `e2e/mcp/api/scene.e2e.test.ts` |
| Project API | `e2e/mcp/api/project.e2e.test.ts` |

### 2. 添加测试用例

```typescript
import { MCPTestClient } from '../../helpers/mcp-client';
import { createTestProject } from '../../helpers/test-utils';

describe('API Category E2E Tests', () => {
    let mcpClient: MCPTestClient;
    let testProject: TestProject;

    beforeAll(async () => {
        // 创建测试项目
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/your-project');
        testProject = await createTestProject(fixtureProject);

        // 启动 MCP 服务器
        mcpClient = new MCPTestClient(testProject.path);
        await mcpClient.start();
    });

    afterAll(async () => {
        await mcpClient.close();
        await testProject.cleanup();
    });

    // ✅ 新增测试用例
    test('should call your-api-tool', async () => {
        const result = await mcpClient.callTool('your-api-tool', {
            // 根据 API 定义填写参数
            param1: 'value1',
            param2: 'value2',
        });

        // 验证结果
        expect(result).toBeDefined();
        expect(result.code).toBe(0); // 或其他预期的返回码
        // 添加更多断言...
    });
});
```

### 3. 运行测试验证

```bash
# 运行 E2E 测试
npm run test:e2e

# 再次检查覆盖率
npm run check:e2e-coverage
```

## 🔍 工作原理

### 扫描 API 定义

工具会扫描 `src/api/**/*.ts` 中所有带 `@tool` 装饰器的方法：

```typescript
@tool('assets-query-asset-info')
async queryAssetInfo(
    @param(SchemaUrlOrUUIDOrPath) urlOrUUIDOrPath: TUrlOrUUIDOrPath,
    @param(SchemaDataKeys) dataKeys?: TDataKeys
): Promise<CommonResultType<TAssetInfoResult>> {
    // ...
}
```

### 扫描测试引用

工具会在 `e2e/**/*.e2e.test.ts` 中查找 `callTool` 调用：

```typescript
const result = await mcpClient.callTool('assets-query-asset-info', {
    urlOrUUIDOrPath: 'db://assets/test.png',
});
```

### 匹配和统计

- 如果 API 工具名在测试中出现至少一次，标记为**已覆盖**
- 否则标记为**未覆盖**
- 计算覆盖率百分比

## 📋 最佳实践

### ✅ 推荐

1. **为每个 API 至少写一个测试用例**
    - 测试主要成功路径
    - 验证基本返回结果

2. **使用类型安全的 API 调用**

    ```typescript
    // ✅ 推荐：类型安全
    await mcpClient.callTool('assets-query-asset-info', {
        urlOrUUIDOrPath: 'db://assets/test.png',
        dataKeys: ['uuid', 'url'], // IDE 会提示可用的 keys
    });
    ```

3. **复用测试项目**
    - 只读 API（查询类）使用 `getSharedTestProject`
    - 写入 API（创建/修改类）使用 `createTestProject`

4. **及时添加测试**
    - 新增 API 时同步添加 E2E 测试
    - CI 会在 PR 中提醒缺失的测试

### ❌ 避免

1. **不要只为了提高覆盖率而写无意义的测试**

    ```typescript
    // ❌ 避免：空测试
    test('should call api', async () => {
        await mcpClient.callTool('api-name', {});
    });
    ```

2. **不要忽略 CI 警告**
    - 缺失测试应该在合并前补充
    - 或者在 PR 描述中说明为什么暂不添加测试

## 🛠️ 命令速查

| 命令 | 说明 |
|------|------|
| `npx tsx e2e/scripts/check-coverage.ts` | 检查 E2E 测试覆盖率 |
| `npm run test:e2e` | 运行所有 E2E 测试 |
| `npm run test:e2e -- --testPathPattern=assets` | 只运行 assets 相关测试 |

## 🔗 相关文档

- [E2E 测试 README](../README.md)
- [类型安全的 MCP 客户端](./TYPE-SAFE-MCP-CLIENT.md)
- [测试项目管理器指南](./PROJECT-MANAGER-GUIDE.md)

---

**总结**：通过这个简单的覆盖率检查，我们可以快速发现哪些 API 缺少 E2E 测试，确保关键功能都经过端到端验证！
