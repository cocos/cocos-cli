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
    IPublicRedoService,
    IRedoService,
    IPublicCameraService,
    ICameraService,
    IPublicGizmoService,
    IGizmoService,
    IPublicSceneViewService,
    ISceneViewService,
    IPublicPreviewService,
    IPreviewService,
    IPublicUIService,
    IUIService,
    IAnimationService,
    IPublicReferenceImageService,
    IReferenceImageService,
    IParticleService,
    IPublicParticleService,
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
    Redo: IPublicRedoService,
    Camera: IPublicCameraService,
    Gizmo: IPublicGizmoService,
    SceneView: IPublicSceneViewService,
    Preview: IPublicPreviewService,
    UI: IPublicUIService,
    ReferenceImage: IPublicReferenceImageService,
    Particle: IPublicParticleService,
}

export interface IServiceManager {
    Editor: IEditorService;
    Node: INodeService;
    Component: IComponentService;
    Script: IScriptService,
    Asset: IAssetService,
    Engine: IEngineService,
    Animation: IAnimationService,
    Prefab: IPrefabService,
    Selection: ISelectionService,
    Operation: IOperationService,
    Undo: IUndoService,
    Redo: IRedoService,
    Camera: ICameraService,
    Gizmo: IGizmoService,
    SceneView: ISceneViewService,
    Preview: IPreviewService,
    UI: IUIService,
    ReferenceImage: IReferenceImageService,
    Particle: IParticleService,
}
