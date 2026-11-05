import { resolve } from 'path';
import { EventEmitter } from 'events';
import { cloneDeep } from 'lodash';
import type { IFeatureGroup, ModuleRenderConfig } from '../src/core/engine/@types/modules';

// Engine's asset APIs are unrelated to module-cache derivation and pull in a separately built workspace package.
jest.mock('../src/core/assets', () => ({
    assetManager: {},
}));

function createRenderConfig(): ModuleRenderConfig {
    return {
        version: 'test',
        categories: {
            gameplay: {
                label: 'Gameplay',
            },
            empty: {
                label: 'Empty category',
            },
        },
        features: {
            spine: {
                default: true,
                label: 'Spine',
                category: 'gameplay',
                options: {
                    'spine-3.8': {
                        default: true,
                        label: 'Spine 3.8',
                        flags: {},
                        cmakeConfig: 'USE_SPINE_3_8',
                        isNativeModule: true,
                        dependencies: ['2d'],
                    },
                    'spine-4.2': {
                        default: false,
                        label: 'Spine 4.2',
                        flags: {},
                        cmakeConfig: 'USE_SPINE_4_2',
                        isNativeModule: true,
                        envCondition: '$NATIVE',
                        fallback: 'spine-3.8',
                    },
                },
            },
            'physics-2d-box2d': {
                default: true,
                label: 'Box2D',
                category: 'physics',
                flags: {},
                isNativeModule: true,
                envCondition: '$NATIVE || $HTML5',
                fallback: 'physics-2d-box2d-wasm',
            },
            audio: {
                default: true,
                label: 'Audio',
                category: 'gameplay',
                flags: {},
                dependencies: ['2d'],
            },
            base: {
                default: true,
                label: 'Base',
                flags: {},
                dependencies: [],
            },
            'custom-pipeline-post-process': {
                default: false,
                label: 'Post Process',
                category: 'gameplay',
                flags: {},
            },
        },
    };
}

