import * as EditorExtends from '../../engine/editor-extends';
import { Rpc } from './rpc';
import { serviceManager } from './service/service-manager';
import { Service as DecoratorService } from './service/core/decorator';
import { messageManager } from './service/message';
import { initLocalI18n } from './i18n';

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

    let _decodeCCONBinaryCached = false;
    let _decodeCCONBinary: ((bytes: Uint8Array) => any) | null = null;
    async function getDecodeCCONBinary(): Promise<((bytes: Uint8Array) => any) | null> {
        if (_decodeCCONBinaryCached) return _decodeCCONBinary;
        try {
            const m: any = await System.import('cc/editor/serialization');
            _decodeCCONBinary = m?.decodeCCONBinary ?? null;
        } catch { _decodeCCONBinary = null; }
        _decodeCCONBinaryCached = true;
        return _decodeCCONBinary;
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

    // Override assetManager.loadAny to fetch project assets from the server
    // when they aren't found in any loaded bundle (e.g., main bundle not loaded).
    const am = cc.assetManager;
    const origLoadAny = am.loadAny.bind(am);

    // Tracks per-uuid native (image/buffer) loading. An asset is added to the
    // asset cache before its native data is attached (so circular references can
    // resolve), which means a concurrent cache hit could otherwise return a
    // texture/image whose width/height are still 0. Cache hits await this to get
    // fully-loaded dimensions; see loadFromServer / loadAny below.
    const nativeReady = new Map<string, Promise<void>>();

    // Dedups concurrent loads of the same uuid during the fetch/deserialize
    // window (before the asset is registered in the cache). Without this, two
    // sprite frames sharing a texture can each start a separate load, producing
    // duplicate half-initialized instances and racing the nativeReady bookkeeping
    // (one loader deleting the other's readiness promise), which leaves a
    // width-0 texture reachable via a cache hit.
    const inFlight = new Map<string, Promise<{ err: any; asset: any }>>();

    function tryDecompress(uuid: string): string {
        if (uuid.includes('-')) return uuid;
        try {
            return (EditorExtends.UuidUtils as any)?.decompressUuid?.(uuid) ?? uuid;
        } catch { return uuid; }
    }

    function isUuidInBundles(uuid: string): boolean {
        const variants = [uuid, uuid.split('@')[0]];
        const dec = tryDecompress(uuid);
        if (dec !== uuid) variants.push(dec, dec.split('@')[0]);

        let found = false;
        am.bundles.forEach((bundle: any) => {
            if (found) return;
            for (const v of variants) {
                if (bundle.getAssetInfo(v)) { found = true; return; }
            }
        });
        return found;
    }

    const silentClassFinder = (id: string) => cc.js?.getClassById?.(id) ?? cc._MissingScript ?? null;

    async function queryNativeExt(uuid: string): Promise<string> {
        // The imported asset JSON (e.g. cc.ImageAsset, serialized as
        // { fmt, w:0, h:0 }) does not embed the native extension — it lives in
        // the asset's library file map. Recover it so assets whose real data
        // (and, for images, their width/height) come from the native file can
        // be loaded. Without this, an ImageAsset stays 0x0, its Texture2D
        // reports width 0, and every SpriteFrame on it fails checkRect and gets
        // its rect reset (e.g. sprite frames from a plist atlas in a prefab).
        try {
            const res = await fetch(`${serverURL}/query-asset-info/${encodeURIComponent(uuid)}`);
            if (!res.ok) return '';
            const info: any = await res.json();
            const lib = info?.library;
            if (!lib) return '';
            // The native entry is the library file that is not the serialized
            // asset itself (.json / .cconb).
            const key = Object.keys(lib).find((k) => k !== '.json' && k !== '.cconb');
            return key ?? '';
        } catch {
            return '';
        }
    }

    async function loadNativeAsset(asset: any, uuid: string): Promise<void> {
        let nativeExt: string | undefined = asset._native;
        // Only ImageAsset needs the native-extension recovery: its serialized
        // JSON is { fmt, w:0, h:0 } and the real dimensions come from the native
        // image. Restricting the extra /query-asset-info lookup to images avoids
        // issuing a blocking request for every other asset in the graph
        // (prefabs, components, materials, ...), which would otherwise stall a
        // large scene/prefab load.
        if (!nativeExt && cc.ImageAsset && asset instanceof cc.ImageAsset) {
            nativeExt = await queryNativeExt(uuid);
            if (nativeExt) asset._native = nativeExt;
        }
        if (!nativeExt) return;

        const encodedUuid = encodeURIComponent(uuid);
        const isSubAsset = nativeExt.length > 0 && nativeExt[0] !== '.';
        const nativeUrl = isSubAsset
            ? `${serverURL}/native/${encodedUuid}/${nativeExt}?isBrowser=true`
            : `${serverURL}/native/${encodedUuid}${nativeExt}?isBrowser=true`;

        try {
            const res = await fetch(nativeUrl);
            if (!res.ok) return;

            const ext = nativeExt.split('.').pop()?.toLowerCase() ?? '';
            const imageExts = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'];

            if (imageExts.includes(ext)) {
                const blob = await res.blob();
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = reject;
                    img.src = URL.createObjectURL(blob);
                });
                asset._nativeAsset = img;
            } else {
                asset._nativeAsset = await res.arrayBuffer();
            }
        } catch { /* native data unavailable */ }
    }

    async function loadFromServer(uuid: string, onComplete: any) {
        try {
            const encodedUuid = encodeURIComponent(uuid);

            // Query the correct file extension — assets may be stored as
            // binary (.bin/cconb) instead of .json.
            let ext = 'json';
            try {
                const extRes = await fetch(`${serverURL}/query-extname/${encodedUuid}`);
                const queryExt = (await extRes.text()).trim();
                if (queryExt === '.cconb') ext = 'bin';
            } catch { /* default to json */ }

            const res = await fetch(`${serverURL}/import/${encodedUuid}.${ext}?isBrowser=true`);
            if (!res.ok) throw new Error(`Asset fetch failed (${res.status}): ${uuid}`);

            const isBinary = ext === 'bin';
            let deserializeInput: any;
            if (isBinary) {
                const rawBytes = new Uint8Array(await res.arrayBuffer());
                const decode = await getDecodeCCONBinary();
                if (decode) {
                    deserializeInput = decode(rawBytes);
                } else {
                    console.warn(`[loadFromServer] decodeCCONBinary not available, cannot decode CCONB for ${uuid}`);
                    onComplete?.(new Error('decodeCCONBinary not available'), null);
                    return;
                }
            } else {
                deserializeInput = await res.json();
            }

            const Details = cc.deserialize?.Details;
            let asset;
            let details: any;
            const deserializeOpts = { classFinder: silentClassFinder };

            if (Details) {
                details = Details.pool?.get?.() ?? new Details();
                if (details.reset) details.reset();
                asset = cc.deserialize(deserializeInput, details, deserializeOpts);
            } else {
                asset = cc.deserialize(deserializeInput, undefined, deserializeOpts);
            }

            // Register in the cache BEFORE resolving dependencies. Circular
            // references (e.g. a SpriteAtlas lists its SpriteFrames while each
            // SpriteFrame references its atlas back) would otherwise re-enter
            // loadFromServer for an asset already being loaded and recurse
            // forever. With the (partial) instance already cached, the circular
            // loadAny below resolves to it and the cycle is broken.
            asset._uuid = uuid;
            am.assets.add(uuid, asset);

            // For width/data-sensitive leaf assets (textures/images), publish a
            // readiness promise now — synchronously with the cache add — so a
            // concurrent cache hit waits for the fully-loaded asset instead of
            // reading a still-zero-sized one. These types never take part in a
            // dependency cycle, so awaiting them cannot deadlock. Other
            // (potentially cyclic) types are intentionally left without a promise
            // so their cache hits return the partial instance immediately, which
            // is what breaks the cycle above.
            let resolveReady: (() => void) | undefined;
            const needsReady = (cc.TextureBase && asset instanceof cc.TextureBase)
                || (cc.ImageAsset && asset instanceof cc.ImageAsset);
            if (needsReady) {
                nativeReady.set(uuid, new Promise<void>((r) => { resolveReady = r; }));
            }

            try {
                if (details) {
                    const uuidList = details.uuidList;
                    if (uuidList && uuidList.length > 0) {
                        const depMap: Record<string, any> = {};
                        await Promise.all(
                            uuidList
                                .filter((id: any) => typeof id === 'string')
                                .map((depUuid: string) => new Promise<void>((resolve) => {
                                    am.loadAny(depUuid, (err: any, depAsset: any) => {
                                        if (!err && depAsset) depMap[depUuid] = depAsset;
                                        resolve();
                                    });
                                })),
                        );
                        if (details.assignAssetsBy) {
                            details.assignAssetsBy((depUuid: string) => depMap[depUuid] ?? null);
                        }
                    }
                    Details.pool?.put?.(details);
                }

                stripNullComponents(asset);
                if (asset.data) stripNullComponents(asset.data);
                await loadNativeAsset(asset, uuid);
                try { if (asset.onLoaded) asset.onLoaded(); } catch { /* some assets need specific native data */ }
            } finally {
                if (resolveReady) {
                    nativeReady.delete(uuid);
                    resolveReady();
                }
            }
            onComplete?.(null, asset);
        } catch (e: any) {
            console.warn(`[AssetFallback] load failed for ${uuid}:`, e);
            onComplete?.(e, null);
        }
    }

    am.loadAny = function (requests: any, options: any, onComplete: any) {
        if (typeof options === 'function') {
            onComplete = options;
            options = null;
        }
        const uuid = typeof requests === 'string' ? requests
            : Array.isArray(requests) ? requests[0]
            : requests?.uuid || requests;

        if (typeof uuid === 'string' && !isUuidInBundles(uuid)) {
            const dec = tryDecompress(uuid);
            const cached = am.assets.get(uuid) ?? am.assets.get(dec);
            if (cached) {
                // The asset may be cached but still loading its native data
                // (added to the cache early to break circular refs). Wait for it
                // so shared textures/images report their real width/height.
                const nr = nativeReady.get(uuid) ?? nativeReady.get(dec);
                if (nr) {
                    nr.then(() => onComplete?.(null, cached), () => onComplete?.(null, cached));
                } else {
                    onComplete?.(null, cached);
                }
                return;
            }
            // Dedup concurrent loads of the same uuid that arrive before it is
            // registered in the cache, so only one loadFromServer runs per asset.
            // (Circular back-references hit the cache above — the asset is cached
            // before its dependencies are resolved — so they never reach here,
            // meaning this await can never target an ancestor and cannot deadlock.)
            const inf = inFlight.get(uuid) ?? inFlight.get(dec);
            if (inf) {
                inf.then(({ err, asset }) => onComplete?.(err, asset));
                return;
            }
            let settle!: (r: { err: any; asset: any }) => void;
            const p = new Promise<{ err: any; asset: any }>((resolve) => { settle = resolve; });
            inFlight.set(uuid, p);
            loadFromServer(uuid, (err: any, asset: any) => {
                inFlight.delete(uuid);
                onComplete?.(err, asset);
                settle({ err, asset });
            });
            return;
        }
        origLoadAny(requests, options, onComplete);
    };

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
