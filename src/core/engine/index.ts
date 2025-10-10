import { EngineInfo } from './@types/public';
import { EngineConfig, InitEngineInfo, MakeRequired } from './@types/config';
import { IModuleConfig } from './@types/modules';
import { join } from 'path';
import { configurationManager, configurationRegistry, IBaseConfiguration } from '../configuration';

/**
 * 整合 engine 的一些编译、配置读取等功能
 */

export interface IEngine {
    getInfo(): EngineInfo;
    getConfig(): EngineConfig;
    init(enginePath: string): Promise<this>;
    initEngine(info: InitEngineInfo): Promise<this>;
}

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}

// TODO issue 记录： https://github.com/cocos/3d-tasks/issues/18489 后续完善
// 后处理管线模块的开关，在图像设置那边处理 (说是 3.9 会彻底删除)
// 所以界面上的 勾选动作 和 状态判断 都要忽略这个列表的数据，从 3.8.6 开始我将这个 ignoreKeys 改成 ignoreModules 从 视图层移到主进程
// 直接在数据源上过滤掉，减少 视图层的判断
const ignoreModules = ['custom-pipeline-post-process'];
class Engine implements IEngine {
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
    }
    private _config: EngineConfig = this.defaultConfig;
    private _configInstance!: IBaseConfiguration;

    private get defaultConfig(): EngineConfig {
        return {
            includeModules: [
                '2d',
                '3d',
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
            ],
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
                BATCHER2D_MEM_INCREMENT: 144
            },
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
                        'x': 0.0156862745098039,
                        'y': 0.0352941176470588,
                        'z': 0.0392156862745098,
                        'w': 1
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
        };
    }

    /**
     * TODO init data in register project modules
     */
    private moduleConfigCache: IModuleConfig = {
        moduleDependMap: {}, // 依赖关系
        moduleDependedMap: {}, // 被依赖的关系
        nativeCodeModules: [], // 原生模块(构建功能需要用到)
        moduleCmakeConfig: {}, // 模块的 cmake 配置 3.8.6 从 moduleConfig 挪到这边
        features: {}, // 引擎提供的所有选项(包括选项的 options)
        // 用于界面渲染的数据
        moduleTreeDump: {
            default: {},
            categories: {},
        },
        ignoreModules: ignoreModules,
        envLimitModule: {}, // 记录有环境限制的模块数据
    };

    getInfo() {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._info;
    }

    getConfig(useDefault?: boolean): EngineConfig {
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
        this._configInstance = await configurationRegistry.register('engine', this.defaultConfig);
        this._init = true;
        this._config = await this._configInstance.get('');
        return this;
    }

    async initEditorExtensions() {
        // @ts-ignore
        globalThis.EditorExtends = await import('./editor-extends');
        // 注意：目前 Editor.Utils 用的是 UUID，EditorExtends 用的是 Uuid 
        // @ts-ignore
        globalThis.EditorExtends.UuidUtils.compressUuid = globalThis.EditorExtends.UuidUtils.compressUUID;
        // @ts-ignore
        await globalThis.EditorExtends.init();
    }

    /**
     * 加载以及初始化引擎环境
     */
    async initEngine(info: InitEngineInfo) {
        // @ts-ignore - cc/preload is a dynamic module
        const { default: preload } = await import('cc/preload');
        await preload({
            engineRoot: this._info.typescript.path,
            engineDev: join(this._info.typescript.path, 'bin', '.cache', 'dev-cli'),
            writablePath: info.writablePath,
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
            ]
        });
        await this.initEditorExtensions();

        // @ts-ignore
        // window.cc.debug._resetDebugSetting(cc.DebugMode.INFO);
        //newConsole.trackTimeEnd('asset-db:require-engine-code', { output: true });

        const modules = this.getConfig().includedModules || [];
        let physicsEngine = '';
        const engineList = ['physics-cannon', 'physics-ammo', 'physics-builtin', 'physics-physx'];
        for (let i = 0; i < engineList.length; i++) {
            if (modules.indexOf(engineList[i]) >= 0) {
                physicsEngine = engineList[i];
                break;
            }
        }
        const { physicsConfig, macroConfig, customLayers, sortingLayers, highQuality } = this.getConfig();
        const defaultConfig = {
            debugMode: cc.debug.DebugMode.WARN,
            overrideSettings: {
                engine: {
                    builtinAssets: [],
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
                    highQualityMode: highQuality,
                },
                physics: {
                    ...physicsConfig,
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
        return this;
    }

    /**
     * TODO
     * @returns 
     */
    queryModuleConfig() {
        return this.moduleConfigCache;
    }
}

export default new Engine();
