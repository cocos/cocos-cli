import { ConfigurationRegistry } from '../script/registry';

describe('ConfigurationRegistry', () => {
    let registry: ConfigurationRegistry;

    beforeEach(() => {
        registry = new ConfigurationRegistry();
    });

    describe('注册配置', () => {
        test('应该成功注册新配置', () => {
            const config = { enabled: true, timeout: 5000 };
            
            const result = registry.register('myModule', config);
            
            expect(result).toEqual(config);
            expect(registry.get('myModule')).toEqual(config);
        });

        test('应该拒绝注册空键名', () => {
            const config = { enabled: true };
            
            const result = registry.register('', config);
            
            expect(result).toBeNull();
            expect(registry.get('')).toBeUndefined();
        });

        test('应该拒绝注册非对象值', () => {
            const result = registry.register('myModule', 'invalid' as any);
            
            expect(result).toBeNull();
            expect(registry.get('myModule')).toBeUndefined();
        });

        test('应该拒绝覆盖已存在的配置（默认行为）', () => {
            const config1 = { enabled: true };
            const config2 = { enabled: false };
            
            registry.register('myModule', config1);
            const result = registry.register('myModule', config2);
            
            expect(result).toEqual(config1);
            expect(registry.get('myModule')).toEqual(config1);
        });

        test('应该允许覆盖已存在的配置（当设置 overwrite: true）', () => {
            const config1 = { enabled: true };
            const config2 = { enabled: false };
            
            registry.register('myModule', config1);
            const result = registry.register('myModule', config2, { overwrite: true });
            
            expect(result).toEqual(config2);
            expect(registry.get('myModule')).toEqual(config2);
        });

    });

    describe('获取配置', () => {
        beforeEach(() => {
            registry.register('module1', { enabled: true });
            registry.register('module2', { timeout: 1000 });
        });

        test('应该获取已注册的配置', () => {
            expect(registry.get('module1')).toEqual({ enabled: true });
            expect(registry.get('module2')).toEqual({ timeout: 1000 });
        });

        test('应该返回 undefined 对于未注册的配置', () => {
            expect(registry.get('nonexistent')).toBeUndefined();
        });

        test('应该获取所有已注册的配置', () => {
            const allConfigs = registry.getAll();
            
            expect(allConfigs).toEqual({
                module1: { enabled: true },
                module2: { timeout: 1000 }
            });
        });

        test('应该通过 getAll 获取所有配置键名', () => {
            const allConfigs = registry.getAll();
            const keys = Object.keys(allConfigs);
            
            expect(keys).toContain('module1');
            expect(keys).toContain('module2');
            expect(keys).toHaveLength(2);
        });
    });

    describe('移除配置', () => {
        beforeEach(() => {
            registry.register('module1', { enabled: true });
            registry.register('module2', { timeout: 1000 });
        });

        test('应该成功移除已存在的配置', () => {
            const result = registry.remove('module1');
            
            expect(result).toBe(true);
            expect(registry.get('module1')).toBeUndefined();
        });

        test('应该返回 false 对于不存在的配置', () => {
            const result = registry.remove('nonexistent');
            
            expect(result).toBe(false);
        });
    });

    describe('清空配置', () => {
        beforeEach(() => {
            registry.register('module1', { enabled: true });
            registry.register('module2', { timeout: 1000 });
        });

        test('应该清空所有配置', () => {
            registry.clear();
            
            expect(Object.keys(registry.getAll())).toHaveLength(0);
            expect(registry.getAll()).toEqual({});
            expect(registry.get('module1')).toBeUndefined();
            expect(registry.get('module2')).toBeUndefined();
        });
    });

    describe('基本功能验证', () => {
        test('应该正确管理配置状态', () => {
            registry.register('module1', { enabled: true });
            registry.register('module2', { timeout: 1000 });
            
            const allConfigs = registry.getAll();
            const keys = Object.keys(allConfigs);
            
            expect(keys).toHaveLength(2);
            expect(keys).toContain('module1');
            expect(keys).toContain('module2');
        });

        test('应该正确处理空注册器', () => {
            const allConfigs = registry.getAll();
            const keys = Object.keys(allConfigs);
            
            expect(keys).toHaveLength(0);
            expect(allConfigs).toEqual({});
        });
    });

    describe('树形结构支持', () => {
        test('应该支持点号分隔的键名注册', () => {
            const config1 = { enabled: true, timeout: 5000 };
            const config2 = { debug: false, level: 'info' };
            
            registry.register('module.submodule.config1', config1);
            registry.register('module.submodule.config2', config2);
            
            expect(registry.get('module.submodule.config1')).toEqual(config1);
            expect(registry.get('module.submodule.config2')).toEqual(config2);
        });

        test('应该支持深层嵌套的键名注册', () => {
            const config = { value: 'test' };
            
            registry.register('a.b.c.d.e.f', config);
            
            expect(registry.get('a.b.c.d.e.f')).toEqual(config);
        });

        test('应该正确构建树形结构', () => {
            const config1 = { enabled: true };
            const config2 = { timeout: 1000 };
            
            registry.register('module.config1', config1);
            registry.register('module.config2', config2);
            
            const allConfigs = registry.getAll();
            expect(allConfigs).toEqual({
                module: {
                    config1: { enabled: true },
                    config2: { timeout: 1000 }
                }
            });
        });

        test('应该支持混合键名（点号分隔和普通键名）', () => {
            const config1 = { enabled: true };
            const config2 = { timeout: 1000 };
            const config3 = { debug: false };
            
            registry.register('module.config1', config1);
            registry.register('module.config2', config2);
            registry.register('standalone', config3);
            
            expect(registry.get('module.config1')).toEqual(config1);
            expect(registry.get('module.config2')).toEqual(config2);
            expect(registry.get('standalone')).toEqual(config3);
            
            const allConfigs = registry.getAll();
            expect(allConfigs).toEqual({
                module: {
                    config1: { enabled: true },
                    config2: { timeout: 1000 }
                },
                standalone: { debug: false }
            });
        });

        test('应该支持覆盖树形结构中的配置', () => {
            const config1 = { enabled: true, timeout: 5000 };
            const config2 = { enabled: false, timeout: 1000 };
            
            registry.register('module.config', config1);
            const result = registry.register('module.config', config2, { overwrite: true });
            
            expect(result).toEqual(config2);
            expect(registry.get('module.config')).toEqual(config2);
        });

        test('应该支持移除树形结构中的配置', () => {
            const config1 = { enabled: true };
            const config2 = { timeout: 1000 };
            
            registry.register('module.config1', config1);
            registry.register('module.config2', config2);
            
            const result = registry.remove('module.config1');
            
            expect(result).toBe(true);
            expect(registry.get('module.config1')).toBeUndefined();
            expect(registry.get('module.config2')).toEqual(config2);
            
            const allConfigs = registry.getAll();
            expect(allConfigs).toEqual({
                module: {
                    config2: { timeout: 1000 }
                }
            });
        });

        test('应该支持移除深层嵌套的配置', () => {
            const config = { value: 'test' };
            
            registry.register('a.b.c.d.e.f', config);
            
            const result = registry.remove('a.b.c.d.e.f');
            
            expect(result).toBe(true);
            expect(registry.get('a.b.c.d.e.f')).toBeUndefined();
        });

        test('应该正确处理不存在的树形路径', () => {
            expect(registry.get('nonexistent.path')).toBeUndefined();
            expect(registry.remove('nonexistent.path')).toBe(false);
        });

        test('应该正确处理部分存在的树形路径', () => {
            registry.register('module.config1', { enabled: true });
            
            expect(registry.get('module.config1')).toEqual({ enabled: true });
            expect(registry.get('module.config2')).toBeUndefined();
            expect(registry.get('module.nonexistent.config')).toBeUndefined();
        });

        test('应该支持复杂的树形结构场景', () => {
            // 注册多个层级的配置
            registry.register('app.database.host', { value: 'localhost' });
            registry.register('app.database.port', { value: 5432 });
            registry.register('app.cache.enabled', { value: true });
            registry.register('app.cache.ttl', { value: 3600 });
            registry.register('logging.level', { value: 'info' });
            registry.register('logging.file', { value: 'app.log' });
            
            // 验证所有配置都能正确获取
            expect(registry.get('app.database.host')).toEqual({ value: 'localhost' });
            expect(registry.get('app.database.port')).toEqual({ value: 5432 });
            expect(registry.get('app.cache.enabled')).toEqual({ value: true });
            expect(registry.get('app.cache.ttl')).toEqual({ value: 3600 });
            expect(registry.get('logging.level')).toEqual({ value: 'info' });
            expect(registry.get('logging.file')).toEqual({ value: 'app.log' });
            
            // 验证树形结构
            const allConfigs = registry.getAll();
            expect(allConfigs).toEqual({
                app: {
                    database: {
                        host: { value: 'localhost' },
                        port: { value: 5432 }
                    },
                    cache: {
                        enabled: { value: true },
                        ttl: { value: 3600 }
                    }
                },
                logging: {
                    level: { value: 'info' },
                    file: { value: 'app.log' }
                }
            });
        });
    });
});
