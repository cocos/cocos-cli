import { randomUUID } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { emptyDir, ensureDir, pathExists, readFile, remove, stat, writeFile } from 'fs-extra';
import { join, resolve } from 'path';
import treeKill from 'tree-kill';
import { GlobalPaths } from '../../global';
import {
    ResolutionPolicy,
    createArgs,
    getHostManifest,
    getSimulatorDir,
    getSimulatorResourcesPath,
    getSimulatorWritablePath,
    isReadyServerURL,
    markSessionStopped,
    normalizeServerURL,
    resolveEnginePath,
    resolvePreloadAssetList,
    resolvePrepareTargets,
    resolveRuntimeRoot,
    writeSimulatorConfig,
    validatePreviewOrigin,
    validateSimulatorOptions,
} from './internal';
import {
    assertRequiredSimulatorArtifacts,
    copyIfExists,
    renderApplicationScript,
    renderMainScript,
    writeRuntimeEngineBootstrap,
    writeSettingsFiles,
    type IPreviewData,
} from './runtime-writer';
import type {
    ISimulatorBuildState,
    ISimulatorLaunchPreviewOptions,
    ISimulatorLaunchPreviewResult,
    ISimulatorLogEntry,
    ISimulatorManifest,
    ISimulatorPrepareOptions,
    ISimulatorPreparedResources,
    ISimulatorResolution,
    ISimulatorSessionInfo,
    ISimulatorStartOptions,
} from './internal';

export type {
    ISimulatorBuildState,
    ISimulatorLaunchPreviewOptions,
    ISimulatorLaunchPreviewResult,
    ISimulatorLogEntry,
    ISimulatorManifest,
    ISimulatorPrepareOptions,
    ISimulatorPreparedResources,
    ISimulatorResolution,
    ISimulatorSessionInfo,
    ISimulatorStartOptions,
};

interface ISimulatorSessionRecord {
    child: ChildProcess | null;
    info: ISimulatorSessionInfo;
}

/** 事件名。对外一律通过 `onXxx(listener) => dispose` 暴露，不导出这些字面量。 */
const EVENT_SESSION = 'session';
const EVENT_LOG = 'log';
const EVENT_BUILD_STATE = 'build-state';

/**
 * 把子进程的一路输出按行拆开交给 `onLine`。
 *
 * 按行而不是按 chunk 是因为 `data` 事件的边界与换行无关，直接抛 chunk 会把一行日志
 * 劈成两个事件。尾部不完整的一段留在缓冲里，等下一个 chunk 或 `flush()`。
 */
function pipeLines(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): () => void {
    if (!stream) {
        return () => { /* 没有这一路输出，无需 flush */ };
    }

    let buffered = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? '';
        for (const line of lines) {
            onLine(line);
        }
        while (buffered.length > 65536) {
            onLine(buffered.slice(0, 65536));
            buffered = buffered.slice(65536);
        }
    });

    const flush = () => {
        if (buffered) {
            onLine(buffered);
            buffered = '';
        }
    };
    stream.once('end', flush);
    stream.once('close', flush);
    return flush;
}


async function resolveProjectPath(projectPath?: string): Promise<string> {
    if (projectPath) {
        return resolve(projectPath);
    }

    const [{ default: scripting }, { default: project }] = await Promise.all([
        import('../scripting'),
        import('../project'),
    ]);

    if (scripting.projectPath) {
        return resolve(scripting.projectPath);
    }
    if (project.path) {
        return resolve(project.path);
    }

    throw new Error('Simulator prepareResources requires an opened project. Pass projectPath explicitly or initialize scripting/project first.');
}

async function resolveServerURL(serverURL?: string): Promise<string> {
    if (serverURL !== undefined) {
        return validatePreviewOrigin(serverURL);
    }

    const { getServerUrl } = await import('../../server');
    const current = getServerUrl();
    if (!isReadyServerURL(current)) {
        throw new Error('Simulator prepareResources requires a running preview server. Pass serverURL explicitly or start the preview server first.');
    }
    return normalizeServerURL(current);
}

