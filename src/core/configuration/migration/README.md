# CocosCreator 配置迁移系统

这个迁移系统提供了简单易用的配置迁移功能，支持从旧版本的 CocosCreator 配置迁移到新版本。

## 特性

- **简单重定向**：支持简单的字段重命名
- **详细重定向**：支持值转换、默认值设置、字段移除
- **嵌套路径支持**：支持点号分隔的嵌套路径
- **目标路径**：支持将迁移后的配置放置到指定路径
- **自定义迁移**：支持自定义迁移函数
- **后处理**：支持迁移后的后处理函数
- **批量操作**：支持批量注册和执行迁移

## 基本用法

### 1. 简单重定向

```typescript
import { CocosMigrationManager } from './migration';

// 注册简单的字段重定向
CocosMigrationManager.register({
    scope: 'project',  // 配置范围
    pluginName: 'my-plugin', // 插件名
    redirects: {
        'oldKey': 'newKey',  // 简单重命名
        'anotherOldKey': 'anotherNewKey'
    }
});

// 执行迁移
const migratedConfig = await CocosMigrationManager.migrate('/path/to/project');
```

### 2. 详细重定向

```typescript
import { CocosMigrationManager, DetailedRedirect } from './migration';

// 注册详细的重定向规则
CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'advanced-plugin',
    redirects: {
        // 简单重定向
        'oldKey': 'newKey',
        
        // 详细重定向 - 值转换
        'timeout': {
            newKey: 'timeoutMs',
            transform: (value: number) => value * 1000
        } as DetailedRedirect,
        
        // 详细重定向 - 默认值
        'missingKey': {
            newKey: 'newKey',
            defaultValue: 'defaultValue'
        } as DetailedRedirect,
        
        // 详细重定向 - 移除原字段
        'deprecatedKey': {
            newKey: 'newKey',
            remove: true
        } as DetailedRedirect
    }
});
```

### 3. 嵌套路径支持

```typescript
CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'nested-plugin',
    redirects: {
        // 支持嵌套路径
        'old.nested.key': 'new.nested.key',
        'config.settings.debug': 'debugMode'
    }
});
```

### 4. 目标路径

```typescript
CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'path-plugin',
    targetPath: 'newModule.config', // 将迁移后的配置放到这个路径下
    redirects: {
        'oldKey': 'newKey'
    }
});

// 结果会是：
// {
//   newModule: {
//     config: {
//       newKey: 'value'
//     }
//   }
// }
```

### 5. 自定义迁移函数

```typescript
CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'custom-plugin',
    migrate: async (oldConfig: Record<string, any>) => {
        // 自定义迁移逻辑
        return {
            newConfig: {
                ...oldConfig,
                version: '2.0.0',
                migrated: true
            }
        };
    }
});
```

### 6. 后处理函数

```typescript
CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'postprocess-plugin',
    redirects: {
        'oldKey': 'newKey'
    },
    postProcess: async (migratedConfig: Record<string, any>) => {
        // 迁移后的处理
        return {
            ...migratedConfig,
            processed: true,
            timestamp: Date.now()
        };
    }
});
```

### 7. 复杂迁移场景

```typescript
CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'complex-plugin',
    targetPath: 'newModule.config',
    redirects: {
        // 简单重命名
        'isEnabled': 'enabled',
        
        // 值转换
        'timeout': {
            newKey: 'timeoutMs',
            transform: (value: number) => value * 1000
        } as DetailedRedirect,
        
        // 嵌套路径重定向
        'settings.debug': 'debugMode',
        
        // 值转换 + 嵌套路径
        'settings.logLevel': {
            newKey: 'logging.level',
            transform: (value: string) => value.toUpperCase()
        } as DetailedRedirect,
        
        // 默认值
        'missingSetting': {
            newKey: 'defaultValue',
            defaultValue: 'default'
        } as DetailedRedirect
    },
    postProcess: async (config: Record<string, any>) => {
        return {
            ...config,
            version: '2.0.0',
            migrated: true
        };
    }
});
```

### 8. 批量注册

```typescript
const targets: IMigrationTarget[] = [
    {
        scope: 'project',
        pluginName: 'plugin1',
        redirects: { 'key1': 'newKey1' }
    },
    {
        scope: 'local',
        pluginName: 'plugin2',
        redirects: { 'key2': 'newKey2' }
    }
];

CocosMigrationManager.registerBatch(targets);
```

### 9. 执行迁移

```typescript
// 注册迁移器
CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'my-plugin',
    redirects: { 'oldKey': 'newKey' }
});

// 执行迁移
const migratedConfig = await CocosMigrationManager.migrate('/path/to/project');
console.log('迁移完成:', migratedConfig);
```


## API 参考

### CocosMigrationManager

#### 静态方法

- `register(target: IMigrationTarget): void` - 注册迁移器
- `registerBatch(targets: IMigrationTarget[]): void` - 批量注册
- `migrate(projectPath: string): Promise<Record<string, any>>` - 执行所有迁移
- `getRegisteredCount(): number` - 获取已注册的迁移器数量
- `clear(): void` - 清空所有迁移器

### 类型定义

#### IMigrationTarget

```typescript
interface IMigrationTarget {
    scope: CocosConfigScope;  // 'local' | 'project' | 'global'
    pluginName: string;
    targetPath?: string;
    redirects?: {
        [oldKey: string]: RedirectRule;
    };
    migrate?(oldConfig: Record<string, any>): Promise<any>;
    postProcess?(migratedConfig: Record<string, any>): Promise<any>;
}
```

#### RedirectRule

```typescript
type RedirectRule = SimpleRedirect | DetailedRedirect;

// 简单重定向（字符串）
type SimpleRedirect = string;

// 详细重定向（对象）
interface DetailedRedirect {
    newKey: string;
    transform?: (value: any) => any;
    defaultValue?: any;
    remove?: boolean;
}
```

## 最佳实践

1. **使用简单重定向**：对于只需要重命名的字段，使用字符串形式的简单重定向
2. **使用详细重定向**：对于需要值转换、默认值或特殊处理的字段，使用对象形式的详细重定向
3. **合理使用目标路径**：将相关的配置迁移到统一的路径下，便于管理
4. **错误处理**：在自定义迁移函数中添加适当的错误处理
5. **测试**：为复杂的迁移逻辑编写单元测试
6. **统一使用 register 方法**：所有迁移都通过 `register` 方法注册，保持 API 的一致性
7. **保持简洁**：只保留核心功能，避免过度设计

## 注意事项

- 迁移是单向的，请确保在迁移前备份原始配置
- 嵌套路径使用点号（`.`）分隔
- 值转换函数中的错误会被捕获并记录警告，不会中断迁移过程
- 如果原配置不存在，迁移会返回空对象
- 默认值只在原值为 `undefined` 时生效
