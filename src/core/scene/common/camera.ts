import type { Vec3 } from 'cc';
import type { ICameraConfig, IOriginAxesConfig } from '../scene-configs';

export type { ICameraConfig, IOriginAxesConfig };

/** Editor-camera view snapshot used to align/restore the camera around a screenshot. */
export interface ICameraScreenshotState {
    is2D: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    projection: number;
    fov: number;
    fovAxis: number;
    orthoHeight: number;
    near: number;
    far: number;
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
    queryConfig(): ICameraConfig;
    updateConfig(config: Partial<ICameraConfig>): void;
    getCameraFov(): number;
    zoomUp(): void;
    zoomDown(): void;
    zoomReset(): void;
    alignNodeToSceneView(nodes: string[]): void;
    alignSceneViewToNode(nodes: string[]): void;
    setGridColor(color: number[], persist?: boolean): void;
    setOriginAxes2D(config: IOriginAxesConfig): void;
    setOriginAxes3D(config: IOriginAxesConfig): void;
    onUpdate(deltaTime: number): void;
    /** Wait until the async camera-view restore triggered by opening an editor has settled. */
    waitForRestore(): Promise<void>;
    /** Snapshot the current editor-camera view, or undefined when no camera is available. */
    getScreenshotState(): ICameraScreenshotState | undefined;
    /** Apply a previously captured editor-camera view (used to align/restore around a screenshot). */
    applyScreenshotState(state: ICameraScreenshotState): void;
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
