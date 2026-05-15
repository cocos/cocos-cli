export interface IGizmoService {
    gizmoRootNode: any;
    foregroundNode: any;
    backgroundNode: any;
    transformToolData: any;
    transformToolName: string;
    isViewMode: boolean;
    is2D: boolean;

    init(): void;
    initFromConfig(): Promise<void>;
    saveConfig(): Promise<void>;
    changeTool(name: string): void;
    setCoordinate(coord: 'local' | 'global'): void;
    setPivot(pivot: 'pivot' | 'center'): void;
    lockGizmoTool(locked: boolean): void;
    isGizmoToolLocked(): boolean;
    setIconVisible(visible: boolean): void;
    showAllGizmoOfNode(node: any, recursive?: boolean): void;
    removeAllGizmoOfNode(node: any, recursive?: boolean): void;
    clearAllGizmos(): void;
    callAllGizmoFuncOfNode(node: any, funcName: string, ...params: any[]): boolean;
    onUpdate(deltaTime: number): void;

    // 与 cocos-editor GizmoManager 一致：GizmoConfig 方法
    queryToolsVisibility3d(): boolean;
    setToolsVisibility3d(value: boolean): void;
    isIconGizmo3D(): boolean;
    setIconGizmo3D(value: boolean): void;
    queryIconGizmoSize(): number;
    setIconGizmoSize(size: number): void;

    // 与 cocos-editor TransformGizmoManager 一致：snap 配置
    queryTransformSnapConfigs(): any;
    setTransformSnapConfigs(name: string, value: any): void;

    // 与 cocos-editor SelectionGizmoManager 一致：选中查询
    querySelectNodes(): any[];
    hasSelected(uuid: string): boolean;

    // 与 cocos-editor GizmoManager 一致：显示/渲染相关
    onResize(): void;
    showSelectionRegion(left: number, right: number, top: number, bottom: number): void;
    hideSelectionRegion(): void;
    execGizmoMethods(name: string, funcName: string, params?: any[]): any;
}

export type IPublicGizmoService = Pick<IGizmoService,
    'changeTool' | 'setCoordinate' | 'setPivot' | 'lockGizmoTool' | 'isGizmoToolLocked' |
    'setIconVisible' | 'transformToolName' | 'isViewMode' |
    'queryToolsVisibility3d' | 'setToolsVisibility3d' |
    'isIconGizmo3D' | 'setIconGizmo3D' |
    'queryIconGizmoSize' | 'setIconGizmoSize' |
    'queryTransformSnapConfigs' | 'setTransformSnapConfigs'
>;

export interface IGizmoEvents {
    'gizmo:tool-changed': [name: string];
    'gizmo:control-begin': [];
    'gizmo:control-end': [];
}
