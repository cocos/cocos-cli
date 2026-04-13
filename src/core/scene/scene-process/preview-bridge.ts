import * as EditorExtends from '../../engine/editor-extends';
import { serviceManager } from './service/service-manager';
import { Service as DecoratorService } from './service/core/decorator';
import './service';
import { join } from 'path';

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

/**
 * Placeholder for SystemJS module import.
 * This function will be replaced by \`module.import()\` in the final bundled SystemJS output.
 */
declare function __moduleImport(id: string): Promise<any>;

declare const cc: any;

export async function startup(options: {
    enginePath: string;
    projectPath: string;
    serverURL: string;
    defaultConfig: any;
    modules: string[];
    startScene: any;
}) {
    const { enginePath, projectPath, serverURL, defaultConfig, modules, startScene } = options;

    if (typeof window !== 'undefined') {
        (window as any).__CC_PROJECT_PATH__ = projectPath;
    }
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
            await __moduleImport(mod);
        } catch (e) {
            console.error('Failed to load engine module:', mod, 'e:', e);
        }
    }

    // @ts-ignore
    const metaUrl = import.meta.url;
    const baseUrl = metaUrl.substring(0, metaUrl.lastIndexOf('/static/preview'));

    const webAdapter = join(baseUrl, '/scripting/engine/bin/.editor/web-adapter.js');

    // 通过 fetch + Blob 绕过 Rollup 的转换
    // const response = await fetch('/scripting/engine/bin/.editor/web-adapter.js');
    // const code = await response.text();
    // const blob = new Blob([code], { type: 'application/javascript' });
    // const blobUrl = URL.createObjectURL(blob);
    // await import(blobUrl);
    // URL.revokeObjectURL(blobUrl);

    // // 同样处理 engine adapter
    // const engineAdapter = join(baseUrl, '/scripting/engine/bin/.editor/engine-adapter.js');
    // const engineResponse = await fetch('/scripting/engine/bin/.editor/engine-adapter.js');
    // const engineCode = await engineResponse.text();
    // const engineBlob = new Blob([engineCode], { type: 'application/javascript' });
    // const engineBlobUrl = URL.createObjectURL(engineBlob);
    // await import(engineBlobUrl);
    // URL.revokeObjectURL(engineBlobUrl);

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

    if (EditorExtends.init) {
        await EditorExtends.init();
    }

    // await (globalThis as any).System.import('cc');
    cc.physics.selector.runInEditor = true;
    await cc.game.init(defaultConfig);

    let backend = 'builtin';
    const Backends: Record<string, string> = {
        'physics-cannon': 'cannon.js',
        'physics-ammo': 'bullet',
        'physics-builtin': 'builtin',
        'physics-physx': 'physx',
    };
    modules.forEach((m) => {
        if (m in Backends) {
            backend = Backends[m];
        }
    });

    // 切换物理引擎
    cc.physics.selector.switchTo(backend);
    cc.view.setDesignResolutionSize(1920, 1080, cc.ResolutionPolicy.SHOW_ALL);

    await cc.game.run(async () => {
        cc.game.pause();
        const json = startScene;
        // load scene
        cc.assetManager.loadWithJson(json, { assetId: json[1]._id },
            // 进度条
            (completedCount: number, totalCount: number) => {
                //
            }, (error: Error | null, sceneAsset: any) => {
                if (error) {
                    cc.error(error);
                    return;
                }
                const scene = sceneAsset.scene;
                scene._name = sceneAsset._name;
                cc.director.runSceneImmediate(scene, () => {
                    cc.game.resume();
                });
            });
    });
    await cc.game.resume();
}
