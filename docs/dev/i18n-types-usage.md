# i18n 类型系统使用指南

## 概述

本项目已经完善了 i18n 类型生成系统，现在可以在代码中使用 `i18n.t()` 时获得完整的类型提示和自动补全。

## 生成类型定义

运行以下命令生成类型定义（已经集成在 npm i 里）：

```bash
node workflow/generate-i18n-types.js
```

这将生成 `src/i18n/types/generated.d.ts` 文件，包含所有翻译键的类型定义。

## 使用方式

### 在 src/i18n 中使用

```typescript
import i18n from './i18n';

// 基本翻译
const title = i18n.t('assets.title'); // "Asset Database"
const buildText = i18n.t('builder.build'); // "Build"
const loadingText = i18n.t('common.loading'); // "Loading..."
```

### 在 core 模块中使用

```typescript
import i18n from '../base/i18n';

// 基本翻译
const title = i18n.t('assets.title'); // "Asset Database"
const buildText = i18n.t('builder.build'); // "Build"
const loadingText = i18n.t('common.loading'); // "Loading..."
```

### 带参数的翻译

```typescript
// 带插值参数的翻译
const deprecatedMessage = i18n.t('assets.deprecatedTip', {
  oldName: 'oldFunction',
  version: '1.0.0',
  newName: 'newFunction'
});
// 结果: "oldFunction has been deprecated in version 1.0.0, please replace with newFunction"

const errorMessage = i18n.t('assets.saveAsset.fail.asset', {
  asset: 'texture.png'
});
// 结果: "Failed to save asset: cannot find asset texture.png"
```

### 特殊字符键名

```typescript
// 包含中划线的键名
const debugMessage = i18n.t('assets.debug-mode');

// 包含下划线的键名
const logLevel = i18n.t('assets.preferences.log_level');
```

### 嵌套键访问

```typescript
// 访问嵌套的翻译键
const saveError = i18n.t('assets.saveAsset.fail.unknown');
const buildTip = i18n.t('builder.tips.enter_name');
const bundleConfig = i18n.t('builder.asset_bundle.bundle_name');
```

## 类型特性

### 1. 自动补全

在 IDE 中输入 `i18n.t('` 时，会显示所有可用的翻译键：

- `assets.title`
- `assets.description`
- `builder.build`
- `common.loading`
- 等等...

### 2. 类型检查

使用不存在的键时会报错：

```typescript
// ❌ 这行会报错，因为键不存在
const invalid = i18n.t('nonexistent.key');
```

### 3. 参数提示

对于包含插值参数的翻译，注释中会显示需要的参数：

```typescript
// assets.deprecatedTip: string; // 参数: {oldName, version, newName}
// assets.saveAsset.fail.asset: string; // 参数: {asset}
```

## 生成的文件结构

生成的类型文件包含：

1. **I18nResources 接口**：定义所有翻译资源的类型结构
2. **I18nKeys 联合类型**：包含所有可用的翻译键
3. **i18next 模块扩展**：为 i18next 库添加类型支持
4. **工具类型**：用于提取参数类型等高级用法

## 更新类型

当添加新的翻译文件或修改现有翻译时，需要重新运行生成脚本：

```bash
node workflow/generate-i18n-types.js
```

建议在以下情况下重新生成：

- 添加新的翻译文件
- 修改现有翻译文件的结构
- 添加或删除翻译键
- 修改插值参数

## 注意事项

1. 生成的类型文件是自动生成的，不要手动编辑
2. 确保在 `src/i18n/index.ts` 中导入了生成的类型文件
3. 类型生成基于 `static/i18n/zh/` 目录下的文件（可在脚本中修改）
4. 支持嵌套对象和插值参数的类型推断
5. 自动处理包含特殊字符（如中划线、点号）的键名，确保 TypeScript 语法正确
6. 所有翻译键在联合类型中都用引号包围，避免语法错误
7. core 模块中的 `src/core/base/i18n.ts` 已经集成了类型支持，可以直接使用
8. 两个 i18n 实例（`src/i18n` 和 `src/core/base/i18n`）都支持相同的类型提示

## 键名规范

为了保持一致性，所有 i18n 键名都遵循以下规范：

- **使用下划线命名**：所有键名都使用下划线分隔，如 `debug_mode`、`save_asset`
- **驼峰转下划线**：原来的驼峰命名已转换为下划线，如 `deprecatedTip` → `deprecated_tip`
- **中划线转下划线**：原来的中划线命名已转换为下划线，如 `debug-mode` → `debug_mode`
- **嵌套键使用点号**：嵌套结构使用点号分隔，如 `assets.save_asset.fail.unknown`

### 键名变更示例

| 旧键名 | 新键名 |
|--------|--------|
| `assets.debug-mode` | `assets.debug_mode` |
| `assets.deprecatedTip` | `assets.deprecated_tip` |
| `assets.saveAsset` | `assets.save_asset` |
| `builder.bundleCommonChunk` | `builder.bundle_common_chunk` |
| `importer.sharpError` | `importer.sharp_error` |
