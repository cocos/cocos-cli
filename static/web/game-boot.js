/* global window, document, System, globalThis, fetch, location */

import { loadEngine, composeServerURL } from '/static/web/engine-loader.js';

/**
 * 浏览器游戏预览运行时引导。
 *
 * 引擎加载流程（SystemJS + import-map + 引擎 bundle）与场景编辑器的 scene-editor-boot.js
 * 共用 engine-loader.js，区别在于这里以 PREVIEW 模式加载，并在结尾调用 cc.game.init(settings)
 * 运行启动场景，而不是加载场景编辑器 bundle。流程对齐编辑器 preview-app/src/main.ts。
 */
export default async function gameBoot(addr = {}) {
    const showError = (e) => {
        const el = document.getElementById('error');
        if (el) {
            el.style.display = 'block';
            el.textContent = (e && (e.stack || e.message)) || String(e);
        }
    };

    try {
        // 以 PREVIEW 模式加载引擎（EDITOR=false / PREVIEW=true）
        const serverURL = composeServerURL(addr);
        const env = await loadEngine(serverURL, { preview: true });

        const _originalSystem = System;
        const cc = await System.import('cc');
        globalThis.System = _originalSystem;

        // 监听热重载（脚本/资源变化后服务端广播 browser:reload）
        try {
            if (window.io) {
                const socket = window.io(env.serverURL);
                socket.on('browser:reload', () => location.reload());
            }
        } catch (e) {
            console.warn('[Game Preview] live-reload socket unavailable:', e);
        }

        const settings = window._CCSettings || {};
        let launchScene = (settings.launch && settings.launch.launchScene) || '';
        // 启动场景以浏览器地址栏的 ?scene= 为准（uuid 或 db:// url）；
        // 其次用服务端注入的 __launchSceneQuery；都没有时回退到 settings 里的默认场景。
        const sceneOverride = new URLSearchParams(window.location.search).get('scene')
            || new URLSearchParams(window.__launchSceneQuery || '').get('scene');
        if (sceneOverride) {
            launchScene = sceneOverride;
        }

        // 构建引擎启动选项：以 settings 为基础，覆盖资源路径与启动场景（对齐编辑器 main.ts）
        const option = {
            debugMode: (cc.debug && cc.debug.DebugMode && cc.debug.DebugMode.INFO) || 1,
            overrideSettings: Object.assign({}, settings),
        };
        option.overrideSettings.assets = Object.assign({}, option.overrideSettings.assets, {
            // 资源全部由预览服务器动态托管，覆盖掉项目构建配置里可能存在的远程 server 地址
            server: env.serverURL,
            importBase: 'assets/general/import',
            nativeBase: 'assets/general/native',
            remoteBundles: [],
            subpackages: [],
        });
        option.overrideSettings.launch = Object.assign({}, option.overrideSettings.launch, {
            launchScene: '',
        });
        // 强制使用 WebGL 渲染（LegacyRenderMode.WEBGL = 2）。
        // 预览运行在 PREVIEW 模式（EDITOR=false），引擎 device-manager 在 AUTO 模式下
        // 会优先选 WebGPU（!EDITOR && supportWebGPU），而 dev-cli 引擎的 WebGPU 路径存在
        // 管线/绑定问题（vertex UBO 超 12 上限、cubemap 绑到 2D 槽）导致黑屏。
        // 编辑器预览同样走 WebGL，这里与之对齐。
        option.overrideSettings.rendering = Object.assign({}, option.overrideSettings.rendering, {
            renderMode: 2,
        });

        // 物理后端选择：预览用完整引擎（box2d / box2d-wasm / builtin 等所有后端都会在
        // EVENT_PRE_SUBSYSTEM_INIT 时各自 register），默认后端只是「最后注册的那个」，未必等于项目实际
        // 启用的后端，必须显式指定。模块列表取自 /scripting/engine/modules（= 项目 includeModules）。
        //
        // 关键时机与做法：物理世界在 game.init 内的 director.init() 首次创建（game.ts:
        // emit(EVENT_PRE_SUBSYSTEM_INIT) → director.init() → DirectorEvent.INIT → PhysicsSystem2D
        // 构造函数 createPhysicsWorld），用的是当时选定的后端。若在 game.init 之后再 switchTo，等于「先在
        // 默认后端建好世界、再切换重建」，项目脚本在 EVENT_GAME_INITED 里设置的状态（如 2D 物理
        // debugDrawFlags）会落到随后被丢弃的旧世界上而失效。
        // 而 selector.switchTo 只有在世界「已存在」时才会真正改后端（世界为 null 时只重建、不改后端），
        // 无法在世界创建前用它选后端。因此这里改为：在 game.init 之前注册 EVENT_PRE_SUBSYSTEM_INIT 回调，
        // 该回调在各后端 register 之后、世界创建之前触发，用 register(id, wrapper) 把项目后端设为默认
        // （register 在世界未创建时会把 selector 的 id/wrapper 指向该后端）。这样构造函数一次性就在正确
        // 后端上创建世界、之后不再重建，无需事后 re-emit EVENT_GAME_INITED。
        const Backends = {
            'physics-cannon': 'cannon.js',
            'physics-ammo': 'bullet',
            'physics-builtin': 'builtin',
            'physics-physx': 'physx',
        };
        const Backends2D = {
            'physics-2d-box2d': 'box2d',
            'physics-2d-box2d-wasm': 'box2d-wasm',
            'physics-2d-builtin': 'builtin',
        };
        let backend = 'builtin';
        let backend2d = 'builtin';
        let includeModules = null;
        try {
            includeModules = await (await fetch(`${env.serverURL}/scripting/engine/modules`)).json();
            (includeModules || []).forEach((m) => {
                if (m in Backends) backend = Backends[m];
                else if (m in Backends2D) backend2d = Backends2D[m];
            });
        } catch (e) {
            console.warn('[Game Preview] query engine modules failed, use default physics backend:', e);
        }
        // 自定义渲染管线：customPipeline = includeModules 是否含 'custom-pipeline'（与 Engine.syncConfig 的推导
        // 一致）。game.init 会读 settings.rendering.customPipeline 来建管线（game.ts:789）。这里用 disk-fresh 的
        // includeModules 覆盖该值，使切换「自定义/内置管线」后 reload 即生效（无需重启），与物理后端同一数据源。
        // 仅在成功取到 modules 时覆盖，避免请求失败时误把项目的自定义管线关掉。
        if (Array.isArray(includeModules)) {
            option.overrideSettings.rendering = Object.assign({}, option.overrideSettings.rendering, {
                customPipeline: includeModules.includes('custom-pipeline'),
            });
        }

        // Spine 版本：dev-cli 预览引擎同时编入 spine-3.8 与 spine-4.2（见 engine-compiler / cc.config.json
        // dynamic override），运行时按项目 includeModules 选定。必须在引擎初始化（spine WASM 实例化 +
        // spine-define patch）之前写入全局，供 spine-instantiate-dynamic.ts 读取。改配置 + 硬刷新即切换，
        // 无需重编引擎/重启。真机构建走独立管线、编译期单版本，不受影响。
        if (Array.isArray(includeModules)) {
            globalThis._CC_SPINE_VERSION = includeModules.includes('spine-4.2') ? '4.2' : '3.8';
        }
        // selector 走全局 cc：System.import('cc') 是公开 ES 导出，不含 internal（cc.internal 为 undefined）；
        // 引擎加载后把完整命名空间（含 internal.physics2d.selector）挂在 window.cc / globalThis.cc 上。
        const ccGlobal = (typeof window !== 'undefined' && window.cc) || globalThis.cc || cc;
        cc.game.once(cc.Game.EVENT_PRE_SUBSYSTEM_INIT, () => {
            // 用已注册的 wrapper 重新 register，把项目后端设为默认（此时世界尚未创建）。
            const seed = (selector, id) => {
                if (selector && selector.backend && selector.backend[id]) {
                    selector.register(id, selector.backend[id]);
                }
            };
            try {
                seed(ccGlobal.physics && ccGlobal.physics.selector, backend);
                seed(ccGlobal.internal && ccGlobal.internal.physics2d && ccGlobal.internal.physics2d.selector, backend2d);
            } catch (e) {
                console.warn('[Game Preview] seed physics backend failed:', e);
            }
        });

        await cc.game.init(option);

        // 分辨率适配策略（仅浏览器预览）：按项目 designResolution 设置套用 ResolutionPolicy，
        // 使预览的拉伸/留边行为与真机构建一致。预览 settings 里的 screen.designResolution.policy
        // 已由构建流程从 fitWidth/fitHeight 换算而来（SHOW_ALL / FIXED_WIDTH / FIXED_HEIGHT / NO_BORDER，
        // 见 builder/worker/builder/index.ts），优先使用；缺省时回退到 fitWidth/fitHeight 规则。
        // 场景编辑器（engine-bootstrap.ts）不走这里，保持 SHOW_ALL。
        try {
            const dr = settings && settings.screen && settings.screen.designResolution;
            if (dr) {
                const drWidth = Number(dr.width) || 1280;
                const drHeight = Number(dr.height) || 720;
                let drPolicy = dr.policy;
                if (drPolicy === undefined || drPolicy === null) {
                    drPolicy = cc.ResolutionPolicy.SHOW_ALL;
                    const fw = dr.fitWidth !== false;
                    const fh = dr.fitHeight === true;
                    if (fw && !fh) drPolicy = cc.ResolutionPolicy.FIXED_WIDTH;
                    else if (!fw && fh) drPolicy = cc.ResolutionPolicy.FIXED_HEIGHT;
                }
                cc.view.setDesignResolutionSize(drWidth, drHeight, drPolicy);
            }
        } catch (e) {
            console.warn('[Game Preview] set design resolution failed:', e);
        }

        await cc.game.run(async () => {
            cc.game.pause();

            const json = await (await fetch(`${env.serverURL}/scene/${encodeURIComponent(launchScene)}.json`)).json();
            try {
                launchScene = json[1]._id;
            } catch (e) {
                // ignore
            }
            cc.assetManager.loadWithJson(
                json,
                { assetId: launchScene },
                () => { /* progress */ },
                (err, sceneAsset) => {
                    if (err) {
                        showError(err);
                        cc.error(err);
                        return;
                    }
                    const scene = sceneAsset.scene;
                    scene._name = sceneAsset._name;
                    cc.director.runSceneImmediate(scene, () => {
                        cc.game.resume();
                    });
                }
            );
        });

        console.log('Cocos game preview started');
    } catch (err) {
        console.error('Failed to start game preview:', err.stack || err);
        showError(err);
    }
}
