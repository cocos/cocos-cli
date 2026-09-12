/**
 * Simulator 进程编排（含 stub）+ 纯逻辑单元测试（③ simulator 相关含 stub）。
 *
 * 合并自两份旧测试，分两层：
 * - 纯逻辑单元：`src/core/simulator/internal.ts` 的路径解析 / 参数组装 / config /
 *   预加载资源裁剪。重点是 Windows 分支：`getSimulatorWritablePath` / `createArgs`
 *   在 macOS 上跑 CI 也能覆盖 win32 行为，靠的是把宿主环境（platform + LOCALAPPDATA）
 *   显式注入。
 * - 进程编排：`simulatorManager` 的 spawn / 事件 / 去重。这一层没法用真实 simulator
 *   （起窗口需要 native 产物、退出时机不可控），所以把 `child_process.spawn` 换成假的
 *   `ChildProcess`（EventEmitter + 两条 PassThrough），由测试自己决定什么时候出输出、
 *   什么时候退出。唯一被 stub 的实例方法是 `getExecutablePath`（`start()` 的前置校验），
 *   因为它需要真实构建产物，与本文件要验的行为无关。
 *
 * 文件顶部的 jest.mock 只影响进程编排层；纯逻辑层不依赖 child_process / server，
 * 这些 mock 对它无害。
 */

import { EventEmitter } from 'events';
import { mkdtemp, readFile, readJSON, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join, resolve, sep } from 'path';
import { PassThrough } from 'stream';

import {
    collectPreloadAssets,
    createArgs,
    createSimulatorConfig,
    currentHostEnv,
    formatPath,
    getHostManifest,
    getSimulatorDir,
    getSimulatorResourcesPath,
    getSimulatorRoot,
    getSimulatorWritablePath,
    isReadyServerURL,
    markSessionStopped,
    normalizeServerURL,
    parsePreviewServer,
    resolveOptionPath,
    resolvePreloadAssetList,
    resolvePrepareTargets,
    resolveRuntimeRoot,
    writeSimulatorConfig,
    type ISimulatorHostEnv,
} from '../src/core/simulator/internal';

const mockSpawn = jest.fn();
const mockTreeKill = jest.fn();

