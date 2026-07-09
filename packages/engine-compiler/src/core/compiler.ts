import { QuickCompiler } from '@cocos/quick-compiler';
import { StatsQuery } from '@cocos/ccbuild';
import { editorBrowserslistQuery } from '@cocos/lib-programming/dist/utils';
import * as ps from 'path';
import * as fsExtra from 'fs-extra';
import { IFeatureItem, IModuleItem, ModuleRenderConfig } from './modules';
import { fixImportMapExtensions } from './import-map-utils';

const VERSION = '3';
const TEMP_ENGINE_CONFIG: any = { configs: { defaultConfig: { name: '默认配置', cache: { base: { _value: true }, 'gfx-webgl': { _value: true }, 'gfx-webgl2': { _value: false }, 'gfx-webgpu': { _value: false }, animation: { _value: true }, 'skeletal-animation': { _value: true }, '3d': { _value: true }, meshopt: { _value: false }, '2d': { _value: true }, 'sorting-2d': { _value: false }, 'rich-text': { _value: true }, mask: { _value: true }, graphics: { _value: true }, 'ui-skew': { _value: true }, 'affine-transform': { _value: true }, ui: { _value: true }, particle: { _value: true }, physics: { _value: true, _option: 'physics-physx' }, 'physics-ammo': { _value: true, _flags: { LOAD_BULLET_MANUALLY: false } }, 'physics-cannon': { _value: false }, 'physics-physx': { _value: false, _flags: { LOAD_PHYSX_MANUALLY: false } }, 'physics-builtin': { _value: false }, 'physics-2d': { _value: true, _option: 'physics-2d-box2d' }, 'physics-2d-box2d': { _value: true }, 'physics-2d-box2d-wasm': { _value: false, _flags: { LOAD_BOX2D_MANUALLY: false } }, 'physics-2d-builtin': { _value: false }, 'physics-2d-box2d-jsb': { _value: false }, 'intersection-2d': { _value: true }, primitive: { _value: true }, profiler: { _value: true }, 'occlusion-query': { _value: false }, 'geometry-renderer': { _value: false }, 'debug-renderer': { _value: false }, 'particle-2d': { _value: true }, audio: { _value: true }, video: { _value: true }, webview: { _value: true }, tween: { _value: true }, websocket: { _value: true }, 'websocket-server': { _value: false }, terrain: { _value: true }, 'light-probe': { _value: true }, 'tiled-map': { _value: true }, 'vendor-google': { _value: false }, spine: { _value: true, _option: 'spine-3.8' }, 'spine-3.8': { _value: true, _flags: { LOAD_SPINE_MANUALLY: false } }, 'spine-4.2': { _value: false, _flags: { LOAD_SPINE_MANUALLY: false } }, 'dragon-bones': { _value: true }, marionette: { _value: true }, 'procedural-animation': { _value: true }, 'custom-pipeline-post-process': { _value: false }, 'render-pipeline': { _value: true, _option: 'custom-pipeline' }, 'custom-pipeline': { _value: true }, 'legacy-pipeline': { _value: false }, xr: { _value: false } }, flags: { LOAD_BULLET_MANUALLY: false, LOAD_SPINE_MANUALLY: false, LOAD_PHYSX_MANUALLY: false }, includeModules: ['2d', '3d', 'affine-transform', 'animation', 'audio', 'base', 'custom-pipeline', 'dragon-bones', 'gfx-webgl', 'graphics', 'intersection-2d', 'light-probe', 'marionette', 'mask', 'particle', 'particle-2d', 'physics-2d-box2d', 'physics-physx', 'primitive', 'procedural-animation', 'profiler', 'rich-text', 'skeletal-animation', 'spine-3.8', 'terrain', 'tiled-map', 'tween', 'ui', 'ui-skew', 'video', 'websocket', 'webview'], noDeprecatedFeatures: { value: false, version: '' } } }, globalConfigKey: 'defaultConfig', graphics: { pipeline: 'custom-pipeline', 'custom-pipeline-post-process': false } };
interface IRebuildOptions {
    debugNative?: boolean;
    isNativeScene?: boolean;
}

type IEnvLimitModule = Record<string, {
    envList: string[];
    fallback?: string;
}>

