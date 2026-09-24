import type { IReflectionProbeSceneIdentity } from '../common/reflection-probe';
import * as EditorExtends from '../../engine/editor-extends';
import { Rpc } from './rpc';
import { serviceManager } from './service/service-manager';
import { Service as DecoratorService } from './service/core/decorator';
import { ServiceEvents } from './service/core';
import { ReferenceImageService } from './service/reference-image';
import { messageManager } from './service/message';
import { initLocalI18n } from './i18n';
import { CUSTOM_PIPELINE_MODULE } from '../../engine/graphics-config';
import { fetchSceneEditorSettings, syncSceneEditorBundles } from './scene-editor-assets';
import { installLightProbeNormalReset } from './light-probe-normal-reset';
import type { IEditorSessionService } from './service/core/editor-session';

import './service';

// Patch UuidUtils for casing compatibility
if (EditorExtends.UuidUtils) {
    const U = EditorExtends.UuidUtils as any;
    U.decompressUuid = U.decompressUuid || U.decompressUUID;
    U.compressUuid = U.compressUuid || U.compressUUID;
    U.isUuid = U.isUuid || U.isUUID;
    U.uuid = U.uuid || U.generate;
}

export { serviceManager, EditorExtends };
export const Service = DecoratorService;
// This value is intentionally exported through the preview bridge. Its module
// registers the service with @register(), and this live export prevents the
// web bundle from pruning that registration side effect.
export { ReferenceImageService };

declare const cc: any;

const DEFERRED_MODULE_CACHE_KEY = '__cocosCliDeferredEngineModules';

