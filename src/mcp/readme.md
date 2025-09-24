# MCP 服务器使用说明

本项目实现了基于 `fastmcp` 的 MCP (Model Context Protocol) 服务器，能够自动收集使用装饰器定义的工具并将其暴露为 MCP 工具。

## 功能特性

- 🔄 **自动工具收集**: 自动从装饰器注册表中收集工具信息
- 🛠️ **装饰器支持**: 支持 `@Tool`、`@Title`、`@Description`、`@Param`、`@Result` 装饰器
- 📝 **类型安全**: 使用 Zod 进行参数验证和类型转换
- 🚀 **即插即用**: 只需添加装饰器即可自动注册工具
- 🔍 **错误处理**: 完善的错误处理和日志记录

## 项目结构

```
src/mcp/
├── fast-mcp.ts          # FastMCP 服务器实现
├── start-fast-mcp.ts    # 服务器启动脚本
├── test-mcp.ts          # 基础测试脚本
├── index.ts             # 导出文件
├── stdio.ts             # STDIO 传输实现
└── readme.md            # 本文档
```

## 快速开始

### 1. 定义 API 工具

使用装饰器定义你的 API 工具：

```typescript
import { Tool, Title, Description, Param, Result } from '../api/decorator/decorator';
import { z } from 'zod';

export class MyApi extends ApiBase {
    @Tool('myTool')
    @Title('我的工具')
    @Description('这是一个示例工具')
    @Result(z.object({ message: z.string() }))
    async myMethod(
        @Param(z.string()) input: string
    ): Promise<CommonResultType<{ message: string }>> {
        return {
            code: 200,
            data: { message: `处理结果: ${input}` }
        };
    }
}
```

### 2. 启动 MCP 服务器

```bash
# 使用启动脚本
npx tsx src/mcp/start-fast-mcp.ts

# 或者直接运行
node src/mcp/start-fast-mcp.js
```

### 3. 测试服务器

```bash
# 运行基础测试
npx tsx src/mcp/test-mcp.ts

# 运行完整测试
npx tsx src/mcp/test-full-mcp.ts
```

## 装饰器说明

### @Tool(name: string)
定义工具名称，必须是唯一的。

```typescript
@Tool('queryUrl')
async queryUrl() { ... }
```

### @Title(title: string)
设置工具的显示标题。

```typescript
@Title('获取文件路径的 URL')
```

### @Description(description: string)
设置工具的详细描述。

```typescript
@Description('根据某个路径转化为 URL，返回的是文件的 db 路径')
```

### @Param(schema: ZodType)
定义参数的验证 schema。

```typescript
async myMethod(
    @Param(z.string()) path: string,
    @Param(z.number().optional()) timeout?: number
) { ... }
```

### @Result(schema: ZodType)
定义返回值的 schema（会自动包装在 CommonResult 中）。

```typescript
@Result(z.object({ url: z.string() }))
async queryUrl() { ... }
```

## API 示例

项目中包含了一个完整的示例 `ImporterApi`：

```typescript
export class ImporterApi extends ApiBase {
    @Tool('queryUrl')
    @Title('获取文件路径的 url')
    @Description('根据某个路径转化为 url，返回的是文件的 db 路径，类似db://assets/abc.png')
    @Result(queryResult)
    async queryUrl(@Param(uriPath) path: TypeUriPath): Promise<CommonResultType<TypeQueryResult>> {
        try {
            const url = `db://just/a/test/${path}.png`
            return {
                code: COMMON_STATUS.SUCCESS,
                data: {url},
            };
        } catch (error) {
            console.error('刷新资源失败:', error);
            return {
                code: COMMON_STATUS.FAIL,
                data: {url: ''},
            };
        }
    }
}
```

## 工作原理

1. **装饰器收集**: 当类被加载时，装饰器会自动将工具信息注册到 `toolRegistry`
2. **服务器初始化**: FastMCP 服务器启动时会扫描 `toolRegistry` 中的所有工具
3. **工具注册**: 每个工具都会被转换为 MCP 工具格式并注册到服务器
4. **参数验证**: 使用 Zod schema 验证输入参数
5. **方法调用**: 动态创建实例并调用对应的方法
6. **结果格式化**: 将返回结果格式化为字符串返回给客户端

## 测试结果

测试成功验证了以下功能：

- ✅ 工具注册成功（注册了 2 个工具）
- ✅ FastMCP 服务器启动成功
- ✅ 工具调用逻辑正确
- ✅ 返回结果结构符合预期
- ✅ 服务器正常停止

测试输出示例：
```
🚀 开始测试 MCP 服务器...
📊 检查工具注册情况:
注册的工具数量: 2

🔧 工具: queryUrl
  - 标题: 获取文件路径的 url
  - 描述: 根据某个路径转化为 url，返回的是文件的 db 路径，类似db://assets/abc.png
  - 方法名: queryUrl
  - 参数数量: 1
  - 返回类型: 已定义

✅ queryUrl 调用成功: { code: 200, data: { url: 'db://just/a/test/test/path.png' } }
```
