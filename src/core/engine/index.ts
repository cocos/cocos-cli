import fse from 'fs-extra';
import { existsSync, readdirSync, statSync } from 'fs';
import { EngineInfo } from './@types/public';
import type { IEngineConfig, IEngineProjectConfig, IInitEngineInfo, IJointTextureLayoutPreviewResult } from './@types/config';
import type { CategoryDetail, IFeatureItem, IModuleConfig, IModuleItem, ModuleRenderConfig } from './@types/modules';
import { join } from 'path';
import { cloneDeep, merge } from 'lodash';
import { configurationRegistry, IBaseConfiguration } from '../configuration';
import { assetManager } from '../assets';
import { getEngineDynamicConfigContribution, getEngineRenderConfig, getLocalizedEngineRenderConfig } from './dynamic-metadata';
import { createEngineMetadataNodes } from './metadata';
import i18n from '../base/i18n';
import {
    CUSTOM_PIPELINE_MODULE,
    CUSTOM_PIPELINE_NAME_KEY,
    DEFAULT_CUSTOM_PIPELINE_NAME,
    deriveGraphicsConfigFromCustomPipeline,
    deriveGraphicsConfigFromModules,
    ensureCustomPipelineMacroConfig,
    hasOwnConfigKey,
    mergeGraphicsConfigWithModules,
    normalizeIncludeModulesWithGraphics,
} from './graphics-config';
import {
    queryJointTextureLayoutPreview as createJointTextureLayoutPreview,
    resolveCustomJointTextureLayouts,
} from './joint-texture-layout';

/**
 * 整合 engine 的一些编译、配置读取等功能
 */

export interface IEngine {
    getInfo(): EngineInfo;
    getConfig(): IEngineConfig;
    init(enginePath: string): Promise<this>;
    initEngine(info: IInitEngineInfo): Promise<this>;
    queryRenderConfig(): ModuleRenderConfig;
    queryLocalizedRenderConfig(): ModuleRenderConfig;
    queryJointTextureLayoutPreview(): Promise<IJointTextureLayoutPreviewResult>;
    queryLayerBuiltin(): Promise<{ name: string; value: number }[]>;
    querySortingLayerBuiltin(): Promise<ReadonlyArray<{ id: number; name: string; value: number }>>;
}

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}

const Backends = {
    'physics-cannon': 'cannon.js',
    'physics-ammo': 'bullet',
    'physics-builtin': 'builtin',
    'physics-physx': 'physx',
};

const Backends2D = {
    'physics-2d-box2d': 'box2d',
    'physics-2d-box2d-wasm': 'box2d-wasm',
    'physics-2d-builtin': 'builtin',
};

// TODO issue 记录： https://github.com/cocos/3d-tasks/issues/18489 后续完善
// 后处理管线模块的开关，在图像设置那边处理 (说是 3.9 会彻底删除)
// 所以界面上的 勾选动作 和 状态判断 都要忽略这个列表的数据，从 3.8.6 开始我将这个 ignoreKeys 改成 ignoreModules 从 视图层移到主进程
// 直接在数据源上过滤掉，减少 视图层的判断
const ignoreModules = ['custom-pipeline-post-process'];

function extractMacros(expression: string): string[] {
    // envCondition uses a small "$MACRO || $MACRO" grammar shared with the engine compiler.
    return expression.split('||').map(match => match.trim().substring(1));
}

class EngineManager implements IEngine {
    private _init: boolean = false;
    private _info: EngineInfo = {
        version: '3.8.8',
        tmpDir: '',
        typescript: {
            path: '',
            type: 'builtin',
            builtin: '',
        },
        native: {
            path: '',
            type: 'builtin',
            builtin: '',
        }
    };
    private _defaultConfig: IEngineConfig = this.createFallbackDefaultConfig();
    private _config: IEngineConfig = cloneDeep(this._defaultConfig);
    private _configInstance!: IBaseConfiguration;

    private get defaultConfig(): IEngineConfig {
        return cloneDeep(this._defaultConfig);
    }

