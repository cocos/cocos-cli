import { PluginManager } from '../manager/plugin';
import builderConfig from '../share/builder-config';

let mockLanguage = 'en';
const mockTranslations: Record<string, Record<string, string>> = {
    en: {
        'i18n:test.platform': 'Test Platform',
        'i18n:test.common.name': 'Game Name',
        'i18n:test.common.compression': 'Main Bundle Compression',
        'i18n:test.option.mode': 'Mode',
        'i18n:test.option.description': 'Mode Description',
        'i18n:test.option.auto': 'Auto',
        'i18n:test.custom.invalid': 'Custom Invalid',
        'i18n:test.stage.make': 'Make',
        'i18n:test.stage.description': 'Make Description',
        'i18n:test.template': 'Test Template',
        'i18n:builder.verify_rule_message.required': 'Required',
        'i18n:builder.asset_bundle.none': 'None',
        'i18n:builder.asset_bundle.merge_dep': 'Merge Dependencies',
        'i18n:builder.asset_bundle.zip': 'Zip',
    },
    zh: {
        'i18n:test.platform': '测试平台',
        'i18n:test.common.name': '游戏名称',
        'i18n:test.common.compression': '主包压缩',
        'i18n:test.option.mode': '模式',
        'i18n:test.option.description': '模式描述',
        'i18n:test.option.auto': '自动',
        'i18n:test.stage.make': '制作',
        'i18n:test.stage.description': '制作描述',
        'i18n:test.template': '测试模板',
        'i18n:builder.asset_bundle.none': '无',
        'i18n:builder.asset_bundle.merge_dep': '合并依赖',
        'i18n:builder.asset_bundle.zip': 'Zip',
    },
};

jest.mock('../../base/i18n', () => {
    const mock = {
        transI18nName(name: string) {
            return mockTranslations[mockLanguage][name] || name;
        },
        t(key: string) { return key; },
        setLanguage(language: string) { mockLanguage = language; },
        registerLanguagePatch() {},
        _lang: 'en',
    };
    return { __esModule: true, default: mock };
});

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {
        commonOptionConfigs: {
            name: {
                label: 'i18n:test.common.name',
                type: 'string',
                default: 'game',
                verifyRules: ['required'],
            },
            mainBundleCompressionType: {
                label: 'i18n:test.common.compression',
                type: 'string',
                default: 'merge_dep',
            },
        },
        setProject: jest.fn(),
    },
}));

jest.mock('../share/texture-compress', () => ({
    configGroups: {},
}));

jest.mock('../../configuration', () => ({
    configurationRegistry: { register: jest.fn() },
}));

jest.mock('../../../global', () => ({
    GlobalPaths: { workspace: '/tmp/test-workspace' },
}));

function createPluginManager(): PluginManager {
    return new PluginManager();
}