async function ensurePreviewServer(
    projectPath: string,
    options: Pick<ISimulatorLaunchPreviewOptions, 'serverURL' | 'port' | 'startScene'>,
): Promise<string> {
    const { getServerUrl } = await import('../../server');
    if (options.serverURL !== undefined) {
        return validatePreviewOrigin(options.serverURL);
    }

    let serverURL = getServerUrl();
    if (isReadyServerURL(serverURL)) {
        return normalizeServerURL(serverURL);
    }

    const { default: Launcher } = await import('../launcher');
    const launcher = new Launcher(projectPath);
    await launcher.startGamePreview({
        port: options.port,
        scene: options.startScene && options.startScene !== 'current_scene' ? options.startScene : undefined,
        open: false,
    });

    serverURL = getServerUrl();
    if (!isReadyServerURL(serverURL)) {
        throw new Error('Failed to start simulator preview server.');
    }
    return normalizeServerURL(serverURL);
}

async function resolvePreviewData(
    enginePath: string,
    startScene?: string,
    assetServerURL?: string,
): Promise<IPreviewData> {
    const builder = await import('../builder');
    const { fillIncludeModulesFromProjectConfig } = await import('../builder/share/common-options-validator');
    const { assetManager } = await import('../assets');
    const buildOptions = JSON.parse(JSON.stringify(
        await builder.queryDefaultBuildConfigByPlatform('windows'),
    ));
    buildOptions.debug = true;
    buildOptions.preview = true;
    await fillIncludeModulesFromProjectConfig(buildOptions as any);
    if (startScene) {
        buildOptions.startScene = startScene;
    }
    const allScenes = assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset' }) || [];
    buildOptions.scenes = allScenes.map((scene) => ({ url: scene.url, uuid: scene.uuid }));

    const result = await builder.getPreviewSettings(buildOptions);
    if (!(result && result.settings)) {
        throw new Error('Failed to generate simulator preview settings.');
    }

    const settings = JSON.parse(JSON.stringify(result.settings));
    const bundleConfigs = JSON.parse(JSON.stringify(result.bundleConfigs || []));
    // 与 editor simulator 保持一致：feature 集合完全取自预览 settings（由 getPreviewSettings
    // 按项目 includeModules 生成），不再与 Engine.getConfig().includeModules 求并集。
    // 求并集会把项目里关闭的模块（如 gfx-webgpu）重新写回 settings.engine.engineModules，
    // 使「配置 feature / 实际 runtime 产物 / bootstrap feature」三者不一致。
    const features = Array.isArray(settings.engine?.engineModules) ? settings.engine.engineModules : [];

    if (settings.splashScreen) {
        settings.splashScreen.totalTime = 0;
    }
    // 预览构建的 internal bundle 会收集「全部」feature 的 dependentAssets（见 bundle/index.ts
    // initBundleRootAssets），因为浏览器/场景编辑器预览跑的是完整引擎。simulator 不是：它的 cc
    // 索引由 preview server 的 quick-pack 按项目 feature 生成，未选中的模块根本不在 runtime 里。
    // 因此 builtinResMgr 预加载列表必须按 includeModules 裁剪，否则会去反序列化只有该模块才注册
    // 的类型，例如内置物理材质 default-physics-material 用的旧类名 `cc.PhysicMaterial`
    // （别名只在 physics-framework 的 deprecated.ts 注册），报
    // "Can not find class 'cc.PhysicMaterial'" 后抛 "Cannot set properties of null (setting '_uuid')"。
    if (Array.isArray(settings.engine?.builtinAssets)) {
        const allowed = new Set(await resolvePreloadAssetList(enginePath, buildOptions.includeModules || []));
        const kept = settings.engine.builtinAssets.filter((uuid: string) => allowed.has(uuid));
        const dropped = settings.engine.builtinAssets.length - kept.length;
        if (dropped > 0) {
            console.debug(`[Simulator] Dropped ${dropped} builtin preload asset(s) not covered by project modules.`);
        }
        settings.engine.builtinAssets = kept;
    }
    if (assetServerURL) {
        settings.assets.server = normalizeServerURL(assetServerURL);
        settings.assets.remoteBundles = [...(settings.assets.projectBundles || [])];
    }

    return {
        settings,
        bundleConfigs,
        features,
    };
}

