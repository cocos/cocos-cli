const mockServiceInitialize = jest.fn();
const mockServiceInitAll = jest.fn();
const mockRpcStartup = jest.fn();
const mockInitLocalI18n = jest.fn();
const mockEditorExtendsInit = jest.fn();
const mockDecoratorEngineInit = jest.fn();
const mockDecoratorEnginePause = jest.fn();
const mockOverwrite = jest.fn();

jest.mock('../../engine/editor-extends', () => ({
    UuidUtils: {},
    init: () => mockEditorExtendsInit(),
}));

jest.mock('./rpc', () => ({
    Rpc: {
        startup: (...args: any[]) => mockRpcStartup(...args),
    },
}));

jest.mock('./service/service-manager', () => ({
    serviceManager: {
        initialize: (...args: any[]) => mockServiceInitialize(...args),
        initAllServices: (...args: any[]) => mockServiceInitAll(...args),
    },
}));

jest.mock('./service/core/decorator', () => ({
    Service: {
        Script: {},
        Engine: {
            init: (...args: any[]) => mockDecoratorEngineInit(...args),
            pause: (...args: any[]) => mockDecoratorEnginePause(...args),
        },
    },
}));

jest.mock('./service/message', () => ({
    messageManager: {},
}));

jest.mock('./i18n', () => ({
    initLocalI18n: (...args: any[]) => mockInitLocalI18n(...args),
}));

jest.mock('./service', () => ({}));
jest.mock('cc/polyfill/engine', () => ({}), { virtual: true });
jest.mock('cc/overwrite', () => ({ default: (...args: any[]) => mockOverwrite(...args) }), { virtual: true });
jest.mock('../../engine/editor-extends/utils/serialize', () => ({
    serialize: jest.fn(),
    serializeCompiled: jest.fn(),
}));
jest.mock('../../engine/editor-extends/utils/deserialize', () => ({}));
jest.mock('../../engine/editor-extends/utils/geometry', () => ({}));
jest.mock('../../engine/editor-extends/utils/prefab', () => ({}));

import { startup } from './engine-bootstrap';

describe('scene-process engine bootstrap', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        (globalThis as any).System = {
            import: jest.fn(async () => ({})),
        };
        (globalThis as any).fetch = jest
            .fn()
            .mockResolvedValueOnce({
                json: async () => ({
                    overrideSettings: {
                        rendering: {},
                    },
                }),
            })
            .mockResolvedValueOnce({
                json: async () => ['base', 'custom-pipeline'],
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    settings: {
                        assets: {
                            preloadBundles: [{ bundle: 'main' }],
                        },
                        engine: {
                            builtinAssets: ['builtin-material'],
                        },
                    },
                    bundleConfigs: [],
                }),
            });
        (globalThis as any).document = {
            getElementById: jest.fn(() => null),
            createElement: jest.fn(() => ({})),
            head: {
                appendChild: jest.fn(),
            },
        };
        (globalThis as any).io = jest.fn(() => ({
            on: jest.fn(),
        }));
        (globalThis as any).EditorExtends = {};
        (globalThis as any).cc = {
            game: {
                init: jest.fn(async () => undefined),
                run: jest.fn(async () => undefined),
                pause: jest.fn(),
            },
            physics: {
                selector: {
                    runInEditor: false,
                    switchTo: jest.fn(),
                },
            },
            ResolutionPolicy: {
                SHOW_ALL: 'show-all',
            },
            view: {
                setDesignResolutionSize: jest.fn(),
            },
            director: {
                runSceneImmediate: jest.fn(),
            },
            assetManager: {
                loadAny: jest.fn(),
                loadBundle: jest.fn((_url: string, callback: Function) => callback(null, {})),
                getBundle: jest.fn(() => null),
                downloader: {
                    appendTimeStamp: true,
                },
                bundles: {
                    forEach: jest.fn(),
                },
                assets: {
                    get: jest.fn(),
                    add: jest.fn(),
                },
            },
            js: {
                getClassById: jest.fn(),
            },
            deserialize: jest.fn(),
        };
    });

    it('passes custom pipeline settings to cc.game.init', async () => {
        await startup({ serverURL: 'http://localhost:7456' });

        expect(global.fetch).toHaveBeenCalledWith('http://localhost:7456/scripting/engine/game-config');
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:7456/scripting/engine/modules');
        expect((globalThis as any).cc.game.init).toHaveBeenCalledWith(expect.objectContaining({
            overrideSettings: expect.objectContaining({
                rendering: expect.objectContaining({
                    customPipeline: true,
                    effectSettingsPath: 'http://localhost:7456/scripting/engine/effect-settings',
                }),
            }),
        }));
    });

    it('applies scene editor asset settings to cc.game.init', async () => {
        await startup({ serverURL: 'http://localhost:7456' });

        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:7456/scene-editor/settings.json',
            { cache: 'no-store' },
        );
        expect((globalThis as any).cc.game.init).toHaveBeenCalledWith(expect.objectContaining({
            overrideSettings: expect.objectContaining({
                assets: expect.objectContaining({
                    server: 'http://localhost:7456',
                    importBase: 'assets/general/import',
                    nativeBase: 'assets/general/native',
                    remoteBundles: [],
                    subpackages: [],
                    preloadBundles: [{ bundle: 'main' }],
                }),
                engine: expect.objectContaining({
                    builtinAssets: ['builtin-material'],
                }),
            }),
        }));
    });

    it('loads scene editor bundles through the original asset manager', async () => {
        (global.fetch as jest.Mock).mockReset()
            .mockResolvedValueOnce({
                json: async () => ({
                    overrideSettings: {
                        rendering: {},
                    },
                }),
            })
            .mockResolvedValueOnce({
                json: async () => ['base'],
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    settings: { assets: {} },
                    bundleConfigs: [
                        { name: 'main', deps: ['internal'] },
                        { name: 'internal', deps: [] },
                    ],
                }),
            });

        await startup({ serverURL: 'http://localhost:7456' });

        expect((globalThis as any).cc.assetManager.loadBundle).toHaveBeenNthCalledWith(
            1,
            'http://localhost:7456/scene-editor/assets/internal',
            expect.any(Function),
        );
        expect((globalThis as any).cc.assetManager.loadBundle).toHaveBeenNthCalledWith(
            2,
            'http://localhost:7456/scene-editor/assets/main',
            expect.any(Function),
        );
        expect((globalThis as any).cc.assetManager.downloader.appendTimeStamp).toBe(true);
        expect((globalThis as any).cc.assetManager.loadAny).not.toHaveBeenCalled();
    });
});
