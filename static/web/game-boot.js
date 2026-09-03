/* global window, document, System, globalThis, fetch, location */

import { loadEngine } from '/static/web/engine-loader.js';

/**
 * 浏览器游戏预览运行时引导。
 *
 * 引擎加载流程（SystemJS + import-map + 引擎 bundle）与场景编辑器的 scene-editor-boot.js
 * 共用 engine-loader.js，区别在于这里以 PREVIEW 模式加载，并在结尾调用 cc.game.init(settings)
 * 运行启动场景，而不是加载场景编辑器 bundle。流程对齐编辑器 preview-app/src/main.ts。
 */
export default async function gameBoot() {
    // Creator 的带工具栏预览不是「游戏铺满浏览器窗口」：工具栏下的 GameDiv 是一个可独立
    // 调整尺寸的模拟设备帧。仅由显式 URL 开启，普通浏览器预览与 Simple Browser 不受影响。
    const previewToolbarEnabled = new URLSearchParams(window.location.search).get('previewToolbar') === '1';
    if (previewToolbarEnabled) {
        // 在引擎读取 GameDiv 尺寸前就建立 Creator 同款的 toolbar + content 布局，避免首帧按
        // 浏览器全窗口初始化后再跳变。
        document.body.classList.add('preview-toolbar-enabled');
    }

    const showError = (e) => {
        const el = document.getElementById('error');
        if (el) {
            el.style.display = 'block';
            el.textContent = (e && (e.stack || e.message)) || String(e);
        }
    };

    // 热重载自愈监听：加载共用的「接收端」脚本（创建 socket + 注册 browser:reload，置 window.__previewSocket）。
    // 关键：IDE 直接加载本 game-boot.js（其 webview 宿主页，不经过 game.ejs 首屏），因此必须在这里确保监听
    // 已装上；且要早于可能失败/阻塞的 loadEngine——CLI 未就绪时 boot 会失败，服务端在预览 settings 首次就绪
    // 时会广播 browser:reload（见 live-reload.ts），本页据此整页刷新自愈，无需手动刷新。若留到 boot 成功后
    // 再注册，失败的首屏就永远收不到通知、无法自愈。
    // 与 game.ejs 共用 preview-live-reload.js，避免两处 socket/监听逻辑重复、行为漂移（该文件无 import/export，
    // 既可作 classic <script src> 被 game.ejs 引入，也可在此作副作用 import）。
    // 去重：浏览器预览路径下 game.ejs 首屏已加载该脚本并置 window.__previewSocket，此处据此跳过。
    if (!window.__previewSocket) {
        try {
            await import('/static/web/preview-live-reload.js');
        } catch (e) {
            console.warn('[Game Preview] live-reload setup unavailable:', e);
        }
    }

    // Boot 门控：仅当预览 settings 就绪（后端已完成 asset 冷导入）时才加载引擎。
    // settings.js 在 CLI 未就绪时返回 503 → window._CCSettings 不会被赋值（宿主页在加载本文件前已同步
    // 注入 settings.js，故其缺失即代表后端未就绪，是可靠判据）。若此时仍继续 boot，loadEngine 会去动态
    // import /scripting/systemjs/system.js 等在 asset 冷导入期尚未就绪或事件循环繁忙而拉取失败的资源，
    // 概率性抛 "Failed to fetch dynamically imported module: .../system.js"。跳过后由上面注册的
    // browser:reload 监听在服务端 settings 首次就绪时整页刷新自愈：届时 settings.js 返回 200、programming
    // facet 早已就绪，system.js 必可用，正常 boot。
    if (window.__previewSettingsFailed || !window._CCSettings) {
        console.info('[Game Preview Warning] backend not ready (settings unavailable); skip boot, awaiting server-driven reload.');
        return;
    }

    try {
        // 以 PREVIEW 模式加载引擎（EDITOR=false / PREVIEW=true）
        const env = await loadEngine({ preview: true });

        const _originalSystem = System;
        const cc = await System.import('cc');
        globalThis.System = _originalSystem;

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
        const toolbarOptions = previewToolbarEnabled ? window.__previewToolbarOptions : undefined;
        // Creator 的公开模块 API 将 DebugMode 直接导出为 cc.DebugMode；cc.debug 是
        // legacy/global 调试对象，不能作为启动配置的枚举来源。
        const initialDebugMode = cc.DebugMode?.[toolbarOptions?.debugMode];
        const option = {
            debugMode: initialDebugMode ?? cc.DebugMode?.INFO ?? 1,
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
        if (previewToolbarEnabled) {
            // exactFitScreen=true 会让 Web screen adapter 将 GameDiv 认作浏览器窗口，故意拒绝
            // cc.screen.windowSize。Creator 的设备模拟需要 SubFrame 模式，才能只改变 GameDiv，
            // 而不把宿主窗口 resize 传给游戏。
            option.overrideSettings.screen = Object.assign({}, option.overrideSettings.screen, {
                exactFitScreen: false,
            });
            option.overrideSettings.profiling = Object.assign({}, option.overrideSettings.profiling, {
                showFPS: !!toolbarOptions?.showFps,
            });
        }

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

        // 场景 run 完成信号：resolve 于 runSceneImmediate 回调、reject 于加载错误。
        // gameBoot 只有在场景真正跑起来后才视为成功——IDE 预览 boot 据此 fire view:ready，
        // 避免在场景仍在加载/失败时过早上报就绪。
        let resolveSceneRun;
        let rejectSceneRun;
        const sceneRunDone = new Promise((resolve, reject) => {
            resolveSceneRun = resolve;
            rejectSceneRun = reject;
        });

        await cc.game.run(async () => {
            // 引擎的 game.run 返回 void：该 async 回调是 fire-and-forget，回调内的异常不会传播到
            // 外层 try/catch。因此整条场景加载路径必须在这里全部捕获并收敛到 rejectSceneRun——
            // 否则 fetch/解析失败时 `await sceneRunDone` 永远 pending，boot 挂死：
            // IDE 预览（PinK previewMain 等 await gameBoot() 的消费方）卡在 loading 且无法触发
            // view:error 重试，浏览器首屏则表现为游戏停在 pause 无任何报错。
            try {
                cc.game.pause();

                // Preview in Editor：当启动场景为 __current__ 时，读回编辑器 POST 上来的
                // 「当前编辑场景」实时快照（/scene/current.json），而非从磁盘按 uuid 取已保存场景。
                // 该快照是 sceneUtils.serialize 的输出（与编辑器 save/reload 同一路径），
                // 故与常规路径一样 fetch → .json() → loadWithJson。
                const isCurrent = launchScene === '__current__';
                const sceneJsonUrl = isCurrent
                    ? `${env.serverURL}/scene/current.json`
                    : `${env.serverURL}/scene/${encodeURIComponent(launchScene)}.json`;
                const resp = await fetch(sceneJsonUrl);
                if (!resp.ok) {
                    // 快照未写入（未点 Play / 已停止）时 /scene/current.json 返回 404 且带
                    // { error } JSON body；磁盘场景缺失走 next() 兜底也可能是非 200。把状态码与
                    // 服务端 error 一并带进消息，便于错误浮层定位。
                    let detail = '';
                    try {
                        detail = (await resp.json()).error || '';
                    } catch (e) {
                        // 非 JSON body（如网关 502 HTML），忽略
                    }
                    throw new Error(`fetch scene failed: ${resp.status}${detail ? ` (${detail})` : ''} ${sceneJsonUrl}`);
                }
                const json = await resp.json();
                let loadOptions = null;
                if (!isCurrent) {
                    try {
                        launchScene = json[1]._id;
                    } catch (e) {
                        // ignore
                    }
                    loadOptions = { assetId: launchScene };
                }
                cc.assetManager.loadWithJson(
                    json,
                    loadOptions,
                    () => { /* progress */ },
                    (err, sceneAsset) => {
                        if (err) {
                            showError(err);
                            cc.error(err);
                            rejectSceneRun(err instanceof Error ? err : new Error(String(err)));
                            return;
                        }
                        try {
                            const scene = sceneAsset.scene;
                            scene._name = sceneAsset._name;
                            cc.director.runSceneImmediate(scene, () => {
                                cc.game.resume();
                                resolveSceneRun();
                            });
                        } catch (e) {
                            showError(e);
                            rejectSceneRun(e instanceof Error ? e : new Error(String(e)));
                        }
                    }
                );
            } catch (e) {
                showError(e);
                rejectSceneRun(e instanceof Error ? e : new Error(String(e)));
            }
        });

        // 等待场景真正 run 起来后再视为 boot 成功。
        await sceneRunDone;

        console.log('Cocos game preview started');
    } catch (err) {
        console.error('Failed to start game preview:', err.stack || err);
        showError(err);
        // 重新抛出，让 await gameBoot() 的调用方（IDE 预览 boot、game.ejs）能感知失败。
        // 浏览器 game.ejs 已用 try/catch 包裹，不会产生未处理拒绝。
        throw err;
    }
}
