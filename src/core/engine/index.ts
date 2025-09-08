
// 临时配置的引擎路径
import { QuickCompiler } from '@editor/quick-compiler';
import { StatsQuery } from '@cocos/ccbuild';
import { editorBrowserslistQuery } from '@editor/lib-programming/dist/utils';
import { dirname, join } from 'path';
import { emptyDir, ensureDir, outputFile, readFile, readJSONSync } from 'fs-extra';
import { IFeatureItem, IModuleItem, ModuleRenderConfig } from './@types/modules';

/**
 * 整合 engine 的一些编译、配置读取等功能
 */

type IFlags = Record<string, boolean | number>;

interface IPhysicsConfig {
    gravity: IVec3Like; // （0，-10， 0）
    allowSleep: boolean; // true
    sleepThreshold: number; // 0.1，最小 0
    autoSimulation: boolean; // true
    fixedTimeStep: number; // 1 / 60 ，最小 0
    maxSubSteps: number; // 1，最小 0
    defaultMaterial?: string; // 物理材质 uuid
    useNodeChains: boolean; // true
    collisionMatrix: ICollisionMatrix;
    physicsEngine: string;
    physX?: {
        notPackPhysXLibs: boolean;
        multiThread: boolean;
        subThreadCount: number;
        epsilon: number;
    };
}

// 物理配置
interface ICollisionMatrix {
    [x: string]: number;
}

interface IVec3Like {
    x: number;
    y: number;
    z: number;
}

interface IPhysicsMaterial {
    friction: number; // 0.5
    rollingFriction: number; // 0.1
    spinningFriction: number; // 0.1
    restitution: number; // 0.1
}
/**
 * TODO 引擎配置文件
 */
export interface EngineConfig {
    includedModules: string[];
    physics: IPhysicsConfig;
    macroConfig?: Record<string, string | number | boolean>;
    sortingLayers: { id: number, name: string, value: number }[];
    layers: { name: string, value: number }[];
    flags?: IFlags;
    renderPipeline?: string;
    // 是否使用自定义管线，如与其他模块配置不匹配将会以当前选项为准
    customPipeline?: boolean;
    highQuality: boolean;
}

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}

export interface EngineInfo {
    path: string;
    tmpDir: string;
    version: string;
}
export interface InitEngineInfo {
    importBase: string;
    nativeBase: string;
}
const VERSION = '3';
const ENGIN_PATH = '/Users/wzm/Documents/wzm/creator/cocos-editor380/resources/3d/engine';
const TEMP_ENGINE_CONFIG: any = { "configs": { "defaultConfig": { "name": "默认配置", "cache": { "base": { "_value": true }, "gfx-webgl": { "_value": true }, "gfx-webgl2": { "_value": false }, "gfx-webgpu": { "_value": false }, "animation": { "_value": true }, "skeletal-animation": { "_value": true }, "3d": { "_value": true }, "meshopt": { "_value": false }, "2d": { "_value": true }, "sorting-2d": { "_value": false }, "rich-text": { "_value": true }, "mask": { "_value": true }, "graphics": { "_value": true }, "ui-skew": { "_value": true }, "affine-transform": { "_value": true }, "ui": { "_value": true }, "particle": { "_value": true }, "physics": { "_value": true, "_option": "physics-physx" }, "physics-ammo": { "_value": true, "_flags": { "LOAD_BULLET_MANUALLY": false } }, "physics-cannon": { "_value": false }, "physics-physx": { "_value": false, "_flags": { "LOAD_PHYSX_MANUALLY": false } }, "physics-builtin": { "_value": false }, "physics-2d": { "_value": true, "_option": "physics-2d-box2d" }, "physics-2d-box2d": { "_value": true }, "physics-2d-box2d-wasm": { "_value": false, "_flags": { "LOAD_BOX2D_MANUALLY": false } }, "physics-2d-builtin": { "_value": false }, "physics-2d-box2d-jsb": { "_value": false }, "intersection-2d": { "_value": true }, "primitive": { "_value": true }, "profiler": { "_value": true }, "occlusion-query": { "_value": false }, "geometry-renderer": { "_value": false }, "debug-renderer": { "_value": false }, "particle-2d": { "_value": true }, "audio": { "_value": true }, "video": { "_value": true }, "webview": { "_value": true }, "tween": { "_value": true }, "websocket": { "_value": true }, "websocket-server": { "_value": false }, "terrain": { "_value": true }, "light-probe": { "_value": true }, "tiled-map": { "_value": true }, "vendor-google": { "_value": false }, "spine": { "_value": true, "_option": "spine-3.8" }, "spine-3.8": { "_value": true, "_flags": { "LOAD_SPINE_MANUALLY": false } }, "spine-4.2": { "_value": false, "_flags": { "LOAD_SPINE_MANUALLY": false } }, "dragon-bones": { "_value": true }, "marionette": { "_value": true }, "procedural-animation": { "_value": true }, "custom-pipeline-post-process": { "_value": false }, "render-pipeline": { "_value": true, "_option": "custom-pipeline" }, "custom-pipeline": { "_value": true }, "legacy-pipeline": { "_value": false }, "xr": { "_value": false } }, "flags": { "LOAD_BULLET_MANUALLY": false, "LOAD_SPINE_MANUALLY": false, "LOAD_PHYSX_MANUALLY": false }, "includeModules": ["2d", "3d", "affine-transform", "animation", "audio", "base", "custom-pipeline", "dragon-bones", "gfx-webgl", "graphics", "intersection-2d", "light-probe", "marionette", "mask", "particle", "particle-2d", "physics-2d-box2d", "physics-physx", "primitive", "procedural-animation", "profiler", "rich-text", "skeletal-animation", "spine-3.8", "terrain", "tiled-map", "tween", "ui", "ui-skew", "video", "websocket", "webview"], "noDeprecatedFeatures": { "value": false, "version": "" } } }, "globalConfigKey": "defaultConfig", "graphics": { "pipeline": "custom-pipeline", "custom-pipeline-post-process": false } };
interface IRebuildOptions {
    debugNative?: boolean;
    isNativeScene?: boolean;
}