async function resolveDefaultStartScene(): Promise<string> {
    try {
        const { assetManager } = await import('../assets');
        const scenes = assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset' });
        if (scenes && scenes.length) {
            const builder = await import('../builder');
            const config = await builder.queryDefaultBuildConfigByPlatform('windows');
            const candidates = [config.startScene, (config as any).packages?.windows?.startScene];
            for (const candidate of candidates) {
                const configured = scenes.find(scene => scene.uuid === candidate || scene.url === candidate);
                if (configured) return configured.uuid;
            }
            const projectScene = scenes.find((scene) => scene.url.startsWith('db://assets/'));
            return (projectScene || scenes[0]).uuid;
        }
        console.warn('[Simulator] No scene asset found in project; launch scene will be empty.');
    } catch (err) {
        console.warn('[Simulator] Failed to resolve default start scene:', err);
    }
    return '';
}

async function resolvePreviewSceneJson(
    previewSceneJson: ISimulatorPrepareOptions['previewSceneJson'],
    startScene: string,
): Promise<string> {
    if (typeof previewSceneJson === 'string') {
        return previewSceneJson;
    }
    if (previewSceneJson && typeof previewSceneJson === 'object') {
        return JSON.stringify(previewSceneJson, null, 2);
    }
    if (!startScene) {
        throw new Error('Simulator preview scene is unavailable. Provide startScene or previewSceneJson explicitly.');
    }
    if (startScene === 'current_scene') {
        throw new Error('Simulator preview for current unsaved scene requires previewSceneJson to be passed explicitly.');
    }

    const { assetManager } = await import('../assets');
    const scenePath = assetManager.queryPath(startScene);
    if (!scenePath || !(await pathExists(scenePath))) {
        throw new Error(`Unable to resolve simulator preview scene: ${startScene}`);
    }
    return await readFile(scenePath, 'utf8');
}


class SimulatorManager extends EventEmitter {
    private readonly _sessions = new Map<string, ISimulatorSessionRecord>();
    /**
     * 同一份产物目录上的写操作去重。构建脚本和 `prepareResources` 都是「清空再写」，
     * 并行跑两次结果不确定。先例见 `lib/mcp` 的 `registeringPromise ??= doRegisterMcp()`。
     */
    private readonly _inFlight = new Map<string, Promise<unknown>>();
    private _launchQueue: Promise<void> = Promise.resolve();
    // runtime 构建会重写引擎产物；准备资源与构建必须使用同一条读写队列。
    private _resourceQueue: Promise<void> = Promise.resolve();
    private _launchGeneration = 0;
    private readonly _stops = new Map<string, Promise<boolean>>();
    private readonly _buildChildren = new Set<ChildProcess>();
    private _projectPath = '';
    private _exitCleanupInstalled = false;

    /**
     * 由宿主（Pink 的 cocosHost 基类会在模块加载后自动调用）传入当前工程路径，
     * 之后 `prepareResources` / `launchPreview` 就不必每次都带 `projectPath`。
     */
    async init(projectPath: string): Promise<void> {
        this._projectPath = projectPath ? resolve(projectPath) : '';
    }

    /**
     * 会话状态变化：spawn 成功、首个 stdout（readyAt）、exit、error、stop 各一次。
     *
     * 对应 editor 的两个进程内监听：`simulatorProcess.on('close')`（用来关调试面板）和
     * `runSimulator(onCompleted)` 的首个 stdout 回调。合成一个事件是刻意的 ——
     * Pink 每个事件都要单独订阅 + 转发 + 声明 d.ts，而 `status` / `readyAt` / `exitCode`
     * 已经够区分这几种情形。
     */
    onDidChangeSession(listener: (session: ISimulatorSessionInfo) => void): () => void {
        this.on(EVENT_SESSION, listener);
        return () => {
            this.removeListener(EVENT_SESSION, listener);
        };
    }

    /** simulator 进程与构建脚本的逐行输出。对应 editor 的 stdout/stderr → console。 */
    onLog(listener: (entry: ISimulatorLogEntry) => void): () => void {
        this.on(EVENT_LOG, listener);
        return () => {
            this.removeListener(EVENT_LOG, listener);
        };
    }

    /** 构建开始 / 成功 / 失败。对应 editor 的 `programming:compile-start` / `compiled` 广播。 */
    onDidChangeBuildState(listener: (state: ISimulatorBuildState) => void): () => void {
        this.on(EVENT_BUILD_STATE, listener);
        return () => {
            this.removeListener(EVENT_BUILD_STATE, listener);
        };
    }

