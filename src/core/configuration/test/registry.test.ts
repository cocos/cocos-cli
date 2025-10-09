import { ConfigurationRegistry } from '../script/registry';
import { BaseConfiguration } from '../script/config';
import { IBaseConfiguration } from '../script/config';
import { MessageType } from '../script/interface';

// Mock console.warn to avoid test output noise
const originalConsoleWarn = console.warn;
beforeAll(() => {
    console.warn = jest.fn();
});

afterAll(() => {
    console.warn = originalConsoleWarn;
});

describe('ConfigurationRegistry', () => {
    let registry: ConfigurationRegistry;
    const moduleName = 'test-module';
    const defaultConfig = {
        defaultKey: 'defaultValue',
        nested: {
            key: 'nestedValue'
        }
    };

    beforeEach(() => {
        registry = new ConfigurationRegistry();
    });

    describe('constructor and getInstances', () => {
        it('should initialize with empty instances and return registered instances', () => {
            expect(registry.getInstances()).toEqual({});
        });

        it('should return all registered instances', async () => {
            await registry.register('module1');
            await registry.register('module2');
            
            const instances = registry.getInstances();
            expect(Object.keys(instances)).toHaveLength(2);
            expect(instances['module1']).toBeInstanceOf(BaseConfiguration);
            expect(instances['module2']).toBeInstanceOf(BaseConfiguration);
        });
    });

    describe('getInstance', () => {
        it('should return registered instance or undefined for non-registered module', async () => {
            const instance = await registry.register(moduleName);
            const retrieved = registry.getInstance(moduleName);
            expect(retrieved).toBe(instance);
            expect(retrieved).toBeInstanceOf(BaseConfiguration);

            const nonExistent = registry.getInstance('non-existent');
            expect(nonExistent).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(
                '[Configuration] 获取配置实例错误，non-existent 未注册配置。'
            );
        });
    });

    describe('register', () => {
        it('should register configuration instances', async () => {
            const emitSpy = jest.spyOn(registry, 'emit');
            
            // Register new instance
            const instance = await registry.register(moduleName);
            expect(instance).toBeInstanceOf(BaseConfiguration);
            expect(instance.moduleName).toBe(moduleName);
            expect(registry.getInstance(moduleName)).toBe(instance);
            expect(emitSpy).toHaveBeenCalledWith(MessageType.Registry, expect.any(BaseConfiguration));
            
            // Register with default config
            const instanceWithConfig = await registry.register('module2', defaultConfig);
            expect(instanceWithConfig.getDefaultConfig()).toEqual(defaultConfig);
            
            // Return existing instance if already registered
            const instanceAgain = await registry.register(moduleName);
            expect(instance).toBe(instanceAgain);
        });

        it('should handle multiple registrations and invalid module names', async () => {
            const instance1 = await registry.register('module1', { key1: 'value1' });
            const instance2 = await registry.register('module2', { key2: 'value2' });
            
            expect(instance1).not.toBe(instance2);
            expect(instance1.moduleName).toBe('module1');
            expect(instance2.moduleName).toBe('module2');
            expect(instance1.getDefaultConfig()).toEqual({ key1: 'value1' });
            expect(instance2.getDefaultConfig()).toEqual({ key2: 'value2' });
            
            // Invalid module names
            await expect(registry.register('')).rejects.toThrow(
                '[Configuration] 注册配置失败：模块名不能为空。'
            );
            await expect(registry.register(null as any)).rejects.toThrow(
                '[Configuration] 注册配置失败：模块名不能为空。'
            );
        });
    });

    describe('unregister', () => {
        it('should unregister configurations and emit events', async () => {
            const emitSpy = jest.spyOn(registry, 'emit');
            const instance = await registry.register(moduleName);
            expect(registry.getInstance(moduleName)).toBeDefined();
            
            await registry.unregister(moduleName);
            expect(registry.getInstance(moduleName)).toBeUndefined();
            expect(emitSpy).toHaveBeenCalledWith(MessageType.UnRegistry, instance);
        });

        it('should handle multiple unregistrations and non-existent modules', async () => {
            await registry.register('module1');
            await registry.register('module2');
            expect(Object.keys(registry.getInstances())).toHaveLength(2);
            
            await registry.unregister('module1');
            expect(Object.keys(registry.getInstances())).toHaveLength(1);
            expect(registry.getInstance('module1')).toBeUndefined();
            expect(registry.getInstance('module2')).toBeDefined();
            
            await registry.unregister('module2');
            expect(Object.keys(registry.getInstances())).toHaveLength(0);
            
            // Should not throw error for non-existent module
            await expect(registry.unregister('non-existent')).resolves.toBeUndefined();
        });
    });

    describe('EventEmitter functionality', () => {
        it('should handle event listeners', async () => {
            const registryListener = jest.fn();
            const unregistryListener = jest.fn();
            
            registry.on(MessageType.Registry, registryListener);
            registry.on(MessageType.UnRegistry, unregistryListener);
            
            await registry.register(moduleName);
            expect(registryListener).toHaveBeenCalledWith(expect.any(BaseConfiguration));
            
            await registry.unregister(moduleName);
            expect(unregistryListener).toHaveBeenCalledWith(expect.any(BaseConfiguration));
            
            // Test listener removal
            registry.off(MessageType.Registry, registryListener);
            await registry.register('module2');
            expect(registryListener).toHaveBeenCalledTimes(1); // Only called once before removal
            
            // Test once listener
            const onceListener = jest.fn();
            registry.once(MessageType.Registry, onceListener);
            await registry.register('module3');
            await registry.register('module4');
            expect(onceListener).toHaveBeenCalledTimes(1);
        });
    });

    describe('integration with BaseConfiguration', () => {
        it('should create BaseConfiguration instances and allow operations', async () => {
            const instance = await registry.register(moduleName, defaultConfig);
            
            expect(instance).toBeInstanceOf(BaseConfiguration);
            expect(instance.moduleName).toBe(moduleName);
            expect(instance.getDefaultConfig()).toEqual(defaultConfig);
            
            // Test configuration operations
            await instance.set('testKey', 'testValue');
            const value = await instance.get('testKey');
            expect(value).toBe('testValue');
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle various default config types', async () => {
            const complexConfig = {
                nested: { deep: { value: 'test', array: [1, 2, 3], object: { key: 'value' } } },
                array: ['a', 'b', 'c'],
                primitive: 42,
                boolean: true,
                nullValue: null
            };

            const complexInstance = await registry.register('complex-module', complexConfig);
            expect(complexInstance.getDefaultConfig()).toEqual(complexConfig);

            const emptyInstance = await registry.register('empty-module', {});
            expect(emptyInstance.getDefaultConfig()).toEqual({});

            const nullInstance = await registry.register('null-module', null as any);
            expect(nullInstance.getDefaultConfig()).toBeUndefined();

            const undefinedInstance = await registry.register('undefined-module', undefined as any);
            expect(undefinedInstance.getDefaultConfig()).toBeUndefined();
        });

        it('should handle multiple operations and concurrent registrations', async () => {
            // Multiple registrations and unregistrations
            const modules = ['module1', 'module2', 'module3'];
            for (const module of modules) {
                await registry.register(module, { key: module });
            }
            expect(Object.keys(registry.getInstances())).toHaveLength(3);
            
            for (const module of modules) {
                await registry.unregister(module);
            }
            expect(Object.keys(registry.getInstances())).toHaveLength(0);

            // Concurrent registrations
            const promises: Promise<IBaseConfiguration>[] = [];
            for (let i = 0; i < 10; i++) {
                promises.push(registry.register(`concurrent-module-${i}`));
            }
            const instances = await Promise.all(promises);
            expect(instances).toHaveLength(10);
            expect(Object.keys(registry.getInstances())).toHaveLength(10);
        });

        it('should handle event listener errors and special module names', async () => {
            const errorListener = jest.fn().mockImplementation(() => {
                throw new Error('Listener error');
            });
            registry.on(MessageType.Registry, errorListener);
            
            try {
                await registry.register('error-module');
            } catch (error) {
                expect((error as Error).message).toBe('Listener error');
            }
            expect(errorListener).toHaveBeenCalled();

            // Special characters in module names
            const specialNames = ['module-with-dash', 'module_with_underscore', 'module.with.dots'];
            specialNames.forEach(name => {
                expect(registry.getInstance(name)).toBeUndefined();
            });
        });
    });

    describe('register with custom instance', () => {
        it('should register a custom BaseConfiguration instance', async () => {
            const customInstance = new BaseConfiguration('customModule', { customKey: 'customValue' });
            const registeredInstance = await registry.register('customModule', customInstance);

            expect(registeredInstance).toBe(customInstance);
            expect(registry.getInstance('customModule')).toBe(customInstance);
            expect(registeredInstance.moduleName).toBe('customModule');
        });

        it('should throw error when module names do not match', async () => {
            const customInstance = new BaseConfiguration('differentModule', { key: 'value' });
            
            await expect(registry.register('targetModule', customInstance))
                .rejects.toThrow('配置实例的模块名 "differentModule" 与注册的模块名 "targetModule" 不匹配');
        });

        it('should not register if module already exists', async () => {
            // First registration
            const firstInstance = await registry.register('existingModule', { key: 'value' });
            
            // Try to register a custom instance with the same module name
            const customInstance = new BaseConfiguration('existingModule', { customKey: 'customValue' });
            const registeredInstance = await registry.register('existingModule', customInstance);

            // Should return the existing instance, not the custom one
            expect(registeredInstance).toBe(firstInstance);
            expect(registeredInstance).not.toBe(customInstance);
        });

        it('should work with custom configuration class extending BaseConfiguration', async () => {
            class CustomConfiguration extends BaseConfiguration {
                public customMethod(): string {
                    return 'custom method result';
                }

                public async getCustomValue(): Promise<string> {
                    return await this.get('customKey') || 'default custom value';
                }
            }

            const customInstance = new CustomConfiguration('extendedModule', { customKey: 'extended value' });
            const registeredInstance = await registry.register<CustomConfiguration>('extendedModule', customInstance);

            expect(registeredInstance).toBe(customInstance);
            expect(registeredInstance instanceof CustomConfiguration).toBe(true);
            
            // Test custom methods - with generic type inference, we should get the correct type
            expect(registeredInstance.customMethod()).toBe('custom method result');
            expect(await registeredInstance.getCustomValue()).toBe('extended value');
        });

        it('should emit registry event when registering custom instance', async () => {
            const customInstance = new BaseConfiguration('eventModule', { key: 'value' });
            const eventSpy = jest.fn();
            
            registry.on(MessageType.Registry, eventSpy);
            await registry.register('eventModule', customInstance);

            expect(eventSpy).toHaveBeenCalledWith(customInstance);
        });
    });
});
