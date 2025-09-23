# 配置注册器 (Configuration Registry)

## 概述

配置注册器是一个独立的模块，用于管理默认配置的注册、存储和检索。它从 `ConfigurationManager` 中抽取出来，提供了更灵活和强大的配置管理功能。

## 设计理念

**解耦设计**：
- `ConfigurationRegistry` 可以独立使用来注册配置
- `ConfigurationManager` 专注于项目配置的管理（读取、更新、初始化）
- 用户可以直接使用 `configurationRegistry` 进行配置注册，无需通过管理器
- 这样的设计更加解耦和灵活，允许不同的模块独立注册配置

## 核心 API

### ConfigurationRegistry

```typescript
import { configurationRegistry } from './script/registry';

// 注册配置
configurationRegistry.register('myModule', {
    enabled: true,
    timeout: 5000
});

// 获取配置
const config = configurationRegistry.get('myModule');

// 检查配置是否存在
const exists = configurationRegistry.get('myModule') !== undefined;

// 获取所有配置
const allConfigs = configurationRegistry.getAll();

// 移除配置
configurationRegistry.remove('myModule');

// 清空所有配置
configurationRegistry.clear();
```

### ConfigurationManager

```typescript
import { configurationManager } from './script/manager';

// 初始化配置管理器
await configurationManager.initialize('/path/to/project');

// 获取配置（支持点号路径）
const value = await configurationManager.getValue('myModule.timeout');

// 更新配置
await configurationManager.updateValue('myModule.timeout', 6000, 'project');
```

## 使用示例

### 1. 独立使用注册器

```typescript
// 直接注册配置（无需初始化配置管理器）
configurationRegistry.register('database', {
    host: 'localhost',
    port: 5432
});

// 获取配置
const dbConfig = configurationRegistry.get('database');
```

### 2. 配置管理器自动查询注册器

```typescript
// 1. 先独立注册配置
configurationRegistry.register('database', {
    host: 'localhost',
    port: 5432
});

// 2. 初始化配置管理器
await configurationManager.initialize('/path/to/project');

// 3. 配置管理器会自动从注册器获取默认配置
const dbHost = await configurationManager.getValue('database.host');
console.log(dbHost); // localhost
```

### 3. 配置优先级

```typescript
// 设置项目配置
await configurationManager.updateValue('database.host', 'project-db-host', 'project');

// 获取配置（项目配置优先）
const host = await configurationManager.getValue('database.host'); // project-db-host

// 只获取默认配置
const defaultHost = await configurationManager.getValue('database.host', 'default'); // localhost
```

## 类型定义

```typescript
// 注册选项
interface RegistryOptions {
    overwrite?: boolean;      // 是否覆盖已存在的配置
}

// 配置作用域
type ConfigurationScope = 'default' | 'project';
```

## 配置验证

注册器会自动验证：
1. **键名验证**: 键名不能为空字符串
2. **值验证**: 配置值必须是对象类型

```typescript
// 这些调用会失败
configurationRegistry.register('', { value: 1 });           // 空键名
configurationRegistry.register('test', null);               // null 值
configurationRegistry.register('test', []);                 // 数组值

// 这个调用会成功
configurationRegistry.register('test', { value: 1 });       // 对象值
```

## 配置覆盖

默认情况下，注册器不允许覆盖已存在的配置：

```typescript
// 第一次注册
configurationRegistry.register('myModule', { enabled: true });

// 第二次注册（不会覆盖）
const result = configurationRegistry.register('myModule', { enabled: false });
// result 返回原始配置 { enabled: true }

// 强制覆盖
const result2 = configurationRegistry.register('myModule', { enabled: false }, { overwrite: true });
// result2 返回新配置 { enabled: false }
```

## 测试

```bash
npm test -- registry.test.ts
npm test -- configuration.test.ts
```
