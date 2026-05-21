import {
    IPublicEditorService,
    IPublicNodeService,
    IPublicComponentService,
    IPublicScriptService,
    IEditorService,
    INodeService,
    IComponentService,
    IScriptService,
    IPublicAssetService,
    IAssetService,
    IEngineService,
    IPublicEngineService,
    IPublicPrefabService,
    IPrefabService,
    IPublicSelectionService,
    ISelectionService,
    IPublicOperationService,
    IOperationService,
    IPublicUndoService,
    IUndoService,
    IPublicCameraService,
    ICameraService,
    IPublicGizmoService,
    IGizmoService,
    IPublicSceneViewService,
    ISceneViewService,
    IPublicUIService,
    IUIService,
} from '../../common';

/**
 * 场景进程开放出去的模块与接口
 */
export interface IPublicServiceManager {
    Editor: IPublicEditorService;
    Node: IPublicNodeService;
    Component: IPublicComponentService;
    Script: IPublicScriptService,
    Asset: IPublicAssetService,
    Engine: IPublicEngineService,
    Prefab: IPublicPrefabService,
    Selection: IPublicSelectionService,
    Operation: IPublicOperationService,
    Undo: IPublicUndoService,
    Camera: IPublicCameraService,
    Gizmo: IPublicGizmoService,
    SceneView: IPublicSceneViewService,
    UI: IPublicUIService,
}

export interface IServiceManager {
    Editor: IEditorService;
    Node: INodeService;
    Component: IComponentService;
    Script: IScriptService,
    Asset: IAssetService,
    Engine: IEngineService,
    Prefab: IPrefabService,
    Selection: ISelectionService,
    Operation: IOperationService,
    Undo: IUndoService,
    Camera: ICameraService,
    Gizmo: IGizmoService,
    SceneView: ISceneViewService,
    UI: IUIService,
}
