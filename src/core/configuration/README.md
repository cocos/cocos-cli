# 配置管理模块

配置管理模块提供完整的配置管理解决方案，支持默认配置注册、项目级配置管理、配置迁移和版本控制。

## 特性

- **模块化配置**：支持按模块注册和管理配置
- **多作用域支持**：支持 `default`、`project`、`local`、`global` 四种配置作用域
- **点号路径操作**：支持嵌套配置的便捷访问，如 `'database.connection.pool.max'`
- **事件驱动**：基于 EventEmitter 的事件系统，支持配置变更监听
- **自动迁移**：内置配置迁移系统，支持版本升级时的配置自动迁移
- **类型安全**：完整的 TypeScript 类型定义
- **持久化存储**：自动保存配置到 `cocos.config.json` 文件

## 使用建议

**推荐使用方式**：通过 `configurationRegistry.register()` 获取配置对象，然后直接调用配置对象的 `get`、`set` 等方法进行操作。这种方式更加直观和高效。

**兼容方式**：也可以通过 `configurationManager` 使用点号路径（如 `'module.key'`）进行操作，但这种方式需要额外的解析步骤。

## 核心组件

- **ConfigurationRegistry**: 配置注册器，管理默认配置和配置实例
- **ConfigurationManager**: 配置管理器，负责项目配置的读写和持久化
- **BaseConfiguration**: 配置基类，提供配置操作功能和事件支持
- **CocosMigrationManager**: 配置迁移管理器，处理版本升级时的配置迁移

## 快速开始

```typescript
import { configurationRegistry, configurationManager } from './index';

// 1. 初始化配置管理器
await configurationManager.initialize('/path/to/project');

// 2. 注册配置模块（推荐方式）
const dbConfig = await configurationRegistry.register('database', {
    host: 'localhost',
    port: 5432,
    timeout: 5000
});

// 3. 直接通过配置对象进行操作（推荐）
await dbConfig.set('host', 'localhost', 'project');
await dbConfig.set('port', 5432, 'project');

// 4. 获取配置值
const host = await dbConfig.get('host');
const port = await dbConfig.get('port');
```

## 主要功能

### 点号路径操作
```typescript
// 推荐方式：通过配置对象操作
const dbConfig = await configurationRegistry.register('database');
await dbConfig.set('connection.pool.max', 10, 'project');
const maxPool = await dbConfig.get('connection.pool.max');

// 或者通过配置管理器操作（兼容方式）
await configurationManager.set('database.connection.pool.max', 10, 'project');
const maxPool = await configurationManager.get('database.connection.pool.max');
```

### 配置作用域
```typescript
// 推荐方式：通过配置对象操作
const dbConfig = await configurationRegistry.register('database');

// 设置默认配置
await dbConfig.set('timeout', 5000, 'default');

// 设置项目配置
await dbConfig.set('timeout', 10000, 'project');

// 获取配置（项目配置优先）
const timeout = await dbConfig.get('timeout'); // 10000

// 或者通过配置管理器操作（兼容方式）
await configurationManager.set('database.timeout', 5000, 'default');
await configurationManager.set('database.timeout', 10000, 'project');
const timeout = await configurationManager.get('database.timeout'); // 10000
```

### 事件监听
```typescript
// 推荐方式：通过 register 获取配置对象
const config = await configurationRegistry.register('myModule', { value: 1 });

// 监听配置变更事件
config.on('configuration:change', (key, newValue, oldValue) => {
    console.log(`配置变更: ${key} = ${newValue}`);
});

// 监听保存事件
config.on('configuration:save', () => {
    console.log('配置已保存');
});
```

## API 参考

### ConfigurationRegistry
```typescript
// 注册配置模块（推荐方式）
const config = await configurationRegistry.register('myModule', {
    defaultKey: 'defaultValue'
});

// 获取已注册的配置实例
const instance = configurationRegistry.getInstance('myModule');

// 注销配置模块
await configurationRegistry.unregister('myModule');
```

### ConfigurationManager
```typescript
// 初始化
await configurationManager.initialize('/path/to/project');

// 获取配置值（兼容方式）
const value = await configurationManager.get('myModule.key');

// 设置配置值（兼容方式）
await configurationManager.set('myModule.key', 'value', 'project');

// 删除配置值（兼容方式）
await configurationManager.remove('myModule.key', 'project');
```

### BaseConfiguration
`BaseConfiguration` 是配置对象的基类，通过 `configurationRegistry.register()` 返回的实例就是 `BaseConfiguration` 的子类。

```typescript
// 通过 register 获取 BaseConfiguration 实例
const config = await configurationRegistry.register('myModule', { timeout: 5000 });

// 获取配置值
const timeout = await config.get('timeout');

// 设置配置值
await config.set('timeout', 6000, 'project');

// 获取所有配置
const allConfigs = config.getAll('project');

// 删除配置值
await config.remove('timeout', 'project');

// 手动保存配置
await config.save();
```

### 配置作用域说明
- `default`: 默认配置，作为基础模板
- `project`: 项目级配置，优先级最高
- `local`: 本地配置，仅当前环境有效（暂无）
- `global`: 全局配置，跨项目共享（暂无）
