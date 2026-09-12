/**
 * Simulator runtime 产物验证（② runtime 验证）。
 *
 * 合并自三份旧测试，按「从静态产物 → 各写入步骤 → 端到端」的层次组织：
 * - 构建产物一致性：`workflow/build-simulator*.js` 与 `core/simulator` 的平台产物表、
 *   `packages/engine/bin/simulator/import-map.json` 与 `buildImportMap()`、`main.ejs` 的 bootstrap 约定。
 * - runtime-writer 各写入步骤：settings / bundle 索引 / `cc/env` / `main.js` /
 *   `application.js` / `config.json` / 产物校验，逐个对着临时目录验证。
 * - `prepareResources()` 端到端：靠 `runtimeRoot` 把产物写到临时目录，不覆盖开发者
 *   当前准备好的 runtime。
 *
 * 只有「需要真实项目 / preview server」的依赖（builder、asset-db、include-modules 校验）
 * 被 mock；引擎 runtime 产物（native-preview、bin/simulator 的 bundle）走真实实现。
 *
 * native C++ 可执行文件与 jsb-adapter 是重产物，测试不探测它们是否存在：
 * `simulatorManager.getExecutablePath` 被 stub 成固定路径只验证透传；
 * `runtime-writer.assertRequiredSimulatorArtifacts` 在 prepareResources 流程里被 mock 成
 * no-op（其真实行为由下方 assertRequiredSimulatorArtifacts 用例经 jest.requireActual
 * 单独覆盖）。
 */

import { existsSync, readFileSync } from 'fs';
import { ensureDir, mkdtemp, pathExists, readFile, readJSON, remove, writeFile } from 'fs-extra';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { platformArtifacts } from '../src/core/simulator/internal';
import {
    PACK_IMPORT_MAP_URL,
    copyIfExists,
    generateBundleIndex,
    renderApplicationScript,
    renderMainScript,
    writeRuntimeEngineBootstrap,
    writeSettingsFiles,
} from '../src/core/simulator/runtime-writer';

const buildSimulator = require('../workflow/build-simulator.js');
const buildSimulatorRuntime = require('../workflow/build-simulator-runtime.js');

const workspace = resolve(__dirname, '..');
const enginePath = resolve(__dirname, '..', 'packages', 'engine');
const simulatorStaticDir = join(enginePath, 'bin', 'simulator');

/** 原生可执行文件的期望路径。测试里 stub 掉真实 exe 探测，只验证这个路径被透传。 */
const FAKE_EXECUTABLE_PATH = join(
    enginePath,
    'native',
    'simulator',
    'Release',
    process.platform === 'win32' ? 'SimulatorApp-Win32.exe' : 'SimulatorApp-Mac.app',
);

/** `cc.config.json` 里挂在 physics 后端下的内置物理材质，项目没开物理时必须被裁掉。 */
const PHYSICS_MATERIAL_UUID = 'ba21476f-2866-4f81-9c4d-6e359316e448';
/** 分别挂在 `base` / `2d` 下的真实内置资源，必须被保留。 */
const BASE_ASSET_UUID = '970b0598-bcb0-4714-91fb-2e81440dccd8';
const SPRITE_ASSET_UUID = '60f7195c-ec2a-45eb-ba94-8955f60e81d0';

/** 项目实际启用的模块，不含任何物理后端。 */
const INCLUDE_MODULES = ['base', '2d', 'ui', 'gfx-webgl2'];

const mockGetPreviewSettings = jest.fn();
const mockQueryDefaultBuildConfigByPlatform = jest.fn();
const mockQueryAssetInfos = jest.fn();
const mockGetEffectBinPath = jest.fn();

jest.mock('../src/core/builder', () => ({
    getPreviewSettings: (...args: unknown[]) => mockGetPreviewSettings(...args),
    queryDefaultBuildConfigByPlatform: (...args: unknown[]) => mockQueryDefaultBuildConfigByPlatform(...args),
}));

jest.mock('../src/core/builder/share/common-options-validator', () => ({
    fillIncludeModulesFromProjectConfig: (options: Record<string, unknown>) => {
        options.includeModules = [...INCLUDE_MODULES];
    },
}));

jest.mock('../src/core/assets', () => ({
    assetDBManager: {},
    assetManager: {
        queryAssetInfos: (...args: unknown[]) => mockQueryAssetInfos(...args),
        getEffectBinPath: (...args: unknown[]) => mockGetEffectBinPath(...args),
    },
}));

// jsb-adapter 由 `build:adapter` / `@cocos/engine-platforms` 产出，不属于 `build:simulator:runtime`，
// 单测里不要求它真实存在；其拷贝逻辑由 runtime-writer 的 copyIfExists 单测覆盖。
// 只覆盖 assertRequiredSimulatorArtifacts 一个导出；其余导出走 ...actual 的真实实现。
jest.mock('../src/core/simulator/runtime-writer', () => {
    const actual = jest.requireActual('../src/core/simulator/runtime-writer');
    return {
        ...actual,
        assertRequiredSimulatorArtifacts: jest.fn().mockResolvedValue(undefined),
    };
});

