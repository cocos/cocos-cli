/**
 * 往 simulator runtime 目录写产物的部分：settings、bundle 索引、`cc/env`、
 * `main.js` / `application.js` 模板渲染，以及构建产物的存在性校验。
 *
 * 和 `index.ts` 分开是因为这些函数只依赖 fs / ejs / 引擎自身，不碰 builder、asset-db、
 * preview server，所以可以在单元测试里直接对着临时目录跑（见
 * `tests/simulator-runtime.test.ts`）。
 */

import ejs from 'ejs';
import { copy, ensureDir, pathExists, writeFile } from 'fs-extra';
import { dirname, join } from 'path';

import { GlobalPaths } from '../../global';
import { formatPath, ResolutionPolicy, validatePreviewOrigin } from './internal';

export interface IPreviewData {
    settings: any;
    bundleConfigs: any[];
    features: string[];
}

export interface IDesignResolution {
    width: number;
    height: number;
    policy?: number;
}

export interface IRuntimeScriptContext {
    /** 预览服务器地址，例如 `http://127.0.0.1:7509`。 */
    serverURL: string;
    /** 项目根目录（未格式化，函数内部会转成正斜杠）。 */
    projectPath: string;
    waitForConnect?: boolean;
}

export interface IApplicationScriptContext extends IRuntimeScriptContext {
    previewSceneJsonPath: string;
    designResolution: IDesignResolution;
}

/**
 * simulator bootstrap 用的 pack import-map。走的是 preview server 的「原样」import-map
 * （保留 `cce:/internal/x/cc`），而不是浏览器用的 `pack-import-map-url` 变体
 * （那个会把 cc 索引删掉交给浏览器 bundle）。
 */
export const PACK_IMPORT_MAP_URL = '/scripting/x/import-map.json';
export const PACK_RESOLUTION_DETAIL_MAP_URL = '/scripting/x/resolution-detail-map.json';

function simulatorTemplate(name: string): string {
    return join(GlobalPaths.workspace, 'static', 'simulator', name);
}

export function requireFromEngine<T = any>(request: string, enginePath: string): T {
    const resolved = require.resolve(request, {
        paths: [enginePath, GlobalPaths.workspace],
    });
    return require(resolved) as T;
}

export async function generateBundleIndex(bundleName: string): Promise<string> {
    const bundleEntry = bundleName === 'main' ? ['cce:/internal/x/prerequisite-imports'] : [];
    return await ejs.renderFile(simulatorTemplate('bundleIndex.ejs'), {
        bundleName,
        bundleEntry,
    });
}

