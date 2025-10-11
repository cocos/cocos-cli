// 用于管理场景中需要declare的代码，不对外暴露

// import type cameraMgr from '../source/script/3d/manager/camera';
// import type animationMgr from '../source/script/3d/manager/animation';
// import type sceneMgr from '../source/script/3d/manager/scene';
// import type nodeMgr from '../source/script/3d/manager/node';
// import type operationMgr from '../source/script/3d/manager/operation';
// import type gizmoMgr from '../source/script/3d/manager/gizmos';
// import type assetMgr from '../source/script/3d/manager/asset';
// import type previewPlay from '../source/script/3d/manager/preview-play';
// import type prefabMgr from '../source/script/3d/manager/prefab';
// import type effectMgr from '../source/script/3d/manager/effects';
// import type selectionMgr from '../source/script/3d/manager/selection';
// import type shortcutMgr from '../source/script/3d/manager/shortcut';
// import type { previewMgr } from '../source/script/3d/manager/preview';
// import type compMgr from '../source/script/3d/manager/component';
// import type terrainMgr from '../source/script/3d/manager/terrain';
// import type pluginMgr from '../source/script/3d/manager/plugin';
// import type { engineManager,NeedAnimState } from '../source/script/3d/manager/engine';
// import type {SceneFacadeManager} from '../source/script/3d/facade/scene-facade-manager'
// import type DumpEncode from '../source/script/export/dump/encode';
// import type DumpDecode from '../source/script/export/dump/decode';
// import type DumpUtils from '../source/script/export/dump/utils';
// import type { CustomWebIPC } from '../source/script/3d/manager/ipc/web/ipc';
// import type Startup from '../source/script/3d/manager/startup';
// import type EditorPreview from '../source/script/3d/preload/preview/editor-preview';
// import type NativeScene from '../source/script/3d/preload/native/native-scene';
// import type { Node } from 'cc';
const NodeMgr = EditorExtends.Node;

declare global {
    namespace cce {
        // export let Camera: typeof cameraMgr;
        // export let Animation: typeof animationMgr;
        // export let Scene: typeof sceneMgr;
        export let Node: typeof nodeMgr;
        // export let Script: any;
        // export let Operation: typeof operationMgr;
        // export let Gizmo: typeof gizmoMgr;
        // export let Asset: typeof assetMgr;
        // export let PreviewPlay: typeof previewPlay;
        // export let Prefab: typeof prefabMgr;
        // export let Effect: typeof effectMgr;
        // export let Selection: typeof selectionMgr;
        // export let Shortcut: typeof shortcutMgr;
        // export let Preview: typeof previewMgr;
        // export let Component: typeof compMgr;
        // export let Terrain: typeof terrainMgr;
        // export let Plugin: typeof pluginMgr;
        // export let Engine: typeof engineManager;
        // export let NeedAnimState: typeof NeedAnimState;
        // export let ModelPreview: typeof previewMgr.modelPreview;
        // export let MotionPreview: typeof previewMgr.motionPreview;
        // export let TransitionPreview: typeof previewMgr.transitionPreview;

        // 古早的gizmo导出,内部没使用，仅保留注释，后续以新的gizmo扩展机制为主
        // export let gizmos : {
        //     ControllerBase,
        //     PositionController,
        //     BoxController,
        //     ControllerUtils,
        //     GizmoDefines,
        //     Gizmo,
        //     TransformGizmo,
        //     EngineUtils,
        //     Utils,
        // }
        
        // 开放 dump data 工具方法给插件里的场景脚本使用
        export namespace Dump {
            export let encode: typeof DumpEncode;
            export let decode: typeof DumpDecode;
            export let utils: typeof DumpUtils;
        }


        // export let SceneFacadeManager: typeof SceneFacadeManager;
        // export let foregroundNode:Node;
        // export let backgroundNode:Node;
        // export let project: string;
        
        // export let Ipc: CustomWebIPC;
        // export let Startup: typeof Startup;
        // export let EditorPreview: typeof EditorPreview;
        // export let NativeScene:NativeScene;
    }
}

// export class NativeWindow {
//     handler: number;
//     constructor(x: number, y: number, handle: Buffer);
//     setPos(x: number, y: number): void;
//     setSize(w: number, h: number): void;
//     updateContextID(): void;
//     renderWindow: any;
// }

// declare class EmbedWindow {
//     setPos(x: number, y: number): void;
//     setSize(w: number, h: number): void;
//     updateContext(handler:number): void;// mac only
//     setVisible(visible:boolean): void;
// }

// declare class NativeEngineManager {
//     constructor();
//     init(handle:Buffer,width:number,height:number): void;
//     createWindow(...args:any[]): EmbedWindow;
// }