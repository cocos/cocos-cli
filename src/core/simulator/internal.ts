/**
 * Simulator 的纯逻辑部分：平台产物表、路径推导、命令行参数、`config.json` 生成、
 * 内置预加载资源裁剪。
 *
 * 这些函数被单独放在这里是为了能在任意宿主平台上做单元测试（尤其是 Windows 分支，
 * 见 `tests/simulator-manager.test.ts`）：凡是依赖 `process.platform` /
 * `process.env.LOCALAPPDATA` 的地方都改成从 {@link ISimulatorHostEnv} 取，
 * 默认值仍然是当前进程的真实环境。
 */

import { readJSON, ensureDir, writeFile } from 'fs-extra';
import { isAbsolute, join, resolve } from 'path';
import { GlobalPaths } from '../../global';

export type SimulatorStatus = 'running' | 'stopped';

export enum ResolutionPolicy {
    ResolutionExactFit,
    ResolutionNoBorder,
    ResolutionShowAll,
    ResolutionFixedHeight,
    ResolutionFixedWidth,
}

/** 宿主平台下 native simulator 可执行文件的产物元信息。 */
export interface ISimulatorManifest {
    /** 宿主平台。 */
    platform: NodeJS.Platform;
    /** 产物名（darwin 是 `SimulatorApp-Mac.app`，win32 是 `SimulatorApp-Win32.exe`）。 */
    bundle: string;
    /** 可执行文件相对产物根目录的路径。 */
    entry: string;
    /** 可执行文件构建时间（ISO 字符串），由 `getManifest` 读 mtime 填充。 */
    builtAt?: string;
}

export interface ISimulatorResolution {
    width: number;
    height: number;
}

export interface ISimulatorPrepareOptions {
    enginePath?: string;
    projectPath?: string;
    /** HTTP(S) origin；不支持路径前缀、查询参数、片段或凭据。 */
    serverURL?: string;
    /**
     * 覆盖 runtime 产物的输出目录。
     *
     * 默认（不传）行为不变：写进 simulator 自己的资源目录（macOS 是 app bundle 的
     * `Contents/Resources`，Windows 是 `Release/`），也就是**不做多实例隔离**。
     *
     * 传了之后 `prepareResources` 只会往这个目录写，不再碰 app bundle。目前主要用途是
     * 让 `prepareResources` 可以在测试里端到端跑一遍而不覆盖开发者准备好的 runtime；
     * 未来做多实例隔离时也是从这里接入。
     *
     * 注意：native 可执行文件仍然从 `enginePath` 下的 Release 目录取，不受此项影响。
     */
    runtimeRoot?: string;
    /**
     * 覆盖 `config.json` 的第二个写入目录（对应 native 的 `-writable-path`）。
     *
     * 不传时：未覆盖 {@link runtimeRoot} 就用平台真实的 writable path（Windows 上是
     * `%LOCALAPPDATA%/SimulatorApp-Win32/debugruntime`）；已覆盖 runtimeRoot 则跟随
     * runtimeRoot，避免沙箱化的准备流程反过来写进真实的用户目录。
     */
    writablePath?: string;
    /**
     * 覆盖运行时资源服务器。指定后 simulator 会把项目 bundle 当作远程 bundle，
     * 通过 HTTP 从该地址拉取。
     */
    assetServerURL?: string;
    startScene?: string;
    /** 未保存 / 当前编辑场景的显式场景 JSON。 */
    previewSceneJson?: string | Record<string, unknown>;
    waitForConnect?: boolean;
    resolution?: ISimulatorResolution;
    landscape?: boolean;
    cleanCaches?: boolean;
}

export interface ISimulatorPreparedResources {
    runtimeRoot: string;
    writablePath: string;
    executablePath: string;
    projectPath: string;
    serverURL: string;
    previewSceneJsonPath: string;
    settingsPath: string;
    mainScriptPath: string;
    applicationScriptPath: string;
    /**
     * 主 `config.json` 路径（runtimeRoot 下的那一份）。
     */
    configPath: string;
    /**
     * 实际写入的全部 `config.json` 路径。Windows 上除 runtimeRoot 外还包含
     * `%LOCALAPPDATA%/SimulatorApp-Win32/debugruntime`。
     */
    configPaths: string[];
}

