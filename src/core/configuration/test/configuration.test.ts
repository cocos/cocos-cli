import { configurationManager } from '../script/manager';
import fse from 'fs-extra';
import path from 'path';

// Mock fs-extra
jest.mock('fs-extra');

describe('ConfigurationManager', () => {
    const projectPath = '/tmp';

    beforeEach(() => {
        jest.clearAllMocks();
        // 重置配置管理器的状态
        (configurationManager as any).initialized = false;
        (configurationManager as any).projectConfig = {};
        (configurationManager as any).projectPath = '';
        // 清空全局注册器
        const { configurationRegistry } = require('../script/registry');
        configurationRegistry.clear();
    });

    describe('初始化', () => {
        test('应该正确初始化配置管理器', async () => {
            (fse.pathExists as jest.Mock).mockResolvedValue(false);
            
            await configurationManager.initialize(projectPath);
            
            expect(fse.pathExists).toHaveBeenCalledWith(path.join(projectPath, '.cocos', 'settings.json'));
        });

        test('应该加载现有的项目配置文件', async () => {
            const existingConfig = { myModule: { enabled: true } };
            (fse.pathExists as jest.Mock).mockResolvedValue(true);
            (fse.readJSON as jest.Mock).mockResolvedValue(existingConfig);
            
            await configurationManager.initialize(projectPath);

            expect(fse.readJSON).toHaveBeenCalledWith(path.join(projectPath, '.cocos', 'settings.json'));
        });
    });


    describe('读取配置', () => {
        beforeEach(async () => {
            (fse.pathExists as jest.Mock).mockResolvedValue(false);
            await configurationManager.initialize(projectPath);
            
            // 注册一些测试配置
            const { configurationRegistry } = require('../script/registry');
            configurationRegistry.register('myModule', {
                enabled: true,
                timeout: 5000,
                settings: {
                    debug: false,
                    logLevel: 'info'
                }
            });
        });

        test('应该读取嵌套配置值', async () => {
            const timeout = await configurationManager.getValue<number>('myModule.timeout');
            
            expect(timeout).toBe(5000);
        });

        test('应该读取深层嵌套配置值', async () => {
            const logLevel = await configurationManager.getValue<string>('myModule.settings.logLevel');
            
            expect(logLevel).toBe('info');
        });

        test('应该返回 undefined 对于不存在的配置', async () => {
            const result = await configurationManager.getValue('myModule.nonExistent');
            
            expect(result).toBeUndefined();
        });

        test('应该只从项目配置读取', async () => {
            // 模拟项目配置
            (fse.pathExists as jest.Mock).mockResolvedValue(true);
            (fse.readJSON as jest.Mock).mockResolvedValue({
                myModule: { timeout: 10000 }
            });
            
            // 重置并重新初始化配置管理器
            (configurationManager as any).initialized = false;
            (configurationManager as any).defaultConfig = {};
            (configurationManager as any).projectConfig = {};
            await configurationManager.initialize(projectPath);
            
            const timeout = await configurationManager.getValue<number>('myModule.timeout', 'project');
            
            expect(timeout).toBe(10000);
        });

        test('应该只从默认配置读取', async () => {
            const timeout = await configurationManager.getValue<number>('myModule.timeout', 'default');
            
            expect(timeout).toBe(5000);
        });

        test('应该优先读取项目配置', async () => {
            // 先设置 mock
            (fse.pathExists as jest.Mock).mockResolvedValue(true);
            (fse.readJSON as jest.Mock).mockResolvedValue({
                myModule: { timeout: 10000 }
            });
            
            // 重置并重新初始化配置管理器
            (configurationManager as any).initialized = false;
            (configurationManager as any).defaultConfig = {};
            (configurationManager as any).projectConfig = {};
            
            // 先初始化配置管理器
            await configurationManager.initialize(projectPath);
            
            // 然后注册默认配置
            const { configurationRegistry } = require('../script/registry');
            configurationRegistry.register('myModule', {
                enabled: true,
                timeout: 5000,
                settings: {
                    debug: false,
                    logLevel: 'info'
                }
            });
            
            const timeout = await configurationManager.getValue<number>('myModule.timeout');
            
            expect(timeout).toBe(10000); // 项目配置优先
        });

        test('应该处理 null 值配置', async () => {
            const { configurationRegistry } = require('../script/registry');
            configurationRegistry.register('nullModule', { value: null });
            
            const result = await configurationManager.getValue('nullModule.value');
            
            expect(result).toBeNull();
        });
    });

    describe('更新配置', () => {
        beforeEach(async () => {
            (fse.pathExists as jest.Mock).mockResolvedValue(false);
            (fse.ensureDir as jest.Mock).mockResolvedValue(undefined);
            (fse.writeJSON as jest.Mock).mockResolvedValue(undefined);
            await configurationManager.initialize(projectPath);
        });

        test('应该成功更新项目配置', async () => {
            const result = await configurationManager.updateValue('myModule.timeout', 10000);
            
            expect(result).toBe(true);
            expect(fse.writeJSON).toHaveBeenCalled();
        });

        test('应该成功更新默认配置', async () => {
            // 清除之前的 mock 调用记录
            jest.clearAllMocks();
            
            // 先注册默认配置
            const { configurationRegistry } = require('../script/registry');
            configurationRegistry.register('myModule', {
                enabled: true,
                timeout: 5000
            });
            
            const result = await configurationManager.updateValue('myModule.timeout', 8000, 'default');
            
            expect(result).toBe(true);
            expect(fse.writeJSON).not.toHaveBeenCalled(); // 默认配置不写入文件
        });

        test('应该拒绝空键名', async () => {
            const result = await configurationManager.updateValue('', 10000);
            
            expect(result).toBe(false);
        });

        test('应该处理保存错误', async () => {
            (fse.writeJSON as jest.Mock).mockRejectedValue(new Error('Write failed'));
            
            const result = await configurationManager.updateValue('myModule.timeout', 10000);
            
            expect(result).toBe(false);
        });

        test('应该能够设置没有默认值的配置', async () => {
            // 设置一个全新的配置项（没有默认值）
            const result = await configurationManager.updateValue('newModule.newSetting', 'newValue');
            
            expect(result).toBe(true);
            
            // 读取设置的配置
            const value = await configurationManager.getValue('newModule.newSetting');
            expect(value).toBe('newValue');
        });

        test('应该能够设置嵌套的配置路径', async () => {
            // 设置深层嵌套的配置
            const result = await configurationManager.updateValue('newModule.nested.deep.value', 123);
            
            expect(result).toBe(true);
            
            // 读取嵌套配置
            const value = await configurationManager.getValue('newModule.nested.deep.value');
            expect(value).toBe(123);
            
            // 读取整个模块配置
            const moduleConfig = await configurationManager.getValue('newModule');
            expect(moduleConfig).toEqual({
                nested: {
                    deep: {
                        value: 123
                    }
                }
            });
        });
    });

    describe('错误处理', () => {
        test('应该处理配置文件读取错误', async () => {
            (fse.pathExists as jest.Mock).mockResolvedValue(true);
            (fse.readJSON as jest.Mock).mockRejectedValue(new Error('Read failed'));
            
            await configurationManager.initialize(projectPath);
            
            // 应该不会抛出错误，而是使用空配置
            const result = await configurationManager.getValue('any.key');
            expect(result).toBeUndefined();
        });

        test('应该处理不支持的配置作用域', async () => {
            (fse.pathExists as jest.Mock).mockResolvedValue(false);
            await configurationManager.initialize(projectPath);
            
            const result = await configurationManager.updateValue('key', 'value', 'invalid' as any);
            
            expect(result).toBe(false);
        });
    });
});