jest.mock('child_process', () => ({
    ...jest.requireActual('child_process'),
    spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock('tree-kill', () => ({
    __esModule: true,
    default: (pid: number, signal: string, callback?: (error?: Error) => void) => mockTreeKill(pid, signal, callback),
}));

// `launchPreview` 会 `import('../../server')` 拿 preview server 地址。测试传了现成的
// `serverURL`，走的是 early return，但那个 import 本身会拖起整个 server 模块，直接替掉。
jest.mock('../src/server', () => ({
    getServerUrl: () => 'http://127.0.0.1:7509',
}));

import { simulatorManager, type ISimulatorBuildState, type ISimulatorLogEntry, type ISimulatorSessionInfo } from '../src/core/simulator';

const MAC: ISimulatorHostEnv = { platform: 'darwin' };
const WIN: ISimulatorHostEnv = { platform: 'win32', localAppData: 'C:\\Users\\tester\\AppData\\Local' };
const WIN_NO_APPDATA: ISimulatorHostEnv = { platform: 'win32' };
const LINUX: ISimulatorHostEnv = { platform: 'linux' };

const ENGINE = resolve('/tmp/fake-engine');
const EXECUTABLE = '/fake/SimulatorApp-Mac.app/Contents/MacOS/SimulatorApp-Mac';

/** 断言时统一分隔符，这样 win32 分支在 posix 宿主上也能写出可读的期望值。 */
function slashes(pathValue: string): string {
    return pathValue.split(sep).join('/').replace(/\\/g, '/');
}

/** 假的 `ChildProcess`：只实现本文件用到的那几个成员。 */
class FakeChild extends EventEmitter {
    static nextPid = 4242;

    /** 每个实例一个不同的 pid —— stopAll 要能按 pid 分别命中。 */
    pid = FakeChild.nextPid++;
    stdout = new PassThrough();
    stderr = new PassThrough();

    /** 模拟进程退出：先冲掉未读的输出，再按真实 ChildProcess 的顺序发 `exit` 然后 `close`。 */
    exit(code: number | null, signal: NodeJS.Signals | null = null): void {
        this.stdout.end();
        this.stderr.end();
        this.emit('exit', code, signal);
        this.emit('close', code, signal);
    }
}

/** 等一个 macrotask，让 stream 的 `data` 事件派发完。 */
function flush(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// 纯逻辑单元
// ---------------------------------------------------------------------------

describe('host manifest', () => {
    it('describes the mac app bundle', () => {
        expect(getHostManifest(MAC)).toEqual({
            platform: 'darwin',
            bundle: 'SimulatorApp-Mac.app',
            entry: 'SimulatorApp-Mac.app/Contents/MacOS/SimulatorApp-Mac',
        });
    });

    it('describes the win32 executable', () => {
        expect(getHostManifest(WIN)).toEqual({
            platform: 'win32',
            bundle: 'SimulatorApp-Win32.exe',
            entry: 'SimulatorApp-Win32.exe',
        });
    });

    it('returns null on unsupported hosts', () => {
        expect(getHostManifest(LINUX)).toBeNull();
    });

    it('reflects the real process by default', () => {
        expect(currentHostEnv().platform).toBe(process.platform);
    });
});

describe('simulator paths', () => {
    it('puts the release dir under native/simulator/Release', () => {
        expect(slashes(getSimulatorDir(ENGINE))).toBe(`${slashes(ENGINE)}/native/simulator/Release`);
    });

    it('resolves the mac runtime root inside Contents/Resources', () => {
        expect(slashes(getSimulatorRoot(ENGINE, MAC)))
            .toBe(`${slashes(ENGINE)}/native/simulator/Release/SimulatorApp-Mac.app`);
        expect(slashes(getSimulatorResourcesPath(ENGINE, MAC)))
            .toBe(`${slashes(ENGINE)}/native/simulator/Release/SimulatorApp-Mac.app/Contents/Resources`);
    });

    it('resolves the win32 runtime root to the release dir itself', () => {
        // Windows 上没有 app bundle，`SimulatorApp-Win32.exe` 和资源同级。
        expect(slashes(getSimulatorRoot(ENGINE, WIN)))
            .toBe(`${slashes(ENGINE)}/native/simulator/Release`);
        expect(slashes(getSimulatorResourcesPath(ENGINE, WIN)))
            .toBe(`${slashes(ENGINE)}/native/simulator/Release`);
    });

    it('throws on unsupported hosts', () => {
        expect(() => getSimulatorRoot(ENGINE, LINUX)).toThrow(/not supported on host platform: linux/);
    });
});

describe('getSimulatorWritablePath', () => {
    it('equals the runtime root on macOS', () => {
        // native 的 FileUtils::getWritablePath() 在 macOS 上返回 app bundle 的 Contents/Resources。
        expect(getSimulatorWritablePath(ENGINE, MAC)).toBe(getSimulatorResourcesPath(ENGINE, MAC));
    });

    it('matches %LOCALAPPDATA%/<exe name>/debugruntime on Windows', () => {
        // 对应 FileUtils-win32.cpp getWritablePath() + FileServer::init 追加的 debugruntime/。
        expect(slashes(getSimulatorWritablePath(ENGINE, WIN)))
            .toBe('C:/Users/tester/AppData/Local/SimulatorApp-Win32/debugruntime');
    });

    it('falls back to the runtime root when LOCALAPPDATA is missing', () => {
        expect(getSimulatorWritablePath(ENGINE, WIN_NO_APPDATA))
            .toBe(getSimulatorResourcesPath(ENGINE, WIN_NO_APPDATA));
    });
});

describe('server url helpers', () => {
    it('strips trailing slashes', () => {
        expect(normalizeServerURL('http://localhost:7456///')).toBe('http://localhost:7456');
        expect(normalizeServerURL('http://localhost:7456')).toBe('http://localhost:7456');
    });

    it('only accepts http(s) urls as ready', () => {
        expect(isReadyServerURL('http://127.0.0.1:7456')).toBe(true);
        expect(isReadyServerURL('https://example.com')).toBe(true);
        expect(isReadyServerURL('ws://127.0.0.1:7456')).toBe(false);
        expect(isReadyServerURL('')).toBe(false);
        expect(isReadyServerURL(undefined)).toBe(false);
        expect(isReadyServerURL(null)).toBe(false);
    });

    it('splits host and port, defaulting by protocol', () => {
        expect(parsePreviewServer('http://127.0.0.1:7509')).toEqual({ previewIp: '127.0.0.1', previewPort: 7509 });
        expect(parsePreviewServer('http://localhost')).toEqual({ previewIp: 'localhost', previewPort: 80 });
        expect(parsePreviewServer('https://example.com')).toEqual({ previewIp: 'example.com', previewPort: 443 });
    });
});

describe('formatPath', () => {
    it('turns windows separators into forward slashes', () => {
        // 生成的 main.js / application.js 把路径当 JS 字符串字面量插值，`\` 会被吃掉。
        expect(formatPath('C:\\projects\\demo\\library')).toBe('C:/projects/demo/library');
        expect(formatPath('/Users/tester/demo/library')).toBe('/Users/tester/demo/library');
    });
});

describe('resolveRuntimeRoot / resolveOptionPath', () => {
    it('honours an explicit runtimeRoot', () => {
        expect(resolveRuntimeRoot({ runtimeRoot: '/a/b', enginePath: ENGINE }, MAC)).toBe(resolve('/a/b'));
    });

    it('falls back to the simulator resources path', () => {
        expect(resolveRuntimeRoot({ enginePath: ENGINE }, MAC)).toBe(getSimulatorResourcesPath(ENGINE, MAC));
    });

    it('keeps absolute option paths and resolves relative ones against the runtime root', () => {
        const root = resolve('/runtime/root');
        expect(resolveOptionPath(root, 'main.js')).toBe(join(root, 'main.js'));
        expect(resolveOptionPath(root, resolve('/elsewhere/main.js'))).toBe(resolve('/elsewhere/main.js'));
    });
});

describe('resolvePrepareTargets', () => {
    it('defaults to the simulator resources path — no isolation', () => {
        // 不传 runtimeRoot 时行为必须与加这个入参之前完全一致。
        expect(resolvePrepareTargets({ enginePath: ENGINE }, MAC)).toEqual({
            runtimeRoot: getSimulatorResourcesPath(ENGINE, MAC),
            writablePath: getSimulatorWritablePath(ENGINE, MAC),
        });
        expect(resolvePrepareTargets({ enginePath: ENGINE }, WIN)).toEqual({
            runtimeRoot: getSimulatorResourcesPath(ENGINE, WIN),
            writablePath: getSimulatorWritablePath(ENGINE, WIN),
        });
    });

    it('redirects both targets when runtimeRoot is overridden', () => {
        // 覆盖 runtimeRoot 的意图就是别碰真实产物目录，所以 writable path 必须跟着走，
        // 否则 Windows 上 config.json 还会写进 %LOCALAPPDATA%。
        const sandbox = resolve('/tmp/sandbox/Resources');
        for (const host of [MAC, WIN]) {
            expect(resolvePrepareTargets({ enginePath: ENGINE, runtimeRoot: sandbox }, host)).toEqual({
                runtimeRoot: sandbox,
                writablePath: sandbox,
            });
        }
    });

    it('honours an explicit writablePath, absolute or runtimeRoot-relative', () => {
        const sandbox = resolve('/tmp/sandbox/Resources');
        expect(resolvePrepareTargets({ runtimeRoot: sandbox, writablePath: 'gamecaches' }, MAC).writablePath)
            .toBe(join(sandbox, 'gamecaches'));
        expect(resolvePrepareTargets({ runtimeRoot: sandbox, writablePath: resolve('/tmp/elsewhere') }, MAC).writablePath)
            .toBe(resolve('/tmp/elsewhere'));
        // 只给 writablePath、不覆盖 runtimeRoot 也应该生效（相对路径按真实产物目录解析）。
        expect(resolvePrepareTargets({ enginePath: ENGINE, writablePath: 'gamecaches' }, WIN).writablePath)
            .toBe(join(getSimulatorResourcesPath(ENGINE, WIN), 'gamecaches'));
    });

    it('normalizes a relative runtimeRoot', () => {
        expect(resolvePrepareTargets({ runtimeRoot: 'build/sim' }, MAC).runtimeRoot).toBe(resolve('build/sim'));
    });
});

describe('createArgs', () => {
    const runtimeRoot = resolve('/runtime/root');

    function argValue(args: string[], flag: string): string | undefined {
        const index = args.indexOf(flag);
        return index < 0 ? undefined : args[index + 1];
    }

    it('always starts with -workdir', () => {
        const args = createArgs({ runtimeRoot }, MAC);
        expect(args[0]).toBe('-workdir');
        expect(args[1]).toBe(runtimeRoot);
    });

    it('resolves -entry against the runtime root', () => {
        const args = createArgs({ runtimeRoot, entryFile: 'main.js' }, MAC);
        expect(argValue(args, '-entry')).toBe(join(runtimeRoot, 'main.js'));
    });

    it('defaults -writable-path to the platform writable path', () => {
        expect(argValue(createArgs({ runtimeRoot, enginePath: ENGINE }, MAC), '-writable-path'))
            .toBe(getSimulatorWritablePath(ENGINE, MAC));
        expect(argValue(createArgs({ runtimeRoot, enginePath: ENGINE }, WIN), '-writable-path'))
            .toBe(getSimulatorWritablePath(ENGINE, WIN));
    });

    it('honours an explicit writablePath', () => {
        expect(argValue(createArgs({ runtimeRoot, writablePath: 'gamecaches' }, MAC), '-writable-path'))
            .toBe(join(runtimeRoot, 'gamecaches'));
    });

    it('joins search paths with ";" on every host', () => {
        // native 的 ProjectConfig::parseCommandLine 一律用 `;` 切分，不能用 path.delimiter。
        const expected = [join(runtimeRoot, 'a'), join(runtimeRoot, 'b')].join(';');
        expect(argValue(createArgs({ runtimeRoot, searchPaths: ['a', 'b'] }, MAC), '-search-path')).toBe(expected);
        expect(argValue(createArgs({ runtimeRoot, searchPaths: ['a', 'b'] }, WIN), '-search-path')).toBe(expected);
    });

    it('omits -search-path when there is nothing to add', () => {
        expect(createArgs({ runtimeRoot, searchPaths: [] }, MAC)).not.toContain('-search-path');
        expect(createArgs({ runtimeRoot }, MAC)).not.toContain('-search-path');
    });

    it('formats resolution, scale and position the way native expects', () => {
        const args = createArgs({
            runtimeRoot,
            resolution: { width: 1280, height: 720 },
            scale: 0.5,
            position: { x: 10, y: -20 },
        }, MAC);
        expect(argValue(args, '-resolution')).toBe('1280x720');
        expect(argValue(args, '-scale')).toBe('0.5');
        expect(argValue(args, '-position')).toBe('10,-20');
    });

    it('passes -console as an explicit boolean string', () => {
        expect(argValue(createArgs({ runtimeRoot, showConsole: true }, MAC), '-console')).toBe('true');
        expect(argValue(createArgs({ runtimeRoot, showConsole: false }, MAC), '-console')).toBe('false');
        expect(createArgs({ runtimeRoot }, MAC)).not.toContain('-console');
    });

    it('adds orientation flags without values', () => {
        expect(createArgs({ runtimeRoot, landscape: true }, MAC)).toContain('-landscape');
        expect(createArgs({ runtimeRoot, portrait: true }, MAC)).toContain('-portrait');
        expect(createArgs({ runtimeRoot }, MAC)).not.toContain('-landscape');
    });

    it('resolves -write-debug-log and passes -listen through', () => {
        const args = createArgs({ runtimeRoot, debugLogFile: 'sim.log', bindAddress: '0.0.0.0' }, MAC);
        expect(argValue(args, '-write-debug-log')).toBe(join(runtimeRoot, 'sim.log'));
        expect(argValue(args, '-listen')).toBe('0.0.0.0');
    });
});

describe('createSimulatorConfig', () => {
    it('defaults to 960x640 portrait without waiting for a debugger', () => {
        expect(createSimulatorConfig({})).toEqual({
            name: 'Simulator',
            entry: 'main.js',
            isLandscape: false,
            isWindowTop: false,
            waitForConnect: false,
            width: 960,
            height: 640,
            consolePort: 6050,
            uploadPort: 6060,
            debugPort: 5086,
        });
    });

    it('carries resolution, landscape and waitForConnect through', () => {
        expect(createSimulatorConfig({
            resolution: { width: 1334, height: 750 },
            landscape: true,
            waitForConnect: true,
        })).toMatchObject({
            width: 1334,
            height: 750,
            isLandscape: true,
            waitForConnect: true,
        });
    });
});

describe('writeSimulatorConfig', () => {
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'cocos-simulator-config-'));
    });

    afterEach(async () => {
        await remove(tempDir);
    });

    it('writes an identical config.json to every target dir', async () => {
        const runtimeRoot = join(tempDir, 'runtime');
        const writablePath = join(tempDir, 'debugruntime');
        const paths = await writeSimulatorConfig([runtimeRoot, writablePath], { landscape: true });

        expect(paths).toEqual([join(runtimeRoot, 'config.json'), join(writablePath, 'config.json')]);
        const [first, second] = await Promise.all(paths.map((p) => readFile(p, 'utf8')));
        expect(first).toBe(second);
        await expect(readJSON(paths[0])).resolves.toMatchObject({ isLandscape: true, entry: 'main.js' });
    });

    it('dedupes targets that resolve to the same dir (the macOS case)', async () => {
        const runtimeRoot = join(tempDir, 'runtime');
        const paths = await writeSimulatorConfig([runtimeRoot, join(runtimeRoot, 'nested', '..')], {});
        expect(paths).toEqual([join(runtimeRoot, 'config.json')]);
    });

    it('ignores empty target dirs', async () => {
        const runtimeRoot = join(tempDir, 'runtime');
        const paths = await writeSimulatorConfig([runtimeRoot, ''], {});
        expect(paths).toEqual([join(runtimeRoot, 'config.json')]);
    });

    it('creates missing directories and ends the file with a newline', async () => {
        const deep = join(tempDir, 'a', 'b', 'c');
        const [configPath] = await writeSimulatorConfig([deep], {});
        expect(await readFile(configPath, 'utf8')).toMatch(/\n$/);
    });
});

