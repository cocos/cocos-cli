# 配置管理模块

配置管理模块提供完整的配置管理解决方案，支持默认配置注册和项目级配置管理。

## 核心组件

- **ConfigurationRegistry**: 配置注册器，管理默认配置
- **ConfigurationManager**: 配置管理器，负责项目配置的读写
- **BaseConfiguration**: 配置基类，提供配置操作功能

## 快速开始

```typescript
import { configurationRegistry, configurationManager } from './index';

// 1. 注册配置模块
const dbConfig = await configurationRegistry.register('database');

// 2. 初始化配置管理器
await configurationManager.initialize('/path/to/project');

// 3. 设置配置值
await configurationManager.set('database.host', 'localhost', 'project');
await configurationManager.set('database.port', 5432, 'project');

// 4. 获取配置值
const host = await configurationManager.get('database.host');
const port = await configurationManager.get('database.port');
```

## 主要功能

### 点号路径操作
```typescript
// 支持嵌套配置
await configurationManager.set('database.connection.pool.max', 10, 'project');
const maxPool = await configurationManager.get('database.connection.pool.max');
```

### 配置作用域
```typescript
// 设置默认配置
await configurationManager.set('database.timeout', 5000, 'default');

// 设置项目配置
await configurationManager.set('database.timeout', 10000, 'project');

// 获取配置（项目配置优先）
const timeout = await configurationManager.get('database.timeout'); // 10000
```

### 事件监听
```typescript
import { BaseConfiguration } from './script/config';

const config = new BaseConfiguration('myModule', { value: 1 });

// 监听保存事件
config.on('configuration:save', () => {
    console.log('配置已保存');
});
```

## API 参考

### ConfigurationRegistry
```typescript
// 注册配置模块
await configurationRegistry.register('myModule');

// 获取配置实例
const instance = configurationRegistry.getInstance('myModule');

// 注销配置模块
await configurationRegistry.unregister('myModule');
```

### ConfigurationManager
```typescript
// 初始化
await configurationManager.initialize('/path/to/project');

// 获取配置值
const value = await configurationManager.get('myModule.key');

// 设置配置值
await configurationManager.set('myModule.key', 'value', 'project');

// 删除配置值
await configurationManager.remove('myModule.key', 'project');
```

### BaseConfiguration
```typescript
// 创建配置实例
const config = new BaseConfiguration('myModule', { timeout: 5000 });

// 获取配置值
const timeout = await config.get('timeout');

// 设置配置值
await config.set('timeout', 6000, 'project');

// 获取所有配置
const allConfigs = config.getAll('project');
```
