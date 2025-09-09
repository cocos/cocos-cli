
import { EngineCompiler } from './compiler';
import { EngineInfo } from './@types/public';
import { EngineConfig, InitEngineInfo } from './@types/private';

/**
 * 整合 engine 的一些编译、配置读取等功能
 */

export interface IEngine {
    getInfo (): EngineInfo;
    getConfig (): EngineConfig;
    getCompiler(): EngineCompiler;
    init(enginePath: string): Promise<this>;
    initEngine(info: InitEngineInfo): Promise<this>;
}

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}

class Engine implements IEngine {
    private _init: boolean = false;
    private _info: EngineInfo = {
        path: '',
        tmpDir: '',
        version: '',
    }
    private _config: EngineConfig = {
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
    private _compiler: EngineCompiler | null = null;

    getInfo() {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._info;
    }

    getConfig() {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._config;
    }

    getCompiler(): EngineCompiler {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        this._compiler = this._compiler || EngineCompiler.create(this._info.path);
        return this._compiler;
    }

    // TODO 对外开发一些 compile 已写好的接口

    /**
     * TODO 初始化配置等
     */
    async init(enginePath: string) {
        if (this._init) {
            return this;
        }
        this._info.path = enginePath;
        this._compiler = EngineCompiler.create(enginePath);
        this._init = true;

        return this;
    }

    /**
     * 加载以及初始化引擎环境
     */
    async initEngine(info: InitEngineInfo) {
        // window.CC_PREVIEW = false;
        const { default: preload } = await import('./modules/cc/preload');
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

        const modules = this.getConfig().includedModules || [];
        let physicsEngine = '';
        const engineList = ['physics-cannon', 'physics-ammo', 'physics-builtin', 'physics-physx'];
        for (let i = 0; i < engineList.length; i++) {
            if (modules.indexOf(engineList[i]) >= 0) {
                physicsEngine = engineList[i];
                break;
            }
        }
        const { physics, macroConfig, layers, sortingLayers, highQuality } = this.getConfig();
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

        return this;
    }
}

export default new Engine();