import { simulatorManager, type ISimulatorPreparedResources } from '../src/core/simulator';

// 原生 C++ exe 是重产物，测试不探测它是否存在；固定返回一个路径验证透传。
jest.spyOn(simulatorManager, 'getExecutablePath').mockResolvedValue(FAKE_EXECUTABLE_PATH);

// 上面的 jest.mock 把 assertRequiredSimulatorArtifacts 换成了 no-op（prepareResources 流程需要），
// 这里拿到真实实现，给 assertRequiredSimulatorArtifacts 用例单独覆盖。
const realRuntimeWriter = jest.requireActual('../src/core/simulator/runtime-writer') as typeof import('../src/core/simulator/runtime-writer');

interface IImportMap {
    imports: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

function readImportMap(): IImportMap {
    // import-map.json 是 build 产物、不进版本库（见 .gitignore），新克隆的仓库里不存在。
    // 这里给一句明确的提示，否则会在 collection 阶段抛裸 ENOENT，看不出该跑什么。
    const filePath = join(simulatorStaticDir, 'import-map.json');
    if (!existsSync(filePath)) {
        throw new Error(`${filePath} is missing. Run \`npm run build:simulator:runtime\` first.`);
    }
    return JSON.parse(readFileSync(filePath, 'utf8')) as IImportMap;
}

function readMainEjs(): string {
    return readFileSync(join(workspace, 'static', 'simulator', 'main.ejs'), 'utf8');
}

// ---------------------------------------------------------------------------
// 构建产物一致性
// ---------------------------------------------------------------------------

describe('build artifacts consistency', () => {
    describe('simulator platform artifacts', () => {
        it('places generated support files inside the selected engine', () => {
            const customEngine = resolve('/tmp/custom-engine');
            const generatedDir = buildSimulatorRuntime.getSimulatorStaticDir(customEngine);
            expect(generatedDir).toBe(join(customEngine, 'bin', 'simulator'));
            for (const name of ['import-map.json', 'system.bundle.js', 'polyfills.bundle.js']) {
                expect(realRuntimeWriter.listRequiredSimulatorArtifacts(customEngine)).toContain(join(generatedDir, name));
            }
        });
        it('keeps workflow/build-simulator.js and core/simulator in sync', () => {
            // 构建脚本决定「产出哪个可执行文件」，core/simulator 决定「运行时去哪里找」。
            // 两张表必须逐字段相同，否则 launchPreview 会报 executable is unavailable。
            expect(buildSimulator.platformArtifacts).toEqual(platformArtifacts);
        });

        it('only declares the two supported desktop hosts', () => {
            expect(Object.keys(platformArtifacts).sort()).toEqual(['darwin', 'win32']);
        });

        it('derives the win32 writable-path app name from the executable name', () => {
            // getSimulatorWritablePath 会用 entry 的 basename 去掉 .exe 当作
            // %LOCALAPPDATA% 下的目录名，这里锁死这个假设。
            expect(platformArtifacts.win32!.entry).toBe('SimulatorApp-Win32.exe');
            expect(platformArtifacts.win32!.bundle).toBe('SimulatorApp-Win32.exe');
        });

        it('points the darwin entry inside the declared app bundle', () => {
            const darwin = platformArtifacts.darwin!;
            expect(darwin.entry.startsWith(`${darwin.bundle}/`)).toBe(true);
        });
    });

    describe('buildImportMap', () => {
        const { buildImportMap } = buildSimulatorRuntime as {
            buildImportMap: (featureUnits: string[]) => IImportMap;
        };

        it('maps every feature unit to its local systemjs chunk', () => {
            const map = buildImportMap(['base', 'physics-framework', 'spine-3.8']);
            expect(map.imports['cce:/internal/x/cc-fu/base']).toBe('./cocos-js/base.js');
            expect(map.imports['cce:/internal/x/cc-fu/physics-framework']).toBe('./cocos-js/physics-framework.js');
            expect(map.imports['cce:/internal/x/cc-fu/spine-3.8']).toBe('./cocos-js/spine-3.8.js');
        });

        it('provides the cc/env builtin under both ids', () => {
            const map = buildImportMap([]);
            expect(map.imports['cc/env']).toBe('./builtin/cce.env.js');
            expect(map.imports['cce.env']).toBe('./builtin/cce.env.js');
            expect(Object.keys(map.imports)).toHaveLength(2);
        });

        it('never declares bare aliases or the cc index module', () => {
            // `cc` 和 `cce:/internal/x/cc` 必须来自 preview server 的 quick-pack import-map，
            // 否则 simulator 会加载一份 feature 集合与项目配置不一致的 cc 索引。
            const map = buildImportMap(['base', 'physics-framework']);
            expect(map.imports).not.toHaveProperty('cc');
            expect(map.imports).not.toHaveProperty('cce:/internal/x/cc');
            expect(map.scopes).toBeUndefined();
        });
    });

    describe('packages/engine/bin/simulator/import-map.json', () => {
        const map = readImportMap();

        it('is a round-trip of buildImportMap over its own feature units', () => {
            const { buildImportMap } = buildSimulatorRuntime as {
                buildImportMap: (featureUnits: string[]) => IImportMap;
            };
            const prefix = 'cce:/internal/x/cc-fu/';
            const featureUnits = Object.keys(map.imports)
                .filter((id) => id.startsWith(prefix))
                .map((id) => id.slice(prefix.length));

            expect(featureUnits.length).toBeGreaterThan(0);
            expect(buildImportMap(featureUnits)).toEqual(map);
        });

        it('does not shadow the quick-pack cc index', () => {
            expect(map.imports).not.toHaveProperty('cc');
            expect(map.imports).not.toHaveProperty('cce:/internal/x/cc');
            expect(map.imports).not.toHaveProperty('cce:/internal/x/prerequisite-imports');
        });

        it('resolves every entry to a relative path under src/', () => {
            for (const [id, target] of Object.entries(map.imports)) {
                expect(target.startsWith('./')).toBe(true);
                expect(target.endsWith('.js')).toBe(true);
                expect(id).not.toContain('\\');
                expect(target).not.toContain('\\');
            }
        });
    });

    describe('static/simulator/main.ejs', () => {
        const source = readMainEjs();

        it('takes the pack import-map from the preview server', async () => {
            const rendered = await renderMainScript({ serverURL: 'https://localhost:8443', projectPath: '/project' });
            expect(rendered).toContain('https://localhost:8443/scripting/x/import-map.json');
        });

        it('does not hard-wire the cc index module to a local chunk', () => {
            // 这行是移植初期的兜底，会盖掉 quick-pack 的 `cce:/internal/x/cc`。
            expect(source).not.toContain("'cce:/internal/x/cc':");
        });

        it('keeps only the bare cc alias plus the userland macro alias locally', () => {
            const localMapBlock = source.slice(
                source.indexOf("importMapList.push({ location: './'"),
                source.indexOf('System.warmup('),
            );
            expect(localMapBlock).toContain("'cc': 'cce:/internal/x/cc',");
            expect(localMapBlock).toContain("'cc/userland/macro':");
            const aliases = localMapBlock
                .split('\n')
                .map((line) => /^\s*'([^']+)':/.exec(line))
                .filter((match): match is RegExpExecArray => !!match)
                .map((match) => match[1]);
            expect(aliases).toEqual(['cc', 'cc/userland/macro']);
        });

        it('references the virtual cc index exactly once', () => {
            // 只有 `'cc' -> 'cce:/internal/x/cc'` 这一处；真正的实现由 quick-pack import-map 提供。
            expect(source.match(/cce:\/internal\/x\//g)).toHaveLength(1);
        });

        it('does not eagerly import engine feature units', () => {
            // 曾经用 eager import physics-framework 来绕过 cc.PhysicMaterial 反序列化失败，
            // 真实原因是 builtinAssets 没按项目模块裁剪，修好后这个 hack 必须保持删除状态。
            expect(source).not.toContain('cce:/internal/x/cc-fu/');
            expect(source).not.toContain('eagerModules');
        });

        it('boots through System.warmup and then the application module', () => {
            expect(source).toContain('System.warmup(');
            expect(source).toContain("System.import('./src/application.js')");
            expect(source).toContain("System.import('cc')");
        });
    });

    describe('simulator runtime build helpers', () => {
        const { selectSpineFeature, parseSimulatorSpineFeature, getSimulatorRuntimeBuildPlatform } = buildSimulatorRuntime as {
            selectSpineFeature: (features: string[], preferred?: string) => { selected?: string; features: string[] };
            parseSimulatorSpineFeature: (argv?: string[]) => string | undefined;
            getSimulatorRuntimeBuildPlatform: () => string;
        };

        it('keeps exactly one spine feature', () => {
            const result = selectSpineFeature(['base', 'spine-3.8', 'spine-4.2'], 'spine-4.2');
            expect(result.selected).toBe('spine-4.2');
            expect(result.features).toEqual(['base', 'spine-4.2']);
        });

        it('throws when the requested spine feature is unavailable', () => {
            expect(() => selectSpineFeature(['base', 'spine-3.8'], 'spine-9.9'))
                .toThrow(/spine-9\.9/);
        });

        it('is a no-op when the engine has no spine feature at all', () => {
            const result = selectSpineFeature(['base', '2d'], 'spine-3.8');
            expect(result.selected).toBeUndefined();
            expect(result.features).toEqual(['base', '2d']);
        });

        it('parses --spineFeature in both argv styles', () => {
            expect(parseSimulatorSpineFeature(['--spineFeature', 'spine-4.2'])).toBe('spine-4.2');
            expect(parseSimulatorSpineFeature(['--spineFeature=spine-4.2'])).toBe('spine-4.2');
            expect(parseSimulatorSpineFeature([])).toBeUndefined();
        });

        it('maps the host platform to an engine build platform', () => {
            expect(['WINDOWS', 'MAC', 'NATIVE']).toContain(getSimulatorRuntimeBuildPlatform());
        });
    });
});

// ---------------------------------------------------------------------------
// runtime-writer 各写入步骤
// ---------------------------------------------------------------------------

describe('runtime writer steps', () => {
    let tempDir = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'cocos-simulator-runtime-'));
    });

    afterEach(async () => {
        await remove(tempDir);
    });

    describe('generateBundleIndex', () => {
        it('pulls prerequisite-imports into the main bundle only', async () => {
            const main = await generateBundleIndex('main');
            const resources = await generateBundleIndex('resources');
            expect(main).toContain('cce:/internal/x/prerequisite-imports');
            expect(resources).not.toContain('cce:/internal/x/prerequisite-imports');
        });
    });

    describe('writeSettingsFiles', () => {
        const previewData = {
            settings: { engine: { engineModules: ['base'], builtinAssets: [] }, assets: {} },
            bundleConfigs: [
                { name: 'main', importBase: 'http://127.0.0.1:7509/import', nativeBase: 'http://127.0.0.1:7509/native', uuids: [] },
                { name: 'resources', importBase: 'http://127.0.0.1:7509/import', nativeBase: '', uuids: [] },
            ],
            features: ['base'],
        };

        it('writes src/settings.json', async () => {
            await writeSettingsFiles(tempDir, previewData);
            await expect(readJSON(join(tempDir, 'src', 'settings.json'))).resolves.toMatchObject({
                engine: { engineModules: ['base'] },
            });
        });

        it('writes matching runtime and tool configs plus index.js per bundle', async () => {
            await writeSettingsFiles(tempDir, previewData);
            for (const name of ['main', 'resources']) {
                expect(await pathExists(join(tempDir, 'assets', name, 'cc.config.json'))).toBe(true);
                expect(await readFile(join(tempDir, 'assets', name, 'config.json'), 'utf8'))
                    .toBe(await readFile(join(tempDir, 'assets', name, 'cc.config.json'), 'utf8'));
                expect(await pathExists(join(tempDir, 'assets', name, 'index.js'))).toBe(true);
            }
        });

        it('disables automatic scene loading without changing caller settings or other launch options', async () => {
            const settings = { ...previewData.settings, launch: { launchScene: 'saved-scene', otherOption: true } };
            await writeSettingsFiles(tempDir, { ...previewData, settings });
            const written = await readJSON(join(tempDir, 'src', 'settings.json'));
            expect(written.launch).toEqual({ otherOption: true });
            expect(written.engine).toEqual(settings.engine);
            expect(settings.launch).toEqual({ launchScene: 'saved-scene', otherOption: true });
        });

        it('strips the remote import/native bases', async () => {
            // simulator 从本地 assets/<bundle> 读，留着远端前缀会让 AssetManager 走 HTTP。
            await writeSettingsFiles(tempDir, previewData);
            const config = await readJSON(join(tempDir, 'assets', 'main', 'config.json'));
            expect(config).not.toHaveProperty('importBase');
            expect(config).not.toHaveProperty('nativeBase');
            expect(config.name).toBe('main');
        });

        it('does not mutate the caller bundleConfigs', async () => {
            await writeSettingsFiles(tempDir, previewData);
            expect(previewData.bundleConfigs[0].importBase).toBe('http://127.0.0.1:7509/import');
        });
    });

    describe('writeRuntimeEngineBootstrap', () => {
        it('emits a systemjs cc/env module and nothing else', async () => {
            await writeRuntimeEngineBootstrap(tempDir, enginePath);
            const cceEnv = join(tempDir, 'src', 'builtin', 'cce.env.js');
            expect(await pathExists(cceEnv)).toBe(true);

            const source = await readFile(cceEnv, 'utf8');
            expect(source).toContain('System.register');
            // PREVIEW / NATIVE / DEBUG 三个常量必须落在产物里，application.js 和引擎都要读。
            expect(source).toContain('PREVIEW');
            expect(source).toContain('NATIVE');
            expect(source).toContain('DEBUG');
        });

        it('does not generate a cc index module', async () => {
            // cc 索引改由 preview server 的 quick-pack 提供；这里再生成一份就会 feature 不一致。
            await writeRuntimeEngineBootstrap(tempDir, enginePath);
            expect(await pathExists(join(tempDir, 'src', 'cocos-js', 'cc.js'))).toBe(false);
        });
    });

    describe('renderMainScript', () => {
        const context = {
            serverURL: 'http://127.0.0.1:7509',
            projectPath: 'C:\\projects\\demo',
        };

        it.each(['onerror', 'ontimeout', 'onabort'])('rejects bootstrap requests on %s', async event => {
            const source = await renderMainScript(context);
            class XHR {
                timeout = 0;
                open() {}
                send() { queueMicrotask(() => (this as any)[event]()); }
            }
            const { fetchText } = new Function('window', 'XMLHttpRequest',
                source.slice(0, source.indexOf('(async function ()')) + '; return { fetchText };')({ location: {} }, XHR);
            await expect(fetchText('https://localhost/script.js')).rejects.toThrow('https://localhost/script.js');
        });

        it('propagates remote script evaluation failures', async () => {
            const source = await renderMainScript(context);
            class XHR {
                status = 200;
                response = 'invalid';
                open() {}
                send() { queueMicrotask(() => (this as any).onload()); }
            }
            const { httpHandler } = new Function('window', 'XMLHttpRequest', 'console',
                source.slice(0, source.indexOf('(async function ()')) + '; return { httpHandler };')(
                { location: {}, eval() { throw new Error('bad script'); } }, XHR, { log() {}, error() {} });
            await expect(httpHandler('https://localhost/script.js')).rejects.toThrow('bad script');
        });

        it('injects the preview server host and port', async () => {
            const source = await renderMainScript(context);
            expect(source).toContain('http://127.0.0.1:7509/');
            expect(source).toContain(`http://127.0.0.1:7509${PACK_IMPORT_MAP_URL}`);
        });

        it('emits windows paths with forward slashes', async () => {
            // 生成的是 JS 源码，`\` 会被当转义符；native 的 FileUtils 认 `/`。
            const source = await renderMainScript(context);
            expect(source).not.toContain('C:\\projects');
        });

        it('only emits the debugger statement when waiting for a connection', async () => {
            expect(await renderMainScript({ ...context, waitForConnect: true })).toContain('debugger');
            expect(await renderMainScript({ ...context, waitForConnect: false })).not.toContain('debugger');
        });

        it('produces syntactically valid javascript', async () => {
            const source = await renderMainScript(context);
            expect(() => new Function(source)).not.toThrow();
        });

        it('does not leave unrendered ejs tags behind', async () => {
            const source = await renderMainScript(context);
            expect(source).not.toContain('<%');
        });
    });

    describe('renderApplicationScript', () => {
        const context = {
            serverURL: 'http://127.0.0.1:7509',
            projectPath: 'C:\\projects\\demo',
            previewSceneJsonPath: 'C:\\sim\\Resources\\preview-scene.json',
            designResolution: { width: 1280, height: 720, policy: 4 },
            hasPhysicsAmmo: false,
        };

        it('preserves special characters when the generated application executes', async () => {
            const projectPath = "C:\\R&D\\O'Brien\"\nproject";
            const previewSceneJsonPath = projectPath + '/preview-scene.json';
            const source = await renderApplicationScript({ ...context, projectPath, previewSceneJsonPath });
            let Application: any;
            const readScene = jest.fn(() => '{}');
            new Function('System', 'jsb', source)({
                register: (_deps: unknown, factory: any) => factory((_name: string, value: any) => { Application = value; }, {}),
            }, { fileUtils: { getStringFromFile: readScene } });
            const app = new Application();
            app.init({ game: { onPostBaseInitDelegate: { add() {} }, onPostSubsystemInitDelegate: { add() {} } }, assetManager: { loadWithJson() {} } });
            app.onGameStarted();
            expect(app.projectPath).toBe(projectPath.replace(/\\/g, '/'));
            expect(readScene).toHaveBeenCalledWith(previewSceneJsonPath.replace(/\\/g, '/'));
        });

        it.each(['http://localhost:7509', 'https://localhost', 'https://localhost:8443'])('preserves the server origin %s', async serverURL => {
            const main = await renderMainScript({ ...context, serverURL });
            expect(main).toContain(JSON.stringify(serverURL + '/scripting/x/import-map.json'));
            expect(main).toContain(JSON.stringify(serverURL + '/scripting/userland/macro'));
            let Application: any;
            const source = await renderApplicationScript({ ...context, serverURL });
            new Function('System', source)({ register: (_deps: unknown, factory: any) => factory((_name: string, value: any) => { Application = value; }, {}) });
            expect(new Application().previewServer).toBe(serverURL);
        });

        it.each(['ftp://localhost', 'https://localhost/preview', 'https://localhost/?query=1'])('rejects unsupported server addresses %s', async serverURL => {
            await expect(renderMainScript({ ...context, serverURL })).rejects.toThrow('HTTP(S) origin');
            await expect(renderApplicationScript({ ...context, serverURL })).rejects.toThrow('HTTP(S) origin');
        });

        it('injects the design resolution and policy', async () => {
            const source = await renderApplicationScript(context);
            expect(source).toContain('1280');
            expect(source).toContain('720');
        });

        it('emits windows paths with forward slashes', async () => {
            const source = await renderApplicationScript(context);
            expect(source).toContain('C:/sim/Resources/preview-scene.json');
            expect(source).toContain('C:/projects/demo/library');
            expect(source).not.toContain('C:\\');
        });

        it('produces syntactically valid javascript', async () => {
            const source = await renderApplicationScript(context);
            expect(() => new Function(source)).not.toThrow();
        });

        it('does not leave unrendered ejs tags behind', async () => {
            const source = await renderApplicationScript(context);
            expect(source).not.toContain('<%');
        });
    });

    describe('copyIfExists', () => {
        it('is a no-op for a missing source', async () => {
            const dest = join(tempDir, 'dest', 'missing.js');
            await copyIfExists(join(tempDir, 'nope.js'), dest);
            expect(await pathExists(dest)).toBe(false);
        });

        it('creates the destination directory and overwrites', async () => {
            const src = join(tempDir, 'src.js');
            const dest = join(tempDir, 'a', 'b', 'dest.js');
            await writeFile(src, 'v1', 'utf8');
            await copyIfExists(src, dest);
            await writeFile(src, 'v2', 'utf8');
            await copyIfExists(src, dest);
            expect(await readFile(dest, 'utf8')).toBe('v2');
        });
    });

    describe('assertRequiredSimulatorArtifacts', () => {
        // 文件顶部的 jest.mock 把这个导出在 prepareResources 流程里换成了 no-op；
        // 这里直接拿真实实现来测它的清单与抛错行为。
        const { assertRequiredSimulatorArtifacts, listRequiredSimulatorArtifacts } = realRuntimeWriter;

        it('lists the engine and static artifacts prepareResources depends on', () => {
            const required = listRequiredSimulatorArtifacts(enginePath);
            expect(required).toContain(join(enginePath, 'bin', 'native-preview'));
            expect(required).toContain(join(enginePath, 'bin', 'adapter', 'native', 'engine-adapter.js'));
            expect(required).toContain(join(enginePath, 'bin', 'simulator', 'import-map.json'));
            expect(required).toContain(join(enginePath, 'bin', 'simulator', 'system.bundle.js'));
            expect(required).toContain(join(enginePath, 'bin', 'simulator', 'polyfills.bundle.js'));
        });

        it('passes when every required artifact is present', async () => {
            // 所有必需产物都在 fakeEngine 内伪造，不依赖 native 构建。
            const fakeEngine = join(tempDir, 'engine');
            await ensureDir(join(fakeEngine, 'bin', 'simulator'));
            for (const name of ['import-map.json', 'system.bundle.js', 'polyfills.bundle.js']) {
                await writeFile(join(fakeEngine, 'bin', 'simulator', name), 'stub');
            }
            await ensureDir(join(fakeEngine, 'bin', 'native-preview'));
            await writeFile(join(fakeEngine, 'bin', 'native-preview', 'base.js'), 'stub');
            await ensureDir(join(fakeEngine, 'bin', 'adapter', 'native'));
            for (const name of ['web-adapter.js', 'engine-adapter.js']) {
                await writeFile(join(fakeEngine, 'bin', 'adapter', 'native', name), 'stub', 'utf8');
            }
            await expect(assertRequiredSimulatorArtifacts(fakeEngine)).resolves.toBeUndefined();
        });

        it('names the missing artifact and points at the build script', async () => {
            const emptyEngine = join(tempDir, 'engine');
            await ensureDir(emptyEngine);
            await expect(assertRequiredSimulatorArtifacts(emptyEngine))
                .rejects.toThrow(/Required simulator artifact is missing.*npm run build:simulator/s);
        });
    });
});