type IEnvLimitModule = Record<string, {
    envList: string[];
    fallback?: string;
}>

class Engine {
    _init: boolean = false;
    _info: EngineInfo = {
        path: '',
        tmpDir: '',
        version: '',
    }

    get info() {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._info;
    }

    _config: EngineConfig = {
        includedModules: [],
        physics: {
            gravity: { x: 0, y: -10, z: 0 },
            allowSleep: true,
            sleepThreshold: 0.1,
            autoSimulation: true,
            fixedTimeStep: 1 / 60,
            maxSubSteps: 1,
            defaultMaterial: '',
            useNodeChains: true,
            collisionMatrix: { '0': 1 },
            physicsEngine: '',
            physX: {
                notPackPhysXLibs: false,
                multiThread: false,
                subThreadCount: 0,
                epsilon: 0.0001,
            },
        },
        highQuality: false,
        layers: [],
        sortingLayers: [],
    }

    get config() {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._config;
    }

    /**
     * TODO 初始化配置等
     */
    async init(enginePath: string) {
        if (this._init) {
            return;
        }
        this._info.path = enginePath;
        this._init = true;
    }

    private busy: boolean = false;
    private compiler: QuickCompiler | null = null;
    private editorFeaturesCache: string[] = [];
    private outDir: string = '';
    private statsQuery: StatsQuery | null = null;


    async compile(force: boolean = false): Promise<void> {
        // TODO 编译引擎
        this.outDir = join(this.info.path, 'bin', '.cache', 'dev-cli');
        // 发布之后不需要编译内置引擎
        // 开始第一次编译引擎
        const versionFile = join(this.outDir, 'VERSION');

        let needClear = false;
        try {
            const version = await readFile(versionFile, 'utf8');
            if (version !== VERSION) {
                needClear = true;
            }
        } catch {
            needClear = true;
        }
        this.compiler = await this.generateCompiler();
        const isNativeScene = false;

        const debugNative = false;

        if (needClear) {
            console.debug('[EditorQuickCompiler]Version information lost.');
            await emptyDir(this.outDir);
        } else {
            console.debug('[EditorQuickCompiler]Version information looks good.');
        }
        if ((needClear || force) && !process.argv.includes('--no-quick-compile')) {
            await this.rebuild({ isNativeScene, debugNative });
        } else {
            console.debug('Note, quick compiler does not get launched.');
        }

        this.statsQuery = this.statsQuery || await StatsQuery.create(this.info.path);
    }