export interface ISimulatorStartOptions {
    runtimeRoot?: string;
    enginePath?: string;
    entryFile?: string;
    writablePath?: string;
    searchPaths?: string[];
    resolution?: ISimulatorResolution;
    scale?: number;
    landscape?: boolean;
    portrait?: boolean;
    showConsole?: boolean;
    debugLogFile?: string;
    position?: { x: number; y: number };
    bindAddress?: string;
    env?: Record<string, string | undefined>;
}

export interface ISimulatorSessionInfo {
    id: string;
    pid?: number;
    status: SimulatorStatus;
    startedAt?: string;
    /**
     * 进程产出第一行 stdout 的时刻。对齐 editor 的 `runSimulator(onCompleted)` —— 它也是在
     * 首个 stdout 数据上判定「起来了」（`app/builtin/preview/source/browser/simulator.ts:296`）。
     *
     * `status` 仍然只有 running / stopped 两态：spawn 成功即 running，这里只是补一个
     * 「已经开始出输出」的时间点，供 UI 收起 loading 态。
     */
    readyAt?: string;
    exitedAt?: string;
    exitCode?: number | null;
    signal?: NodeJS.Signals | string | null;
    runtimeRoot: string;
    enginePath: string;
    executablePath: string;
    args: string[];
}

/**
 * 一行来自 simulator 进程或构建脚本的输出。
 *
 * 对齐 editor：它把 simulator 的 stdout/stderr 直接 `console.log` / `console.error`
 * （`simulator.ts:295-304`）。cocos-cli 跑在 Pink 的 utility process 里，光靠 console
 * 只能进 Pink 的宿主日志，所以额外用事件抛出来，让 IDE 能自己决定怎么展示。
 */
export interface ISimulatorLogEntry {
    /** `simulator` 来自模拟器进程，`build` 来自 buildNative / buildRuntime 的子进程。 */
    source: 'simulator' | 'build';
    level: 'log' | 'error';
    message: string;
    /** `source === 'simulator'` 时带上会话 id，便于多会话下对应。 */
    sessionId?: string;
}

/**
 * 构建阶段状态。
 *
 * 只有 start / success / failed 三态，**不带百分比**：对齐 editor 的两点广播
 * （`programming:compile-start` / `programming:compiled`，见
 * `app/builtin/preview/source/browser/index.ts:36-48`）。两个构建脚本自身没有可靠的
 * 总步数，逐行输出走 {@link ISimulatorLogEntry}。
 */
export interface ISimulatorBuildState {
    step: 'native' | 'runtime';
    state: 'start' | 'success' | 'failed';
    /** `state === 'failed'` 时的错误信息。 */
    error?: string;
}

export interface ISimulatorLaunchPreviewOptions extends ISimulatorPrepareOptions, Omit<ISimulatorStartOptions, 'runtimeRoot' | 'entryFile' | 'writablePath'> {
    port?: number;
}

export interface ISimulatorLaunchPreviewResult {
    prepared: ISimulatorPreparedResources;
    session: ISimulatorSessionInfo;
}

export interface IHostArtifact {
    bundle: string;
    entry: string;
}

/**
 * 宿主环境切片。生产代码走 {@link currentHostEnv}，测试可以显式伪造成 win32。
 */
export interface ISimulatorHostEnv {
    platform: NodeJS.Platform;
    /**
     * `%LOCALAPPDATA%`，只在 win32 分支使用。
     */
    localAppData?: string;
}

export function currentHostEnv(): ISimulatorHostEnv {
    return {
        platform: process.platform,
        localAppData: process.env.LOCALAPPDATA,
    };
}

/**
 * 与 `workflow/build-simulator.js` 里的同名表必须保持一致（由
 * `tests/simulator-runtime.test.ts` 断言），否则「构建出的可执行文件」和
 * 「运行时查找的可执行文件」会脱钩。
 */
