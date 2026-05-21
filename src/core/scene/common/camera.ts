import type { Vec3 } from 'cc';

export interface IOriginAxesConfig {
    x: boolean;
    y: boolean;
    z: boolean;
}

export interface ICameraConfigData {
    color: number[];
    fov: number;
    far: number;
    near: number;
    wheelSpeed: number;
    wanderSpeed: number;
    enableAcceleration: boolean;
    aperture: number;
    shutter: number;
    iso: number;
    gridVisible: boolean;
    gridColor: number[];
    originAxis2D: IOriginAxesConfig;
    originAxis3D: IOriginAxesConfig;
}

export interface ICameraService {
    init(): void;
    initFromConfig(): Promise<void>;
    is2D: boolean;
    focus(nodes?: string[] | null, editorCameraInfo?: any, immediate?: boolean): void;
    defaultFocus(uuid: string): void;
    rotateCameraToDir(dir: Vec3, rotateByViewDist: boolean): void;
    changeProjection(): void;
    setGridVisible(value: boolean): void;
    isGridVisible(): boolean;
    setCameraProperty(options: any): void;
    resetCameraProperty(): void;
    queryConfig(): ICameraConfigData;
    updateConfig(config: Partial<ICameraConfigData>): void;
    getCameraFov(): number;
    zoomUp(): void;
    zoomDown(): void;
    zoomReset(): void;
    alignNodeToSceneView(nodes: string[]): void;
    alignSceneViewToNode(nodes: string[]): void;
    onUpdate(deltaTime: number): void;
}

export type IPublicCameraService = Pick<ICameraService,
    'focus' | 'defaultFocus' | 'rotateCameraToDir' | 'changeProjection' |
    'setGridVisible' | 'isGridVisible' | 'setCameraProperty' | 'resetCameraProperty' |
    'queryConfig' | 'updateConfig' |
    'getCameraFov' | 'zoomUp' | 'zoomDown' | 'zoomReset' |
    'alignNodeToSceneView' | 'alignSceneViewToNode'
> & { is2D: boolean };

export interface ICameraEvents {
    'camera:mode-change': [mode: number];
    'camera:fov-changed': [fov: number];
    'camera:projection-changed': [projection: number];
}
