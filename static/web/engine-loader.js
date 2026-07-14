/* global window, document, System, fetch */

/**
 * 由 ip / port 组装服务地址；未提供 ip 时回退到当前页面 origin。
 * @param {{ ip?: string, port?: number|string, https?: boolean }} [addr]
 * @returns {string}
 */
export function composeServerURL(addr = {}) {
    const { ip, port, https } = addr;
    if (!ip) return window.location.origin;
    const protocol = https ? 'https' : 'http';
    return port ? `${protocol}://${ip}:${port}` : `${protocol}://${ip}`;
}

/**
 * 引擎加载公共流程。
 *
 * 浏览器游戏预览（game-boot.js）与场景编辑器预览（scene-editor-boot.js）共用这一段
 * 「web-env + SystemJS + import-map + 引擎 bundle」加载流程，唯一区别是运行模式：
 * 预览以 PREVIEW 模式（EDITOR=false / PREVIEW=true）加载，场景编辑器以默认编辑器模式加载。
 * 加载完成后各调用方自行 System.import('cc') 跑游戏，或 import scene-bundle 启服务。
 *
 * @param {string} serverURL 服务地址（http[s]://ip:port），由调用方（boot）传入。
 * @param {{ preview?: boolean }} [options] preview=true 时以 PREVIEW 模式加载引擎。
 * @returns {Promise<object>} 加载环境（含 serverURL / enginePath 等）。
 */
export async function loadEngine(serverURL, options = {}) {
    const env = { serverURL };
    const envRes = await fetch(`${serverURL}/scripting/web-env`);
    Object.assign(env, await envRes.json());

    await import('/static/web/polyfills.bundle.js');
    await import('/scripting/systemjs/system.js');
    await import('/scripting/systemjs/extras/named-register.js');

    // 注入 import map。动态注入外部 src import-map 存在时序问题（System.import 可能
    // 在其 fetch 完成前就解析 'cc'），因此先 fetch 再以内联方式注入，保证同步解析就绪。
    const sources = [
        '/scripting/engine-dist/import-map.json',
        '/scripting/x/pack-import-map-url',
        '/scripting/import-map-global',
    ];
    for (const src of sources) {
        const res = await fetch(new URL(src, env.serverURL));
        const text = await res.text();
        const script = document.createElement('script');
        script.type = 'systemjs-importmap';
        script.textContent = text;
        document.head.appendChild(script);
    }

    System.setResolutionDetailMapCallback(function () {
        const url = new URL('/scripting/x/resolution-detail-map', env.serverURL);
        return fetch(url).then((response) => response.json()).then((json) => ({ json, url: url.href }));
    });

    const { initEditorStub } = await import('/static/web/editor-stub-preload.js');
    initEditorStub(serverURL);
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
    await import('/static/web/editor-extends.bundle.js');
    await import('/scripting/engine-dist/bundled/index.js');

    return env;
}