describe('collectPreloadAssets', () => {
    const features = {
        base: { dependentAssets: ['asset-base'] },
        '2d': { dependentAssets: ['asset-2d'], dependentModules: ['base'] },
        'physics-framework': {
            dependentAssets: ['default-physics-material'],
            dependentScripts: ['script-physics'],
        },
        'physics-ammo': { dependentModules: ['physics-framework'] },
        cyclic: { dependentAssets: ['asset-cyclic'], dependentModules: ['cyclic', 'base'] },
    };

    it('collects assets and scripts of the requested features', () => {
        expect(collectPreloadAssets(features, ['physics-framework']))
            .toEqual(['default-physics-material', 'script-physics']);
    });

    it('follows dependentModules transitively', () => {
        expect(collectPreloadAssets(features, ['physics-ammo']))
            .toEqual(['default-physics-material', 'script-physics']);
        expect(collectPreloadAssets(features, ['2d'])).toEqual(['asset-2d', 'asset-base']);
    });

    it('excludes features that are not enabled', () => {
        // 这正是 cc.PhysicMaterial 反序列化崩溃的修复点：没开 physics-framework 时
        // default-physics-material 不能进 builtinResMgr 的预加载列表。
        expect(collectPreloadAssets(features, ['base'])).not.toContain('default-physics-material');
    });

    it('dedupes and tolerates cycles and unknown features', () => {
        expect(collectPreloadAssets(features, ['base', 'base', '2d'])).toEqual(['asset-base', 'asset-2d']);
        expect(collectPreloadAssets(features, ['cyclic'])).toEqual(['asset-cyclic', 'asset-base']);
        expect(collectPreloadAssets(features, ['nope'])).toEqual([]);
        expect(collectPreloadAssets({}, ['base'])).toEqual([]);
    });
});