    /**
     * 加载引擎包的 i18n 文件（.js CommonJS 模块）
     * 将 packages/engine/editor/i18n/{lang}/*.js 注册到 ENGINE.* 命名空间
     * 递归处理子目录（如 modules/physics.js → ENGINE.physics.*）
     */
    private _loadEngineI18n(enginePath: string) {
        const i18nDir = join(enginePath, 'editor', 'i18n');
        if (!existsSync(i18nDir)) {
            return;
        }

        const loadDir = (dir: string, lang: string, prefix: string) => {
            readdirSync(dir).forEach((entry) => {
                const fullPath = join(dir, entry);
                if (entry.endsWith('.js')) {
                    try {
                        const resolved = require.resolve(fullPath);
                        const data = require(resolved);
                        i18n.registerLanguagePatch(lang, prefix, data);
                    } catch (error) {
                        console.warn(`[i18n] Failed to load engine i18n: ${fullPath}`, error);
                    }
                } else if (statSync(fullPath).isDirectory()) {
                    loadDir(fullPath, lang, prefix);
                }
            });
        };

        for (const lang of ['zh', 'en']) {
            const langDir = join(i18nDir, lang);
            if (!existsSync(langDir)) {
                continue;
            }
            loadDir(langDir, lang, 'ENGINE');
        }
    }

    private createFallbackDefaultConfig(): IEngineConfig {
        const includeModules = [
            '2d',
            '3d',
            'debug-renderer',
            'affine-transform',
            'animation',
            'audio',
            'base',
            'custom-pipeline',
            'dragon-bones',
            'gfx-webgl',
            'graphics',
            'intersection-2d',
            'light-probe',
            'marionette',
            'mask',
            'particle',
            'particle-2d',
            'physics-2d-box2d',
            'physics-ammo',
            'primitive',
            'profiler',
            'rich-text',
            'skeletal-animation',
            'spine-3.8',
            'terrain',
            'tiled-map',
            'tween',
            'ui',
            'ui-skew',
            'video',
            'websocket',
            'webview'
        ];

        return {
            includeModules,
            flags: {
                LOAD_BULLET_MANUALLY: false,
                LOAD_SPINE_MANUALLY: false
            },
            physicsConfig: {
                gravity: { x: 0, y: -10, z: 0 },
                allowSleep: true,
                sleepThreshold: 0.1,
                autoSimulation: true,
                fixedTimeStep: 1 / 60,
                maxSubSteps: 1,
                defaultMaterial: '',
                useNodeChains: true,
                collisionMatrix: { 0: 1 },
                physicsEngine: '',
                physX: {
                    notPackPhysXLibs: false,
                    multiThread: false,
                    subThreadCount: 0,
                    epsilon: 0.0001,
                },
            },
            highQuality: false,
            customLayers: [],
            sortingLayers: [],
            macroCustom: [],
            // TODO 从 engine 内初始化
            macroConfig: {
                ENABLE_TILEDMAP_CULLING: true,
                TOUCH_TIMEOUT: 5000,
                ENABLE_TRANSPARENT_CANVAS: false,
                ENABLE_WEBGL_ANTIALIAS: true,
                ENABLE_FLOAT_OUTPUT: false,
                CLEANUP_IMAGE_CACHE: false,
                ENABLE_MULTI_TOUCH: true,
                MAX_LABEL_CANVAS_POOL_SIZE: 20,
                ENABLE_WEBGL_HIGHP_STRUCT_VALUES: false,
                BATCHER2D_MEM_INCREMENT: 144,
                [CUSTOM_PIPELINE_NAME_KEY]: DEFAULT_CUSTOM_PIPELINE_NAME,
            },
            graphics: deriveGraphicsConfigFromModules(includeModules),
            customJointTextureLayouts: [],
            splashScreen: {
                displayRatio: 1,
                totalTime: 2000,
                logo: {
                    type: 'default',
                    image: ''
                },
                background: {
                    type: 'default',
                    color: {
                        x: 0.0156862745098039,
                        y: 0.0352941176470588,
                        z: 0.0392156862745098,
                        w: 1
                    },
                    image: ''
                },
                watermarkLocation: 'default',
                autoFit: true
            },
            designResolution: {
                width: 1280,
                height: 720,
                fitWidth: true,
                fitHeight: false
            },
            downloadMaxConcurrency: 15,
            renderPipeline: 'fd8ec536-a354-4a17-9c74-4f3883c378c8',
            customPipeline: false,
        };
    }