describe('engine module config cache', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('should build module config cache from grouped and plain render config entries', () => {
        const renderConfig = createRenderConfig();
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');

        (Engine as any).initRenderConfig2ModuleConfigCache(renderConfig);
        const moduleConfig = Engine.queryModuleConfig();
        const spineGroup = renderConfig.features.spine as IFeatureGroup;

        expect(moduleConfig.moduleCmakeConfig['spine-3.8']).toEqual({ native: 'USE_SPINE_3_8' });
        expect(moduleConfig.moduleCmakeConfig['spine-4.2']).toEqual({ native: 'USE_SPINE_4_2' });
        expect(moduleConfig.nativeCodeModules).toEqual(expect.arrayContaining([
            'spine-3.8',
            'spine-4.2',
            'physics-2d-box2d',
        ]));
        expect(moduleConfig.features.spine).toBe(spineGroup);
        expect(moduleConfig.features['spine-4.2']).toBe(spineGroup.options['spine-4.2']);
        expect(moduleConfig.features.audio).toBe(renderConfig.features.audio);
    });

    it('should record env limits for plain modules and grouped options', () => {
        const renderConfig = createRenderConfig();
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');

        (Engine as any).initRenderConfig2ModuleConfigCache(renderConfig);
        const moduleConfig = Engine.queryModuleConfig();

        expect(moduleConfig.envLimitModule['physics-2d-box2d']).toEqual({
            envList: ['NATIVE', 'HTML5'],
            fallback: 'physics-2d-box2d-wasm',
        });
        expect(moduleConfig.envLimitModule['spine-4.2']).toEqual({
            envList: ['NATIVE'],
            fallback: 'spine-3.8',
        });
    });

    it('should accumulate reverse dependencies and preserve explicitly empty dependencies', () => {
        const renderConfig = createRenderConfig();
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');

        (Engine as any).initRenderConfig2ModuleConfigCache(renderConfig);
        const moduleConfig = Engine.queryModuleConfig();

        expect(moduleConfig.moduleDependMap['spine-3.8']).toEqual(['2d']);
        expect(moduleConfig.moduleDependMap.audio).toEqual(['2d']);
        expect(moduleConfig.moduleDependMap.base).toEqual([]);
        expect(moduleConfig.moduleDependMap['custom-pipeline-post-process']).toBeUndefined();
        expect(moduleConfig.moduleDependedMap['2d']).toEqual(['spine-3.8', 'audio']);
    });

    it('should build display tree data without mutating render config categories', () => {
        const renderConfig = createRenderConfig();
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');

        (Engine as any).initRenderConfig2ModuleConfigCache(renderConfig);
        const moduleConfig = Engine.queryModuleConfig();

        expect(moduleConfig.moduleTreeDump.categories.gameplay.modules.spine).toBe(renderConfig.features.spine);
        expect(moduleConfig.moduleTreeDump.categories.gameplay.modules.audio).toBe(renderConfig.features.audio);
        expect(moduleConfig.moduleTreeDump.categories.empty).toEqual({
            label: 'Empty category',
            modules: {},
        });
        expect(moduleConfig.moduleTreeDump.default.base).toBe(renderConfig.features.base);
        expect(moduleConfig.moduleTreeDump.default['physics-2d-box2d']).toBe(renderConfig.features['physics-2d-box2d']);
        expect(renderConfig.categories).toEqual({
            gameplay: { label: 'Gameplay' },
            empty: { label: 'Empty category' },
        });
    });

    it('should replace the previous cache when render config is initialized again', () => {
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');
        const nextRenderConfig: ModuleRenderConfig = {
            version: 'next',
            categories: {},
            features: {
                next: {
                    default: true,
                    label: 'Next',
                    flags: {},
                },
            },
        };

        (Engine as any).initRenderConfig2ModuleConfigCache(createRenderConfig());
        (Engine as any).initRenderConfig2ModuleConfigCache(nextRenderConfig);

        expect(Engine.queryModuleConfig().features).toEqual({ next: nextRenderConfig.features.next });
        expect(Engine.queryModuleConfig().nativeCodeModules).toEqual([]);
        expect(Engine.queryModuleConfig().moduleTreeDump).toEqual({
            default: { next: nextRenderConfig.features.next },
            categories: {},
        });
    });

    it('should keep ignored modules in feature metadata but hide them from display tree', () => {
        const renderConfig = createRenderConfig();
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');

        (Engine as any).initRenderConfig2ModuleConfigCache(renderConfig);
        const moduleConfig = Engine.queryModuleConfig();

        expect(moduleConfig.ignoreModules).toContain('custom-pipeline-post-process');
        expect(moduleConfig.features['custom-pipeline-post-process']).toBe(renderConfig.features['custom-pipeline-post-process']);
        expect(moduleConfig.moduleTreeDump.categories.gameplay.modules['custom-pipeline-post-process']).toBeUndefined();
        expect(moduleConfig.moduleTreeDump.default['custom-pipeline-post-process']).toBeUndefined();
    });

    it('should reset to an empty cache when render config loading fails', () => {
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        (Engine as any).initRenderConfig2ModuleConfigCache(createRenderConfig());
        expect(Engine.queryModuleConfig().moduleCmakeConfig['spine-4.2']).toEqual({ native: 'USE_SPINE_4_2' });

        (Engine as any).initModuleConfigCache('__missing_engine_root__');

        expect(Engine.queryModuleConfig()).toMatchObject({
            moduleDependMap: {},
            moduleDependedMap: {},
            nativeCodeModules: [],
            moduleCmakeConfig: {},
            features: {},
            moduleTreeDump: {
                default: {},
                categories: {},
            },
            ignoreModules: ['custom-pipeline-post-process'],
            envLimitModule: {},
        });
        expect(warnSpy).toHaveBeenCalledWith(
            '[Engine] Failed to initialize engine module configuration from engine source.',
            expect.objectContaining({ code: 'ENOENT' })
        );
        warnSpy.mockRestore();
    });

    it('should initialize module config cache through Engine.init', async () => {
        const renderConfig = createRenderConfig();
        const getEngineRenderConfig = jest.fn(() => renderConfig);
        const register = jest.fn(async (_namespace: string, options: { defaults: unknown }) => ({
            getAll: () => ({}),
            getDefaultConfig: () => options.defaults,
            on: jest.fn(),
        }));

        jest.doMock('../src/core/configuration', () => ({
            configurationRegistry: { register },
        }));
        jest.doMock('../src/core/engine/dynamic-metadata', () => ({
            getEngineRenderConfig,
            getLocalizedEngineRenderConfig: jest.fn(),
            getEngineDynamicConfigContribution: jest.fn(() => ({
                defaults: {
                    includeModules: [],
                    flags: {},
                    macroConfig: {},
                },
                metadata: {},
            })),
        }));

        try {
            const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');
            const engineRoot = resolve(__dirname, '..');

            await Engine.init(engineRoot);

            expect(getEngineRenderConfig).toHaveBeenCalledTimes(1);
            expect(getEngineRenderConfig).toHaveBeenCalledWith(engineRoot);
            expect(register).toHaveBeenCalledWith('engine', expect.objectContaining({
                defaults: expect.any(Object),
                nodes: expect.any(Function),
            }));
            expect(Engine.queryModuleConfig().moduleCmakeConfig['spine-4.2']).toEqual({
                native: 'USE_SPINE_4_2',
            });
        } finally {
            jest.dontMock('../src/core/configuration');
            jest.dontMock('../src/core/engine/dynamic-metadata');
        }
    });
});