    private _emitSession(info: ISimulatorSessionInfo): void {
        this.emit(EVENT_SESSION, { ...info, args: [...info.args] });
    }

    private _emitLog(entry: ISimulatorLogEntry): void {
        this.emit(EVENT_LOG, entry);
    }

    private _emitBuildState(state: ISimulatorBuildState): void {
        this.emit(EVENT_BUILD_STATE, state);
    }

    private _dedupe<T>(key: string, task: () => Promise<T>): Promise<T> {
        const existing = this._inFlight.get(key) as Promise<T> | undefined;
        if (existing) {
            return existing;
        }
        const promise = task().finally(() => {
            this._inFlight.delete(key);
        });
        this._inFlight.set(key, promise);
        return promise;
    }

    private _withResources<T>(task: () => Promise<T>): Promise<T> {
        const operation = this._resourceQueue.then(task);
        this._resourceQueue = operation.then(() => undefined, () => undefined);
        return operation;
    }

    async getManifest(enginePath?: string): Promise<ISimulatorManifest | null> {
        const manifest = getHostManifest();
        if (!manifest) {
            return null;
        }

        const executablePath = join(getSimulatorDir(enginePath), manifest.entry);
        if (await pathExists(executablePath)) {
            const executableStat = await stat(executablePath);
            manifest.builtAt = executableStat.mtime.toISOString();
        }

        return manifest;
    }

    async isBuilt(enginePath?: string): Promise<boolean> {
        const manifest = await this.getManifest(enginePath);
        if (!manifest || manifest.platform !== process.platform) {
            return false;
        }

        return pathExists(join(getSimulatorDir(enginePath), manifest.entry));
    }

    getResourcesPath(enginePath?: string): string {
        return getSimulatorResourcesPath(enginePath);
    }

    getWritablePath(enginePath?: string): string {
        return getSimulatorWritablePath(enginePath);
    }

    async getExecutablePath(enginePath?: string): Promise<string | null> {
        const manifest = await this.getManifest(enginePath);
        if (!manifest || manifest.platform !== process.platform) {
            return null;
        }

        const executablePath = join(getSimulatorDir(enginePath), manifest.entry);
        return await pathExists(executablePath) ? executablePath : null;
    }

    /**
     * 跑一个构建脚本，广播 start / success / failed，并把逐行输出同时送进 `onLog` 和 console。
     *
     * stdio 从 `'inherit'` 改成 pipe 是为了能抛 `onLog`；`console.log` 那一行不能省——
     * 之前 inherit 时输出直接流到宿主 stdout（CLI 直跑的终端、或 Pink 的 cocosHost 日志），
     * 改 pipe 会把这条路断掉。
     */
    private async _runBuildScript(step: ISimulatorBuildState['step'], scriptName: string, enginePath?: string): Promise<void> {
        const generation = this._launchGeneration;
        const buildScript = join(GlobalPaths.workspace, 'workflow', scriptName);
        const resolvedEnginePath = resolveEnginePath(enginePath);
        const failure = step === 'native' ? 'Simulator build' : 'Simulator runtime build';

        this._emitBuildState({ step, state: 'start' });
        try {
            await new Promise<void>((resolvePromise, reject) => {
                const child = spawn(process.execPath, [buildScript, `--enginePath=${resolvedEnginePath}`], {
                    cwd: GlobalPaths.workspace,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: process.env,
                });
                this._buildChildren.add(child);
                this._installExitCleanup();

                const flushOut = pipeLines(child.stdout, (message) => {
                    this._emitLog({ source: 'build', level: 'log', message });
                    console.log(message);
                });
                const flushErr = pipeLines(child.stderr, (message) => {
                    this._emitLog({ source: 'build', level: 'error', message });
                    console.error(message);
                });

                child.on('error', (error) => {
                    this._buildChildren.delete(child);
                    flushOut();
                    flushErr();
                    reject(error);
                });
                child.on('close', (code) => {
                    this._buildChildren.delete(child);
                    flushOut();
                    flushErr();
                    if (code === 0) {
                        resolvePromise();
                    } else {
                        reject(new Error(`${failure} failed with exit code ${code}`));
                    }
                });
            });
            this._checkGeneration(generation);
        } catch (error) {
            this._emitBuildState({ step, state: 'failed', error: (error as Error).message });
            throw error;
        }
        this._emitBuildState({ step, state: 'success' });
    }