describe('PluginManager platform config schema queries', () => {
    let pm: PluginManager;

    beforeEach(() => {
        mockLanguage = 'en';
        pm = createPluginManager();
        (pm as any).platformConfig = {
            test: {
                name: 'Test Platform',
                nameI18nKey: 'i18n:test.platform',
                platformType: 'WEB',
                doc: 'editor/publish/test.html',
                pluginPath: '/plugins/test',
            },
        };
        (pm as any).commonOptionConfig = {
            test: {
                name: {
                    label: 'i18n:test.common.name',
                    type: 'string',
                    default: 'overridden',
                    verifyRules: ['required'],
                    hidden: true,
                    verifyKey: 'testtest',
                },
            },
        };
        (pm as any).configMap = {
            test: {
                test: {
                    options: {
                        mode: {
                            label: 'i18n:test.option.mode',
                            type: 'enum',
                            default: 'auto',
                            verifyRules: ['required'],
                            items: [{
                                label: 'i18n:test.option.auto',
                                value: 'auto',
                            }],
                        },
                    },
                },
            },
        };
        (pm as any).bundleConfigs = {
            test: {
                platformType: 'web',
                supportOptions: {
                    compressionType: ['none', 'merge_dep', 'zip'],
                },
            },
        };
        (pm as any).platformRegisterInfoPool = new Map([
            ['test', {
                platform: 'test',
                path: '/plugins/test',
                type: 'register',
                config: (pm as any).configMap.test.test,
            }],
        ]);
        (pm as any).translateConfigItemsDisplayFields(builderConfig.commonOptionConfigs);
        (pm as any).translateConfigItemsDisplayFields((pm as any).commonOptionConfig.test);
        (pm as any).translateConfigDisplayFields((pm as any).configMap.test.test);
    });

    it('returns translated platform display config with doc and plugin path', () => {
        const result = pm.queryPlatformConfig();

        expect(result).toEqual([expect.objectContaining({
            platform: 'test',
            displayName: 'Test Platform',
            doc: 'editor/publish/test.html',
            pluginPath: '/plugins/test',
            supportTextureCompress: false,
        })]);
    });

    it('queryPlatformConfig returns the platform metadata required by the config page', () => {
        (pm as any).platformConfig.test.createTemplateLabel = 'Test Platform';
        (pm as any).platformConfig.test.texture = {
            platformType: 'web',
            support: {},
        };

        const [result] = pm.queryPlatformConfig();

        expect(result).toEqual(expect.objectContaining({
            platform: 'test',
            displayName: 'Test Platform',
            platformType: 'WEB',
            isNative: false,
            doc: 'editor/publish/test.html',
            pluginPath: '/plugins/test',
            createTemplateLabel: 'Test Platform',
            supportTextureCompress: true,
        }));
    });

    it('returns common options and platform options for a platform', () => {
        const result = pm.getPlatformBuildSchema('test');

        // name 标记为 hidden -> 在源头过滤(配置系统 schema 无 hidden 字段)
        expect(result.common.name).toBeUndefined();
        expect(result.common.mainBundleCompressionType).toMatchObject({
            title: 'Main Bundle Compression',
            type: 'string',
            enum: ['none', 'merge_dep', 'zip'],
            enumDescriptions: ['None', 'Merge Dependencies', 'Zip'],
        });
        expect(result.platformOptions.mode).toMatchObject({
            title: 'Mode',
            type: 'string',
            enum: ['auto'],
            enumDescriptions: ['Auto'],
        });
    });

    it('getPlatformBuildSchema derives compression items from platform supportedCompressionTypes', async () => {
        const config = {
            displayName: 'Asset Platform',
            platformType: 'WEB',
            assetBundleConfig: {
                platformType: 'web',
                supportedCompressionTypes: ['none', 'zip'],
            },
            options: {
                quality: {
                    label: 'Quality',
                    type: 'number',
                    default: 80,
                },
            },
        };
        const registerInfo = {
            platform: 'asset-source',
            path: '/plugins/asset-source',
            type: 'register',
            config,
        };

        (pm as any).platformRegisterInfoPool.set('asset-source', registerInfo);
        await (pm as any).registerPlatform(registerInfo);

        const result = pm.getPlatformBuildSchema('asset-source');

        expect(result.common.mainBundleCompressionType).toMatchObject({
            type: 'string',
            enum: ['none', 'zip'],
            enumDescriptions: ['None', 'Zip'],
        });
        expect(result.platformOptions.quality).toMatchObject({
            title: 'Quality',
            type: 'number',
            default: 80,
        });
    });

    it('checkBuildOption verifies common options and returns BuildCheckResult', async () => {
        const result = await pm.checkBuildOption('test', 'name', '', {
            platform: 'test',
            packages: {
                test: {
                    mode: 'auto',
                },
            },
        } as any);

        expect(result).toEqual({
            valid: false,
            level: 'error',
            message: 'Required',
            fixedValue: 'overridden',
        });
    });

    it('checkBuildOption verifies common options declared with verifyRules', async () => {
        (pm as any).commonOptionConfig.test.verifyOnly = {
            label: 'Verify Only',
            type: 'string',
            default: 'fallback',
            verifyRules: ['required'],
        };

        const result = await pm.checkBuildOption('test', 'verifyOnly', '', {
            platform: 'test',
            packages: {
                test: {
                    mode: 'auto',
                },
            },
        } as any);

        expect(result).toEqual({
            valid: false,
            level: 'error',
            message: 'Required',
            fixedValue: 'fallback',
        });
    });

    it('checkBuildOption verifies platform options declared with verifyRuleMap', async () => {
        const config = {
            displayName: 'Test Platform',
            platformType: 'WEB',
            options: {
                customCode: {
                    label: 'Custom Code',
                    type: 'string',
                    default: 'ok',
                    verifyRules: ['customCode'],
                },
            },
            verifyRuleMap: {
                customCode: {
                    func: (value: unknown) => value === 'ok',
                    message: 'i18n:test.custom.invalid',
                },
            },
        };

        await (pm as any).internalRegister({
            platform: 'test',
            path: '/plugins/test',
            type: 'register',
            config,
        });

        const result = await pm.checkBuildOption('test', 'customCode', 'bad', {
            platform: 'test',
            packages: {
                test: {
                    customCode: 'bad',
                },
            },
        } as any);

        expect(result).toEqual({
            valid: false,
            level: 'error',
            message: 'Custom Invalid',
            fixedValue: 'ok',
        });
    });

    it('checkBuildOption verifies platform options and unsupported compression types', async () => {
        const platformOptionResult = await pm.checkBuildOption('test', 'mode', '', {
            platform: 'test',
            name: 'game',
            mainBundleCompressionType: 'merge_dep',
            packages: {
                test: {
                    mode: '',
                },
            },
        } as any);

        expect(platformOptionResult).toEqual({
            valid: false,
            level: 'error',
            message: 'Required',
            fixedValue: 'auto',
        });

        const compressionResult = await pm.checkBuildOption('test', 'mainBundleCompressionType', 'subpackage', {
            platform: 'test',
            name: 'game',
            mainBundleCompressionType: 'subpackage',
            packages: {
                test: {
                    mode: 'auto',
                },
            },
        } as any);

        expect(compressionResult).toMatchObject({
            valid: false,
            level: 'error',
            fixedValue: 'merge_dep',
        });
        expect(compressionResult.message).toContain('compression type(subpackage) is invalid');
    });

    it('checkBuildOptions verifies common and platform option values in batch', async () => {
        const result = await pm.checkBuildOptions('test', {
            platform: 'test',
            name: '',
            mainBundleCompressionType: 'zip',
            packages: {
                test: {
                    mode: '',
                },
            },
        } as any);

        expect(result.name).toEqual({
            valid: false,
            level: 'error',
            message: 'Required',
            fixedValue: 'overridden',
        });
        expect(result.mode).toEqual({
            valid: false,
            level: 'error',
            message: 'Required',
            fixedValue: 'auto',
        });
        expect(result.mainBundleCompressionType).toEqual({
            valid: true,
        });
    });

    it('materializes display fields and stores original i18n keys', () => {
        const config = {
            displayName: 'i18n:test.platform',
            options: {
                mode: {
                    label: 'i18n:test.option.mode',
                    description: 'i18n:test.option.description',
                    type: 'enum',
                    default: 'auto',
                    items: [{
                        label: 'i18n:test.option.auto',
                        value: 'auto',
                    }],
                },
            },
            customBuildStages: [{
                name: 'make',
                hook: 'make',
                displayName: 'i18n:test.stage.make',
                description: 'i18n:test.stage.description',
            }],
            buildTemplateConfig: {
                templates: [{ path: './template', destUrl: './' }],
                displayName: 'i18n:test.template',
                version: '1.0.0',
            },
        };

        (pm as any).translateConfigDisplayFields(config);

        expect(config.displayName).toBe('Test Platform');
        expect((config as any).displayNameI18nKey).toBe('i18n:test.platform');
        expect(config.options.mode.label).toBe('Mode');
        expect((config.options.mode as any).labelI18nKey).toBe('i18n:test.option.mode');
        expect(config.options.mode.description).toBe('Mode Description');
        expect((config.options.mode as any).descriptionI18nKey).toBe('i18n:test.option.description');
        expect(config.options.mode.items[0].label).toBe('Auto');
        expect((config.options.mode.items[0] as any).labelI18nKey).toBe('i18n:test.option.auto');
        expect(config.customBuildStages[0].displayName).toBe('Make');
        expect((config.customBuildStages[0] as any).displayNameI18nKey).toBe('i18n:test.stage.make');
        expect(config.customBuildStages[0].description).toBe('Make Description');
        expect((config.customBuildStages[0] as any).descriptionI18nKey).toBe('i18n:test.stage.description');
        expect(config.buildTemplateConfig.displayName).toBe('Test Template');
        expect((config.buildTemplateConfig as any).displayNameI18nKey).toBe('i18n:test.template');
    });

    it('refreshes materialized display fields after language changes', () => {
        (pm as any).customBuildStages = {
            test: {
                test: [{
                    name: 'make',
                    hook: 'make',
                    displayName: 'Make',
                    displayNameI18nKey: 'i18n:test.stage.make',
                    description: 'Make Description',
                    descriptionI18nKey: 'i18n:test.stage.description',
                }],
            },
        };
        const platformConfig = (pm as any).configMap.test.test;
        platformConfig.displayName = 'Test Platform';
        platformConfig.displayNameI18nKey = 'i18n:test.platform';
        platformConfig.buildTemplateConfig = {
            templates: [{ path: './template', destUrl: './' }],
            displayName: 'Test Template',
            displayNameI18nKey: 'i18n:test.template',
            version: '1.0.0',
        };
        (pm as any).buildTemplateConfigMap = {
            'Test Platform': platformConfig.buildTemplateConfig,
        };

        mockLanguage = 'zh';
        pm.refreshDisplayI18nFields();

        const platforms = pm.queryPlatformConfig();
        const schema = pm.getPlatformBuildSchema('test');
        const stage = pm.getBuildStageConfigByPlatform('test' as any)!.buttons[0];
        const template = pm.getBuildTemplateConfig('test');

        expect(platforms[0].displayName).toBe('测试平台');
        expect(platforms[0].createTemplateLabel).toBe('测试平台');
        expect(schema.common.name).toBeUndefined();
        expect(schema.common.mainBundleCompressionType).toMatchObject({
            enum: ['none', 'merge_dep', 'zip'],
            enumDescriptions: ['无', '合并依赖', 'Zip'],
        });
        expect(schema.platformOptions.mode.title).toBe('模式');
        expect(schema.platformOptions.mode.description).toBeUndefined();
        expect(stage.displayName).toBe('制作');
        expect(stage.description).toBe('制作描述');
        expect(template.displayName).toBe('测试模板');
    });

    it('returns materialized values with original i18n keys attached', () => {
        const option = (pm as any).configMap.test.test.options.mode;
        option.label = 'Stored Mode Value';
        option.labelI18nKey = 'i18n:test.option.mode';
        option.items[0].label = 'Stored Auto Value';
        option.items[0].labelI18nKey = 'i18n:test.option.auto';
        (pm as any).platformConfig.test.name = 'Stored Platform Value';
        (pm as any).platformConfig.test.nameI18nKey = 'i18n:test.platform';

        const platforms = pm.queryPlatformConfig();
        const schema = pm.getPlatformBuildSchema('test');

        expect(platforms[0].displayName).toBe('Stored Platform Value');
        // metadata.ts 中展示字段优先使用已物化的展示值, i18n key 仅作为缺省回退与刷新依据。
        expect(schema.platformOptions.mode.title).toBe('Stored Mode Value');
        expect(schema.platformOptions.mode).toMatchObject({ enum: ['auto'], enumDescriptions: ['Stored Auto Value'] });
        // 源 option 对象不被 getPlatformBuildSchema 修改(克隆后再转换)
        expect(option.label).toBe('Stored Mode Value');
        expect(option.labelI18nKey).toBe('i18n:test.option.mode');
    });
});