    async generateCompiler(options?: { isNative?: boolean }): Promise<QuickCompiler> {
        const logFile = join(this.info.path, 'bin', '.cache', 'logs', 'log.txt');
        if (logFile) {
            await ensureDir(dirname(logFile));
        }
        this.statsQuery = this.statsQuery || await StatsQuery.create(this.info.path);
        let allFeatures = this.statsQuery.getFeatures();
        // Spine Hack Begin
        // 先移除 spine 所有版本
        allFeatures = allFeatures.filter((f) => !f.startsWith('spine-'));
        //todo:暂时只打包 spine 3.8，迁移差不多完成后再支持其他版本
        allFeatures.push('spine-3.8');
        /* if (Editor) {
            // 编辑器状态下，可以选择切换 spine 版本
            const engineModule = (await Editor.Profile.getProject('engine', 'modules'));
            const moduleConfig = engineModule?.configs[engineModule.globalConfigKey];

            const includeModules: string[] | undefined = moduleConfig?.includeModules ?? [];
            const spineVersion = includeModules?.find((m) => m.startsWith('spine-'));
            if (spineVersion) {
                allFeatures.push(spineVersion);
            } else {
                // Fallback to spine 3.8
                allFeatures.push('spine-3.8');
            }
        } else {
            编辑器打包默认只打 spine 3.8 版本
            allFeatures.push('spine-3.8');
        } */
        // Spine Hack End
        const env: StatsQuery.ConstantManager.ConstantOptions = {
            platform: 'HTML5',
            mode: 'EDITOR',
            flags: {
                DEBUG: true,
            },
        };
        const featureUnitPrefix = 'cce:/internal/x/cc-fu/'; // cc-fu -> cc feature unit
        if (options?.isNative) {
            env.platform = 'NATIVE';
            if (process.platform === 'win32') {
                env.platform = 'WINDOWS';
            } else if (process.platform === 'darwin') {
                env.platform = 'MAC';
            } else {
                console.error(`Unsupported platform: ${process.platform}`);
            }

            const editorFeatures = await this.filterEngineModules(env, allFeatures);
            this.editorFeaturesCache.push(...editorFeatures);
            const nativeOutDir = join(this.info.path, 'bin/.editor');
            return new QuickCompiler({
                rootDir: this.info.path,
                outDir: nativeOutDir,
                platform: env.platform,
                targets: [{
                    featureUnitPrefix,
                    dir: nativeOutDir,
                    format: 'systemjs',
                    targets: 'node 10',
                    loose: true,
                    includeEditorExports: true,
                    includeIndex: {
                        features: editorFeatures,
                    },
                    loader: true,
                }],
                logFile,
            });
        } else {
            const editorFeatures = await this.filterEngineModules(env, allFeatures);
            this.editorFeaturesCache.push(...editorFeatures);
            const conf = {
                rootDir: this.info.path,
                outDir: this.outDir,
                platform: env.platform,
                targets: [
                    {
                        featureUnitPrefix,
                        dir: join(this.outDir, 'editor'),
                        format: 'systemjs',
                        // inlineSourceMap: true,
                        // 使用 indexed source map 加快编译速度：
                        // 见 https://github.com/cocos-creator/3d-tasks/issues/4720
                        // indexedSourceMap: true,
                        usedInElectron509: true,
                        targets: editorBrowserslistQuery,
                        includeIndex: {
                            features: editorFeatures,
                        },
                        loader: true, // 编辑器里没有 SystemJS，所以需要生成 loader
                        loose: true, // TODO(cjh): 当前 ccbuild 构建强制使用了 loose 模式且后面一个 preview target 也是强制开启，先把当前 editor target 也开启 loose 模式，临时修复 Though the "loose" option was set to "false" in your @babel/preset-env config ... 问题。后续需要考虑使用项目设置中的「宽松模式」设置选项。
                    },
                    {
                        featureUnitPrefix,
                        dir: join(this.outDir, 'preview'),
                        format: 'systemjs',
                        loose: true,
                        // indexedSourceMap: true,
                    },
                ],
                logFile,
            };
            console.log(JSON.stringify(conf))
            return new QuickCompiler({
                rootDir: this.info.path,
                outDir: this.outDir,
                platform: env.platform,
                targets: [
                    {
                        featureUnitPrefix,
                        dir: join(this.outDir, 'editor'),
                        format: 'systemjs',
                        // inlineSourceMap: true,
                        // 使用 indexed source map 加快编译速度：
                        // 见 https://github.com/cocos-creator/3d-tasks/issues/4720
                        // indexedSourceMap: true,
                        usedInElectron509: true,
                        targets: editorBrowserslistQuery,
                        includeIndex: {
                            features: editorFeatures,
                        },
                        loader: true, // 编辑器里没有 SystemJS，所以需要生成 loader
                        loose: true, // TODO(cjh): 当前 ccbuild 构建强制使用了 loose 模式且后面一个 preview target 也是强制开启，先把当前 editor target 也开启 loose 模式，临时修复 Though the "loose" option was set to "false" in your @babel/preset-env config ... 问题。后续需要考虑使用项目设置中的「宽松模式」设置选项。
                    },
                    {
                        featureUnitPrefix,
                        dir: join(this.outDir, 'preview'),
                        format: 'systemjs',
                        loose: true,
                        // indexedSourceMap: true,
                    },
                ],
                logFile,
            });
        }
    }
    // TODO 目前引擎分离、engine 插件内部都需要这个过滤功能，需要统一复用
    async filterEngineModules(envOptions: StatsQuery.ConstantManager.ConstantOptions, features: string[]) {
        const engineStatsQuery = await StatsQuery.create(this.info.path);
        const ccEnvConstants = engineStatsQuery.constantManager.genCCEnvConstants(envOptions);
        const envLimitModule = this.queryEnvLimitModule();
        const moduleToFallBack: Record<string, string> = {};
        Object.keys(envLimitModule).forEach((moduleId: string) => {
            if (!features.includes(moduleId)) {
                return;
            }
            const { envList, fallback } = envLimitModule[moduleId];
            const enable = envList.some((env) => ccEnvConstants[env as keyof StatsQuery.ConstantManager.CCEnvConstants]);
            if (enable) {
                return;
            }
            moduleToFallBack[moduleId] = fallback || '';
            if (fallback) {
                features.splice(features.indexOf(moduleId), 1, fallback);
            } else {
                features.splice(features.indexOf(moduleId), 1);
            }
        });
        return features;
    }