    async buildNative(enginePath?: string): Promise<void> {
        const resolvedEnginePath = resolveEnginePath(enginePath);
        const generation = this._launchGeneration;
        return this._dedupe(`build:native:${resolvedEnginePath}`, () => this._withResources(() => {
            this._checkGeneration(generation);
            return this._runBuildScript('native', 'build-simulator.js', resolvedEnginePath);
        }));
    }

    async buildRuntime(enginePath?: string): Promise<void> {
        const resolvedEnginePath = resolveEnginePath(enginePath);
        const generation = this._launchGeneration;
        return this._dedupe(`build:runtime:${resolvedEnginePath}`, () => this._withResources(() => {
            this._checkGeneration(generation);
            return this._runBuildScript('runtime', 'build-simulator-runtime.js', resolvedEnginePath);
        }));
    }

    async build(enginePath?: string): Promise<void> {
        const generation = this._launchGeneration;
        await this.buildNative(enginePath);
        this._checkGeneration(generation);
        await this.buildRuntime(enginePath);
    }

    /**
     * 准备 runtime 产物。
     *
     * 并发调用按输出目录去重：整个流程是「清空 assets / 删旧 cc.js / 重写 settings」，
     * 两次并行跑会互相踩，产物落到谁的中间态都不确定。去重后至少是「其中一次的完整结果」。
     * 需要两份互不干扰的产物时传不同的 `runtimeRoot`。
     */
    async prepareResources(options: ISimulatorPrepareOptions = {}): Promise<ISimulatorPreparedResources> {
        validateSimulatorOptions(options);
        const { runtimeRoot } = resolvePrepareTargets({
            ...options,
            enginePath: resolveEnginePath(options.enginePath),
        });
        return this._dedupe(`prepare:${runtimeRoot}`, () => this._withResources(() => this._prepareResources(options)));
    }

