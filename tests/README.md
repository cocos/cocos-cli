# 测试代码配置说明

本目录包含单元测试和共享的测试辅助工具。

## 📁 目录结构

```
tests/
├── tsconfig.json           # 测试代码的 TypeScript 配置（不参与编译）
├── fixtures/               # 测试数据和项目
│   ├── effect-compiler/    # Effect 编译器测试用例
│   └── projects/           # 测试项目
├── shared/                 # 共享的测试辅助工具
│   ├── asset-test-data.ts  # 测试数据定义
│   ├── asset-test-helpers.ts # 测试辅助函数
│   └── README.md           # 共享工具说明
└── global-env.ts           # 全局测试环境配置
```

## ⚙️ TypeScript 配置

### `tests/tsconfig.json`

- **继承自主配置** - 复用根目录的 `tsconfig.json`
- **仅类型检查** - `"noEmit": true`，不生成编译产物
- **Jest 类型支持** - `"types": ["jest", "node"]`
- **包含测试文件** - 所有 `tests/` 下的 `.ts` 文件
- **排除测试数据** - `fixtures/` 不参与类型检查

## 🔧 关键特性

### 1. 不参与编译

```json
{
    "compilerOptions": {
        "noEmit": true  // ✅ 只做类型检查，不生成 .js 和 .d.ts
    }
}
```

### 2. 完整的类型提示

```json
{
    "compilerOptions": {
        "types": ["jest", "node"]  // ✅ 支持 Jest 和 Node.js 类型
    },
    "include": [
        "**/*.ts",                 // ✅ 所有测试文件
        "../src/**/*.d.ts"         // ✅ 源码的类型定义
    ]
}
```

### 3. 路径别名支持

```json
{
    "compilerOptions": {
        "paths": {
            "@/*": ["src/*"]  // ✅ 可使用 @ 别名引用源码
        }
    }
}
```

## 📝 使用示例

### 单元测试中使用共享工具

```typescript
// src/core/assets/test/operation.test.ts
import { CREATE_ASSET_TYPE_TEST_CASES } from '../../../tests/shared/asset-test-data';
import { validateAssetCreated } from '../../../tests/shared/asset-test-helpers';

describe('create-asset', () => {
    test.each(CREATE_ASSET_TYPE_TEST_CASES)(
        '创建 $description',
        async ({ type, ext, ccType }) => {
            const result = await createAsset(type);
            validateAssetCreated(result, ccType);
        }
    );
});
```

### E2E 测试中使用共享工具

```typescript
// e2e/mcp/api/assets.e2e.test.ts
import { CREATE_ASSET_TYPE_TEST_CASES } from '../../../tests/shared/asset-test-data';
import { validateAssetCreated } from '../../../tests/shared/asset-test-helpers';

describe('MCP Assets API', () => {
    test.each(CREATE_ASSET_TYPE_TEST_CASES)(
        'should create $description via MCP',
        async ({ type, ext, ccType }) => {
            const result = await mcpClient.callTool('asset-create-by-type', { type });
            validateAssetCreated(result.data, ccType);
        }
    );
});
```

## ✅ 优势

1. **🎯 清晰分离** - 测试代码有独立配置，不影响主项目编译
2. **⚡ 快速编译** - `npm run build` 不会处理测试文件，编译速度更快
3. **🔍 完整提示** - VSCode/IDE 中有完整的类型检查和自动补全
4. **♻️ 代码复用** - 单元测试和 E2E 测试共享辅助函数和测试数据
5. **🛡️ 类型安全** - 使用 `@jest/globals` 而不是 `any` 类型

## 🔗 相关文件

- 主配置：[`tsconfig.json`](../tsconfig.json)
- E2E 配置：[`e2e/tsconfig.json`](../e2e/tsconfig.json)
- 共享工具说明：[`shared/README.md`](./shared/README.md)
- E2E 测试说明：[`../e2e/README.md`](../e2e/README.md)
