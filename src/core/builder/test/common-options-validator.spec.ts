import { pathExists, readJSON } from 'fs-extra';

jest.mock('fs-extra', () => ({
    pathExists: jest.fn(),
    readJSON: jest.fn(),
}));

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: {
        projectRoot: 'E:/test-project',
    },
}));

describe('common-options-validator', () => {
    const pathExistsMock = pathExists as jest.Mock;
    const readJSONMock = readJSON as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('fillIncludeModulesFromProjectConfig', () => {
        it('uses engineModulesConfigKey to select includeModules from cocos.config.json', async () => {
            pathExistsMock.mockResolvedValue(true);
            readJSONMock.mockResolvedValue({
                engine: {
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
                },
            });

            const { fillIncludeModulesFromProjectConfig } = await import('../share/common-options-validator');
            const options = {
                engineModulesConfigKey: 'custom-config-97fe9ed0-e4b5-4f54-a122-959feba4586e',
            } as any;

            await fillIncludeModulesFromProjectConfig(options);

            expect(options.includeModules).toEqual(['base', 'gfx-webgl', 'webview']);
        });

        it('falls back to globalConfigKey when engineModulesConfigKey is not specified', async () => {
            pathExistsMock.mockResolvedValue(true);
            readJSONMock.mockResolvedValue({
                engine: {
                    configs: {
                        defaultConfig: {
                            includeModules: ['default-module'],
                        },
                        migrationsConfig: {
                            includeModules: ['2d', '3d', 'base'],
                        },
                    },
                    globalConfigKey: 'migrationsConfig',
                },
            });

            const { fillIncludeModulesFromProjectConfig } = await import('../share/common-options-validator');
            const options = {} as any;

            await fillIncludeModulesFromProjectConfig(options);

            expect(options.includeModules).toEqual(['2d', '3d', 'base']);
        });
    });
});