    private async _prepareResources(options: ISimulatorPrepareOptions = {}): Promise<ISimulatorPreparedResources> {
        const resolvedEnginePath = resolveEnginePath(options.enginePath);
        const executablePath = await this.getExecutablePath(resolvedEnginePath);
        if (!executablePath) {
            throw new Error('Native simulator executable is unavailable. Run `npm run build:simulator` first.');
        }
        await assertRequiredSimulatorArtifacts(resolvedEnginePath);

        const { runtimeRoot: resourcesPath, writablePath } = resolvePrepareTargets({
            ...options,
            enginePath: resolvedEnginePath,
        });
        const projectPath = await resolveProjectPath(options.projectPath || this._projectPath);
        const serverURL = await resolveServerURL(options.serverURL);
        const resolvedStartScene = options.startScene || await resolveDefaultStartScene();
        const previewData = await resolvePreviewData(resolvedEnginePath, resolvedStartScene, options.assetServerURL);
        const previewSceneJson = await resolvePreviewSceneJson(
            options.previewSceneJson,
            resolvedStartScene || previewData.settings?.launch?.launchScene || '',
        );

        await ensureDir(join(resourcesPath, 'jsb-adapter'));
        await emptyDir(join(resourcesPath, 'src', 'cocos-js'));
        await emptyDir(join(resourcesPath, 'assets'));
        // 旧版本会在这里生成 simulator 专用的 cc 索引模块；现已改为走 preview server 的
        // quick-pack 产物，遗留文件必须清掉，否则会被误当成引擎 feature unit 产物。
        await remove(join(resourcesPath, 'src', 'cocos-js', 'cc.js'));
        if (options.cleanCaches) {
            // 引擎的 gamecaches 落在 native 的 writable path 下。macOS 上 writablePath 就是
            // Resources；Windows 上是 %LOCALAPPDATA%/<App>/debugruntime，两处都要清。
            await emptyDir(join(resourcesPath, 'gamecaches'));
            if (resolve(writablePath) !== resolve(resourcesPath)) {
                await emptyDir(join(writablePath, 'gamecaches'));
            }
        }

        await writeRuntimeEngineBootstrap(resourcesPath, resolvedEnginePath);

        await copyIfExists(
            join(resolvedEnginePath, 'bin', 'adapter', 'native', 'web-adapter.js'),
            join(resourcesPath, 'jsb-adapter', 'web-adapter.js'),
        );
        await copyIfExists(
            join(resolvedEnginePath, 'bin', 'adapter', 'native', 'engine-adapter.js'),
            join(resourcesPath, 'jsb-adapter', 'engine-adapter.js'),
        );
        await copyIfExists(
            join(resolvedEnginePath, 'bin', 'native-preview'),
            join(resourcesPath, 'src', 'cocos-js'),
        );
        await copyIfExists(
            join(resolvedEnginePath, 'bin', 'simulator', 'import-map.json'),
            join(resourcesPath, 'src', 'import-map.json'),
        );
        await copyIfExists(
            join(resolvedEnginePath, 'bin', 'simulator', 'system.bundle.js'),
            join(resourcesPath, 'src', 'system.bundle.js'),
        );
        await copyIfExists(
            join(resolvedEnginePath, 'bin', 'simulator', 'polyfills.bundle.js'),
            join(resourcesPath, 'src', 'polyfills.bundle.js'),
        );

        const { assetManager } = await import('../assets');
        const effectBinPath = await assetManager.getEffectBinPath();
        await remove(join(resourcesPath, 'src', 'effect.bin'));
        if (effectBinPath) {
            await copyIfExists(effectBinPath, join(resourcesPath, 'src', 'effect.bin'));
        }

        await writeSettingsFiles(resourcesPath, previewData);

        const previewSceneJsonPath = join(resourcesPath, 'preview-scene.json');
        await writeFile(previewSceneJsonPath, previewSceneJson, 'utf8');

        const mainScriptPath = join(resourcesPath, 'main.js');
        const settingsPath = join(resourcesPath, 'src', 'settings.json');
        const applicationScriptPath = join(resourcesPath, 'src', 'application.js');
        const designResolution = previewData.settings?.screen?.designResolution || {
            width: options.resolution?.width || 960,
            height: options.resolution?.height || 640,
            policy: ResolutionPolicy.ResolutionShowAll,
        };
        await writeFile(mainScriptPath, await renderMainScript({
            serverURL,
            projectPath,
            waitForConnect: options.waitForConnect,
        }), 'utf8');

        await writeFile(applicationScriptPath, await renderApplicationScript({
            serverURL,
            projectPath,
            previewSceneJsonPath,
            designResolution,
        }), 'utf8');

        const configPaths = await writeSimulatorConfig([resourcesPath, writablePath], {
            waitForConnect: options.waitForConnect,
            landscape: options.landscape,
            resolution: options.resolution || {
                width: designResolution.width,
                height: designResolution.height,
            },
        });

        return {
            runtimeRoot: resourcesPath,
            writablePath,
            executablePath,
            projectPath,
            serverURL,
            previewSceneJsonPath,
            settingsPath,
            mainScriptPath,
            applicationScriptPath,
            configPath: configPaths[0],
            configPaths,
        };
    }

    /**
     * 单实例预览入口：**先停掉现有会话再起新的**。
     *
     * 对齐 editor —— `runSimulator` 第一句就是 `stopSimulatorProcess()`
     * （`app/builtin/preview/source/browser/simulator.ts:100`），所以它既是「启动」也是「重启」，
     * 调试面板改分辨率 / 朝向走的就是 `restart-simulator` → `runSimulator()`。
     *
     * 停在 `prepareResources` **之前**也是照 editor 的顺序：准备流程会清空并重写 runtime 目录，
     * 而正在跑的 simulator 正打开着那批文件（Windows 上会直接锁住）。
     */
    async launchPreview(options: ISimulatorLaunchPreviewOptions = {}): Promise<ISimulatorLaunchPreviewResult> {
        validateSimulatorOptions(options);
        const generation = this._launchGeneration;
        const launch = this._launchQueue.then(() => this._launchPreview(options, generation));
        // 保留每个请求的参数，并让一次失败不会阻塞后续启动。
        this._launchQueue = launch.then(() => undefined, () => undefined);
        return launch;
    }

    private _checkGeneration(generation: number): void {
        if (generation !== this._launchGeneration) throw new Error('Simulator launch cancelled.');
    }