    private resolveDefaultConfig(engineRoot: string): IEngineConfig {
        const fallbackConfig = this.createFallbackDefaultConfig();
        const contribution = getEngineDynamicConfigContribution({
            engineRoot,
            fallbackConfig: {
                includeModules: fallbackConfig.includeModules,
                flags: fallbackConfig.flags,
                macroConfig: fallbackConfig.macroConfig,
            },
        });
        const includeModules = contribution.defaults.includeModules;

        return {
            ...fallbackConfig,
            includeModules,
            flags: contribution.defaults.flags,
            macroConfig: ensureCustomPipelineMacroConfig(contribution.defaults.macroConfig),
            graphics: deriveGraphicsConfigFromModules(includeModules),
        };
    }

    private getSelectedModuleProjectConfig(projectConfig: IEngineProjectConfig) {
        if (!projectConfig.configs || Object.keys(projectConfig.configs).length === 0) {
            return undefined;
        }
        const globalConfigKey = projectConfig.globalConfigKey || Object.keys(projectConfig.configs)[0];
        return projectConfig.configs[globalConfigKey];
    }
    private createModuleConfigCache(): IModuleConfig {
        return {
            moduleDependMap: {},
            moduleDependedMap: {},
            nativeCodeModules: [],
            moduleCmakeConfig: {},
            features: {},
            moduleTreeDump: {
                default: {},
                categories: {},
            },
            ignoreModules,
            envLimitModule: {},
        };
    }

    private initModuleConfigCache(engineRoot: string) {
        try {
            this.initRenderConfig2ModuleConfigCache(getEngineRenderConfig(engineRoot));
        } catch (error) {
            // A missing or malformed custom-engine config must not leave a partially derived cache behind.
            this.moduleConfigCache = this.createModuleConfigCache();
            console.warn('[Engine] Failed to initialize engine module configuration from engine source.', error);
        }
    }

    private initRenderConfig2ModuleConfigCache(modulesInfo: ModuleRenderConfig) {
        // Build into a fresh object and publish it only when complete, avoiding stale or partial engine data.
        const moduleConfigCache = this.createModuleConfigCache();
        const moduleTreeDumpCategories: Record<string, CategoryDetail> = {};
        Object.entries(modulesInfo.categories).forEach(([key, category]) => {
            // render-config categories contain metadata only; `modules` belongs to the derived display tree.
            moduleTreeDumpCategories[key] = {
                ...cloneDeep(category),
                modules: {},
            };
        });

        const addModule = (key: string, moduleItem: IFeatureItem) => {
            moduleConfigCache.features[key] = moduleItem;

            if (moduleItem.cmakeConfig) {
                moduleConfigCache.moduleCmakeConfig[key] = {
                    native: moduleItem.cmakeConfig,
                };
            }
            if (moduleItem.isNativeModule) {
                moduleConfigCache.nativeCodeModules.push(key);
            }
            if (moduleItem.envCondition) {
                moduleConfigCache.envLimitModule[key] = {
                    envList: extractMacros(moduleItem.envCondition),
                    fallback: moduleItem.fallback,
                };
            }
            if (moduleItem.dependencies) {
                moduleConfigCache.moduleDependMap[key] = moduleItem.dependencies;
                moduleItem.dependencies.forEach((module) => {
                    moduleConfigCache.moduleDependedMap[module] = moduleConfigCache.moduleDependedMap[module] || [];
                    moduleConfigCache.moduleDependedMap[module].push(key);
                });
            }
        };
        const addModuleOrGroup = (key: string, moduleItem: IModuleItem) => {
            // Keep groups for the settings UI, while flattening their options for build-time lookups.
            moduleConfigCache.features[key] = moduleItem;
            if ('options' in moduleItem) {
                Object.entries(moduleItem.options).forEach(([moduleId, module]) => {
                    addModule(moduleId, module);
                });
            } else {
                addModule(key, moduleItem);
            }
        };

        Object.entries(modulesInfo.features).forEach(([key, moduleItem]) => {
            addModuleOrGroup(key, moduleItem);
            if (!ignoreModules.includes(key)) {
                if (moduleItem.category && moduleTreeDumpCategories[moduleItem.category]) {
                    moduleTreeDumpCategories[moduleItem.category].modules[key] = moduleItem;
                } else {
                    moduleConfigCache.moduleTreeDump.default[key] = moduleItem;
                }
            }
        });
        moduleConfigCache.moduleTreeDump.categories = moduleTreeDumpCategories;
        this.moduleConfigCache = moduleConfigCache;
    }

