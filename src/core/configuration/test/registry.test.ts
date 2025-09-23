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
});