export const platformArtifacts: Partial<Record<NodeJS.Platform, IHostArtifact>> = {
    darwin: {
        bundle: 'SimulatorApp-Mac.app',
        entry: 'SimulatorApp-Mac.app/Contents/MacOS/SimulatorApp-Mac',
    },
    win32: {
        bundle: 'SimulatorApp-Win32.exe',
        entry: 'SimulatorApp-Win32.exe',
    },
};

export function markSessionStopped(
    info: ISimulatorSessionInfo,
    exitCode: number | null,
    signal: NodeJS.Signals | string | null,
): void {
    info.status = 'stopped';
    info.exitCode = exitCode;
    info.signal = signal;
    info.exitedAt = new Date().toISOString();
}

export function getHostManifest(host: ISimulatorHostEnv = currentHostEnv()): ISimulatorManifest | null {
    const manifest = platformArtifacts[host.platform];
    if (!manifest) {
        return null;
    }

    return {
        platform: host.platform,
        bundle: manifest.bundle,
        entry: manifest.entry,
    };
}

export function resolveEnginePath(enginePath?: string): string {
    return resolve(enginePath || GlobalPaths.enginePath);
}

export function getSimulatorDir(enginePath?: string): string {
    return join(resolveEnginePath(enginePath), 'native', 'simulator', 'Release');
}

export function getSimulatorRoot(enginePath?: string, host: ISimulatorHostEnv = currentHostEnv()): string {
    const manifest = getHostManifest(host);
    if (!manifest) {
        throw new Error(`Simulator is not supported on host platform: ${host.platform}`);
    }
    const releaseDir = getSimulatorDir(enginePath);
    return host.platform === 'darwin' ? join(releaseDir, manifest.bundle) : releaseDir;
}

export function getSimulatorResourcesPath(enginePath?: string, host: ISimulatorHostEnv = currentHostEnv()): string {
    const simulatorRoot = getSimulatorRoot(enginePath, host);
    return host.platform === 'darwin'
        ? join(simulatorRoot, 'Contents', 'Resources')
        : simulatorRoot;
}

/**
 * native 侧 `FileUtils::getWritablePath()`（win32）取的是
 * `%LOCALAPPDATA%\<可执行文件名去掉扩展名>\`，`FileServer` 再拼上 `debugruntime/`
 * （`FileServer::init`，其中 `getCurAppName()` 分支只对 macOS 生效）。
 * 这里从 {@link platformArtifacts} 推导 app 名，避免和可执行文件名脱钩。
 *
 * macOS 上 `getWritablePath()` 就是 app bundle 的 `Contents/Resources`，与 runtimeRoot 同一个目录。
 */
export function getSimulatorWritablePath(enginePath?: string, host: ISimulatorHostEnv = currentHostEnv()): string {
    if (host.platform === 'darwin') {
        return getSimulatorResourcesPath(enginePath, host);
    }

    const entry = platformArtifacts[host.platform]?.entry;
    if (host.localAppData && entry) {
        const appName = entry.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
        return join(host.localAppData, appName, 'debugruntime');
    }
    return getSimulatorResourcesPath(enginePath, host);
}

export function normalizeServerURL(serverURL: string): string {
    return serverURL.replace(/\/+$/, '');
}

export function validatePreviewOrigin(value: string): string {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/'
        || url.search || url.hash || url.username || url.password) {
        throw new Error('Simulator serverURL must be an HTTP(S) origin without a path prefix, query, fragment or credentials.');
    }
    return url.origin;
}

export function validateSimulatorOptions(options: ISimulatorLaunchPreviewOptions): void {
    if (options.serverURL !== undefined) validatePreviewOrigin(options.serverURL);
    if (options.assetServerURL !== undefined) {
        const url = new URL(options.assetServerURL);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('assetServerURL must use HTTP(S).');
    }
    if (options.resolution && ![options.resolution.width, options.resolution.height]
        .every(value => Number.isSafeInteger(value) && value > 0)) {
        throw new Error('Simulator resolution must contain positive integers.');
    }
    if (options.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0)) {
        throw new Error('Simulator scale must be positive and finite.');
    }
    if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) {
        throw new Error('Simulator port must be an integer between 1 and 65535.');
    }
    if (options.landscape && options.portrait) throw new Error('Choose either landscape or portrait.');
    if (options.position && ![options.position.x, options.position.y].every(Number.isFinite)) {
        throw new Error('Simulator position must contain finite coordinates.');
    }
    if (typeof options.previewSceneJson === 'string') JSON.parse(options.previewSceneJson);
}