    private moduleConfigCache: IModuleConfig = this.createModuleConfigCache();

    get type() {
        return this._config.includeModules.includes('3d') ? '3d' : '2d';
    }

    getInfo() {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._info;
    }

    getConfig(useDefault?: boolean): IEngineConfig {
        if (useDefault) {
            return this.defaultConfig;
        }
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._config;
    }

    // TODO 对外开发一些 compile 已写好的接口

    /**
     * TODO 初始化配置等
     */
    async init(enginePath: string) {
        if (this._init) {
            return this;
        }
        this._info.typescript.builtin = this._info.typescript.path = enginePath;
        this._info.native.builtin = this._info.native.path = join(enginePath, 'native');
        this._info.version = await import(join(enginePath, 'package.json')).then((pkg) => pkg.version);
        this._info.tmpDir = join(enginePath, '.temp');
        this._loadEngineI18n(enginePath);
        this.initModuleConfigCache(this._info.typescript.path);
        this._defaultConfig = this.resolveDefaultConfig(this._info.typescript.path);
        const configInstance = await configurationRegistry.register('engine', {
            defaults: this.defaultConfig,
            nodes: () => createEngineMetadataNodes({
                defaultConfig: this.defaultConfig,
                engineRoot: this._info.typescript.path,
            }),
        });
        this._configInstance = configInstance;
        const syncConfig = () => {
            const projectConfig = configInstance.getAll() || {};
            const mergedConfig = merge(
                cloneDeep(configInstance.getDefaultConfig() || {}),
                projectConfig,
            ) as IEngineConfig & IEngineProjectConfig;
            const moduleConfig = this.getSelectedModuleProjectConfig(mergedConfig);

            if (moduleConfig) {
                if (!Object.prototype.hasOwnProperty.call(projectConfig, 'includeModules')) {
                    mergedConfig.includeModules = moduleConfig.includeModules;
                }
                if (!Object.prototype.hasOwnProperty.call(projectConfig, 'flags')) {
                    mergedConfig.flags = moduleConfig.flags;
                }
                if (!Object.prototype.hasOwnProperty.call(projectConfig, 'noDeprecatedFeatures')) {
                    mergedConfig.noDeprecatedFeatures = moduleConfig.noDeprecatedFeatures;
                }
            }
            mergedConfig.macroConfig = ensureCustomPipelineMacroConfig(mergedConfig.macroConfig);

            if (hasOwnConfigKey(projectConfig, 'graphics')) {
                mergedConfig.graphics = mergeGraphicsConfigWithModules(mergedConfig.includeModules, projectConfig.graphics);
                mergedConfig.includeModules = normalizeIncludeModulesWithGraphics(mergedConfig.includeModules, mergedConfig.graphics);
            } else if (hasOwnConfigKey(projectConfig, 'customPipeline')) {
                mergedConfig.graphics = deriveGraphicsConfigFromCustomPipeline(mergedConfig.customPipeline, mergedConfig.includeModules);
                mergedConfig.includeModules = normalizeIncludeModulesWithGraphics(mergedConfig.includeModules, mergedConfig.graphics);
            } else {
                mergedConfig.graphics = deriveGraphicsConfigFromModules(mergedConfig.includeModules);
            }

            const graphics = mergedConfig.graphics ?? deriveGraphicsConfigFromModules(mergedConfig.includeModules);
            mergedConfig.graphics = graphics;
            mergedConfig.customPipeline = graphics.pipeline === CUSTOM_PIPELINE_MODULE;
            this._config = mergedConfig;
        };
        syncConfig();
        configInstance.on('configuration:save', syncConfig);
        this._init = true;
        return this;
    }

    async importEditorExtensions() {

        // @ts-ignore
        globalThis.EditorExtends = await import('./editor-extends');
        // 注意：目前 utils 用的是 UUID，EditorExtends 用的是 Uuid 
        // @ts-ignore
        globalThis.EditorExtends.UuidUtils.compressUuid = globalThis.EditorExtends.UuidUtils.compressUUID;
    }

    async initEditorExtensions() {
        // @ts-ignore
        await globalThis.EditorExtends.init();
    }

