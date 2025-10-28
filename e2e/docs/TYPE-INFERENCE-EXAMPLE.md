# MCP 类型推断示例

本文档演示如何正确使用 MCP 客户端的类型推断功能。

## ✅ 正确的类型推断效果

### 1. 工具名称自动补全

当你输入 `mcpClient.callTool('` 时，应该看到所有可用的工具名称：

```typescript
mcpClient.callTool('assets-create-asset', ...);  // ✅ 自动补全
mcpClient.callTool('assets-delete-asset', ...);  // ✅ 自动补全
mcpClient.callTool('builder-build', ...);        // ✅ 自动补全
// ... 等 48 个工具
```

### 2. 参数类型检查

根据选择的工具名称，第二个参数会自动推断类型：

```typescript
// ✅ 正确 - options 参数是必需的
await mcpClient.callTool('assets-create-asset', {
    options: {
        target: 'db://assets/test.txt',
        content: 'hello',  // 可选
    }
});

// ❌ 错误 - 缺少必需参数
await mcpClient.callTool('assets-create-asset', {
    target: 'db://assets/test.txt'  // ❌ 错误：target 不是直接参数
});

// ✅ 正确 - 可选参数可以省略
await mcpClient.callTool('assets-query-asset-info', {
    urlOrUUIDOrPath: 'db://assets/scene.scene',
    // dataKeys 是可选的，可以不传
});

// ✅ 正确 - 可选参数也可以传入
await mcpClient.callTool('assets-query-asset-info', {
    urlOrUUIDOrPath: 'db://assets/scene.scene',
    dataKeys: ['uuid', 'name', 'type'],  // 可选参数
});

// ✅ 正确 - 所有参数都是可选的工具
await mcpClient.callTool('builder-build', {
    options: {  // 整个 options 都是可选的
        platform: 'web-desktop',
        debug: true,
    }
});

// ✅ 正确 - 可选参数可以完全省略
await mcpClient.callTool('builder-build', {});
```

### 3. 返回值类型推断

返回值类型也会自动推断：

```typescript
// result 的类型自动推断为 MCPResponse<TCreatedAssetResult>
const result = await mcpClient.callTool('assets-create-asset', {
    options: { target: 'db://assets/test.txt' }
});

// TypeScript 知道 result.data 的类型
if (result.data) {
    console.log(result.data.uuid);        // ✅ 类型安全
    console.log(result.data.url);         // ✅ 类型安全
    console.log(result.data.isDirectory); // ✅ 类型安全
}
```

### 4. 鼠标悬停查看类型

将鼠标悬停在任何地方，都能看到正确的类型信息：

- 悬停在 `'assets-create-asset'` → 显示工具的标题和描述
- 悬停在参数对象 → 显示 `AssetsCreateAssetParams` 类型
- 悬停在 `result` → 显示 `MCPResponse<TCreatedAssetResult>` 类型
- 悬停在 `result.data` → 显示 `TCreatedAssetResult | null` 类型

## 🔧 如果类型推断不工作

如果你看到的是 `any` 类型而不是具体类型，请尝试：

### 方法 1: 重启 TypeScript 服务器

1. 按 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（Mac）
2. 输入 `TypeScript: Restart TS Server`
3. 回车执行

### 方法 2: 重新生成类型定义

```bash
npm run generate:mcp-types
```

### 方法 3: 清理并重新编译

```bash
npm run compile
npm run generate:mcp-types
```

### 方法 4: 检查导入

确保类型定义文件存在且正确：

```bash
# 检查文件是否存在
ls e2e/types/mcp-tools.generated.ts

# 检查是否有 linter 错误
npx tsc --noEmit
```

## 📝 类型定义的工作原理

```typescript
// 泛型约束确保工具名称是有效的
async callTool<TName extends keyof MCPToolsMap>(
    name: TName,                           // 工具名称（字面量类型）
    args: MCPToolsMap[TName]['params'],    // 根据工具名称推断参数类型
    timeout?: number
): Promise<MCPResponse<MCPToolsMap[TName]['result']>> // 根据工具名称推断返回值类型
```

当你传入 `'assets-create-asset'` 时：

- `TName` 被推断为 `'assets-create-asset'`
- `args` 的类型被推断为 `AssetsCreateAssetParams`
- 返回值类型被推断为 `MCPResponse<TCreatedAssetResult>`

## 🎯 实际使用示例

查看以下测试文件以获取更多实际使用示例：

- `e2e/mcp/api/assets.e2e.test.ts` - 资源管理 API 测试
- `e2e/mcp/api/builder.e2e.test.ts` - 构建 API 测试