    async rebuild(options?: IRebuildOptions) {
        if (options?.isNativeScene === undefined) {
            options ??= {};
            options.isNativeScene = await this.getIsSceneNative();
            if (options.isNativeScene) {
                options.debugNative = await this.getIsDebugNative();
            }

        }
        if (!this.compiler || (options?.isNativeScene)) {
            await this.compileEngine(this.info.path, true);
            return;
        }
        if (this.busy) {
            console.error('Compile engine fails: The compilation is in progress');
            return;
        }
        this.busy = true;
        console.log('Start Quick Compile');
        const time = Date.now();
        if (!this.compiler) {
            this.busy = false;
            console.error('Compile engine fails: The compiler does not exist.');
            return;
        }
        try {
            // if (options.isNativeScene) {
            //     await this.rebuildNativeImportMap();
            //     await this.generateEngineAddon(options);
            //     await this.updateAdapter();
            // }
            await this.compiler.build();
            await this.rebuildImportMaps();
            const versionFile = join(this.outDir, 'VERSION');
            await outputFile(versionFile, VERSION, { encoding: 'utf8' });

            // eslint-disable-next-line no-useless-catch
        } catch (error) {
            throw error;

        } finally {
            console.log('Quick Compile: ' + (Date.now() - time) + 'ms');
            this.busy = false;
        }
    }

    async compileEngine(directory: string, force?: boolean, options?: IRebuildOptions) {
        this.info.path = directory;
        this.outDir = join(directory, 'bin', '.cache', 'dev-cli');
        // 发布之后不需要编译内置引擎
        // 开始第一次编译引擎
        const versionFile = join(this.outDir, 'VERSION');

        let needClear = false;
        try {
            const version = await readFile(versionFile, 'utf8');
            if (version !== VERSION) {
                needClear = true;
            }
        } catch {
            needClear = true;
        }
        this.compiler = await this.generateCompiler();
        const isNativeScene = options && options.isNativeScene && await this.getIsSceneNative();

        const debugNative = false;

        if (needClear) {
            console.debug('[EditorQuickCompiler]Version information lost.');
            await emptyDir(this.outDir);
        } else {
            console.debug('[EditorQuickCompiler]Version information looks good.');
        }
        if ((needClear || debugNative || force) && !process.argv.includes('--no-quick-compile')) {
            await this.rebuild({ isNativeScene, debugNative });
        } else {
            console.debug('Note, quick compiler does not get launched.');
        }

        this.statsQuery = this.statsQuery || await StatsQuery.create(this.info.path);
    }

    async getIsSceneNative(): Promise<boolean> {
        return false;
    }

    async getIsDebugNative(): Promise<boolean> {
        return false;
    }