export function isReadyServerURL(serverURL: string | undefined | null): serverURL is string {
    return typeof serverURL === 'string' && /^https?:\/\//.test(serverURL);
}

/**
 * 生成的 `main.js` / `application.js` 会把路径当成 JS 字符串字面量插值，Windows 的
 * `\` 会被当转义符吃掉，所以统一转成 `/`（native 的 FileUtils 两种分隔符都认）。
 */
export function formatPath(pathValue: string): string {
    return pathValue.replace(/\\/g, '/');
}

export function parsePreviewServer(serverURL: string): { previewIp: string; previewPort: number } {
    const url = new URL(serverURL);
    return {
        previewIp: url.hostname,
        previewPort: Number(url.port || (url.protocol === 'https:' ? '443' : '80')),
    };
}

export function resolveRuntimeRoot(
    options: ISimulatorStartOptions,
    host: ISimulatorHostEnv = currentHostEnv(),
): string {
    if (options.runtimeRoot) {
        return resolve(options.runtimeRoot);
    }
    return getSimulatorResourcesPath(options.enginePath, host);
}

export function resolveOptionPath(runtimeRoot: string, filePath: string): string {
    if (isAbsolute(filePath)) {
        return filePath;
    }
    return resolve(runtimeRoot, filePath);
}

/**
 * 推导 `prepareResources` 的两个输出目录。
 *
 * 默认行为（两个 override 都不传）与之前完全一致：runtime 根目录是 simulator 自己的资源
 * 目录，writable path 是平台真实的 writable path。
 *
 * 传了 `runtimeRoot` 但没传 `writablePath` 时，writable path 跟随 runtimeRoot —— 否则
 * 一个本该沙箱化的准备流程还是会往 `%LOCALAPPDATA%` 或 app bundle 里写 `config.json`。
 * 这也和 macOS 的天然形态一致（两者本来就是同一个目录，{@link writeSimulatorConfig} 会去重）。
 */
export function resolvePrepareTargets(
    options: Pick<ISimulatorPrepareOptions, 'enginePath' | 'runtimeRoot' | 'writablePath'>,
    host: ISimulatorHostEnv = currentHostEnv(),
): { runtimeRoot: string; writablePath: string } {
    const runtimeRoot = options.runtimeRoot
        ? resolve(options.runtimeRoot)
        : getSimulatorResourcesPath(options.enginePath, host);

    if (options.writablePath) {
        return { runtimeRoot, writablePath: resolveOptionPath(runtimeRoot, options.writablePath) };
    }
    return {
        runtimeRoot,
        writablePath: options.runtimeRoot ? runtimeRoot : getSimulatorWritablePath(options.enginePath, host),
    };
}

export function createArgs(
    options: ISimulatorStartOptions,
    host: ISimulatorHostEnv = currentHostEnv(),
): string[] {
    const runtimeRoot = resolveRuntimeRoot(options, host);
    const args = ['-workdir', runtimeRoot];

    if (options.entryFile) {
        args.push('-entry', resolveOptionPath(runtimeRoot, options.entryFile));
    }

    const writablePath = options.writablePath
        ? resolveOptionPath(runtimeRoot, options.writablePath)
        : getSimulatorWritablePath(options.enginePath, host);
    args.push('-writable-path', writablePath);

    if (options.landscape) {
        args.push('-landscape');
    }
    if (options.portrait) {
        args.push('-portrait');
    }
    if (options.resolution) {
        args.push('-resolution', `${options.resolution.width}x${options.resolution.height}`);
    }
    if (typeof options.scale === 'number') {
        args.push('-scale', `${options.scale}`);
    }
    if (typeof options.showConsole === 'boolean') {
        args.push('-console', options.showConsole ? 'true' : 'false');
    }
    if (options.debugLogFile) {
        args.push('-write-debug-log', resolveOptionPath(runtimeRoot, options.debugLogFile));
    }
    if (options.position) {
        args.push('-position', `${options.position.x},${options.position.y}`);
    }
    if (options.bindAddress) {
        args.push('-listen', options.bindAddress);
    }
    if (options.searchPaths?.length) {
        // native 侧 `ProjectConfig::parseCommandLine` 对 `-search-path` 一律用 `;` 切分
        // （见 ProjectConfig.cpp），两个平台都一样，不能用 path.delimiter。
        const searchPaths = options.searchPaths.map((searchPath) => resolveOptionPath(runtimeRoot, searchPath));
        args.push('-search-path', searchPaths.join(';'));
    }

    return args;
}

