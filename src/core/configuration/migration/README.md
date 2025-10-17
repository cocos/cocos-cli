# CocosCreator 配置迁移系统

这个迁移系统提供了简单易用的配置迁移功能，支持从旧版本的 CocosCreator 配置迁移到新版本。

## 用法

```typescript
import { CocosMigrationManager } from './migration';

CocosMigrationManager.register({
    scope: 'project',
    pluginName: 'custom-plugin',
    migrate: async (oldConfig: Record<string, any>) => {
        return {
            newConfig: {
                ...oldConfig,
                version: '2.0.0',
                migrated: true
            }
        };
    }
});

// 执行迁移
const migratedConfig = await CocosMigrationManager.migrate('/path/to/project');
console.log('迁移完成:', migratedConfig);
```

## API 参考

### CocosMigrationManager

#### 静态方法

- `register(target: IMigrationTarget | IMigrationTarget[]): void` - 注册迁移器
- `migrate(projectPath: string): Promise<Record<string, any>>` - 执行所有迁移

### 类型定义

#### IMigrationTarget

```typescript
interface IMigrationTarget {
    scope: CocosConfigScope;  // 'local' | 'project' | 'global'
    pluginName: string;
    targetPath?: string;
    migrate(oldConfig: Record<string, any>): Promise<any>;
}
```

## 注意事项

- 迁移是单向的，请确保在迁移前备份原始配置
- 嵌套路径使用点号（`.`）分隔
- 值转换函数中的错误会被捕获并记录警告，不会中断迁移过程
- 如果原配置不存在，迁移会返回空对象
- 默认值只在原值为 `undefined` 时生效