export class EngineCompiler {
    private busy: boolean = false;
    private compiler: QuickCompiler | null = null;
    private editorFeaturesCache: string[] = [];
    private outDir: string = '';
    private statsQuery: StatsQuery | null = null;
    private isWeb: boolean;

    private constructor(
        private enginePath: string,
        isWeb: boolean = false,
    ) {
        this.outDir = ps.join(enginePath, 'bin', '.cache', 'dev-cli');
        this.isWeb = isWeb;
    }

    public getOutDir(): string {
        return this.outDir;
    }

    static create(path: string, isWeb?: boolean) {
        return new EngineCompiler(path, isWeb);
    }

    async compile(force: boolean = false): Promise<void> {
        // 发布之后不需要编译内置引擎
        // 开始第一次编译引擎
        const versionFile = ps.join(this.outDir, 'VERSION');

        let needClear = false;
        try {
            const version = await fsExtra.readFile(versionFile, 'utf8');
            if (version !== VERSION) {
                needClear = true;
            }
        } catch {
            needClear = true;
        }
        this.compiler = await this.generateCompiler({ isWebview: this.isWeb });
        const isNativeScene = false;

        const debugNative = false;

        if (needClear) {
            console.debug('[EditorQuickCompiler]Version information lost.');
            await this.clear();
        } else {
            console.debug('[EditorQuickCompiler]Version information looks good.');
        }
        if ((needClear || force) && !process.argv.includes('--no-quick-compile')) {
            await this.rebuild({ isNativeScene, debugNative });
        } else {
            console.debug('Note, quick compiler does not get launched.');
        }

        this.statsQuery = this.statsQuery || await StatsQuery.create(this.enginePath);
    }