    queryEnvLimitModule() {
        const modulesInfo: ModuleRenderConfig = readJSONSync(join(this.info.path, 'editor', 'engine-features', 'render-config.json'));

        const envLimitModule: IEnvLimitModule = {};
        const stepModule = (moduleKey: string, moduleItem: IFeatureItem) => {
            if (moduleItem.envCondition) {
                envLimitModule[moduleKey] = {
                    envList: this.extractMacros(moduleItem.envCondition),
                    fallback: moduleItem.fallback,
                };
            }
        };
        function addModuleOrGroup(moduleKey: string, moduleItem: IModuleItem) {
            if ('options' in moduleItem) {
                Object.entries(moduleItem.options).forEach(([optionKey, optionItem]) => {
                    stepModule(optionKey, optionItem);
                });
            } else {
                stepModule(moduleKey, moduleItem);
            }
        }
        Object.entries(modulesInfo.features).forEach(([moduleKey, moduleItem]) => {
            addModuleOrGroup(moduleKey, moduleItem);
        });

        return envLimitModule;
    }
    async rebuildImportMaps() {
        if (!this.compiler) {
            return;
        }

        const editorShippedFeatures = this.editorFeaturesCache;
        await this.rebuildTargetImportMap(
            this.compiler,
            0,
            editorShippedFeatures,
        );

        const previewShippedFeatures = await this.getPreviewShippedFeatures();
        await this.rebuildTargetImportMap(
            this.compiler,
            1,
            previewShippedFeatures,
        );
    }
    async rebuildTargetImportMap(compiler: QuickCompiler, targetIndex: number, features: string[], platform?: string, mode?: string, out?: string) {
        const configurableFlags = await this.getConfigurableFlagsOfFeatures(features);
        await compiler.buildImportMap(
            targetIndex, features, {
            mode,
            platform,
            out,
            features,
            configurableFlags,
        },
        );
    }

    async getConfigurableFlagsOfFeatures(features: string[]) {
        const flags: Record<string, unknown> = {};
        const EngineModulesConfig = TEMP_ENGINE_CONFIG;
        const featureFlagsQuery = EngineModulesConfig.configs[EngineModulesConfig.globalConfigKey].flags;
        if (featureFlagsQuery) {
            for (const [feature, configurableFeatureFlags] of Object.entries(featureFlagsQuery)) {
                if (features.includes(feature)) {
                    Object.assign(flags, configurableFeatureFlags);
                }
            }
        }
        return flags;
    }

    async getPreviewShippedFeatures() {
        const EngineModulesConfig = TEMP_ENGINE_CONFIG;
        const engineModules = EngineModulesConfig.configs[EngineModulesConfig.globalConfigKey].includeModules;
        return engineModules || [];
    }

    extractMacros(expression: string): string[] {
        return expression.split('||').map(match => match.trim().substring(1));
    }

    /**
     * 加载以及初始化引擎环境
     */
    async initEngine(info: InitEngineInfo) {
        // @ts-ignore
        window.CC_PREVIEW = false;
        // 加载引擎
        const { default: preload } = await import('cc/preload');
        await preload({
            requiredModules: [
                'cc',
                'cc/editor/populate-internal-constants',
                'cc/editor/serialization',
                'cc/editor/animation-clip-migration',
                'cc/editor/exotic-animation',
                'cc/editor/new-gen-anim',
                'cc/editor/offline-mappings',
                'cc/editor/embedded-player',
                'cc/editor/color-utils',
                'cc/editor/custom-pipeline',
            ],
        });

        // @ts-ignore
        // window.cc.debug._resetDebugSetting(cc.DebugMode.INFO);
        newConsole.trackTimeEnd('asset-db:require-engine-code', { output: true });

        const modules = this.config.includedModules || [];
        let physicsEngine = '';
        const engineList = ['physics-cannon', 'physics-ammo', 'physics-builtin', 'physics-physx'];
        for (let i = 0; i < engineList.length; i++) {
            if (modules.indexOf(engineList[i]) >= 0) {
                physicsEngine = engineList[i];
                break;
            }
        }
        const { physics, macroConfig, layers, sortingLayers, highQuality } = this.config;
        const customLayers = layers.map((layer: any) => {
            const index = layerMask.findIndex((num) => { return layer.value === num; });
            return {
                name: layer.name,
                bit: index,
            };
        });
        const defaultConfig = {
            debugMode: cc.debug.DebugMode.WARN,
            overrideSettings: {
                engine: {
                    builtinAssets: [],
                    macros: macroConfig,
                    sortingLayers,
                    customLayers,
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
                    highQualityMode: highQuality,
                },
                physics: {
                    ...physics,
                    physicsEngine,
                    enabled: false,
                },
                assets: {
                    importBase: info.importBase,
                    nativeBase: info.nativeBase,
                },
            },
            exactFitScreen: true,
        };
        cc.physics.selector.runInEditor = true;
        await cc.game.init(defaultConfig);
    }
}

export default new Engine();