// ---------------------------------------------------------------------------
// prepareResources 端到端
// ---------------------------------------------------------------------------

describe('prepareResources (end-to-end)', () => {
    let tempDir = '';
    let runtimeRoot = '';
    let projectPath = '';

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'cocos-simulator-prepare-'));
        runtimeRoot = join(tempDir, 'Resources');
        projectPath = join(tempDir, 'project');

        mockQueryDefaultBuildConfigByPlatform.mockResolvedValue({
            platform: 'windows',
            includeModules: [],
        });
        mockQueryAssetInfos.mockReturnValue([
            { url: 'db://assets/scene.scene', uuid: 'scene-uuid' },
        ]);
        mockGetEffectBinPath.mockResolvedValue('');
        mockGetPreviewSettings.mockResolvedValue(previewSettings());
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await remove(tempDir);
    });

    /**
     * 模拟 `builder.getPreviewSettings` 的返回。`builtinAssets` 刻意按预览构建的真实行为
     * 写成「全部 feature 的 dependentAssets」，好验证 prepareResources 的裁剪。
     */
    function previewSettings(bundleNames = ['main']): Record<string, unknown> {
        return {
            settings: {
                engine: {
                    engineModules: [...INCLUDE_MODULES],
                    builtinAssets: [BASE_ASSET_UUID, PHYSICS_MATERIAL_UUID, SPRITE_ASSET_UUID],
                },
                assets: { projectBundles: ['resources'] },
                screen: { designResolution: { width: 1280, height: 720, policy: 4 } },
                splashScreen: { totalTime: 3000 },
                launch: { launchScene: 'scene-uuid' },
            },
            bundleConfigs: bundleNames.map((name) => ({
                name,
                importBase: 'http://127.0.0.1:7509/import',
                nativeBase: 'http://127.0.0.1:7509/native',
                uuids: [],
            })),
        };
    }

    async function prepare(
        overrides: Parameters<typeof simulatorManager.prepareResources>[0] = {},
    ): Promise<ISimulatorPreparedResources> {
        return await simulatorManager.prepareResources({
            enginePath,
            runtimeRoot,
            projectPath,
            serverURL: 'http://127.0.0.1:7509',
            startScene: 'scene-uuid',
            previewSceneJson: { __type__: 'cc.SceneAsset' },
            ...overrides,
        });
    }

    describe('prepareResources runtimeRoot override', () => {
        it('writes everything under the given runtimeRoot and nothing into the app bundle', async () => {
            const prepared = await prepare();

            expect(prepared.runtimeRoot).toBe(runtimeRoot);
            // 默认（不传 writablePath）时跟随 runtimeRoot，不去写 %LOCALAPPDATA% / app bundle。
            expect(prepared.writablePath).toBe(runtimeRoot);
            for (const filePath of [
                prepared.mainScriptPath,
                prepared.applicationScriptPath,
                prepared.settingsPath,
                prepared.previewSceneJsonPath,
                prepared.configPath,
            ]) {
                expect(filePath.startsWith(runtimeRoot)).toBe(true);
                expect(await pathExists(filePath)).toBe(true);
            }
            expect(prepared.configPaths).toEqual([prepared.configPath]);
        });

        it('passes the executable path through without probing a real build', async () => {
            const prepared = await prepare();
            // getExecutablePath 被 stub：这里只验证 prepareResources 把可执行文件路径原样透传，
            // 且它不落在 runtimeRoot 之下（可执行文件从来不属于 runtime 产物）。
            expect(prepared.executablePath).toBe(FAKE_EXECUTABLE_PATH);
            expect(prepared.executablePath.startsWith(runtimeRoot)).toBe(false);
        });

        it('honours an explicit writablePath and writes both config copies', async () => {
            // 模拟 Windows 的形态：writable path 与 runtime 根目录不是同一个。
            const writablePath = join(tempDir, 'debugruntime');
            const prepared = await prepare({ writablePath });

            expect(prepared.writablePath).toBe(writablePath);
            expect(prepared.configPaths).toEqual([
                join(runtimeRoot, 'config.json'),
                join(writablePath, 'config.json'),
            ]);
            const [a, b] = await Promise.all(prepared.configPaths.map((p) => readFile(p, 'utf8')));
            expect(a).toBe(b);
        });

        it('resolves a relative writablePath against the runtimeRoot', async () => {
            const prepared = await prepare({ writablePath: 'gamecaches' });
            expect(prepared.writablePath).toBe(join(runtimeRoot, 'gamecaches'));
        });
    });

    describe('prepareResources output', () => {
        it('keeps builtin preload assets of the enabled modules and drops the rest', async () => {
            // 这就是 cc.PhysicMaterial 反序列化崩溃的修复点：项目没开物理，
            // 内置物理材质就不能进 builtinResMgr 的预加载列表，但 base / 2d 的必须留下。
            await prepare();
            const settings = await readJSON(join(runtimeRoot, 'src', 'settings.json'));
            expect(settings.engine.builtinAssets).toEqual([BASE_ASSET_UUID, SPRITE_ASSET_UUID]);
            expect(settings.engine.engineModules).toEqual(INCLUDE_MODULES);
        });

        it('zeroes the splash screen time', async () => {
            await prepare();
            const settings = await readJSON(join(runtimeRoot, 'src', 'settings.json'));
            expect(settings.splashScreen.totalTime).toBe(0);
        });

        it('strips the remote bundle bases and emits a bundle index', async () => {
            await prepare();
            const bundleConfig = await readJSON(join(runtimeRoot, 'assets', 'main', 'config.json'));
            expect(bundleConfig).not.toHaveProperty('importBase');
            expect(bundleConfig).not.toHaveProperty('nativeBase');
            expect(await readFile(join(runtimeRoot, 'assets', 'main', 'index.js'), 'utf8'))
                .toContain('cce:/internal/x/prerequisite-imports');
        });

        it('copies the engine runtime and systemjs bundles', async () => {
            await prepare();
            // jsb-adapter 由 build:adapter 产出，不属于 runtime build，这里不测。
            for (const relative of [
                join('src', 'import-map.json'),
                join('src', 'system.bundle.js'),
                join('src', 'polyfills.bundle.js'),
                join('src', 'cocos-js', 'base.js'),
                join('src', 'builtin', 'cce.env.js'),
            ]) {
                expect(await pathExists(join(runtimeRoot, relative))).toBe(true);
            }
        });

        it('does not emit a simulator-owned cc index module', async () => {
            // cc 索引必须来自 preview server 的 quick-pack，本地再生成一份就会 feature 不一致。
            await prepare();
            expect(await pathExists(join(runtimeRoot, 'src', 'cocos-js', 'cc.js'))).toBe(false);
            const importMap = await readJSON(join(runtimeRoot, 'src', 'import-map.json'));
            expect(importMap.imports).not.toHaveProperty('cc');
            expect(importMap.imports).not.toHaveProperty('cce:/internal/x/cc');
        });

        it('renders bootable main.js / application.js pointing at the preview server', async () => {
            const prepared = await prepare();
            const main = await readFile(prepared.mainScriptPath, 'utf8');
            const application = await readFile(prepared.applicationScriptPath, 'utf8');

            for (const source of [main, application]) {
                expect(source).not.toContain('<%');
                expect(() => new Function(source)).not.toThrow();
            }
            expect(main).toContain('http://127.0.0.1:7509/scripting/x/import-map.json');
            expect(application).toContain('1280');
            expect(application).toContain('720');
            // 资产基址必须指向 preview server 的 /sim-assets 内容路由，不能指项目 library 磁盘路径：
            // 单个磁盘 base 只覆盖一个 library 目录，而内置资产在 engine 的 internal db library
            // （editor/library），不在项目 library，直读磁盘够不到 → readFile failed。/sim-assets 路由
            // 用 getLibraryDirs 聚合所有 db 的 library 目录（含引擎 editor/library）。
            expect(application).toContain("importBase: this.previewServer + '/sim-assets'");
            expect(application).toContain("nativeBase: this.previewServer + '/sim-assets'");
        });

        it('takes the config.json resolution from the design resolution by default', async () => {
            const prepared = await prepare();
            await expect(readJSON(prepared.configPath)).resolves.toMatchObject({
                entry: 'main.js',
                width: 1280,
                height: 720,
                isLandscape: false,
                waitForConnect: false,
            });
        });

        it('lets explicit resolution / landscape / waitForConnect win', async () => {
            const prepared = await prepare({
                resolution: { width: 1334, height: 750 },
                landscape: true,
                waitForConnect: true,
            });
            await expect(readJSON(prepared.configPath)).resolves.toMatchObject({
                width: 1334,
                height: 750,
                isLandscape: true,
                waitForConnect: true,
            });
            expect(await readFile(prepared.mainScriptPath, 'utf8')).toContain('debugger');
        });

        it('points config.json entry at the generated main.js', async () => {
            const prepared = await prepare();
            const config = await readJSON(prepared.configPath) as { entry: string };
            expect(join(runtimeRoot, config.entry)).toBe(prepared.mainScriptPath);
        });

        it('writes the given previewSceneJson verbatim', async () => {
            const prepared = await prepare({ previewSceneJson: '["raw-scene"]' });
            expect(await readFile(prepared.previewSceneJsonPath, 'utf8')).toBe('["raw-scene"]');
        });

        it('marks project bundles as remote when an assetServerURL is given', async () => {
            await prepare({ assetServerURL: 'http://10.0.0.2:7509/' });
            const settings = await readJSON(join(runtimeRoot, 'src', 'settings.json'));
            expect(settings.assets.server).toBe('http://10.0.0.2:7509');
            expect(settings.assets.remoteBundles).toEqual(['resources']);
        });

        it('is idempotent across repeated runs', async () => {
            const first = await prepare();
            const before = await readFile(first.mainScriptPath, 'utf8');
            const second = await prepare();
            expect(second.runtimeRoot).toBe(first.runtimeRoot);
            expect(await readFile(second.mainScriptPath, 'utf8')).toBe(before);
        });

        it('removes obsolete engine scripts and effect data on restart', async () => {
            await prepare();
            await writeFile(join(runtimeRoot, 'src', 'cocos-js', 'obsolete.js'), 'old engine');
            await writeFile(join(runtimeRoot, 'src', 'effect.bin'), 'old effects');
            await prepare();
            expect(await pathExists(join(runtimeRoot, 'src', 'cocos-js', 'obsolete.js'))).toBe(false);
            expect(await pathExists(join(runtimeRoot, 'src', 'effect.bin'))).toBe(false);
        });

        it('clears stale bundles instead of merging them', async () => {
            await prepare();
            expect(await pathExists(join(runtimeRoot, 'assets', 'main'))).toBe(true);

            mockGetPreviewSettings.mockResolvedValueOnce(previewSettings(['resources']));
            await prepare();
            expect(await pathExists(join(runtimeRoot, 'assets', 'resources', 'index.js'))).toBe(true);
            expect(await pathExists(join(runtimeRoot, 'assets', 'main'))).toBe(false);
        });
    });
});
