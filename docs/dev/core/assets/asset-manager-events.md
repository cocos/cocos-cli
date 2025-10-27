# AssetManager 事件系统说明

## 概述

AssetManager 提供了完整的事件系统，用于通知外部监听器资源的各种变更操作。所有事件都支持 TypeScript 类型提示，确保开发时获得准确的类型检查。

## 支持的事件类型

### 1. asset-add 事件

- **触发时机**：创建新资源时
- **事件参数**：`(asset: IAsset) => void`
- **触发场景**：
  - 创建文件夹 (`createAsset` 创建目录)
  - 创建各种类型的资源 (`createAssetByType`)
  - 导入外部文件 (`importAsset`)

### 2. asset-change 事件

- **触发时机**：修改现有资源时
- **事件参数**：`(asset: IAsset) => void`
- **触发场景**：
  - 保存资源内容 (`saveAsset`)
  - 修改资源 meta 数据 (`saveAssetMeta`)
  - 重新导入资源 (`reimportAsset`)

### 3. asset-delete 事件

- **触发时机**：删除资源时
- **事件参数**：`(asset: IAsset) => void`
- **触发场景**：
  - 使用 URL 删除资源 (`removeAsset` 通过 URL)
  - 使用 UUID 删除资源 (`removeAsset` 通过 UUID)

### 4. db-created 事件

- **触发时机**：创建新的资源数据库时
- **事件参数**：`(db: AssetDB) => void`
- **触发场景**：
  - 导入文件夹创建数据库
  - 创建新的资源包

### 5. db-removed 事件

- **触发时机**：移除资源数据库时
- **事件参数**：`(db: AssetDB) => void`
- **触发场景**：
  - 删除整个数据库
  - 卸载资源包

## 事件参数说明

### IAsset 接口

事件回调中的 `asset` 参数包含以下关键属性：

```typescript
interface IAsset {
    uuid: string;           // 资源的唯一标识符
    url: string;            // 资源的 URL 路径
    _name: string;          // 资源名称
    isDirectory: boolean;   // 是否为目录
    type?: string;          // 资源类型（如 'cc.ImageAsset'）
    file: string;           // 资源文件路径
    // ... 其他属性
}
```

### AssetDB 接口

数据库事件回调中的 `db` 参数包含数据库相关信息：

```typescript
interface AssetDB {
    // 数据库相关属性和方法
    // 具体属性请参考 @cocos/asset-db 的类型定义
}
```

## 使用示例

### 基本事件监听

```typescript
import assetManager, { AssetManagerEvents } from '../core/assets/manager/asset';

// 监听资源添加事件
assetManager.on('asset-add', (asset) => {
    console.log('新资源已添加:', asset.url);
    console.log('资源 UUID:', asset.uuid);
    console.log('资源名称:', asset._name);
});

// 监听资源变更事件
assetManager.on('asset-change', (asset) => {
    console.log('资源已变更:', asset.url);
});

// 监听资源删除事件
assetManager.on('asset-delete', (asset) => {
    console.log('资源已删除:', asset.url);
});
```

### 类型安全的事件监听

```typescript
// 使用类型约束的监听器
const handleAssetAdd: AssetManagerEvents['asset-add'] = (asset) => {
    console.log('处理资源添加:', asset.url);
};

assetManager.on('asset-add', handleAssetAdd);

// 后续可以安全地移除监听器
assetManager.removeListener('asset-add', handleAssetAdd);
```

### 一次性事件监听

```typescript
// 只监听一次资源添加事件
assetManager.once('asset-add', (asset) => {
    console.log('第一个资源添加事件:', asset.url);
});
```

### 事件名称类型约束

```typescript
// 事件名称有类型约束，只能使用定义的事件名称
type EventName = keyof AssetManagerEvents;
const eventName: EventName = 'asset-add'; // ✅ 正确
// const invalidEvent: EventName = 'invalid-event'; // ❌ 类型错误
```

## 事件系统特性

### 1. 类型安全

- 所有事件名称都有类型约束
- 事件回调参数有完整的类型提示
- 编译时类型检查，防止使用错误的事件名称或参数类型

### 2. 自动类型推断

```typescript
assetManager.on('asset-add', (asset) => {
    // asset 参数自动推断为 IAsset 类型
    console.log(asset.url, asset.uuid);
});
```

### 3. 完整的方法支持

```typescript
// 添加监听器
assetManager.on('asset-add', listener);

// 添加一次性监听器
assetManager.once('asset-add', listener);

// 移除特定监听器
assetManager.removeListener('asset-add', listener);

// 移除所有监听器
assetManager.removeAllListeners('asset-add');

// 获取监听器数量
const count = assetManager.listenerCount('asset-add');

// 获取所有监听器
const listeners = assetManager.listeners('asset-add');
```

## 注意事项

1. **内存管理**：使用完监听器后记得移除，避免内存泄漏
2. **异步操作**：事件触发是异步的，确保在适当的时机检查事件结果
3. **错误处理**：在事件回调中添加适当的错误处理逻辑
4. **性能考虑**：避免在事件回调中执行耗时操作，以免影响资源操作性能

## 类型定义导出

```typescript
// 从 AssetManager 模块导出类型定义
export { AssetManagerEvents, TypedAssetManager } from './manager/asset';
export { IAsset } from './@types/private';
```

这些事件为外部系统提供了完整的资源变更通知机制，支持构建响应式的资源管理应用。