    /**
     * 加载以及初始化引擎环境
     * @param info 初始化引擎数据
     * @param onBeforeGameInit - 在初始化之前需要做的工作
     * @param onAfterGameInit - 在初始化之后需要做的工作
     */
    async initEngine(info: IInitEngineInfo, onBeforeGameInit?: () => Promise<void>, onAfterGameInit?: () => Promise<void>) {
        const { default: preload } = await import('cc/preload');
        await this.importEditorExtensions();
        await preload({
            engineRoot: this._info.typescript.path,
            engineDev: join(this._info.typescript.path, 'bin', '.cache', 'dev-cli'),
            writablePath: info.writablePath,
            requiredModules: [
                'cc',
                'cc/editor/populate-internal-constants',
                'cc/editor/serialization',
                'cc/editor/new-gen-anim',
                'cc/editor/embedded-player',
                'cc/editor/reflection-probe',
                'cc/editor/lod-group-utils',
                'cc/editor/material',
                'cc/editor/2d-misc',
                'cc/editor/offline-mappings',
                'cc/editor/custom-pipeline',
                'cc/editor/animation-clip-migration',
                'cc/editor/exotic-animation',
                'cc/editor/color-utils',
            ]
        });
        await this.initEditorExtensions();

        const modules = this.getConfig().includeModules || [];
        const { physicsConfig, macroConfig, customLayers, sortingLayers, highQuality, renderPipeline, customPipeline, customJointTextureLayouts } = this.getConfig();
        const enableCustomPipeline = info.enableCustomPipeline ?? customPipeline;
        const bundles = assetManager.queryAssets({ isBundle: true }).map((item: any) => item.meta?.userData?.bundleName ?? item.name);
        const builtinAssets = info.serverURL && await this.queryInternalAssetList(this.getInfo().typescript.path);
        const resolvedCustomJointTextureLayouts = await resolveCustomJointTextureLayouts(customJointTextureLayouts);
        const defaultConfig = {
            debugMode: cc.debug.DebugMode.WARN,
            overrideSettings: {
                engine: {
                    builtinAssets: builtinAssets || [],
                    macros: macroConfig,
                    sortingLayers,
                    customLayers: customLayers.map((layer: any) => {
                        const index = layerMask.findIndex((num) => { return layer.value === num; });
                        return {
                            name: layer.name,
                            bit: index,
                        };
                    }),
                },
                profiling: {
                    showFPS: false,
                },
                screen: {
                    frameRate: 30,
                    exactFitScreen: true,
                },
                rendering: {
                    renderMode: 3,
                    renderPipeline,
                    customPipeline: enableCustomPipeline,
                    highQualityMode: highQuality,
                    ...(enableCustomPipeline && info.serverURL ? { effectSettingsPath: `${info.serverURL}/scripting/engine/effect-settings` } : {}),
                },
                animation: {
                    customJointTextureLayouts: resolvedCustomJointTextureLayouts,
                },
                physics: {
                    ...physicsConfig,
                    // 物理引擎如果没有明确设置，默认是开启的，因此需要明确定义为false
                    enabled: info.serverURL ? true : false,
                },
                assets: {
                    importBase: info.importBase,
                    nativeBase: info.nativeBase,
                    remoteBundles: ['internal', 'main'].concat(bundles),
                    server: info.serverURL,
                }
            },
            exactFitScreen: true,
        };
        cc.physics.selector.runInEditor = true;
        if (onBeforeGameInit) {
            await onBeforeGameInit();
        }
        await cc.game.init(defaultConfig);
        if (onAfterGameInit) {
            await onAfterGameInit();
        }

        let backend = 'builtin';
        let backend2d = 'builtin';
        modules.forEach((module: string) => {
            if (module in Backends) {
                // @ts-ignore
                backend = Backends[module];
            } else if (module in Backends2D) {
                // @ts-ignore
                backend2d = Backends2D[module];
            }
        });

        // 切换物理引擎
        cc.physics.selector.switchTo(backend);
        // 禁用计算，避免刚体在tick的时候生效
        // cc.physics.PhysicsSystem.instance.enable = false;

        // @ts-ignore
        // window.cc.internal.physics2d.selector.switchTo(backend2d);
        return this;
    }