    async generateCompiler(options?: { isNative?: boolean, isWebview?: boolean }): Promise<QuickCompiler> {
        const logFile = ps.join(this.enginePath, 'bin', '.cache', 'logs', 'log.txt');
        if (logFile) {
            await fsExtra.ensureDir(ps.dirname(logFile));
        }
        this.statsQuery = this.statsQuery || await StatsQuery.create(this.enginePath);
        let allFeatures = this.statsQuery.getFeatures();
        // Spine Hack Begin
        // 先移除 spine 所有版本
        allFeatures = allFeatures.filter((f) => !f.startsWith('spine-'));
        // dev-cli 预览 / 场景编辑器引擎：同时编入 spine-3.8 与 spine-4.2，配合 cc.config.json 的
        // moduleOverrides（SPINE_3_8 && SPINE_4_2 → spine-*-dynamic.ts）实现运行时按 cocos.config.json
        // 选定 spine 版本（改配置 + 硬刷新即生效，无需重编引擎）。两份 spine WASM/asm external 都会被编入。
        // 注意：这里是 dev-cli 引擎编译器，与项目构建引擎（src/core/builder/.../separate-engine.ts）是
        // 两条独立管线；项目构建仍按 includeModules 编译期单版本，产物包体不受影响。
        allFeatures.push('spine-3.8');
        allFeatures.push('spine-4.2');
        // Spine Hack End
        const env: StatsQuery.ConstantManager.ConstantOptions = {
            platform: 'NODEJS',
            mode: 'EDITOR',
            flags: {
                DEBUG: true,
            },
        };
        if (options?.isWebview) {
            env.platform = 'HTML5'; // Webview targeting HTML5 platform
        }

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
            const nativeOutDir = ps.join(this.enginePath, 'bin/.editor');
            return new QuickCompiler({
                rootDir: this.enginePath,
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
            const outputDir = options?.isWebview ? ps.join(this.outDir, 'web') : ps.join(this.outDir, 'editor');

            return new QuickCompiler({
                rootDir: this.enginePath,
                outDir: outputDir,
                platform: env.platform,
                targets: [
                    {
                        featureUnitPrefix,
                        dir: outputDir,
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
                ],
                logFile,
            });
        }
    }
    // TODO 目前引擎分离、engine 插件内部都需要这个过滤功能，需要统一复用
    async filterEngineModules(envOptions: StatsQuery.ConstantManager.ConstantOptions, features: string[]) {
        const engineStatsQuery = await StatsQuery.create(this.enginePath);
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
            await this.compileEngine(this.enginePath, true);
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
            await this.updateAdapter();
            await this.compiler.build();
            await this.rebuildImportMaps();
            const versionFile = ps.join(this.outDir, 'VERSION');
            await fsExtra.outputFile(versionFile, VERSION, { encoding: 'utf8' });

            // eslint-disable-next-line no-useless-catch
        } catch (error) {
            throw error;

        } finally {
            console.log('Quick Compile: ' + (Date.now() - time) + 'ms');
            this.busy = false;
        }
    }

    async clear() {
        try {
            const clearPath = ps.join(this.outDir, this.isWeb ? 'web' : 'editor');
            await fsExtra.remove(clearPath);
        } catch (error) { }
    }

    async compileEngine(directory: string, force?: boolean, options?: IRebuildOptions) {
        this.enginePath = directory;
        // this.outDir = join(directory, 'bin', '.cache', 'dev-cli'); // Removed to avoid overriding constructor-init outDir
        // 开始第一次编译引擎
        const versionFile = ps.join(this.outDir, 'VERSION');

        let needClear = false;
        try {
            const version = await fsExtra.readFile(versionFile, 'utf8');
            if (version !== VERSION) {
                needClear = true;
            }
        } catch {
            needClear = true;
        }
        this.compiler = await this.generateCompiler({ isWebview: this.isWeb });
        const isNativeScene = options && options.isNativeScene && await this.getIsSceneNative();

        const debugNative = false;

        if (needClear) {
            console.debug('[EditorQuickCompiler] Version information lost.');
            await this.clear();
        } else {
            console.debug('[EditorQuickCompiler] Version information looks good.');
        }
        if ((needClear || debugNative || force) && !process.argv.includes('--no-quick-compile')) {
            await this.rebuild({ isNativeScene, debugNative });
        } else {
            console.debug('Note, quick compiler does not get launched.');
        }

        this.statsQuery = this.statsQuery || await StatsQuery.create(this.enginePath);
    }

    async getIsSceneNative(): Promise<boolean> {
        return false;
    }

    async getIsDebugNative(): Promise<boolean> {
        return false;
    }

    queryEnvLimitModule() {
        const modulesInfo: ModuleRenderConfig = fsExtra.readJSONSync(ps.join(this.enginePath, 'editor', 'engine-features', 'render-config.json'));

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

    async updateAdapter() {
        try {
            let isSuccess = true;

            const nativeOutDir = ps.join(this.enginePath, 'bin/.editor');
            const webAdapter = ps.join(this.enginePath, 'bin/adapter/nodejs/web-adapter.js');
            if (!fsExtra.existsSync(nativeOutDir)) {
                fsExtra.mkdirSync(nativeOutDir);
            }
            if (fsExtra.existsSync(webAdapter)) {
                const output = ps.join(nativeOutDir, 'web-adapter.js');
                fsExtra.copyFileSync(webAdapter, output);
            } else {
                isSuccess = false;
                console.error(`${webAdapter} not exist, please build engine first`);
            }
            const engineAdapter = ps.join(this.enginePath, 'bin/adapter/nodejs/engine-adapter.js');
            if (fsExtra.existsSync(engineAdapter)) {
                fsExtra.copyFileSync(engineAdapter, ps.join(nativeOutDir, 'engine-adapter.js'));
            } else {
                isSuccess = false;
                console.error(`${engineAdapter} not exist, please build engine first`);
            }
            if (isSuccess) {
                console.log('update adapter success');
            } else {
                console.error('update adapter failed');
            }

            return Promise.resolve();
        } catch (error) {
            console.error(error);
            return Promise.reject(error);
        }
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

        // const previewShippedFeatures = await this.getPreviewShippedFeatures();
        // await this.rebuildTargetImportMap(
        //     this.compiler,
        //     1,
        //     previewShippedFeatures,
        // );
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
        // 修正 import-map 中无扩展名的模块映射(见 import-map-utils）。
        // quick-compiler 的 buildImportMap 直接用 cc.config override 字符串生成映射值：override
        // 无扩展名(如 pal/*)时生成的 q-bundled URL 也无扩展名，与 bundle 里以 .js 注册的模块
        // 错位，编辑器/预览的静态 import-map 运行期会 fetch 无扩展名 URL 失败。这里补成 .js。
        const outputDir = this.isWeb ? ps.join(this.outDir, 'web') : ps.join(this.outDir, 'editor');
        await fixImportMapExtensions(ps.join(outputDir, 'import-map.json'), this.enginePath);
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
}