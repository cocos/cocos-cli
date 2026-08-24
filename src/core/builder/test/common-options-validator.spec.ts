const mockGetConfig = jest.fn();
const mockGetInfo = jest.fn();

jest.mock('../../engine', () => ({
    Engine: {
        getConfig: mockGetConfig,
        getInfo: mockGetInfo,
    },
}));

jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: {
        queryAsset: jest.fn(),
        queryAssets: jest.fn(() => []),
        queryUrl: jest.fn(),
    },
}));

function createEngineConfig(overrides: Record<string, any> = {}) {
    return {
        designResolution: { width: 960, height: 640 },
        renderPipeline: '',
        physicsConfig: { defaultMaterial: '' },
        customLayers: [],
        sortingLayers: [],
        macroConfig: {},
        includeModules: ['default-module'],
        splashScreen: {},
        ...overrides,
    };
}

describe('common-options-validator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetInfo.mockReturnValue({ version: 'test' });
    });

    describe('checkProjectSetting', () => {
        it('uses engineModulesConfigKey to select includeModules from Engine config', async () => {
            mockGetConfig.mockReturnValue(createEngineConfig({
                configs: {
                    defaultConfig: {
                        includeModules: ['default-module'],
                    },
                    migrationsConfig: {
                        includeModules: ['migration-module'],
                    },
                    'custom-config-97fe9ed0-e4b5-4f54-a122-959feba4586e': {
                        includeModules: ['base', 'gfx-webgl', 'webview'],
                    },
                },
                globalConfigKey: 'migrationsConfig',
            }));

            const { checkProjectSetting } = await import('../share/common-options-validator');
            const options = {
                engineModulesConfigKey: 'custom-config-97fe9ed0-e4b5-4f54-a122-959feba4586e',
            } as any;

            await checkProjectSetting(options);

            expect(options.includeModules).toEqual(['base', 'gfx-webgl', 'webview', 'debug-renderer']);
        });

        it('uses Engine includeModules when engineModulesConfigKey is not specified', async () => {
            mockGetConfig.mockReturnValue(createEngineConfig({
                includeModules: ['2d', '3d', 'base'],
                configs: {
                    defaultConfig: {
                        includeModules: ['default-module'],
                    },
                    migrationsConfig: {
                        includeModules: ['migration-module'],
                    },
                },
                globalConfigKey: 'migrationsConfig',
            }));

            const { checkProjectSetting } = await import('../share/common-options-validator');
            const options = {} as any;

            await checkProjectSetting(options);

            expect(options.includeModules).toEqual(['2d', '3d', 'base', 'debug-renderer']);
        });

        it('does not override explicitly provided includeModules', async () => {
            mockGetConfig.mockReturnValue(createEngineConfig({
                configs: {
                    custom: {
                        includeModules: ['custom-module'],
                    },
                },
            }));

            const { checkProjectSetting } = await import('../share/common-options-validator');
            const options = {
                engineModulesConfigKey: 'custom',
                includeModules: ['explicit-module'],
            } as any;

            await checkProjectSetting(options);

            expect(options.includeModules).toEqual(['explicit-module', 'debug-renderer']);
        });

        it('throws when engineModulesConfigKey does not exist', async () => {
            mockGetConfig.mockReturnValue(createEngineConfig({
                configs: {
                    custom: {
                        includeModules: ['custom-module'],
                    },
                },
            }));

            const { checkProjectSetting } = await import('../share/common-options-validator');
            const options = {
                engineModulesConfigKey: 'missing',
            } as any;

            await expect(checkProjectSetting(options)).rejects.toThrow('Invalid engineModulesConfigKey: missing');
        });

        it('does not mutate objects from Engine config when filling project settings', async () => {
            const engineConfig = createEngineConfig({
                designResolution: { width: 1280, height: 720 },
                physicsConfig: { defaultMaterial: '' },
                customLayers: [{ name: 'LayerA', value: 1 }],
                sortingLayers: [{ id: 1, name: 'SortingA' }],
                macroConfig: { ENABLE_FOO: true },
                splashScreen: { totalTime: 1000 },
            });
            mockGetConfig.mockReturnValue(engineConfig);

            const { checkProjectSetting } = await import('../share/common-options-validator');
            const options = {} as any;

            await checkProjectSetting(options);

            options.designResolution.width = 1;
            options.physicsConfig.defaultMaterial = 'changed';
            options.customLayers[0].name = 'ChangedLayer';
            options.sortingLayers[0].name = 'ChangedSorting';
            options.macroConfig.ENABLE_FOO = false;
            options.splashScreen.totalTime = 1;

            expect(engineConfig.designResolution).toEqual({ width: 1280, height: 720 });
            expect(engineConfig.physicsConfig).toEqual({ defaultMaterial: '' });
            expect(engineConfig.customLayers).toEqual([{ name: 'LayerA', value: 1 }]);
            expect(engineConfig.sortingLayers).toEqual([{ id: 1, name: 'SortingA' }]);
            expect(engineConfig.macroConfig).toEqual({ ENABLE_FOO: true });
            expect(engineConfig.splashScreen).toEqual({ totalTime: 1000 });
        });
    });

    describe('handleOverwriteProjectSettings', () => {
        it('does not mutate the original includeModules array while applying overwrites', async () => {
            const { handleOverwriteProjectSettings } = await import('../share/common-options-validator');
            const includeModules = ['base', 'physics-builtin'];
            const options = {
                includeModules,
                overwriteProjectSettings: {
                    includeModules: {
                        webview: 'on',
                        physics: 'physics-physx',
                    },
                },
            } as any;

            handleOverwriteProjectSettings(options);

            expect(includeModules).toEqual(['base', 'physics-builtin']);
            expect(options.includeModules).toEqual(['base', 'physics-physx', 'webview']);
        });
    });
});
