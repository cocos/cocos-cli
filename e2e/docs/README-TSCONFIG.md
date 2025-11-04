# E2E 测试配置说明

## 全局配置 (`e2e/config.ts`)

统一管理超时时间、端口号等配置：

```typescript
import { E2E_TIMEOUTS, E2E_PORTS } from '../config';

// 使用超时配置
test('long operation', async () => {
    // ...
}, E2E_TIMEOUTS.BUILD_OPERATION);
```

## TypeScript 配置 (`e2e/tsconfig.json`)

### 核心特性

- **只做类型检查**：`"noEmit": true`，不参与编译
- **完整类型支持**：Jest、Node.js、源码类型定义
- **路径别名**：支持 `@/*` 别名

### 使用示例

```typescript
// 引入共享测试工具
import { validateAssetCreated } from '../../../tests/shared/asset-test-helpers';

// 访问源码类型
import { Platform } from '../src/core/builder/@types/public/platform';

// 使用路径别名
import { build } from '@/core/builder';
```

## 验证配置

```bash
# 检查类型错误
npx tsc --project e2e/tsconfig.json --noEmit
```