describe('resolvePreloadAssetList', () => {
    const enginePath = resolve(__dirname, '..', 'packages', 'engine');

    it('reads cc.config.json and keeps physics assets scoped to physics features', async () => {
        // 内置物理材质 default-physics-material 挂在各物理后端 feature 的 dependentAssets 下，
        // 它反序列化时用旧类名 cc.PhysicMaterial，别名只在 physics-framework 注册。
        const physicsMaterial = 'ba21476f-2866-4f81-9c4d-6e359316e448';
        const withPhysics = await resolvePreloadAssetList(enginePath, ['physics-ammo']);
        const withoutPhysics = await resolvePreloadAssetList(enginePath, ['base']);
        expect(withPhysics).toContain(physicsMaterial);
        expect(withoutPhysics).not.toContain(physicsMaterial);
    });

    it('matches the builder queryPreloadAssetList behaviour for the full feature set', async () => {
        const ccConfigJson = await readJSON(join(enginePath, 'cc.config.json')) as { features: Record<string, unknown> };
        const all = await resolvePreloadAssetList(enginePath, Object.keys(ccConfigJson.features));
        const subset = await resolvePreloadAssetList(enginePath, ['base', '2d']);
        expect(all.length).toBeGreaterThan(subset.length);
        for (const uuid of subset) {
            expect(all).toContain(uuid);
        }
    });

    it('returns a deduped list', async () => {
        const list = await resolvePreloadAssetList(enginePath, ['base', 'base', '2d']);
        expect(new Set(list).size).toBe(list.length);
    });
});