    async getGameConfig(serverURL: string, importBase: string, nativeBase: string, isPreview?: boolean) {
        const { physicsConfig, macroConfig, customLayers, sortingLayers, highQuality, renderPipeline, customPipeline, customJointTextureLayouts } = this.getConfig();
        const bundles = assetManager.queryAssets({ isBundle: true }).map((item: any) => item.meta?.userData?.bundleName ?? item.name);
        const builtinAssets = serverURL && await this.queryInternalAssetList(this.getInfo().typescript.path);
        const resolvedCustomJointTextureLayouts = await resolveCustomJointTextureLayouts(customJointTextureLayouts);
        return {
            debugMode: cc.debug.DebugMode.WARN,
            overrideSettings: {
                engine: {
                    builtinAssets: builtinAssets || [],
                    macros: macroConfig,
                    sortingLayers,
                    customLayers: customLayers.map((layer: any) => {
                        const index = layerMask.findIndex((num) => { return layer.value === num; });
                        return {
                            name: layer.name,
                            bit: index,
                        };
                    }),
                },
                profiling: {
                    showFPS: isPreview ? true : false,
                },
                screen: {
                    frameRate: 30,
                    exactFitScreen: true,
                    designResolution: this.getConfig().designResolution,
                },
                rendering: {
                    renderMode: 2,
                    renderPipeline,
                    customPipeline,
                    highQualityMode: highQuality,
                    ...(customPipeline ? { effectSettingsPath: `${serverURL}/scripting/engine/effect-settings` } : {}),
                },
                animation: {
                    customJointTextureLayouts: resolvedCustomJointTextureLayouts,
                },
                physics: {
                    ...physicsConfig,
                    // 物理引擎如果没有明确设置，默认是开启的，因此需要明确定义为false
                    enabled: serverURL ? true : false,
                },
                assets: {
                    importBase: importBase,
                    nativeBase: nativeBase,
                    remoteBundles: ['internal', 'main'].concat(bundles),
                    server: serverURL,
                }
            },
            exactFitScreen: true,
        };
    }

    getModules(): string[] {
        return this.getConfig().includeModules || [];
    }

    async queryInternalAssetList(enginePath: string) {
        // 添加引擎依赖的预加载内置资源到主包内
        const ccConfigJson = await fse.readJSON(join(enginePath, 'cc.config.json'));
        const internalAssets: string[] = [];
        for (const featureName in ccConfigJson.features) {
            if (ccConfigJson.features[featureName].dependentAssets) {
                internalAssets.push(...ccConfigJson.features[featureName].dependentAssets);
            }
        }
        return Array.from(new Set(internalAssets));
    }

    /**
     * TODO
     * @returns 
     */
    queryModuleConfig() {
        return this.moduleConfigCache;
    }

    queryRenderConfig(): ModuleRenderConfig {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return getEngineRenderConfig(this._info.typescript.path);
    }

    queryLocalizedRenderConfig(): ModuleRenderConfig {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return getLocalizedEngineRenderConfig(this._info.typescript.path);
    }

    async queryJointTextureLayoutPreview(): Promise<IJointTextureLayoutPreviewResult> {
        const { customJointTextureLayouts } = this.getConfig();
        return createJointTextureLayoutPreview(customJointTextureLayouts);
    }

    async queryLayerBuiltin() {
        const { Layers } = await import('cc');

        const LAYER_NONE = 0;
        const LAYER_ALL = 0xffffffff;
        const entries = Object.entries(Layers.Enum) as [string, number][];

        return entries
            .filter(([, value]) => value !== LAYER_NONE && value !== LAYER_ALL)
            .map(([name, value]) => ({ name, value }));
    }

    async querySortingLayerBuiltin() {
        const { SortingLayers } = await import('cc');

        return SortingLayers.getBuiltinLayers();
    }
}

const Engine = new EngineManager();

export { Engine };

/**
 * 初始化 engine
 * @param enginePath
 * @param projectPath
 * @param serverURL
 */
export async function initEngine(enginePath: string, projectPath: string, serverURL?: string) {
    await Engine.init(enginePath);
    // 这里 importBase 与 nativeBase 用服务器是为了让服务器转换资源真实存放的路径
    await Engine.initEngine({
        serverURL: serverURL,
        importBase: serverURL ?? join(projectPath, 'library'),
        nativeBase: serverURL ?? join(projectPath, 'library'),
        writablePath: join(projectPath, 'temp'),
    });
}
