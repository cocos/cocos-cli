import type { Vec3 } from 'cc';
import type { ICameraConfig, IOriginAxesConfig } from '../scene-configs';

export type { ICameraConfig, IOriginAxesConfig };

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
    queryConfig(): ICameraConfig;
    updateConfig(config: Partial<ICameraConfig>): void;
    getCameraFov(): number;
    zoomUp(): void;
    zoomDown(): void;
    zoomReset(): void;
    alignNodeToSceneView(nodes: string[]): void;
    alignSceneViewToNode(nodes: string[]): void;
    setGridColor(color: number[]): void;
    setOriginAxes2D(config: IOriginAxesConfig): void;
    setOriginAxes3D(config: IOriginAxesConfig): void;
    onUpdate(deltaTime: number): void;
}

export type IPublicCameraService = Pick<ICameraService,
    'focus' | 'defaultFocus' | 'rotateCameraToDir' | 'changeProjection' |
    'setGridVisible' | 'isGridVisible' | 'setCameraProperty' | 'resetCameraProperty' |
    'queryConfig' | 'updateConfig' |
    'getCameraFov' | 'zoomUp' | 'zoomDown' | 'zoomReset' |
    'alignNodeToSceneView' | 'alignSceneViewToNode' |
    'setGridColor' | 'setOriginAxes2D' | 'setOriginAxes3D'
> & { is2D: boolean };

export interface ICameraEvents {
    'camera:mode-change': [mode: number];
    'camera:fov-changed': [fov: number];
    'camera:projection-changed': [projection: number];
}
