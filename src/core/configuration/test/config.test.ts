import { BaseConfiguration } from '../script/config';
import { MessageType } from '../script/interface';

// Mock the defaultConfigMap
jest.mock('../configs', () => ({
    defaultConfigMap: {
        'test-module': {
            defaultKey: 'defaultValue',
            nested: {
                key: 'nestedValue'
            }
        }
    }
}));

describe('BaseConfiguration', () => {
    let config: BaseConfiguration;
    const moduleName = 'test-module';
    const defaultConfigs = {
        customKey: 'customValue',
        nested: {
            custom: 'customNestedValue'
        }
    };

    beforeEach(() => {
        config = new BaseConfiguration(moduleName, defaultConfigs);
    });

    describe('constructor and getDefaultConfig', () => {
        it('should initialize with module name and default configs', () => {
            expect(config.moduleName).toBe(moduleName);
            expect(config.getDefaultConfig()).toEqual(defaultConfigs);
        });

        it('should initialize with module name only and use defaultConfigMap', () => {
            const configWithoutDefaults = new BaseConfiguration('test-module');
            expect(configWithoutDefaults.moduleName).toBe('test-module');
            expect(configWithoutDefaults.getDefaultConfig()).toEqual({
                defaultKey: 'defaultValue',
                nested: { key: 'nestedValue' }
            });
        });
    });

    describe('getAll', () => {
        it('should return configs by scope', () => {
            config['configs'] = { projectKey: 'projectValue' };
            expect(config.getAll()).toEqual({ projectKey: 'projectValue' });
            expect(config.getAll('project')).toEqual({ projectKey: 'projectValue' });
            expect(config.getAll('default')).toEqual(defaultConfigs);
        });
    });

    describe('get', () => {
        beforeEach(() => {
            config['configs'] = {
                projectKey: 'projectValue',
                nested: { project: 'projectNestedValue' }
            };
        });

        it('should get values by scope', async () => {
            // Project scope
            expect(await config.get('projectKey', 'project')).toBe('projectValue');
            expect(await config.get('nested.project', 'project')).toBe('projectNestedValue');
            
            // Default scope
            expect(await config.get('customKey', 'default')).toBe('customValue');
            expect(await config.get('nested.custom', 'default')).toBe('customNestedValue');
            
            // No scope - project first, then default
            expect(await config.get('projectKey')).toBe('projectValue');
            expect(await config.get('customKey')).toBe('customValue');
            
            // Merge when both exist
            expect(await config.get('nested')).toEqual({
                custom: 'customNestedValue',
                project: 'projectNestedValue'
            });
        });

        it('should throw error for non-existent values', async () => {
            await expect(config.get('nonExistent', 'project')).rejects.toThrow(
                '[Configuration] 通过 test-module.nonExistent 获取配置失败'
            );
            await expect(config.get('nonExistent', 'default')).rejects.toThrow(
                '[Configuration] 通过 test-module.nonExistent 获取配置失败'
            );
            await expect(config.get('nonExistent')).rejects.toThrow(
                '[Configuration] 通过 test-module.nonExistent 获取配置失败'
            );
        });
    });

    describe('set', () => {
        it('should set values by scope', async () => {
            const saveSpy = jest.spyOn(config, 'save').mockResolvedValue(true);
            
            // Project scope (default)
            const result1 = await config.set('newKey', 'newValue');
            expect(result1).toBe(true);
            expect(config['configs']['newKey']).toBe('newValue');
            expect(saveSpy).toHaveBeenCalled();
            
            // Project scope (explicit)
            const result2 = await config.set('nested.newKey', 'newValue', 'project');
            expect(result2).toBe(true);
            expect(config['configs']['nested']['newKey']).toBe('newValue');
            
            // Default scope (no save)
            const result3 = await config.set('newDefaultKey', 'newDefaultValue', 'default');
            expect(result3).toBe(true);
            expect(config.getDefaultConfig()!['newDefaultKey']).toBe('newDefaultValue');
            expect(saveSpy).toHaveBeenCalledTimes(2); // Only project scope saves
        });
    });

    describe('remove', () => {
        beforeEach(() => {
            config['configs'] = {
                keyToRemove: 'value',
                nested: { keyToRemove: 'nestedValue', keep: 'keepValue' }
            };
        });

        it('should remove values by scope', async () => {
            const saveSpy = jest.spyOn(config, 'save').mockResolvedValue(true);
            
            // Project scope (default)
            expect(await config.remove('keyToRemove')).toBe(true);
            expect(config['configs']['keyToRemove']).toBeUndefined();
            expect(saveSpy).toHaveBeenCalled();
            
            // Project scope (explicit)
            expect(await config.remove('nested.keyToRemove', 'project')).toBe(true);
            expect(config['configs']['nested']['keyToRemove']).toBeUndefined();
            expect(config['configs']['nested']['keep']).toBe('keepValue');
            
            // Default scope (no save)
            expect(await config.remove('customKey', 'default')).toBe(true);
            expect(config.getDefaultConfig()!['customKey']).toBeUndefined();
            expect(saveSpy).toHaveBeenCalledTimes(2); // Only project scope saves
        });

        it('should return false for non-existent values', async () => {
            const saveSpy = jest.spyOn(config, 'save').mockResolvedValue(true);
            
            expect(await config.remove('nonExistent', 'project')).toBe(false);
            expect(await config.remove('nonExistent', 'default')).toBe(false);
            expect(saveSpy).not.toHaveBeenCalled();
        });
    });

    describe('save and EventEmitter', () => {
        it('should emit save event and return true', async () => {
            const emitSpy = jest.spyOn(config, 'emit');
            const result = await config.save();
            expect(result).toBe(true);
            expect(emitSpy).toHaveBeenCalledWith(MessageType.Save, config);
        });

        it('should handle event listeners', () => {
            const listener = jest.fn();
            config.on(MessageType.Save, listener);
            config.emit(MessageType.Save, config);
            expect(listener).toHaveBeenCalledWith(config);

            config.off(MessageType.Save, listener);
            config.emit(MessageType.Save, config);
            expect(listener).toHaveBeenCalledTimes(1);

            const onceListener = jest.fn();
            config.once(MessageType.Save, onceListener);
            config.emit(MessageType.Save, config);
            config.emit(MessageType.Save, config);
            expect(onceListener).toHaveBeenCalledTimes(1);
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle various value types and complex objects', async () => {
            config['configs'] = {
                nullValue: null,
                emptyString: '',
                zeroValue: 0,
                falseValue: false,
                complex: {
                    level1: { level2: { level3: { array: [1, 2, 3], nested: { value: 'deep' } } } }
                },
                items: ['first', 'second', 'third']
            };

            expect(await config.get('nullValue')).toBe(undefined);
            expect(await config.get('emptyString')).toBe('');
            expect(await config.get('zeroValue')).toBe(0);
            expect(await config.get('falseValue')).toBe(false);
            expect(await config.get('complex.level1.level2.level3')).toEqual({
                array: [1, 2, 3],
                nested: { value: 'deep' }
            });
            expect(await config.get('complex.level1.level2.level3.nested.value')).toBe('deep');
            expect(await config.get('items.0')).toBe('first');
            expect(await config.get('items.1')).toBe('second');
        });

        it('should handle invalid inputs and errors', async () => {
            // Invalid dot paths
            await expect(config.get('')).rejects.toThrow();
            await expect(config.get('..')).rejects.toThrow();
            await expect(config.get('.invalid')).rejects.toThrow();
            
            // Invalid keys for set/remove
            expect(await config.set('', 'value')).toBe(true);
            expect(await config.set(null as any, 'value')).toBe(true);
            expect(await config.remove('')).toBe(false);
            expect(await config.remove(null as any)).toBe(false);
            
            // Save errors
            const saveSpy = jest.spyOn(config, 'save').mockRejectedValue(new Error('Save failed'));
            await expect(config.set('testKey', 'testValue')).rejects.toThrow('Save failed');
            saveSpy.mockRestore();
        });
    });
});
