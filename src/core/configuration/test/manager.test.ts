import { ConfigurationManager } from '../script/manager';
import { configurationRegistry } from '../script/registry';
import { MessageType } from '../script/interface';
import * as fse from 'fs-extra';
import * as path from 'path';
import { CocosMigrationManager } from '../migration';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('../migration', () => ({
    CocosMigrationManager: {
        migrate: jest.fn()
    }
}));

// Mock the registry
jest.mock('../script/registry', () => ({
    configurationRegistry: {
        on: jest.fn(),
        getInstance: jest.fn()
    }
}));

const mockFse = fse as any;
const mockRegistry = configurationRegistry as jest.Mocked<typeof configurationRegistry>;

describe('ConfigurationManager', () => {
    let manager: ConfigurationManager;
    const projectPath = '/test/project';
    const configPath = path.join(projectPath, ConfigurationManager.name);

    beforeEach(() => {
        manager = new ConfigurationManager();
        jest.clearAllMocks();
        
        // Reset static properties
        (ConfigurationManager as any).VERSION = '1.0.0';
    });

    describe('constructor', () => {
        it('should initialize with default values', () => {
            expect(manager['initialized']).toBe(false);
            expect(manager['configPath']).toBe('');
            expect(manager['projectConfig']).toEqual({ version: '0.0.0' });
            expect(manager['configurationMap']).toBeInstanceOf(Map);
        });
    });

    describe('initialize', () => {
        it('should initialize successfully with new project and load existing configuration', async () => {
            const { CocosMigrationManager } = require('../migration');
            CocosMigrationManager.migrate.mockResolvedValue({
                global: {},
                local: {},
                project: {},
            });

            // New project
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);

            await manager.initialize(projectPath);
            expect(manager['initialized']).toBe(true);
            expect(manager['configPath']).toBe(configPath);
            expect(mockRegistry.on).toHaveBeenCalledWith(MessageType.Registry, expect.any(Function));
            expect(mockRegistry.on).toHaveBeenCalledWith(MessageType.UnRegistry, expect.any(Function));
            expect(mockFse.writeJSON).toHaveBeenCalledWith(configPath, { version: '1.0.0' }, { spaces: 4 });

            // Existing configuration
            const existingConfig = { version: '1.0.0', module1: { key: 'value' } };
            mockFse.pathExists.mockResolvedValue(true);
            mockFse.readJSON.mockResolvedValue(existingConfig);
            
            const newManager = new ConfigurationManager();
            await newManager.initialize(projectPath);
            expect(newManager['projectConfig']).toEqual(existingConfig);
            expect(mockFse.readJSON).toHaveBeenCalledWith(configPath);
        });

        it('should handle errors and not initialize twice', async () => {
            const { CocosMigrationManager } = require('../migration');
            CocosMigrationManager.migrate.mockResolvedValue({
                global: {},
                local: {},
                project: {},
            });

            // File read errors
            mockFse.pathExists.mockResolvedValue(true);
            mockFse.readJSON.mockRejectedValue(new Error('Read error'));
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);
            await expect(manager.initialize(projectPath)).resolves.not.toThrow();

            // Not initialize twice
            mockFse.pathExists.mockResolvedValue(false);
            await manager.initialize(projectPath);
            await manager.initialize(projectPath);
            expect(mockRegistry.on).toHaveBeenCalledTimes(2); // Only called once per event type
        });
    });

    describe('get', () => {
        beforeEach(async () => {
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);
            await manager.initialize(projectPath);
        });

        it('should get configuration values and handle errors', async () => {
            const mockInstance = {
                get: jest.fn().mockResolvedValue('testValue')
            };
            mockRegistry.getInstance.mockReturnValue(mockInstance as any);

            // Get with default scope
            const result1 = await manager.get('testModule.testKey');
            expect(result1).toBe('testValue');
            expect(mockInstance.get).toHaveBeenCalledWith('testKey', undefined);

            // Get with specific scope
            mockInstance.get.mockResolvedValue('defaultValue');
            const result2 = await manager.get('testModule.testKey', 'default');
            expect(result2).toBe('defaultValue');
            expect(mockInstance.get).toHaveBeenCalledWith('testKey', 'default');

            // Invalid key
            await expect(manager.get('testModule.')).rejects.toThrow(
                '[Configuration] 获取配置失败：Error: 配置键名不能为空'
            );

            // Unregistered module
            mockRegistry.getInstance.mockReturnValue(undefined);
            await expect(manager.get('unregisteredModule.testKey')).rejects.toThrow(
                '[Configuration] 设置配置错误，unregisteredModule 未注册'
            );

            // Not initialized
            const uninitializedManager = new ConfigurationManager();
            await expect(uninitializedManager.get('testModule.testKey')).rejects.toThrow(
                '[Configuration] 获取配置失败：Error: [Configuration] 未初始化'
            );
        });
    });

    describe('set', () => {
        beforeEach(async () => {
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);
            await manager.initialize(projectPath);
        });

        it('should set configuration values and handle errors', async () => {
            const mockInstance = {
                set: jest.fn().mockResolvedValue(true)
            };
            mockRegistry.getInstance.mockReturnValue(mockInstance as any);

            // Set with default scope
            const result1 = await manager.set('testModule.testKey', 'testValue');
            expect(result1).toBe(true);
            expect(mockInstance.set).toHaveBeenCalledWith('testKey', 'testValue', 'project');

            // Set with specific scope
            const result2 = await manager.set('testModule.testKey', 'testValue', 'default');
            expect(result2).toBe(true);
            expect(mockInstance.set).toHaveBeenCalledWith('testKey', 'testValue', 'default');

            // Invalid key
            await expect(manager.set('testModule.', 'testValue')).rejects.toThrow(
                '[Configuration] 更新配置失败：Error: 配置键名不能为空'
            );

            // Unregistered module
            mockRegistry.getInstance.mockReturnValue(undefined);
            await expect(manager.set('unregisteredModule.testKey', 'testValue')).rejects.toThrow(
                '[Configuration] 更新配置失败：Error: [Configuration] 设置配置错误，unregisteredModule 未注册'
            );

            // Not initialized
            const uninitializedManager = new ConfigurationManager();
            await expect(uninitializedManager.set('testModule.testKey', 'testValue')).rejects.toThrow(
                '[Configuration] 更新配置失败：Error: [Configuration] 未初始化'
            );
        });
    });

    describe('remove', () => {
        beforeEach(async () => {
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);
            await manager.initialize(projectPath);
        });

        it('should remove configuration values and handle errors', async () => {
            const mockInstance = {
                remove: jest.fn().mockResolvedValue(true)
            };
            mockRegistry.getInstance.mockReturnValue(mockInstance as any);

            // Remove with default scope
            const result1 = await manager.remove('testModule.testKey');
            expect(result1).toBe(true);
            expect(mockInstance.remove).toHaveBeenCalledWith('testKey', 'project');

            // Remove with specific scope
            const result2 = await manager.remove('testModule.testKey', 'default');
            expect(result2).toBe(true);
            expect(mockInstance.remove).toHaveBeenCalledWith('testKey', 'default');

            // Invalid key
            await expect(manager.remove('testModule.')).rejects.toThrow(
                '[Configuration] 移除配置失败：Error: 配置键名不能为空'
            );

            // Unregistered module
            mockRegistry.getInstance.mockReturnValue(undefined);
            await expect(manager.remove('unregisteredModule.testKey')).rejects.toThrow(
                '[Configuration] 移除配置失败：Error: [Configuration] 设置配置错误，unregisteredModule 未注册'
            );

            // Not initialized
            const uninitializedManager = new ConfigurationManager();
            await expect(uninitializedManager.remove('testModule.testKey')).rejects.toThrow(
                '[Configuration] 移除配置失败：Error: [Configuration] 未初始化'
            );
        });
    });

    describe('event handling', () => {
        beforeEach(async () => {
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);
            await manager.initialize(projectPath);
        });

        it('should handle registry and unregistry events', async () => {
            // Registry event
            const mockInstance = {
                on: jest.fn(),
                moduleName: 'testModule',
                getAll: jest.fn().mockReturnValue({ key: 'value' })
            };

            const onRegistryHandler = mockRegistry.on.mock.calls.find(
                call => call[0] === MessageType.Registry
            )?.[1] as Function;

            expect(onRegistryHandler).toBeDefined();
            await onRegistryHandler(mockInstance);
            expect(mockInstance.on).toHaveBeenCalledWith(MessageType.Save, expect.any(Function));
            expect(manager['configurationMap'].has('testModule')).toBe(true);

            // Unregistry event
            const mockUnregistryInstance = {
                off: jest.fn(),
                moduleName: 'testModule'
            };

            const onUnRegistryHandler = mockRegistry.on.mock.calls.find(
                call => call[0] === MessageType.UnRegistry
            )?.[1] as Function;

            expect(onUnRegistryHandler).toBeDefined();
            await onUnRegistryHandler(mockUnregistryInstance);
            expect(mockUnregistryInstance.off).toHaveBeenCalled();
            expect(manager['configurationMap'].has('testModule')).toBe(false);
        });
    });

    describe('migration', () => {
        it('should perform migration when version is lower and not when same or higher', async () => {
            const { CocosMigrationManager } = require('../migration');
            const migratedConfig = {
                project: {
                    migratedKey: 'migratedValue'
                },
                global: {},
                local: {},
            };
            CocosMigrationManager.migrate.mockResolvedValue(migratedConfig);

            // Lower version - should migrate
            mockFse.pathExists.mockResolvedValue(true);
            mockFse.readJSON.mockResolvedValue({ version: '0.9.0' });
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);

            await manager.initialize(projectPath);
            expect(CocosMigrationManager.migrate).toHaveBeenCalledWith(projectPath);
            console.log(manager['projectConfig']);
            expect(manager['projectConfig']).toEqual({
                version: '1.0.0',
                migratedKey: 'migratedValue'
            });

            // Same version - should not migrate
            const newManager = new ConfigurationManager();
            mockFse.readJSON.mockResolvedValue({ version: '1.0.0' });
            await newManager.initialize(projectPath);
            expect(CocosMigrationManager.migrate).toHaveBeenCalledTimes(1); // Still only called once
        });
    });

    describe('save and static properties', () => {
        beforeEach(async () => {
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);
            await manager.initialize(projectPath);
        });

        it('should save configuration and have correct static properties', async () => {
            // Save configuration
            manager['projectConfig'] = { version: '1.0.0', test: 'value' };
            await manager['save']();
            expect(mockFse.ensureDir).toHaveBeenCalledWith(path.dirname(configPath));
            expect(mockFse.writeJSON).toHaveBeenCalledWith(
                configPath,
                { version: '1.0.0', test: 'value' },
                { spaces: 4 }
            );

            // Handle save errors
            mockFse.writeJSON.mockRejectedValue(new Error('Save error'));
            await expect(manager['save']()).rejects.toThrow('Save error');

            // Static properties
            expect(ConfigurationManager.VERSION).toBe('1.0.0');
            expect(ConfigurationManager.name).toBe('cocos.config.json');
        });
    });

    describe('Edge cases and error handling', () => {
        beforeEach(async () => {
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);
            await manager.initialize(projectPath);
        });

        it('should handle complex operations and initialization errors', async () => {
            const mockInstance = {
                get: jest.fn().mockResolvedValue('complexValue'),
                set: jest.fn().mockResolvedValue(true),
                remove: jest.fn().mockResolvedValue(true)
            };
            mockRegistry.getInstance.mockReturnValue(mockInstance as any);

            // Complex nested operations
            const result1 = await manager.get('testModule.nested.deep.key');
            const result2 = await manager.set('testModule.nested.deep.key', 'newValue');
            const result3 = await manager.remove('testModule.nested.deep.key');
            const result4 = await manager.get('testModule.items.0');

            expect(result1).toBe('complexValue');
            expect(result2).toBe(true);
            expect(result3).toBe(true);
            expect(result4).toBe('complexValue');

            // Concurrent operations
            const promises = [
                await manager.get('testModule.key1'),
                await manager.set('testModule.key2', 'value2'),
                await manager.remove('testModule.key3')
            ];
            const results = await Promise.all(promises);
            expect(results).toEqual(['complexValue', true, true]);

            // Initialization errors
            const invalidManager = new ConfigurationManager();
            await expect(invalidManager.initialize('')).resolves.not.toThrow();

            const errorManager = new ConfigurationManager();
            mockFse.pathExists.mockRejectedValue(new Error('File system error'));
            await expect(errorManager.initialize(projectPath)).resolves.not.toThrow();

            const writeErrorManager = new ConfigurationManager();
            mockFse.pathExists.mockResolvedValue(false);
            mockFse.writeJSON.mockRejectedValue(new Error('Write error'));
            await expect(writeErrorManager.initialize(projectPath)).resolves.not.toThrow();
        });
    });

    describe('configs should be initialized from projectConfig', () => {
        // 提取重复的项目配置对象
        const existingProjectConfig = {
            version: '1.0.0',
            testModule: {
                existingKey: 'existingValue',
                nested: {
                    existingNestedKey: 'existingNestedValue'
                }
            }
        };

        it('should initialize configs from existing projectConfig when registering configuration', async () => {
            // 模拟配置文件存在并包含配置
            mockFse.pathExists.mockResolvedValue(true);
            mockFse.readJSON.mockResolvedValue(existingProjectConfig);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);

            const newManager = new ConfigurationManager();
            await newManager.initialize(projectPath);

            // 验证 projectConfig 已正确加载
            expect(newManager['projectConfig']).toEqual(existingProjectConfig);

            // 模拟配置实例注册 - 使用 BaseConfiguration 类型
            const mockInstance = {
                moduleName: 'testModule',
                configs: {}, // 模拟 BaseConfiguration 的 configs 属性
                getAll: jest.fn().mockReturnValue({}), // 初始返回空对象
                on: jest.fn(),
                emit: jest.fn(),
                set: jest.fn().mockResolvedValue(true)
            };

            // 获取注册事件处理器
            const onRegistryHandler = mockRegistry.on.mock.calls.find(
                call => call[0] === MessageType.Registry
            )?.[1] as Function;

            expect(onRegistryHandler).toBeDefined();
            
            // 执行注册事件处理器
            await onRegistryHandler(mockInstance);

            // 验证修复：注册时应该从 projectConfig 中初始化配置
            // 期望的行为：configs 应该包含 projectConfig.testModule 的值
            expect(mockInstance.configs).toEqual({
                existingKey: 'existingValue',
                nested: {
                    existingNestedKey: 'existingNestedValue'
                }
            });
            
            // 模拟 Save 事件触发（当配置被修改时）
            const saveHandler = mockInstance.on.mock.calls.find(
                call => call[0] === MessageType.Save
            )?.[1] as Function;
            
            expect(saveHandler).toBeDefined();
            
            // 更新 getAll 返回值以反映初始化后的配置
            mockInstance.getAll.mockReturnValue(mockInstance.configs);
            
            await saveHandler(mockInstance);
            
            // 验证修复：Save 时应该保存正确的配置，而不是空对象
            expect(mockInstance.getAll).toHaveBeenCalled();
            expect(mockFse.writeJSON).toHaveBeenCalledWith(
                configPath,
                expect.objectContaining({
                    testModule: {
                        existingKey: 'existingValue',
                        nested: {
                            existingNestedKey: 'existingNestedValue'
                        }
                    }
                }),
                { spaces: 4 }
            );
        });

        it('should throw error when registering non-BaseConfiguration instances', async () => {
            // 模拟配置文件存在并包含配置
            mockFse.pathExists.mockResolvedValue(true);
            mockFse.readJSON.mockResolvedValue(existingProjectConfig);
            mockFse.ensureDir.mockResolvedValue(undefined);
            mockFse.writeJSON.mockResolvedValue(undefined);

            const newManager = new ConfigurationManager();
            await newManager.initialize(projectPath);

            // 模拟非 BaseConfiguration 类型的配置实例
            const mockInstance = {
                moduleName: 'testModule',
                getAll: jest.fn().mockReturnValue({}),
                on: jest.fn(),
                emit: jest.fn(),
                set: jest.fn().mockResolvedValue(true)
            };

            // 获取注册事件处理器
            const onRegistryHandler = mockRegistry.on.mock.calls.find(
                call => call[0] === MessageType.Registry
            )?.[1] as Function;

            expect(onRegistryHandler).toBeDefined();
            
            // 执行注册事件处理器应该抛出错误
            try {
                await onRegistryHandler(mockInstance);
                // eslint-disable-next-line no-undef
                fail('Expected an error to be thrown');
            } catch (error) {
                expect((error as Error).message).toContain('配置实例必须是 BaseConfiguration 类型');
            }
        });
    });
});
