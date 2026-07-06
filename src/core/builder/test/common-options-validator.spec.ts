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
    });
});