export async function startup(options: {
    serverURL: string;
    /**
     * 「Preview in Editor」游戏视图模式：调用方（scene-editor-boot.js）在加载引擎前已置
     * window.isPreviewProcess = true（使 internal:constants 解析出 EDITOR_NOT_IN_PREVIEW=false：
     * director.tick 派发输入帧、mainLoop 按游戏时钟算 dt）；startup 在引擎模块求值后显式置
     * cc.GAME_VIEW=true（见下方赋值处注释——上游 global-exports 的自动赋值分支在 dev-cli
     * 产物上永不执行，且不改引擎源码）。与场景编辑器的其余差异：设计分辨率策略改按预览
     * settings（_CCSettings.screen）套用，对齐浏览器游戏预览（game-boot.js）的拉伸/留边行为；
     * 编辑器 tick 不自动恢复，由 PreviewPlay 服务在播放/暂停切换时接管（Engine.pause/resume）。
     */
    gameView?: boolean;
}) {
    const { serverURL, gameView } = options;
    const defaultConfig = await fetch(`${serverURL}/scripting/engine/game-config`);
    const config = await defaultConfig.json();
    const modules = await fetch(`${serverURL}/scripting/engine/modules`);
    const features = (await modules.json()) as string[];
    config.overrideSettings = config.overrideSettings || {};
    config.overrideSettings.rendering = config.overrideSettings.rendering || {};
    const customPipeline = features.includes(CUSTOM_PIPELINE_MODULE);
    config.overrideSettings.rendering.customPipeline = customPipeline;
    if (customPipeline && !config.overrideSettings.rendering.effectSettingsPath) {
        config.overrideSettings.rendering.effectSettingsPath = `${serverURL}/scripting/engine/effect-settings`;
    }
    const sceneEditorSettings = await fetchSceneEditorSettings(serverURL);

    serviceManager.initialize(serverURL);

    const requiredModules = [
        'cc',
        'cc/editor/populate-internal-constants',
        'cc/editor/serialization',
        'cc/editor/new-gen-anim',
        'cc/editor/embedded-player',
        'cc/editor/reflection-probe',
        'cc/editor/lod-group-utils',
        'cc/editor/material',
        'cc/editor/2d-misc',
        'cc/editor/offline-mappings',
        'cc/editor/custom-pipeline',
        'cc/editor/animation-clip-migration',
        'cc/editor/exotic-animation',
        'cc/editor/color-utils',
    ];
    const deferredModuleCache: Record<string, unknown> = Object.create(null);
    (globalThis as any)[DEFERRED_MODULE_CACHE_KEY] = deferredModuleCache;

    // IMPORTANT: We must NOT use import() here because Rollup's
    // resolveId hook aliases cc/editor/* to a cc re-export stub,
    // which means the real engine side-effect modules never load.
    // We use the __moduleImport placeholder which is replaced with SystemJS's module.import().
    for (const mod of requiredModules) {
        try {
            deferredModuleCache[mod] = await System.import(mod);
        } catch (e) {
            console.error('Failed to load engine module:', mod, 'e:', e);
        }
    }

    if (gameView) {
        // 显式置位 cc.GAME_VIEW（此时引擎模块已求值完毕、场景尚未加载）。
        // 为什么需要手动赋值：dev-cli 引擎产物的 internal:constants 是运行时模块，恒会导出
        // EDITOR_NOT_IN_PREVIEW（= CC_EDITOR && !isPreviewProcess），使引擎 global-exports 里
        // 「EDITOR_NOT_IN_PREVIEW === undefined 才按 isPreviewProcess 赋 GAME_VIEW」的分支永不执行。
        // GAME_VIEW 的全部消费方——node-activator.activateComp/destroyComp、component-scheduler
        // .enableComp/disableComp/enableInEditor、camera.setDefaultUsage——都是**运行时读取**，
        // 在这里赋值即可完整生效，无需改动上游引擎源码（packages/engine 保持 pristine，重新同步不丢失）。
        // 唯一例外：node-dev.ts 的模块级 IS_PREVIEW 捕获仍为 false → Node._onPreDestroy 保留编辑器
        // undo polyfill（destroy 语义与场景编辑器一致，对 gameplay 影响可忽略；Creator game view
        // 因引擎构建期常量折叠而无此 polyfill，属已知且接受的差异）。
        const ccLegacy = (globalThis as any).cc;
        if (ccLegacy) {
            ccLegacy.GAME_VIEW = true;
        }
    }

    // ---- hack creator 使用的一些 engine 参数
    await import('cc/polyfill/engine');
    // overwrite
    const overwrite = await import('cc/overwrite');
    const handle = overwrite.default || overwrite;
    if (typeof handle === 'function') {
        handle(cc);
    }

    (globalThis as any).cce = (globalThis as any).cce || {};
    (globalThis as any).cce.Script = DecoratorService.Script;
    (globalThis as any).cli = {};
    (globalThis as any).cli.Scene = DecoratorService;
    (globalThis as any).cli.SceneEvents = messageManager;

    if (EditorExtends.init) {
        await EditorExtends.init();
    }

    // Load serialize/geometry/prefab utils (depends on cc, must run after engine loads)
    try {
        const serializeUtils = await import('../../engine/editor-extends/utils/serialize');
        const ee = (globalThis as any).EditorExtends;
        ee.serialize = serializeUtils.serialize;
        ee.serializeCompiled = serializeUtils.serializeCompiled;
        ee.deserializeFull = await import('../../engine/editor-extends/utils/deserialize');
        ee.GeometryUtils = await import('../../engine/editor-extends/utils/geometry');
        ee.PrefabUtils = await import('../../engine/editor-extends/utils/prefab');
    } catch (e) {
        console.warn('[engine-bootstrap] Failed to load editor-extends utils:', e);
    }
    await Rpc.startup({ serverURL });
    await initLocalI18n();

    // Spine 版本：dev-cli 引擎同时编入 spine-3.8 与 spine-4.2，按项目 includeModules 选定。
    // 必须在 game.init（spine WASM 实例化 + spine-define patch）之前写入全局，供 spine-instantiate-dynamic 读取。
    (globalThis as any)._CC_SPINE_VERSION = features.includes('spine-4.2') ? '4.2' : '3.8';
    cc.physics.selector.runInEditor = true;

    await cc.game.init(config);
    installLightProbeNormalReset(cc);
    // scene 进程运行在编辑器内嵌视图中，屏幕方向无意义；项目设置默认 'auto' 会让
    // screenAdapter.orientation 停在 Orientation.AUTO(13)，引擎 resize 时对未映射方向打 DEBUG 告警，这里固定为竖屏。
    cc.view.setOrientation(cc.macro.ORIENTATION_PORTRAIT);
    await syncSceneEditorBundles(serverURL, sceneEditorSettings?.bundleConfigs);

    let backend = 'builtin';
    const Backends: Record<string, string> = {
        'physics-cannon': 'cannon.js',
        'physics-ammo': 'bullet',
        'physics-builtin': 'builtin',
        'physics-physx': 'physx',
    };
    features.forEach((m: string) => {
        if (m in Backends) {
            backend = Backends[m];
        }
    });

    // 切换物理引擎
    cc.physics.selector.switchTo(backend);
    if (cc.physics.PhysicsSystem?.instance) {
        cc.physics.PhysicsSystem.instance.enable = false;
    }
    const dr = config?.overrideSettings?.screen?.designResolution;
    const drWidth = dr?.width ?? 1280;
    const drHeight = dr?.height ?? 720;
    let drPolicy = cc.ResolutionPolicy.SHOW_ALL;
    let drApplyWidth = drWidth;
    let drApplyHeight = drHeight;
    // FIXED_WIDTH / FIXED_HEIGHT should only be used by preview.
    // gameView（Preview in Editor）模式下会按预览 settings 覆盖为项目策略（见下方分支）。
    // if (dr) {
    //     const fw = dr.fitWidth !== false;
    //     const fh = dr.fitHeight === true;
    //     if (fw && !fh) drPolicy = cc.ResolutionPolicy.FIXED_WIDTH;
    //     else if (!fw && fh) drPolicy = cc.ResolutionPolicy.FIXED_HEIGHT;
    // }
    if (gameView) {
        // 游戏视图（Preview in Editor）：按预览 settings 的设计分辨率策略套用 ResolutionPolicy，
        // 使拉伸/留边行为与浏览器游戏预览（game-boot.js）和真机构建一致。
        // settings 里的 policy 已由构建流程从 fitWidth/fitHeight 换算而来；缺省时按同规则推导。
        // 调用方（previewMain）在 boot 前已门控 window._CCSettings 就绪。
        try {
            const previewDr = (globalThis as any)?._CCSettings?.screen?.designResolution ?? dr;
            if (previewDr) {
                const pvWidth = Number(previewDr.width) || drWidth;
                const pvHeight = Number(previewDr.height) || drHeight;
                let policy = previewDr.policy;
                if (policy === undefined || policy === null) {
                    const fw = previewDr.fitWidth !== false;
                    const fh = previewDr.fitHeight === true;
                    policy = cc.ResolutionPolicy.SHOW_ALL;
                    if (fw && !fh) policy = cc.ResolutionPolicy.FIXED_WIDTH;
                    else if (!fw && fh) policy = cc.ResolutionPolicy.FIXED_HEIGHT;
                }
                drPolicy = policy;
                drApplyWidth = pvWidth;
                drApplyHeight = pvHeight;
            }
        } catch (e) {
            console.warn('[engine-bootstrap] gameView design resolution failed, fallback SHOW_ALL:', e);
        }
    }
    // 场景编辑器（非 gameView）保持 SHOW_ALL：FIXED_WIDTH / FIXED_HEIGHT 仅用于预览。
    cc.view.setDesignResolutionSize(drApplyWidth, drApplyHeight, drPolicy);

    await cc.game.run();
    // Stop the engine's built-in mainLoop immediately — it would render frames
    // without a loaded scene, causing FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT.
    // Our own edit-mode tick loop (Engine.startTick) takes over later.
    cc.game.pause();

    function stripNullComponents(node: any) {
        if (node._components) {
            node._components = node._components.filter((c: any) => c != null);
        }
        if (node._children) {
            for (const child of node._children) {
                stripNullComponents(child);
            }
        }
    }

    const origRunSceneImmediate = cc.director.runSceneImmediate.bind(cc.director);
    cc.director.runSceneImmediate = function (scene: any, ...args: any[]) {
        stripNullComponents(scene);
        return origRunSceneImmediate(scene, ...args);
    };

    await DecoratorService.Engine.init();
    // Pause the custom tick loop during service initialization — preview
    // services create cameras that would otherwise render on mainWindow
    // before any scene is loaded, causing FRAMEBUFFER_INCOMPLETE errors.
    DecoratorService.Engine.pause();

    await serviceManager.initAllServices();

    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement | null;
    if (canvas && DecoratorService.Operation) {
        await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '/static/web/input-bridge.js';
            s.onload = () => resolve();
            s.onerror = reject;
            document.head.appendChild(s);
        });
        (globalThis as any).setupInputBridge({
            canvas,
            operation: DecoratorService.Operation,
            engine: DecoratorService.Engine,
        });
    }

    await setupBrowserInvokeChannel(serverURL);
}

