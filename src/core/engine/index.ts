
// 临时配置的引擎路径
import { QuickCompiler } from '@editor/quick-compiler';
import { StatsQuery } from '@cocos/ccbuild';
import { editorBrowserslistQuery } from '@editor/lib-programming/dist/utils';
import { dirname, join } from 'path';
import { emptyDir, ensureDir, outputFile, readFile, readJSONSync } from 'fs-extra';
import { IFeatureItem, IModuleItem, ModuleRenderConfig } from './@types/modules';
import { EngineCompile, EngineCompiler } from './compiler';

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
    private _init: boolean = false;
    private _info: EngineInfo = {
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

    get config() {
        if (!this._init) {
            throw new Error('Engine not init');
        }
        return this._config;
    }

    private _compiler!: EngineCompiler;
    // TODO 对外开发一些 compile 已写好的接口

    /**
     * TODO 初始化配置等
     */
    async init(enginePath: string) {
        if (this._init) {
            return;
        }
        this._info.path = enginePath;
        this._compiler = EngineCompiler.create(enginePath);
        this._init = true;
    }

    /**
     * 加载以及初始化引擎环境
     */
    async initEngine(info: InitEngineInfo) {
        // @ts-ignore
        window.CC_PREVIEW = false;
        // 加载引擎
        // const { default: preload } = await import('cc/preload');
        // await preload({
        //     requiredModules: [
        //         'cc',
        //         'cc/editor/populate-internal-constants',
        //         'cc/editor/serialization',
        //         'cc/editor/animation-clip-migration',
        //         'cc/editor/exotic-animation',
        //         'cc/editor/new-gen-anim',
        //         'cc/editor/offline-mappings',
        //         'cc/editor/embedded-player',
        //         'cc/editor/color-utils',
        //         'cc/editor/custom-pipeline',
        //     ],
        // });

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
