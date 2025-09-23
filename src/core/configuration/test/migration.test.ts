import { CocosMigrationManager, CocosMigration, CocosConfigLoader, IMigrationTarget, DetailedRedirect } from '../migration';

describe('Migration System', () => {
    const projectPath = '/tmp/test-project';
    
    beforeEach(() => {
        jest.clearAllMocks();
        CocosMigrationManager.clear();
    });

    describe('CocosMigrationManager', () => {
        describe('注册迁移器', () => {
            test('应该成功注册迁移器', () => {
                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'test-plugin',
                    redirects: {
                        'oldKey': 'newKey'
                    }
                };

                CocosMigrationManager.register(target);

                expect(CocosMigrationManager.getRegisteredCount()).toBe(1);
            });

            test('应该支持注册简单重定向', () => {
                CocosMigrationManager.register({
                    scope: 'project',
                    pluginName: 'simple-plugin',
                    redirects: {
                        'oldKey': 'newKey',
                        'anotherOldKey': 'anotherNewKey'
                    }
                });

                expect(CocosMigrationManager.getRegisteredCount()).toBe(1);
            });

            test('应该支持批量注册', () => {
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

                expect(CocosMigrationManager.getRegisteredCount()).toBe(2);
            });


            test('应该支持清空所有迁移器', () => {
                CocosMigrationManager.register({
                    scope: 'project',
                    pluginName: 'plugin1',
                    redirects: { 'key1': 'newKey1' }
                });
                CocosMigrationManager.register({
                    scope: 'local',
                    pluginName: 'plugin2',
                    redirects: { 'key2': 'newKey2' }
                });

                expect(CocosMigrationManager.getRegisteredCount()).toBe(2);

                CocosMigrationManager.clear();
                expect(CocosMigrationManager.getRegisteredCount()).toBe(0);
            });
        });

        describe('执行迁移', () => {
            beforeEach(() => {
                // Mock CocosConfigLoader
                jest.spyOn(CocosConfigLoader.prototype, 'initialize').mockImplementation(() => true);
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    oldKey: 'oldValue',
                    nested: {
                        key: 'nestedValue'
                    }
                });
            });

            test('应该执行所有注册的迁移器', async () => {
                CocosMigrationManager.register({
                    scope: 'project',
                    pluginName: 'test-plugin',
                    redirects: {
                        'oldKey': 'newKey'
                    }
                });

                const result = await CocosMigrationManager.migrate(projectPath);

                expect(result).toEqual({
                    newKey: 'oldValue',
                    nested: {
                        key: 'nestedValue'
                    }
                });
            });

            test('应该在没有注册迁移器时返回空对象', async () => {
                const result = await CocosMigrationManager.migrate(projectPath);
                expect(result).toEqual({});
            });

        });
    });

    describe('CocosMigration', () => {
        beforeEach(() => {
            // Mock CocosConfigLoader
            jest.spyOn(CocosConfigLoader.prototype, 'initialize').mockImplementation(() => true);
        });

        describe('简单重定向', () => {
            test('应该支持简单的字段重命名', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    oldKey: 'oldValue',
                    keepKey: 'keepValue'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'simple-plugin',
                    redirects: {
                        'oldKey': 'newKey'
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    newKey: 'oldValue',
                    keepKey: 'keepValue'
                });
            });

            test('应该支持嵌套路径的重定向', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    old: {
                        nested: {
                            key: 'nestedValue'
                        }
                    }
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'nested-plugin',
                    redirects: {
                        'old.nested.key': 'new.nested.key'
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    new: {
                        nested: {
                            key: 'nestedValue'
                        }
                    }
                });
            });
        });

        describe('详细重定向', () => {
            test('应该支持值转换', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    oldValue: '123'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'transform-plugin',
                    redirects: {
                        'oldValue': {
                            newKey: 'newValue',
                            transform: (value: string) => parseInt(value) * 2
                        } as DetailedRedirect
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    newValue: 246
                });
            });

            test('应该支持默认值', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    existingKey: 'existingValue'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'default-plugin',
                    redirects: {
                        'missingKey': {
                            newKey: 'newKey',
                            defaultValue: 'defaultValue'
                        } as DetailedRedirect
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    existingKey: 'existingValue',
                    newKey: 'defaultValue'
                });
            });

            test('应该支持移除原字段', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    oldKey: 'oldValue',
                    keepKey: 'keepValue'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'remove-plugin',
                    redirects: {
                        'oldKey': {
                            newKey: 'newKey',
                            remove: true
                        } as DetailedRedirect
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    newKey: 'oldValue',
                    keepKey: 'keepValue'
                });
                expect(result.oldKey).toBeUndefined();
            });
        });

        describe('目标路径', () => {
            test('应该支持应用目标路径', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    key: 'value'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'path-plugin',
                    targetPath: 'nested.config',
                    redirects: {
                        'key': 'newKey'
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    nested: {
                        config: {
                            newKey: 'value'
                        }
                    }
                });
            });
        });

        describe('自定义迁移函数', () => {
            test('应该支持自定义迁移函数', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    oldKey: 'oldValue'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'custom-plugin',
                    migrate: async (oldConfig: Record<string, any>) => {
                        return {
                            customKey: oldConfig.oldKey + '_customized'
                        };
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    customKey: 'oldValue_customized'
                });
            });
        });

        describe('后处理函数', () => {
            test('应该支持后处理函数', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    key: 'value'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'postprocess-plugin',
                    redirects: {
                        'key': 'newKey'
                    },
                    postProcess: async (config: Record<string, any>) => {
                        return {
                            ...config,
                            processed: true
                        };
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({
                    newKey: 'value',
                    processed: true
                });
            });
        });

        describe('错误处理', () => {
            test('应该处理配置加载失败', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue(null);

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'error-plugin',
                    redirects: {
                        'key': 'newKey'
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({});
            });

            test('应该处理值转换错误', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    oldValue: 'invalid'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'transform-error-plugin',
                    redirects: {
                        'oldValue': {
                            newKey: 'newValue',
                            transform: (value: string) => {
                                throw new Error('Transform error');
                            }
                        } as DetailedRedirect
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                // 应该保留原值，不进行转换
                expect(result).toEqual({
                    newValue: 'invalid'
                });
            });

            test('应该处理迁移函数错误', async () => {
                jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                    oldKey: 'oldValue'
                });

                const target: IMigrationTarget = {
                    scope: 'project',
                    pluginName: 'migrate-error-plugin',
                    migrate: async () => {
                        throw new Error('Migration error');
                    }
                };

                const result = await CocosMigration.migrate(projectPath, target);

                expect(result).toEqual({});
            });
        });
    });

    describe('复杂场景', () => {
        test('应该支持复杂的迁移场景', async () => {
            jest.spyOn(CocosConfigLoader.prototype, 'initialize').mockImplementation(() => true);
            jest.spyOn(CocosConfigLoader.prototype, 'loadConfig').mockResolvedValue({
                oldConfig: {
                    enabled: true,
                    timeout: 5000,
                    settings: {
                        debug: false,
                        logLevel: 'info'
                    }
                }
            });

            const target: IMigrationTarget = {
                scope: 'project',
                pluginName: 'complex-plugin',
                targetPath: 'newModule.config',
                redirects: {
                    'oldConfig.enabled': 'enabled',
                    'oldConfig.timeout': {
                        newKey: 'timeoutMs',
                        transform: (value: number) => value * 1000
                    } as DetailedRedirect,
                    'oldConfig.settings.debug': 'debugMode',
                    'oldConfig.settings.logLevel': {
                        newKey: 'logging.level',
                        transform: (value: string) => value.toUpperCase()
                    } as DetailedRedirect,
                    'oldConfig.missing': {
                        newKey: 'missingValue',
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
            };

            const result = await CocosMigration.migrate(projectPath, target);

            expect(result).toEqual({
                newModule: {
                    config: {
                        enabled: true,
                        timeoutMs: 5000000,
                        debugMode: false,
                        logging: {
                            level: 'INFO'
                        },
                        missingValue: 'default',
                        version: '2.0.0',
                        migrated: true
                    }
                }
            });
        });
    });
});
