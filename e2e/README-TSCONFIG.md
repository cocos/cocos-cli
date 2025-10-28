# E2E 测试配置说明

本文档说明 E2E 测试的配置，包括 TypeScript 配置和全局配置。

## 📦 配置文件

### `e2e/config.ts` - 全局配置 ⭐

**统一管理所有超时时间、端口号等配置**

```typescript
export const E2E_TIMEOUTS = {
    /** Jest 全局测试超时：10 分钟 */
    JEST_GLOBAL: 10 * 60 * 1000,
    
    /** 服务器启动超时：2 分钟 */
    SERVER_START: 2 * 60 * 1000,

    /** 构建/创建项目/导入操作超时：10 分钟 */
    BUILD_OPERATION: 10 * 60 * 1000,
    
    /** MCP 请求超时：5 分钟 */
    MCP_REQUEST: 5 * 60 * 1000,
    
    /** MCP 列表操作超时：2 分钟 */
    MCP_LIST: 2 * 60 * 1000,
    
    /** 进程强制终止超时：5 秒 */
    FORCE_KILL: 5 * 1000,
} as const;

export const E2E_PORTS = {
    /** 自动分配端口 */
    AUTO: 0,
    
    /** 测试用的非常规端口 */
    TEST_PORT: 58234,
} as const;
```

**使用方式：**

```typescript
// ✅ 推荐：从统一配置导入
import { E2E_TIMEOUTS, E2E_PORTS } from '../config';

// ❌ 不推荐：硬编码超时时间
const timeout = 10 * 60 * 1000;
```

## ⚙️ 配置文件：`e2e/tsconfig.json`

### 核心特性

```json
{
    "$schema": "https://json.schemastore.org/tsconfig",
    "extends": "../tsconfig.json",
    "compilerOptions": {
        "types": ["jest", "node"],
        "skipLibCheck": true,
        "noEmit": true,           // ✅ 只做类型检查，不生成编译产物
        "rootDir": "..",
        "baseUrl": "..",
        "paths": {
            "@/*": ["src/*"]      // ✅ 支持路径别名
        }
    },
    "include": [
        "**/*.ts",                // E2E 测试文件
        "../tests/shared/**/*.ts", // 共享测试工具
        "../src/**/*.d.ts"        // 源码类型定义
    ],
    "exclude": [
        ".workspace/**"           // 排除测试工作区
    ]
}
```

## 🎯 设计目标

### 1. **不参与主项目编译**

- E2E 测试代码仅用于测试，不会被 `npm run build` 编译
- `"noEmit": true` 确保不生成任何编译产物

### 2. **完整的类型提示**

- 包含 Jest 和 Node.js 的类型定义
- 可以访问源码的类型（`.d.ts` 文件）
- 可以使用共享测试工具（`tests/shared/`）

### 3. **支持路径别名**

```typescript
// ✅ 可以使用 @ 别名
import { build } from '@/core/builder';

// ✅ 也可以使用相对路径
import { build } from '../src/core/builder';
```

## 📦 依赖关系

```
e2e/tsconfig.json
    ↓ extends
tsconfig.json (主配置)
    ↓ types
@types/jest + @types/node
    ↓ include
e2e/**/*.ts + tests/shared/**/*.ts + src/**/*.d.ts
```

## 🔧 与其他配置的关系

| 配置文件 | 用途 | 编译 | 类型检查 |
|---------|------|------|---------|
| `tsconfig.json` | 主项目源码 | ✅ 是 | ✅ 是 |
| `tests/tsconfig.json` | 单元测试 | ❌ 否 | ✅ 是 |
| `e2e/tsconfig.json` | E2E 测试 | ❌ 否 | ✅ 是 |
| `e2e/jest.config.e2e.ts` | Jest 运行时配置 | - | - |

## 💡 使用场景

### 场景 1：引入共享测试工具

```typescript
// e2e/mcp/api/assets.e2e.test.ts
import { 
    CREATE_ASSET_TYPE_TEST_CASES 
} from '../../../tests/shared/asset-test-data';

import { 
    validateAssetCreated,
    validateAssetFileExists 
} from '../../../tests/shared/asset-test-helpers';

describe('MCP Assets API', () => {
    test.each(CREATE_ASSET_TYPE_TEST_CASES)(
        'should create $description',
        async ({ type, ccType }) => {
            const result = await mcpClient.callTool('asset-create-by-type', { type });
            
            // ✅ 使用共享验证函数，有完整类型提示
            validateAssetCreated(result.data, ccType);
        }
    );
});
```

### 场景 2：访问源码类型

```typescript
// e2e/cli/build.e2e.test.ts
import { Platform } from '../src/core/builder/@types/public/platform';

describe('cocos build command', () => {
    test('should build project', async () => {
        // ✅ Platform 类型有完整定义
        const platform: Platform = 'web-desktop';
        await cliRunner.build({ platform });
    });
});
```

### 场景 3：Jest 类型支持

```typescript
// e2e/helpers/test-utils.ts
import { expect } from '@jest/globals';

// ✅ expect 有完整的类型定义
export function validateAssetCreated(asset: any, expectedType: string) {
    expect(asset).not.toBeNull();
    expect(asset.type).toBe(expectedType);
}
```

## ✅ 验证配置

### 检查类型错误

```bash
# 检查 E2E 测试的类型错误
npx tsc --project e2e/tsconfig.json --noEmit
```

### 运行 E2E 测试

```bash
# 完整的 E2E 测试（包含类型检查）
npm run test:e2e
```

## 🔗 相关文档

- [E2E 测试使用指南](./README.md)
- [测试项目管理器](./docs/PROJECT-MANAGER-GUIDE.md)
- [CLI 路径配置](./docs/CLI-PATH-GUIDE.md)
- [单元测试配置](../tests/README.md)