export function createSimulatorConfig(
    options: Pick<ISimulatorPrepareOptions, 'waitForConnect' | 'landscape' | 'resolution'>,
): Record<string, unknown> {
    const resolution = options.resolution || { width: 960, height: 640 };
    return {
        name: 'Simulator',
        entry: 'main.js',
        isLandscape: !!options.landscape,
        isWindowTop: false,
        waitForConnect: !!options.waitForConnect,
        width: resolution.width,
        height: resolution.height,
        consolePort: 6050,
        uploadPort: 6060,
        debugPort: 5086,
    };
}

/**
 * 写 simulator 的 `config.json`，返回实际写入的全部路径（第一个为主路径）。
 *
 * native 侧有两条读取路径，都要覆盖：
 * - `SimulatorApp::parseCocosProjectConfig()` 先把 `-workdir` 及其父目录加进搜索路径，
 *   随后才第一次实例化 `ConfigParser`（即 runtimeRoot 下的 config.json 会被找到）；
 * - `ConfigParser::readConfig()` 在 Windows 上还会把 `FileServer::getWritePath()`
 *   （`%LOCALAPPDATA%/SimulatorApp-Win32/debugruntime/`）插到搜索路径最前面。
 *
 * macOS 上两者是同一个目录（app bundle 的 `Contents/Resources`），会自动去重。
 */
export async function writeSimulatorConfig(
    targetDirs: string[],
    options: Pick<ISimulatorPrepareOptions, 'waitForConnect' | 'landscape' | 'resolution'>,
): Promise<string[]> {
    const config = `${JSON.stringify(createSimulatorConfig(options), null, 2)}\n`;
    const uniqueDirs = Array.from(new Set(targetDirs.filter(Boolean).map((dir) => resolve(dir))));
    const configPaths: string[] = [];
    for (const dir of uniqueDirs) {
        await ensureDir(dir);
        const configPath = join(dir, 'config.json');
        await writeFile(configPath, config, 'utf8');
        configPaths.push(configPath);
    }
    return configPaths;
}

/**
 * 复刻 builder 的 `queryPreloadAssetList`：按 `cc.config.json` 的 feature 依赖关系，
 * 递归收集这批 feature 需要预加载的内置资源/脚本 uuid。
 */
export async function resolvePreloadAssetList(enginePath: string, features: string[]): Promise<string[]> {
    const ccConfigJson = await readJSON(join(enginePath, 'cc.config.json')) as {
        features?: Record<string, {
            dependentAssets?: string[];
            dependentScripts?: string[];
            dependentModules?: string[];
        }>;
    };
    return collectPreloadAssets(ccConfigJson.features || {}, features);
}

/**
 * {@link resolvePreloadAssetList} 的纯函数内核，方便直接喂 fixture 做测试。
 */
export function collectPreloadAssets(
    featuresInJson: Record<string, {
        dependentAssets?: string[];
        dependentScripts?: string[];
        dependentModules?: string[];
    }>,
    features: string[],
): string[] {
    const visited = new Set<string>();
    const preloadAssets: string[] = [];

    const traversal = (names: string[]): void => {
        for (const name of names) {
            const feature = featuresInJson[name];
            if (!feature || visited.has(name)) {
                continue;
            }
            visited.add(name);
            preloadAssets.push(...(feature.dependentAssets || []));
            preloadAssets.push(...(feature.dependentScripts || []));
            traversal(feature.dependentModules || []);
        }
    };
    traversal(features);

    return Array.from(new Set(preloadAssets));
}