describe('markSessionStopped', () => {
    it('records the exit code, signal and timestamp', () => {
        const info = { status: 'running' } as ISimulatorSessionInfo;
        markSessionStopped(info, 0, null);
        expect(info.status).toBe('stopped');
        expect(info.exitCode).toBe(0);
        expect(info.signal).toBeNull();
        expect(typeof info.exitedAt).toBe('string');
    });
});

// ---------------------------------------------------------------------------
// 进程编排（stub child_process / tree-kill / server）
// ---------------------------------------------------------------------------

describe('simulatorManager 进程编排', () => {
    let children: FakeChild[] = [];
    const disposers: Array<() => void> = [];
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        children = [];
        mockSpawn.mockReset();
        mockSpawn.mockImplementation(() => {
            const child = new FakeChild();
            children.push(child);
            setImmediate(() => child.emit('spawn'));
            return child;
        });
        mockTreeKill.mockReset();
        // 默认「杀成功」：立刻回调，并让 child 走一次 exit。
        mockTreeKill.mockImplementation((pid: number, signal: string, callback?: () => void) => {
            const target = children.find((child) => child.pid === pid);
            target?.exit(null, signal as NodeJS.Signals);
            callback?.();
        });

        jest.spyOn(simulatorManager, 'getExecutablePath').mockResolvedValue(EXECUTABLE);
        // 逐行输出会真的打到 console（刻意保留的行为，见 3.4），测试里静音掉。
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => { /* 静音 */ });
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { /* 静音 */ });
    });

    afterEach(async () => {
        while (disposers.length) {
            disposers.pop()!();
        }
        await simulatorManager.stopAll();
        logSpy.mockRestore();
        errorSpy.mockRestore();
        jest.restoreAllMocks();
    });

    /** 订阅并登记反订阅，afterEach 统一清掉。 */
    function collectSessions(): ISimulatorSessionInfo[] {
        const events: ISimulatorSessionInfo[] = [];
        disposers.push(simulatorManager.onDidChangeSession((session) => events.push(session)));
        return events;
    }

    function collectLogs(): ISimulatorLogEntry[] {
        const entries: ISimulatorLogEntry[] = [];
        disposers.push(simulatorManager.onLog((entry) => entries.push(entry)));
        return entries;
    }

    describe('stdio', () => {
        it('flushes output that arrives after exit when stdio closes', async () => {
            const logs = collectLogs();
            await simulatorManager.start({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
            children[0].emit('exit', 0, null);
            children[0].stdout.write('last fragment');
            children[0].emit('close', 0, null);
            expect(logs.map(entry => entry.message)).toContain('last fragment');
        });
        it('pipes stdout/stderr instead of ignoring them', async () => {
            await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });
            expect(mockSpawn).toHaveBeenCalledTimes(1);
            // 'ignore' 会把 simulator 的 JS 报错和 cc.log 全丢掉，这是 3.4 的核心修复。
            expect(mockSpawn.mock.calls[0][2]).toMatchObject({ stdio: ['ignore', 'pipe', 'pipe'] });
        });

        it('emits one onLog entry per line, splitting chunks on newlines', async () => {
            const logs = collectLogs();
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });

            // 一个 chunk 里两行半，最后半行要留在缓冲里。
            children[0].stdout.write('first\nsecond\npart');
            await flush();

            expect(logs.map((entry) => entry.message)).toEqual(['first', 'second']);
            expect(logs.every((entry) => entry.source === 'simulator' && entry.level === 'log')).toBe(true);
            expect(logs.every((entry) => entry.sessionId === session.id)).toBe(true);
        });

        it('flushes the trailing partial line on exit', async () => {
            const logs = collectLogs();
            await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });

            children[0].stdout.write('no trailing newline');
            await flush();
            expect(logs).toHaveLength(0);

            children[0].exit(0);
            await flush();
            expect(logs.map((entry) => entry.message)).toEqual(['no trailing newline']);
        });

        it('tags stderr lines as level error', async () => {
            const logs = collectLogs();
            await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });

            children[0].stderr.write('boom\n');
            await flush();

            expect(logs).toEqual([expect.objectContaining({ source: 'simulator', level: 'error', message: 'boom' })]);
        });
    });

    describe('onDidChangeSession', () => {
        it('fires on start with status running', async () => {
            const events = collectSessions();
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });

            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({ id: session.id, status: 'running', pid: session.pid });
            expect(events[0].readyAt).toBeUndefined();
        });

        it('fires again with readyAt on the first stdout chunk — editor 的 onCompleted 时机', async () => {
            const events = collectSessions();
            await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });

            children[0].stdout.write('booting\n');
            await flush();

            const ready = events.filter((event) => event.readyAt);
            expect(ready).toHaveLength(1);
            expect(ready[0].status).toBe('running');

            // 后续输出不再重复 fire。
            children[0].stdout.write('more\n');
            await flush();
            expect(events.filter((event) => event.readyAt)).toHaveLength(1);
        });

        it('fires on exit with the exit code', async () => {
            const events = collectSessions();
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });

            children[0].exit(3);
            await flush();

            const last = events[events.length - 1];
            expect(last).toMatchObject({ id: session.id, status: 'stopped', exitCode: 3 });
            expect(last.exitedAt).toBeTruthy();
        });

        it('fires on spawn error with exitCode -1', async () => {
            const events = collectSessions();
            const logs = collectLogs();
            mockSpawn.mockImplementationOnce(() => {
                const child = new FakeChild();
                setImmediate(() => child.emit('error', new Error('ENOENT')));
                return child;
            });
            await expect(simulatorManager.start({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' })).rejects.toThrow('ENOENT');

            expect(events[events.length - 1]).toMatchObject({ status: 'stopped', exitCode: -1 });
            expect(logs).toContainEqual(expect.objectContaining({ level: 'error', message: 'failed to start: ENOENT' }));
        });

        it('fires on stop', async () => {
            const events = collectSessions();
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });

            expect(await simulatorManager.stop(session.id)).toBe(true);
            expect(events[events.length - 1]).toMatchObject({ id: session.id, status: 'stopped' });
        });
    });

    describe('stop / stopAll', () => {
        it('escalates termination without depending on the treeKill callback', async () => {
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
            jest.useFakeTimers();
            try {
                mockTreeKill.mockImplementation((_pid, signal) => {
                    if (signal === 'SIGKILL') children[0].exit(null, signal);
                });
                const stop = simulatorManager.stop(session.id);
                await jest.advanceTimersByTimeAsync(3000);
                await expect(stop).resolves.toBe(true);
                expect(mockTreeKill.mock.calls.map(call => call[1])).toEqual(['SIGTERM', 'SIGKILL']);
            } finally { jest.useRealTimers(); }
        });

        it('keeps the process running in status when termination cannot be confirmed', async () => {
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
            jest.useFakeTimers();
            try {
                mockTreeKill.mockImplementation(() => {});
                const result = simulatorManager.stop(session.id).catch(error => error);
                await jest.advanceTimersByTimeAsync(6000);
                expect(await result).toBeInstanceOf(Error);
                expect(simulatorManager.getStatus(session.id)?.status).toBe('running');
            } finally { children[0].exit(0); jest.useRealTimers(); }
        });

        it('returns independent argument snapshots', async () => {
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
            session.args.length = 0;
            const snapshot = simulatorManager.getStatus(session.id)!;
            expect(snapshot.args.length).toBeGreaterThan(0);
            snapshot.args.length = 0;
            expect(simulatorManager.getStatus(session.id)!.args.length).toBeGreaterThan(0);
        });
        it('uses treeKill so simulator 的子进程一起走', async () => {
            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });
            await simulatorManager.stop(session.id);

            expect(mockTreeKill).toHaveBeenCalledTimes(1);
            expect(mockTreeKill.mock.calls[0][0]).toBe(session.pid);
            expect(mockTreeKill.mock.calls[0][1]).toBe('SIGTERM');
        });

        it('returns false for unknown or already stopped sessions', async () => {
            expect(await simulatorManager.stop('nope')).toBe(false);

            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });
            expect(await simulatorManager.stop(session.id)).toBe(true);
            expect(await simulatorManager.stop(session.id)).toBe(false);
        });

        it('still resolves when treeKill reports a failure（进程已经自己退了）', async () => {
            mockTreeKill.mockImplementation((_pid: number, _signal: string, callback?: (error?: Error) => void) => {
                callback?.(new Error('No matching processes'));
            });

            const session = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });
            children[0].exit(0);
            await flush();

            // exit 已经把状态改成 stopped，stop 直接返回 false 而不是抛。
            expect(await simulatorManager.stop(session.id)).toBe(false);
        });

        it('stops every running session and returns the count', async () => {
            await simulatorManager.start({ runtimeRoot: '/tmp/a' });
            await simulatorManager.start({ runtimeRoot: '/tmp/b' });
            const done = await simulatorManager.start({ runtimeRoot: '/tmp/c' });
            children[2].exit(0);
            await flush();

            expect(await simulatorManager.stopAll()).toBe(2);
            expect(simulatorManager.listSessions().filter((session) => session.status === 'running')).toHaveLength(0);
            expect(simulatorManager.getStatus(done.id)?.status).toBe('stopped');
            expect(await simulatorManager.stopAll()).toBe(0);
        });
    });

    describe('构建事件与去重', () => {
        it('cancels a running build and prevents queued builds from spawning', async () => {
            const results = Promise.allSettled([
                simulatorManager.buildRuntime('/fake/engine'),
                simulatorManager.buildNative('/fake/engine'),
            ]);
            await flush();
            expect(mockSpawn).toHaveBeenCalledTimes(1);
            await simulatorManager.stopAll();
            expect((await results).map(result => result.status)).toEqual(['rejected', 'rejected']);
            expect(mockSpawn).toHaveBeenCalledTimes(1);
        });
        /** 让 spawn 出来的构建子进程立刻以 `code` 退出。 */
        function autoExit(code: number, stdout?: string): void {
            mockSpawn.mockImplementation(() => {
                const child = new FakeChild();
                children.push(child);
                setImmediate(() => {
                    if (stdout) {
                        child.stdout.write(stdout);
                    }
                    child.exit(code);
                });
                return child;
            });
        }

        function collectBuildStates(): ISimulatorBuildState[] {
            const states: ISimulatorBuildState[] = [];
            disposers.push(simulatorManager.onDidChangeBuildState((state) => states.push(state)));
            return states;
        }

        it('broadcasts start then success — 对齐 editor 的两点广播', async () => {
            autoExit(0);
            const states = collectBuildStates();

            await simulatorManager.buildRuntime('/fake/engine');

            expect(states).toEqual([
                { step: 'runtime', state: 'start' },
                { step: 'runtime', state: 'success' },
            ]);
        });

        it('broadcasts failed with the error message', async () => {
            autoExit(1);
            const states = collectBuildStates();

            await expect(simulatorManager.buildNative('/fake/engine')).rejects.toThrow('Simulator build failed with exit code 1');

            expect(states).toEqual([
                { step: 'native', state: 'start' },
                { step: 'native', state: 'failed', error: 'Simulator build failed with exit code 1' },
            ]);
        });

        it('emits build output under source build and keeps the console passthrough', async () => {
            autoExit(0, 'compiling\n');
            const logs = collectLogs();

            await simulatorManager.buildRuntime('/fake/engine');

            expect(logs).toEqual([{ source: 'build', level: 'log', message: 'compiling' }]);
            // pipe 之后原来 stdio:'inherit' 那条路要靠 console.log 顶上，不能丢。
            expect(logSpy).toHaveBeenCalledWith('compiling');
        });

        it('collapses concurrent builds of the same engine into one child process', async () => {
            autoExit(0);

            await Promise.all([
                simulatorManager.buildRuntime('/fake/engine'),
                simulatorManager.buildRuntime('/fake/engine'),
                simulatorManager.buildRuntime('/fake/engine'),
            ]);

            expect(mockSpawn).toHaveBeenCalledTimes(1);
        });

        it('does not collapse different engines, nor后续的重新构建', async () => {
            autoExit(0);

            await Promise.all([
                simulatorManager.buildRuntime('/fake/engine-a'),
                simulatorManager.buildRuntime('/fake/engine-b'),
            ]);
            expect(mockSpawn).toHaveBeenCalledTimes(2);

            await simulatorManager.buildRuntime('/fake/engine-a');
            expect(mockSpawn).toHaveBeenCalledTimes(3);
        });

        it('collapses concurrent prepareResources targeting the same runtime root', async () => {
            const prepare = jest.spyOn(simulatorManager as unknown as { _prepareResources: () => Promise<unknown> }, '_prepareResources')
                .mockImplementation(() => new Promise((resolve) => setImmediate(() => resolve({}))));

            await Promise.all([
                simulatorManager.prepareResources({ runtimeRoot: '/tmp/shared' }),
                simulatorManager.prepareResources({ runtimeRoot: '/tmp/shared' }),
            ]);
            expect(prepare).toHaveBeenCalledTimes(1);

            await Promise.all([
                simulatorManager.prepareResources({ runtimeRoot: '/tmp/one' }),
                simulatorManager.prepareResources({ runtimeRoot: '/tmp/two' }),
            ]);
            expect(prepare).toHaveBeenCalledTimes(3);
        });
    });

    describe('launchPreview 先停后起', () => {
        it('cancels preparation and queued launches on stopAll', async () => {
            let release!: (value: unknown) => void;
            let entered!: () => void;
            const preparing = new Promise<void>(resolve => { entered = resolve; });
            jest.spyOn(simulatorManager as any, '_prepareResources').mockImplementation(() => {
                entered();
                return new Promise(resolve => { release = resolve; });
            });
            const options = { runtimeRoot: '/tmp/runtime', projectPath: '/fake/project', serverURL: 'http://127.0.0.1:7509' };
            const results = Promise.allSettled([simulatorManager.launchPreview(options), simulatorManager.launchPreview(options)]);
            await preparing;
            await simulatorManager.stopAll();
            release({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
            expect((await results).map(result => result.status)).toEqual(['rejected', 'rejected']);
            expect(mockSpawn).not.toHaveBeenCalled();
        });

        it('rejects invalid options before stopping a running preview', async () => {
            const first = await simulatorManager.start({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
            await expect(simulatorManager.launchPreview({ resolution: { width: 0, height: 640 } })).rejects.toThrow('resolution');
            await expect(simulatorManager.launchPreview({ serverURL: 'ftp://localhost' })).rejects.toThrow('HTTP(S)');
            expect(simulatorManager.getStatus(first.id)?.status).toBe('running');
        });
        it('serializes concurrent launches without losing their options', async () => {
            const prepare = jest.spyOn(simulatorManager as any, '_prepareResources')
                .mockImplementation(async () => {
                    expect(simulatorManager.listSessions().filter(s => s.status === 'running')).toHaveLength(0);
                    await new Promise(resolve => setImmediate(resolve));
                    return { runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' };
                });
            const options = { runtimeRoot: '/tmp/runtime', projectPath: '/fake/project', serverURL: 'http://127.0.0.1:7509' };
            const [first, last] = await Promise.all([
                simulatorManager.launchPreview({ ...options, startScene: 'first', resolution: { width: 800, height: 600 } }),
                simulatorManager.launchPreview({ ...options, startScene: 'last', resolution: { width: 960, height: 640 } }),
            ]);
            expect(prepare.mock.calls.map(call => (call[0] as any).startScene)).toEqual(['first', 'last']);
            expect(simulatorManager.getStatus(first.session.id)?.status).toBe('stopped');
            expect(simulatorManager.getStatus(last.session.id)?.args).toContain('960x640');
            expect(simulatorManager.listSessions().filter(s => s.status === 'running')).toHaveLength(1);
        });

        it('continues queued launches after a preparation failure', async () => {
            jest.spyOn(simulatorManager as any, '_prepareResources')
                .mockRejectedValueOnce(new Error('prepare failed'))
                .mockResolvedValue({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
            const options = { runtimeRoot: '/tmp/runtime', projectPath: '/fake/project', serverURL: 'http://127.0.0.1:7509' };
            const results = await Promise.allSettled([
                simulatorManager.launchPreview(options), simulatorManager.launchPreview(options),
            ]);
            expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled']);
            expect(simulatorManager.listSessions().filter(s => s.status === 'running')).toHaveLength(1);
        });

        it('stops the previous session before preparing, leaving a single running one', async () => {
            const order: string[] = [];
            jest.spyOn(simulatorManager as unknown as { _prepareResources: () => Promise<unknown> }, '_prepareResources')
                .mockImplementation(() => {
                    order.push('prepare');
                    return Promise.resolve({ runtimeRoot: '/tmp/runtime', writablePath: '/tmp/runtime' });
                });

            const first = await simulatorManager.start({ runtimeRoot: '/tmp/runtime' });
            order.push('first-started');

            const result = await simulatorManager.launchPreview({ projectPath: '/fake/project', serverURL: 'http://127.0.0.1:7509' });

            expect(simulatorManager.getStatus(first.id)?.status).toBe('stopped');
            expect(simulatorManager.getStatus(result.session.id)?.status).toBe('running');
            expect(simulatorManager.listSessions().filter((session) => session.status === 'running')).toHaveLength(1);
            // 停要发生在 prepare 之前：prepare 会清空并重写正在被打开的 runtime 目录。
            expect(order).toEqual(['first-started', 'prepare']);
        });
    });
});
