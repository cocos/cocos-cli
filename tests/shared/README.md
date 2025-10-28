# 共享测试资源

本目录包含单元测试和 E2E 测试共享的测试数据和辅助函数。

## 📁 文件说明

### asset-test-data.ts

包含资源测试的共享数据：

- `CREATE_ASSET_TYPE_TEST_CASES` - 所有支持创建的资源类型测试用例
- `generateTestFileName()` - 生成唯一的测试文件名
- `generateUniqueAssetUrl()` - 生成唯一的资源 URL
- `TEST_ASSET_CONTENTS` - 测试用的资源内容模板

### asset-test-helpers.ts

包含资源测试的共享验证函数：

- `validateAssetCreated()` - 验证资源创建结果
- `validateAssetFileExists()` - 验证资源文件是否存在
- `validateAssetMetaExists()` - 验证资源元数据文件是否存在
- `validateFolderAsset()` - 验证文件夹资源
- `validateFileAsset()` - 验证文件资源
- `validateAssetDeleted()` - 验证资源删除结果
- `validateAssetMoved()` - 验证资源移动结果
- `validateAssetCopied()` - 验证资源复制结果
- `validateImportAssetResult()` - 验证导入资源结果
- `validateAssetSaved()` - 验证资源保存结果
- `validateAssetReimported()` - 验证资源重新导入结果

## 🔧 使用方法

### 在单元测试中使用

```typescript
// src/core/assets/test/operation.test.ts
import {
    CREATE_ASSET_TYPE_TEST_CASES,
    generateTestFileName,
} from '../../../tests/shared/asset-test-data';

import {
    validateAssetCreated,
    validateAssetFileExists,
} from '../../../tests/shared/asset-test-helpers';

describe('asset operations', () => {
    test.each(CREATE_ASSET_TYPE_TEST_CASES)(
        '创建 $description',
        async ({ type, ext, ccType, skipTypeCheck }) => {
            const asset = await assetManager.createAssetByType(type, ...);
            
            // 使用共享的验证函数
            validateAssetCreated(asset, ccType, skipTypeCheck);
            validateAssetFileExists(asset.file);
        }
    );
});
```

### 在 E2E 测试中使用

```typescript
// e2e/mcp/api/assets.e2e.test.ts
import {
    CREATE_ASSET_TYPE_TEST_CASES,
    generateTestFileName,
} from '../../../tests/shared/asset-test-data';

import {
    validateAssetCreated,
    validateAssetFileExists,
} from '../../../tests/shared/asset-test-helpers';

describe('MCP Assets API', () => {
    test.each(CREATE_ASSET_TYPE_TEST_CASES)(
        '通过 MCP 创建 $description',
        async ({ type, ext, ccType, skipTypeCheck }) => {
            const result = await mcpClient.callTool('asset-create-by-type', {
                type,
                ...
            });
            
            // 使用相同的验证函数
            validateAssetCreated(result.data, ccType, skipTypeCheck);
            validateAssetFileExists(result.data.file);
        }
    );
});
```

## 📊 测试用例数据

### CREATE_ASSET_TYPE_TEST_CASES

包含以下资源类型的测试用例：

| 类型 | 扩展名 | Cocos 类型 | 描述 |
|------|--------|-----------|------|
| animation-clip | anim | cc.AnimationClip | 动画剪辑 |
| typescript | ts | cc.Script | TypeScript 脚本 |
| auto-atlas | pac | cc.SpriteAtlas | 自动图集 |
| effect | effect | cc.EffectAsset | 着色器效果 |
| scene | scene | cc.SceneAsset | 场景 (3d/2d/quality) |
| prefab | prefab | cc.Prefab | 预制体 |
| material | mtl | cc.Material | 材质 |
| terrain | terrain | cc.TerrainAsset | 地形 |
| physics-material | pmtl | cc.PhysicsMaterial | 物理材质 |
| label-atlas | labelatlas | cc.LabelAtlas | 标签图集 |
| effect-header | chunk | - | 着色器头文件 |

## 🎯 验证函数说明

### validateAssetCreated(asset, expectedType?, skipTypeCheck?)

验证资源是否成功创建，检查必要字段（uuid, url, file）和类型。

**参数：**

- `asset` - 资源对象
- `expectedType` - 期望的资源类型（可选）
- `skipTypeCheck` - 是否跳过类型检查（可选）

### validateAssetFileExists(filePath)

验证资源文件是否存在于文件系统中。

### validateAssetMetaExists(filePath)

验证资源的 `.meta` 文件是否存在。

### validateFolderAsset(asset, folderPath)

验证文件夹资源，包括：

- 资源对象的 `isDirectory` 属性
- 文件系统中的目录是否存在
- `.meta` 文件是否存在

### validateFileAsset(asset, filePath, expectedContent?)

验证文件资源，包括：

- 资源对象的 `isDirectory` 属性为 false
- 文件是否存在
- `.meta` 文件是否存在
- 文件内容（如果提供了 expectedContent）

### validateAssetDeleted(filePath)

验证资源及其 `.meta` 文件都已被删除。

### validateAssetMoved(sourcePath, destPath)

验证资源移动操作：

- 源路径不存在
- 目标路径存在
- 目标路径的 `.meta` 文件存在

### validateImportAssetResult(result)

验证导入资源的结果：

- 返回的是数组
- 数组包含资源
- 每个资源都有有效的 uuid 和 url
- 目标路径存在

**参数：**

```typescript
{
    assets: AssetCreationResult[];
    targetPath: string;
    expectedCount?: number;
}
```

## 🔄 复用优势

### 单一数据源

- ✅ 所有测试使用相同的测试用例
- ✅ 修改一次，所有测试同步更新
- ✅ 确保单元测试和 E2E 测试覆盖相同的场景

### 统一验证逻辑

- ✅ 相同的验证标准
- ✅ 减少重复代码
- ✅ 更容易维护和更新

### 提高可读性

- ✅ 测试代码更简洁
- ✅ 验证逻辑更清晰
- ✅ 易于理解测试意图

## 📝 添加新的测试用例

### 添加新的资源类型

在 `asset-test-data.ts` 中添加：

```typescript
export const CREATE_ASSET_TYPE_TEST_CASES = [
    // ... 现有用例
    { 
        type: 'new-type', 
        ext: 'ext', 
        ccType: 'cc.NewType', 
        description: '新资源类型' 
    },
];
```

### 添加新的验证函数

在 `asset-test-helpers.ts` 中添加：

```typescript
export function validateNewAssetOperation(asset: any, ...params): void {
    // 验证逻辑
    expect(asset).toBeDefined();
    // ...
}
```

### 使用新的验证函数

在单元测试和 E2E 测试中都可以导入使用：

```typescript
import { validateNewAssetOperation } from '../../../tests/shared/asset-test-helpers';

test('new operation', async () => {
    const result = await someOperation();
    validateNewAssetOperation(result, ...);
});
```

## 🎨 最佳实践

1. **保持简单** - 验证函数应该专注于单一职责
2. **使用 TypeScript** - 提供类型定义以获得更好的 IDE 支持
3. **文档化** - 为新添加的函数添加注释说明
4. **保持独立** - 验证函数不应该依赖特定的测试环境
5. **错误信息** - 使用清晰的错误信息帮助调试

## 🔗 相关文件

- 单元测试：`src/core/assets/test/operation.test.ts`
- E2E 测试：`e2e/mcp/api/assets.e2e.test.ts`
- E2E 测试辅助：`e2e/helpers/test-utils.ts`
