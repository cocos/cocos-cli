import * as EditorExtends from '../../engine/editor-extends';
import { Rpc } from './rpc';
import { serviceManager } from './service/service-manager';
import { Service as DecoratorService } from './service/core/decorator';
import { ServiceEvents } from './service/core/global-events';

import './service';

// Patch UuidUtils for casing compatibility
if (EditorExtends.UuidUtils) {
    const U = EditorExtends.UuidUtils as any;
    U.decompressUuid = U.decompressUuid || U.decompressUUID;
    U.compressUuid = U.compressUuid || U.compressUUID;
    U.isUuid = U.isUuid || U.isUUID;
    U.uuid = U.uuid || U.generate;
}

(globalThis as any).EditorExtends = EditorExtends;

export { serviceManager, EditorExtends };
export const Service = DecoratorService;

declare const cc: any;

export async function startup(options: {
    serverURL: string;
}) {
    const defaultConfig = await fetch('/scripting/engine/game-config');
    const config = await defaultConfig.json();
    const modules = await fetch('/scripting/engine/modules');
    const features = (await modules.json()) as string[];
    const { serverURL } = options;

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
    (globalThis as any).cli.SceneEvents = ServiceEvents;

    if (EditorExtends.init) {
        await EditorExtends.init();
    }
    await Rpc.startup({ serverURL });

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
    let drPolicy = cc.ResolutionPolicy.SHOW_ALL;
    if (dr) {
        const fw = dr.fitWidth !== false;
        const fh = dr.fitHeight === true;
        if (fw && !fh) drPolicy = cc.ResolutionPolicy.FIXED_WIDTH;
        else if (!fw && fh) drPolicy = cc.ResolutionPolicy.FIXED_HEIGHT;
    }
    cc.view.setDesignResolutionSize(drWidth, drHeight, drPolicy);

    await cc.game.run();
    await DecoratorService.Engine.init();
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
}