describe('engine module config synchronization', () => {
    beforeEach(() => jest.resetModules());
    afterEach(() => {
        jest.dontMock('../src/core/configuration');
        jest.dontMock('../src/core/engine/dynamic-metadata');
    });

    it.each([
        { scope: 'selected config', topLevel: false, modules: ['base'] },
        { scope: 'empty selected config', topLevel: false, modules: [] },
        { scope: 'top-level override', topLevel: true, modules: ['audio'] },
        { scope: 'empty top-level override', topLevel: true, modules: [] },
    ])('replaces module arrays on init and save: $scope', async ({ topLevel, modules }) => {
        const defaultModules = ['base', 'audio', 'spine-3.8'];
        const defaults = {
            includeModules: defaultModules,
            globalConfigKey: 'defaultConfig',
            configs: {
                defaultConfig: {
                    name: 'Default',
                    includeModules: defaultModules,
                    flags: { LOAD_SPINE_MANUALLY: false },
                },
            },
        };
        let project: Record<string, any> = {
            configs: { defaultConfig: { includeModules: ['base'] } },
            ...(topLevel ? { includeModules: modules } : {}),
        };
        if (!topLevel) project.configs.defaultConfig.includeModules = modules;
        const savedProject = cloneDeep(project);
        const savedDefaults = cloneDeep(defaults);
        const events = new EventEmitter();
        jest.doMock('../src/core/configuration', () => ({
            configurationRegistry: {
                register: async (_namespace: string, options: { defaults: object }) => ({
                    getAll: () => project,
                    getDefaultConfig: () => ({ ...options.defaults, ...defaults }),
                    on: events.on.bind(events),
                }),
            },
        }));
        jest.doMock('../src/core/engine/dynamic-metadata', () => ({
            getEngineRenderConfig: () => createRenderConfig(),
            getEngineDynamicConfigContribution: () => ({
                defaults: { includeModules: defaultModules, flags: {}, macroConfig: {} },
                metadata: {},
            }),
        }));
        const { Engine } = require('../src/core/engine') as typeof import('../src/core/engine');
        await Engine.init(resolve(__dirname, '..'));

        expect(Engine.getConfig().includeModules).toEqual(modules);
        expect(Engine.getConfig()).toMatchObject({
            configs: {
                defaultConfig: {
                    ...defaults.configs.defaultConfig,
                    includeModules: topLevel ? ['base'] : modules,
                },
            },
        });
        // Effective config must not share project arrays with callers.
        Engine.getConfig().includeModules.push('video');
        expect(project).toEqual(savedProject);
        expect(defaults).toEqual(savedDefaults);

        project = { configs: { defaultConfig: { includeModules: ['audio'] } } };
        events.emit('configuration:save');
        expect(Engine.getConfig().includeModules).toEqual(['audio']);
        expect(Engine.getConfig()).toMatchObject({
            configs: { defaultConfig: { includeModules: ['audio'] } },
        });

        project.configs.defaultConfig.includeModules = [];
        events.emit('configuration:save');
        expect(Engine.getConfig().includeModules).toEqual([]);

        project.physicsConfig = { gravity: undefined };
        events.emit('configuration:save');
        expect(Engine.getConfig().physicsConfig.gravity).toEqual(Engine.getConfig(true).physicsConfig.gravity);

        project.physicsConfig = undefined;
        events.emit('configuration:save');
        expect(Engine.getConfig().physicsConfig).toEqual(Engine.getConfig(true).physicsConfig);

        project.globalConfigKey = 'custom';
        project.configs.custom = { includeModules: ['base'] };
        events.emit('configuration:save');
        expect(Engine.getConfig().includeModules).toEqual(['base']);

        // Missing project values still inherit engine defaults.
        project = {};
        events.emit('configuration:save');
        expect(Engine.getConfig().includeModules).toEqual(defaultModules);
        expect(defaults).toEqual(savedDefaults);
    });
});
