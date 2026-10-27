import { installModuleMapDiagnostics } from './module-map-runtime.js';
/* global window, document, System, fetch */
import { runtimeResource, backendResource, resolveImportMap } from './runtime-resources.js';
let capabilityIds;
let pageSystem;

/**
 * 引擎加载公共流程。
 *
 * 浏览器游戏预览（game-boot.js）与场景编辑器预览（scene-editor-boot.js）共用这一段
 * 「web-env + SystemJS + import-map + 引擎 bundle」加载流程，唯一区别是运行模式：
 * 预览以 PREVIEW 模式（EDITOR=false / PREVIEW=true）加载，场景编辑器以默认编辑器模式加载。
 * 加载完成后各调用方自行 System.import('cc') 跑游戏，或 import scene-bundle 启服务。
 *
 * @param {{ preview?: boolean, backendBaseUrl?: string, runtimeResourceBase?: string }} [options] preview=true 时以 PREVIEW 模式加载引擎。
 * @returns {Promise<object>} 填充后的 window.WebEnv（含 serverURL / enginePath 等）。
 */
export async function loadEngine(options = {}) {
    const env = window.WebEnv = window.WebEnv || {};
    const backendBaseUrl = options.backendBaseUrl || env.serverURL;
    const runtimeResourceBase = options.runtimeResourceBase;
    const cliResourceBase = new URL('./', import.meta.url).href;
    const backend = name => backendResource(name, backendBaseUrl);
    const runtime = name => runtimeResource(name, cliResourceBase);
    const envRes = await fetch(backend('scripting/web-env'));
    if (!envRes.ok) throw new Error(`Web environment query failed: ${envRes.status}`);
    Object.assign(env, await envRes.json(), { serverURL: backendBaseUrl, runtimeResourceBase });

    await import(runtime('polyfills.bundle.js'));
    await import(backend('scripting/systemjs/system.js'));
    await import(backend('scripting/systemjs/extras/named-register.js'));

    // 注入 import map。动态注入外部 src import-map 存在时序问题（System.import 可能
    // 在其 fetch 完成前就解析 'cc'），因此先 fetch 再以内联方式注入，保证同步解析就绪。
    const sources = [
        new URL('import-map.json', cliResourceBase).href,
        '/scripting/engine-dist/import-map.json',
        '/scripting/x/pack-import-map-url',
        '/scripting/import-map-global',
    ];
    for (const src of sources) {
        const sourceUrl = src.startsWith('http:') || src.startsWith('https:') ? src : backend(src);
        const res = await fetch(sourceUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Import map query failed: ${sourceUrl} (${res.status})`);
        const map = resolveImportMap(await res.json(), sourceUrl);
        if (sourceUrl === sources[0]) capabilityIds = Object.keys(map.imports).filter(id => id.startsWith('cocos-cli/browser/'));
        const script = document.createElement('script');
        script.type = 'systemjs-importmap';
        script.textContent = JSON.stringify(map);
        document.head.appendChild(script);
    }

    System.setResolutionDetailMapCallback(function () {
        const url = new URL(backend('scripting/x/resolution-detail-map'));
        return fetch(url).then((response) => response.json()).then((json) => ({ json, url: url.href }));
    });

    await System.prepareImport(true);
    pageSystem = System;
    const packMapURL = backend('scripting/x/pack-import-map-url');
    installModuleMapDiagnostics(System, backendBaseUrl, {
        packMapURL,
        diagnosticURL: backend('scripting/module-diagnostic'),
        mapBaseURL: packMapURL,
    });

    await import(runtime('editor-stub-preload.js'));
    if (options.preview) {
        // 游戏预览必须以 PREVIEW 模式运行，而不是编辑器编辑模式。
        // editor-stub-preload 会设置 window.CC_EDITOR=true（场景编辑器预览需要），
        // 但在游戏预览里这会让引擎 internal:constants 解析出 EDITOR=true，
        // 进而 physics-selector 的 runInEditor=!EDITOR=false，导致物理世界不被创建
        // （PhysicsSystem.physicsWorld 为 null，setDefaultPhysicsMaterial 崩溃）。
        // 这里在引擎加载前覆盖为 PREVIEW 模式：EDITOR=false / PREVIEW=true。
        window.CC_EDITOR = false;
        window.CC_PREVIEW = true;
    }
    await import(runtime('editor-extends.bundle.js'));
    await import(backend('scripting/engine-dist/bundled/index.js'));

    return env;
}

/** Resolve shared implementations before evaluating the private view service classes. */
export async function prepareSceneCapabilities(environment) {
    if (!capabilityIds?.length) throw new Error('Load the engine before preparing scene capabilities');
    // ScriptService bundles an Executor-owned SystemJS that assigns globalThis.System
    // while evaluating. Keep the page loader instance so the import maps stay available
    // for the remaining capability modules and for the private view bundle.
    const system = pageSystem ?? System;
    await system.import('cocos-cli/browser/scene');
    if (globalThis.System !== system) globalThis.System = system;
    const modules = Object.create(null);
    for (const id of capabilityIds) {
        const namespace = await system.import(id);
        modules[id.slice('cocos-cli/browser/'.length)] = namespace.default || namespace;
    }
    return Object.freeze({ apiVersion: 1, identity: system, modules: Object.freeze(modules), environment });
}
