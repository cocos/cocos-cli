import * as EditorExtends from '../../engine/editor-extends';
import { Rpc } from './rpc';
import { serviceManager } from './service/service-manager';
import { Service as DecoratorService } from './service/core/decorator';
import { messageManager } from './service/message';
import { initLocalI18n } from './i18n';
import { CUSTOM_PIPELINE_MODULE } from '../../engine/graphics-config';
import { fetchSceneEditorSettings, syncSceneEditorBundles } from './scene-editor-assets';

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

declare const cc: any;

export async function startup(options: {
    serverURL: string;
}) {
    const { serverURL } = options;
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

    // IMPORTANT: We must NOT use import() here because Rollup's
    // resolveId hook aliases cc/editor/* to a cc re-export stub,
    // which means the real engine side-effect modules never load.
    // We use the __moduleImport placeholder which is replaced with SystemJS's module.import().
    for (const mod of requiredModules) {
        try {
            await System.import(mod);
        } catch (e) {
            console.error('Failed to load engine module:', mod, 'e:', e);
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
    const drPolicy = cc.ResolutionPolicy.SHOW_ALL;
    // FIXED_WIDTH / FIXED_HEIGHT should only be used by preview.
    // There is no preview flow in scene process yet, so keep SHOW_ALL by default.
    // if (dr) {
    //     const fw = dr.fitWidth !== false;
    //     const fh = dr.fitHeight === true;
    //     if (fw && !fh) drPolicy = cc.ResolutionPolicy.FIXED_WIDTH;
    //     else if (!fw && fh) drPolicy = cc.ResolutionPolicy.FIXED_HEIGHT;
    // }
    cc.view.setDesignResolutionSize(drWidth, drHeight, drPolicy);

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
        // 连接建立时同步一次设计分辨率（首次进入 / 断线重连时补齐错过的变更）
        socket.on('connect', () => invoke('Engine', 'syncDesignResolution', []));
    } catch (e) {
        console.warn('[engine-bootstrap] setup browser-invoke channel failed:', e);
    }
}