export async function writeSettingsFiles(resourcesPath: string, previewData: IPreviewData): Promise<void> {
    await ensureDir(join(resourcesPath, 'src'));
    const settings = JSON.parse(JSON.stringify(previewData.settings));
    // simulator 在 onGameStarted 中通过 loadWithJson 加载 preview-scene.json，
    // 包括未保存场景。不要先触发 game 的自动 loadScene，否则可能阻断该回调。
    if (settings.launch) {
        delete settings.launch.launchScene;
    }
    await writeFile(join(resourcesPath, 'src', 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

    for (const config of previewData.bundleConfigs) {
        const outputConfig = JSON.parse(JSON.stringify(config));
        // simulator 从本地 assets/<bundle> 读，importBase / nativeBase 是浏览器预览的远端前缀。
        delete outputConfig.importBase;
        delete outputConfig.nativeBase;

        const bundleDir = join(resourcesPath, 'assets', outputConfig.name);
        await ensureDir(bundleDir);
        const bundleConfigJson = `${JSON.stringify(outputConfig, null, 2)}\n`;
        await writeFile(join(bundleDir, 'cc.config.json'), bundleConfigJson, 'utf8');
        // 引擎 downloadBundle 读取 config.json；同时保留工具侧使用的 cc.config.json。
        await writeFile(join(bundleDir, 'config.json'), bundleConfigJson, 'utf8');
        await writeFile(join(bundleDir, 'index.js'), await generateBundleIndex(outputConfig.name), 'utf8');
    }
}

/**
 * 生成 simulator runtime 需要的 builtin 模块（`cc/env`）。
 *
 * 与 editor simulator 一致：`cc` 索引模块不在这里生成，而是由 preview server 的 quick-pack
 * 产物提供（`cce:/internal/x/cc` → `q-bundled:///virtual/cc.js`），feature 集合天然与项目
 * 配置一致；引擎 feature unit 由 `bin/simulator/import-map.json` 映射到本地 `src/cocos-js/*.js`。
 */
export async function writeRuntimeEngineBootstrap(resourcesPath: string, enginePath: string): Promise<void> {
    const ccbuild = requireFromEngine<any>('@cocos/ccbuild', enginePath);
    const { BuiltinModuleProvider } = requireFromEngine<any>('@cocos/lib-programming/dist/builtin-module-provider', enginePath);

    const cceEnvFile = join(resourcesPath, 'src', 'builtin', 'cce.env.js');
    await ensureDir(dirname(cceEnvFile));

    const statsQuery = await ccbuild.StatsQuery.create(enginePath);
    const ccEnvConstants = statsQuery.constantManager.genCCEnvConstants({
        mode: 'PREVIEW',
        platform: 'NATIVE',
        flags: {
            DEBUG: true,
        },
    });
    const builtinModuleProvider = await BuiltinModuleProvider.create({ format: 'systemjs' });
    await builtinModuleProvider.addBuildTimeConstantsMod(ccEnvConstants);

    await writeFile(cceEnvFile, builtinModuleProvider.modules['cc/env'], 'utf8');
}

export async function renderMainScript(context: IRuntimeScriptContext): Promise<string> {
    const serverURL = validatePreviewOrigin(context.serverURL);
    return await ejs.renderFile(simulatorTemplate('main.ejs'), {
        libraryPath: formatPath(join(context.projectPath, 'library')),
        waitForConnect: !!context.waitForConnect,
        projectPath: formatPath(context.projectPath),
        serverURL,
        packImportMapURL: new URL(PACK_IMPORT_MAP_URL, serverURL).href,
        userlandMacroURL: new URL('/scripting/userland/macro', serverURL).href,
        packResolutionDetailMapURL: PACK_RESOLUTION_DETAIL_MAP_URL,
    });
}

export async function renderApplicationScript(context: IApplicationScriptContext): Promise<string> {
    const serverURL = validatePreviewOrigin(context.serverURL);
    return await ejs.renderFile(simulatorTemplate('application.ejs'), {
        previewSceneJsonPath: formatPath(context.previewSceneJsonPath),
        libraryPath: formatPath(join(context.projectPath, 'library')),
        projectPath: formatPath(context.projectPath),
        designResolution: {
            width: context.designResolution.width,
            height: context.designResolution.height,
            resolutionPolicy: context.designResolution.policy ?? ResolutionPolicy.ResolutionShowAll,
        },
        serverURL,
    });
}

export async function copyIfExists(src: string, dest: string): Promise<void> {
    if (!(await pathExists(src))) {
        return;
    }
    await ensureDir(dirname(dest));
    await copy(src, dest, { overwrite: true });
}

/**
 * `prepareResources` 依赖的构建产物清单。缺任何一项都说明 `npm run build:simulator`
 * 没跑（或只跑了一半），提前报错比让 simulator 在启动时白屏更好定位。
 */
export function listRequiredSimulatorArtifacts(enginePath: string): string[] {
    return [
        join(enginePath, 'bin', 'native-preview'),
        join(enginePath, 'bin', 'native-preview', 'base.js'),
        join(enginePath, 'bin', 'adapter', 'native', 'web-adapter.js'),
        join(enginePath, 'bin', 'adapter', 'native', 'engine-adapter.js'),
        join(enginePath, 'bin', 'simulator', 'import-map.json'),
        join(enginePath, 'bin', 'simulator', 'system.bundle.js'),
        join(enginePath, 'bin', 'simulator', 'polyfills.bundle.js'),
    ];
}

export async function assertRequiredSimulatorArtifacts(enginePath: string): Promise<void> {
    for (const filePath of listRequiredSimulatorArtifacts(enginePath)) {
        if (!(await pathExists(filePath))) {
            throw new Error(`Required simulator artifact is missing: ${filePath}. Run \`npm run build:simulator\` first.`);
        }
    }
}