/**
 * 建立主进程 → 浏览器场景的反向调用通道。
 *
 * web 预览下主进程无法通过 RPC 直接调浏览器 service（浏览器是 setWebTransport 客户端、未 register），
 * 改用 socket.io：主进程 emit('scene:invoke', {module, method, args}) → 这里派发到对应场景 service。
 * 放在场景 bundle 里（而非某个宿主页如 scene-editor.ejs），保证 cocos-cli 预览与 PinK 等所有宿主都生效；
 * socket.io 客户端从服务端托管的 /socket.io/socket.io.js 动态加载，不依赖宿主页。
 */
async function setupBrowserInvokeChannel(serverURL: string) {
    try {
        await new Promise<void>((resolve) => {
            if ((globalThis as any).io) {
                resolve();
                return;
            }
            const s = document.createElement('script');
            s.src = `${serverURL}/socket.io/socket.io.js`;
            s.onload = () => resolve();
            s.onerror = () => resolve();
            document.head.appendChild(s);
        });
        const io = (globalThis as any).io;
        if (!io) {
            console.warn('[engine-bootstrap] socket.io client unavailable, skip browser-invoke channel');
            return;
        }
        const socket = io(serverURL);
        let rendererVisible: boolean | undefined;
        const updateRendererVisibility = (visible: boolean) => {
            rendererVisible = visible;
            socket.emit('scene-renderer:visibility', { visible });
        };
        // Pink retains a hidden, empty Scene Webview for preloading. Track the
        // host-reported visibility without taking over Pink's bridge, so Node-side
        // tools select the displayed scene.
        window.addEventListener('message', (event: MessageEvent) => {
            const message = event.data;
            if (message?.kind === 'event'
                && message.event === 'editor:visibility-changed'
                && typeof message.data?.visible === 'boolean') {
                updateRendererVisibility(message.data.visible);
            }
        });
        ServiceEvents.on('scene-view:visibility-changed', updateRendererVisibility);
        const querySceneUrl = async (): Promise<string> => {
            const current = await DecoratorService.Editor.queryCurrent();
            return (current as any)?.__identifier__?.assetUrl ?? (current as any)?.assetUrl ?? '';
        };
        let rendererSceneUrl = '';
        const updateRendererScene = (sceneUrl: string) => {
            rendererSceneUrl = sceneUrl;
            socket.emit('scene-renderer:scene', { sceneUrl });
        };
        const invoke = (module: string, method: string, args?: any[]) => {
            try {
                const svc = (DecoratorService as any)[module];
                if (svc && typeof svc[method] === 'function') {
                    svc[method](...(args || []));
                }
            } catch (e) {
                console.warn('[scene:invoke] failed:', e);
            }
        };
        socket.on('scene:invoke', (msg: { module?: string; method?: string; args?: any[] }) => {
            if (msg && msg.module && msg.method) {
                invoke(msg.module, msg.method, msg.args);
            }
        });
        socket.on('scene:invoke-lightfx', async (
            msg: {
                sceneUrl?: string;
                module?: 'LightProbeBake' | 'LightmapBake';
                method?: 'bake' | 'querySettings' | 'queryBakeInfo' | 'queryCapabilities' | 'clearBake' | 'cancel';
                args?: unknown[];
            },
            reply: (response: { result?: unknown; sceneUrl?: string; error?: string }) => void,
        ) => {
            try {
                const methods = msg?.module === 'LightProbeBake'
                    ? new Set(['bake', 'querySettings', 'queryCapabilities', 'clearBake', 'cancel'])
                    : msg?.module === 'LightmapBake'
                        ? new Set(['bake', 'queryCapabilities', 'queryBakeInfo', 'clearBake', 'cancel'])
                        : null;
                if (!methods?.has(msg.method || '')) {
                    throw new Error('Invalid LightFX scene request.');
                }

                if (msg.module === 'LightProbeBake' && msg.method === 'querySettings') {
                    // This frequently polled read must not call queryCurrent(), which
                    // encodes all baked probes and tetrahedra just to obtain the URL.
                    const editor = DecoratorService.Editor as typeof DecoratorService.Editor & IEditorSessionService;
                    const session = editor.getEditorSession();
                    const scene = cc.director.getScene();
                    const assertCurrent = () => {
                        if (!scene || cc.director.getScene() !== scene || !editor.isCurrentEditorSession(session)) {
                            throw new Error('The source scene changed during the light-probe settings query.');
                        }
                    };
                    assertCurrent();
                    if (!session.uuid || editor.getCurrentEditorType() !== 'scene') {
                        throw new Error('Light-probe settings require an open scene.');
                    }
                    const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [session.uuid]);
                    assertCurrent();
                    const sceneUrl = assetInfo?.url;
                    if (!sceneUrl || sceneUrl !== msg.sceneUrl) {
                        throw new Error(`The selected scene renderer is not displaying the requested scene: ${msg.sceneUrl || 'unknown'}.`);
                    }
                    const result = await DecoratorService.LightProbeBake.querySettings();
                    assertCurrent();
                    reply({ result, sceneUrl });
                    return;
                }

                const currentSceneUrl = await querySceneUrl();
                if (msg.method !== 'cancel' && (!currentSceneUrl || currentSceneUrl !== msg.sceneUrl)) {
                    throw new Error(
                        `The selected scene renderer is not displaying the requested scene: ${msg.sceneUrl || 'unknown'}.`,
                    );
                }

                const service = (DecoratorService as any)[msg.module!];
                const result = await service[msg.method!](...(msg.args || []));
                const finalSceneUrl = await querySceneUrl().catch(() => '');
                if (finalSceneUrl) updateRendererScene(finalSceneUrl);
                reply({ result, sceneUrl: finalSceneUrl });
            } catch (error) {
                reply({ error: error instanceof Error ? error.message : String(error) });
            }
        });
        socket.on('scene:capture-reflection-probe', async (
            msg: { source?: IReflectionProbeSceneIdentity; sceneUrl?: string; nodePath?: string; componentUuid?: string; timeoutMs?: number },
            reply: (response: { result?: unknown; error?: string }) => void,
        ) => {
            try {
                if (!msg?.nodePath) {
                    throw new Error('Invalid reflection-probe capture request.');
                }
                if (msg.sceneUrl) {
                    const currentSceneUrl = await querySceneUrl().catch(() => '');
                    if (currentSceneUrl !== msg.sceneUrl) {
                        throw new Error(
                            `The WebGL scene renderer is not displaying the requested scene: ${msg.sceneUrl}.`,
                        );
                    }
                }
                const result = await (DecoratorService.ReflectionProbe as any).capturePixels(
                    msg.nodePath,
                    msg.timeoutMs,
                    msg.componentUuid, msg.source,
                );
                updateRendererScene(result.sceneUrl);
                reply({ result });
            } catch (error) {
                reply({ error: error instanceof Error ? error.message : String(error) });
            }
        });
        socket.on('scene:list-reflection-probes', async (
            msg: { sceneUrl?: string; source?: IReflectionProbeSceneIdentity },
            reply: (response: { result?: unknown; error?: string }) => void,
        ) => {
            try {
                const currentSceneUrl = await querySceneUrl().catch(() => '');
                if (!msg?.sceneUrl || currentSceneUrl !== msg.sceneUrl) {
                    throw new Error(
                        `The WebGL scene renderer is not displaying the requested scene: ${msg?.sceneUrl || 'unknown'}.`,
                    );
                }
                if (msg.source) { (DecoratorService.ReflectionProbe as any).assertSceneIdentity(msg.source); }
                const source = await DecoratorService.ReflectionProbe.getSceneIdentity();
                const probes = (DecoratorService.ReflectionProbe as any).listBakeableProbes();
                reply({ result: { sceneUrl: currentSceneUrl, probes, source } });
            } catch (error) {
                reply({ error: error instanceof Error ? error.message : String(error) });
            }
        });
        socket.on('scene:apply-reflection-probe', async (
            msg: {
                sceneUrl?: string;
                nodePath?: string;
                componentUuid?: string;
                cubemapUuid?: string;
                captureToken?: string;
                source?: IReflectionProbeSceneIdentity;
                saveScene?: boolean;
                timeoutMs?: number;
            },
            reply: (response: { result?: unknown; error?: string }) => void,
        ) => {
            try {
                if (!msg?.sceneUrl || !msg.nodePath || !msg.componentUuid || !msg.cubemapUuid || !msg.captureToken) {
                    throw new Error('Invalid reflection-probe apply request.');
                }
                const result = await (DecoratorService.ReflectionProbe as any).applyBakedCubemap({
                    sceneUrl: msg.sceneUrl,
                    nodePath: msg.nodePath,
                    componentUuid: msg.componentUuid,
                    cubemapUuid: msg.cubemapUuid,
                    captureToken: msg.captureToken,
                    source: msg.source,
                    saveScene: msg.saveScene !== false,
                    timeoutMs: msg.timeoutMs,
                    serverURL,
                });
                updateRendererScene(msg.sceneUrl);
                reply({ result });
            } catch (error) {
                reply({ error: error instanceof Error ? error.message : String(error) });
            }
        });
        socket.on('scene:save-reflection-probes', async (
            msg: { sceneUrl?: string; source?: IReflectionProbeSceneIdentity },
            reply: (response: { result?: unknown; error?: string }) => void,
        ) => {
            try {
                const currentSceneUrl = await querySceneUrl().catch(() => '');
                if (!msg?.sceneUrl || currentSceneUrl !== msg.sceneUrl) {
                    throw new Error(
                        `The WebGL scene renderer is not displaying the requested scene: ${msg?.sceneUrl || 'unknown'}.`,
                    );
                }
                if (msg.source) { (DecoratorService.ReflectionProbe as any).assertSceneIdentity(msg.source); }
                await DecoratorService.Editor.save({});
                DecoratorService.Undo.markSaved();
                updateRendererScene(currentSceneUrl);
                reply({ result: { saved: true, sceneUrl: currentSceneUrl } });
            } catch (error) {
                reply({ error: error instanceof Error ? error.message : String(error) });
            }
        });
        socket.on('scene:clear-reflection-probes', async (
            msg: {
                sceneUrl?: string;
                source?: IReflectionProbeSceneIdentity;
                saveScene?: boolean;
                timeoutMs?: number;
            },
            reply: (response: { result?: unknown; error?: string }) => void,
        ) => {
            try {
                if (!msg?.sceneUrl) {
                    throw new Error('Invalid reflection-probe clear request.');
                }
                const result = await (DecoratorService.ReflectionProbe as any).clearBakedCubemaps({
                    sceneUrl: msg.sceneUrl,
                    source: msg.source,
                    saveScene: msg.saveScene !== false,
                    timeoutMs: msg.timeoutMs,
                });
                updateRendererScene(msg.sceneUrl);
                reply({ result });
            } catch (error) {
                reply({ error: error instanceof Error ? error.message : String(error) });
            }
        });
        // Reconcile feature-local runtime state after first connection or reconnect.
        // Reference images need this because their Sprite objects are not persisted with configuration.
        socket.on('connect', () => {
            invoke('Engine', 'syncDesignResolution', []);
            invoke('ReferenceImage', 'syncFromAuthority', []);
            // Join the renderer room immediately, then publish its scene once
            // the editor service is ready.
            socket.emit('scene-renderer:register', {
                sceneUrl: rendererSceneUrl,
                visible: rendererVisible,
            });
            void querySceneUrl().then((sceneUrl) => {
                updateRendererScene(sceneUrl);
            }).catch(() => {
                // Registering without a scene still makes the renderer
                // discoverable; capture will report a precise scene error.
            });
        });
        const reportRendererScene = () => {
            void querySceneUrl().then((sceneUrl) => {
                updateRendererScene(sceneUrl);
            }).catch(() => {
                updateRendererScene('');
            });
        };
        ServiceEvents.on('editor:open', reportRendererScene);
        ServiceEvents.on('editor:reload', reportRendererScene);
        ServiceEvents.on('editor:close', () => {
            updateRendererScene('');
        });
    } catch (e) {
        console.warn('[engine-bootstrap] setup browser-invoke channel failed:', e);
    }
}