    private async _launchPreview(options: ISimulatorLaunchPreviewOptions, generation: number): Promise<ISimulatorLaunchPreviewResult> {
        this._checkGeneration(generation);
        await this._stopRunning();
        this._checkGeneration(generation);

        const projectPath = await resolveProjectPath(options.projectPath || this._projectPath);
        const serverURL = await ensurePreviewServer(projectPath, options);
        const prepared = await this.prepareResources({
            ...options,
            projectPath,
            serverURL,
        });
        this._checkGeneration(generation);
        const session = await this.start({
            enginePath: options.enginePath,
            runtimeRoot: prepared.runtimeRoot,
            writablePath: prepared.writablePath,
            entryFile: 'main.js',
            searchPaths: options.searchPaths,
            resolution: options.resolution,
            scale: options.scale,
            landscape: options.landscape,
            portrait: options.portrait,
            showConsole: options.showConsole,
            debugLogFile: options.debugLogFile,
            position: options.position,
            bindAddress: options.bindAddress,
            env: options.env,
        });

        return {
            prepared,
            session,
        };
    }

    async start(options: ISimulatorStartOptions): Promise<ISimulatorSessionInfo> {
        validateSimulatorOptions(options);
        const generation = this._launchGeneration;
        const resolvedEnginePath = resolveEnginePath(options.enginePath);
        const executablePath = await this.getExecutablePath(resolvedEnginePath);
        if (!executablePath) {
            throw new Error('Native simulator executable is unavailable. Run `npm run build:simulator` first.');
        }

        const runtimeRoot = resolveRuntimeRoot({
            ...options,
            enginePath: resolvedEnginePath,
        });
        const args = createArgs({
            ...options,
            enginePath: resolvedEnginePath,
            runtimeRoot,
        });
        this._checkGeneration(generation);
        const child = spawn(executablePath, args, {
            cwd: runtimeRoot,
            // 必须 pipe：native simulator 的 JS 报错、`cc.log`、引擎日志全走这两路。
            // 之前是 `'ignore'`，等于把唯一的调试通道丢掉了。editor 同样是 piped + console
            // （`simulator.ts:295-304`）。
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                ...options.env,
            },
        });

        let spawnConfirmed = false;
        const spawned = new Promise<void>((resolveSpawn, rejectSpawn) => {
            child.once('spawn', () => {
                spawnConfirmed = true;
                child.off('error', rejectSpawn);
                resolveSpawn();
            });
            child.once('error', rejectSpawn);
        });
        const id = randomUUID();
        const info: ISimulatorSessionInfo = {
            id,
            pid: child.pid,
            status: 'running',
            startedAt: new Date().toISOString(),
            runtimeRoot,
            enginePath: resolvedEnginePath,
            executablePath,
            args,
        };

        // editor 判定「起来了」用的就是首个 stdout 数据（`simulator.ts:296` 的 firstMetrics），
        // 这里挂在原始 `data` 上而不是 pipeLines 的整行回调，免得首段输出不含换行时判定被推迟。
        child.stdout?.once('data', () => {
            const record = this._sessions.get(id);
            if (!record || record.info.readyAt) {
                return;
            }
            record.info.readyAt = new Date().toISOString();
            this._emitSession(record.info);
        });

        const flushOut = pipeLines(child.stdout, (message) => {
            this._emitLog({ source: 'simulator', level: 'log', message, sessionId: id });
            console.log(message);
        });
        const flushErr = pipeLines(child.stderr, (message) => {
            this._emitLog({ source: 'simulator', level: 'error', message, sessionId: id });
            console.error(message);
        });

        child.on('close', () => {
            flushOut(); flushErr();
            const record = this._sessions.get(id);
            if (record) record.child = null;
        });
        child.on('exit', (code, signal) => {
            const record = this._sessions.get(id);
            if (!record) {
                return;
            }
            markSessionStopped(record.info, code, signal);
            this._emitSession(record.info);
        });

        child.on('error', (error) => {
            flushOut();
            flushErr();
            const record = this._sessions.get(id);
            if (!record) {
                return;
            }
            if (!spawnConfirmed) markSessionStopped(record.info, -1, null);
            console.error('[Simulator] failed to start:', error);
            this._emitLog({ source: 'simulator', level: 'error', message: `failed to start: ${error.message}`, sessionId: id });
            this._emitSession(record.info);
        });

        this._sessions.set(id, { child, info });

        this._installExitCleanup();
        await spawned;
        this._emitSession(info);
        if (generation !== this._launchGeneration) {
            await this.stop(id);
            this._checkGeneration(generation);
        }
        return { ...info, args: [...info.args] };
    }

    async stop(id: string): Promise<boolean> {
        const pending = this._stops.get(id);
        if (pending) return pending;
        const operation = this._stop(id).finally(() => this._stops.delete(id));
        this._stops.set(id, operation);
        return operation;
    }

    private async _stop(id: string): Promise<boolean> {
        const record = this._sessions.get(id);
        if (!record || record.info.status !== 'running' || !record.child) return false;
        await this._terminate(record.child, () => record.info.status === 'running');
        return true;
    }

    private async _terminate(child: ChildProcess, isRunning: () => boolean): Promise<void> {
        for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
            if (!isRunning()) return;
            const exited = await new Promise<boolean>((resolveExit) => {
                const done = () => { clearTimeout(timer); resolveExit(true); };
                const timer = setTimeout(() => {
                    child.off('exit', done);
                    resolveExit(false);
                }, 3000);
                child.once('exit', done);
                if (child.pid) {
                    // 完成条件是 exit；taskkill/pgrep 的回调不会阻塞整个停止操作。
                    try { treeKill(child.pid, signal, () => {}); } catch { /* 超时后升级终止 */ }
                }
            });
            if (exited || !isRunning()) return;
        }
        throw new Error(`Failed to stop simulator process ${child.pid}; process exit was not confirmed.`);
    }

    /**
     * 停掉所有还在跑的会话，返回实际停掉的个数。
     *
     * editor 没有对应物（它退出时压根不清理），但 Pink 的 cocosHost 是按工程拉起的
     * utility process，关工程 / 切工程就会被杀，频率远高于 editor 退出。见
     * `docs/simulator-pink-interface.md` 6.1。
     */
    async stopAll(): Promise<number> {
        ++this._launchGeneration;
        const [stopped] = await Promise.all([
            this._stopRunning(),
            ...[...this._buildChildren].map(child => this._terminate(child, () => this._buildChildren.has(child))),
        ]);
        return stopped;
    }

    private async _stopRunning(): Promise<number> {
        const runningIds = Array.from(this._sessions.values())
            .filter((record) => record.info.status === 'running')
            .map((record) => record.info.id);
        const stopped = await Promise.all(runningIds.map((id) => this.stop(id)));
        return stopped.filter(Boolean).length;
    }

    /**
     * 正常 exit 时尽力清理。SIGKILL/强制终止不会执行此回调；宿主应先调用 stopAll。
     * 而 POSIX 下父进程被杀不会连带杀子进程 —— simulator 窗口会留着、5086 调试端口被占。
     *
     * exit 回调里不能 await，所以只能同步 `process.kill(pid, 'SIGKILL')`，拿不到 treeKill
     * 的进程树能力，属于 best-effort。优雅退出请显式调 {@link stopAll}。
     * 挂载放在 `start()` 里而不是构造函数，免得只 import 这个模块也白挂一个监听。
     */
    private _installExitCleanup(): void {
        if (this._exitCleanupInstalled) {
            return;
        }
        this._exitCleanupInstalled = true;
        process.on('exit', () => {
            for (const child of this._buildChildren) {
                if (child.pid) { try { process.kill(child.pid, 'SIGKILL'); } catch { /* already exited */ } }
            }
            for (const record of this._sessions.values()) {
                if (record.info.status !== 'running' || !record.info.pid) {
                    continue;
                }
                try {
                    process.kill(record.info.pid, 'SIGKILL');
                } catch {
                    // 已经退了，无所谓
                }
            }
        });
    }

    getStatus(id: string): ISimulatorSessionInfo | null {
        const record = this._sessions.get(id);
        return record ? { ...record.info, args: [...record.info.args] } : null;
    }

    listSessions(): ISimulatorSessionInfo[] {
        return Array.from(this._sessions.values()).map((record) => ({ ...record.info, args: [...record.info.args] }));
    }
}

export const simulatorManager = new SimulatorManager();
