import { Node, Camera, Vec3, Quat, MeshRenderer, ISizeLike, Color } from 'cc';
import { EventEmitter } from 'events';
import { CameraMoveMode } from './utils';

export interface EditorCameraInfo {
    position?: Vec3;
    rotation?: Quat;
    viewCenter?: Vec3;
    viewDist?: number;
    contentRect?: any;
    scale?: number;
}

abstract class CameraControllerBase extends EventEmitter {
    protected _camera!: Camera;
    protected camera_move_mode = CameraMoveMode.IDLE;

    protected _gridMeshComp!: MeshRenderer;
    protected _originAxisHorizontalMeshComp!: MeshRenderer;
    protected _originAxisVerticalMeshComp!: MeshRenderer;
    public node!: Node;

    protected _isGridVisible = true;

    protected originAxisX_Visible = false;
    protected originAxisY_Visible = false;
    protected originAxisZ_Visible = false;
    protected readonly originAxisX_Color = Color.RED.clone();
    protected readonly originAxisY_Color = Color.GREEN.clone();
    protected readonly originAxisZ_Color = Color.BLUE.clone();

    protected _near = 0.1;
    protected _far = 10000;
    protected _wheelSpeed = 6;
    protected _wheelBaseScale = 1 / 12;

    public get near(): number { return this._near; }
    public set near(value: number) { this._near = value; }
    public get far(): number { return this._far; }
    public set far(value: number) { this._far = value; }
    public get wheelSpeed() { return this._wheelSpeed; }
    public set wheelSpeed(value: number) { this._wheelSpeed = value; }

    init(camera: Camera) {
        this._camera = camera;
        this.node = this._camera.node;
    }

    focus(nodes: string[], editorCameraInfo?: EditorCameraInfo, immediate = false) { }
    alignNodeToSceneView(nodes: string[]) { }
    alignSceneViewToNode(nodes: string[]) { }
    abstract isMoving(): boolean;

    onMouseDBlDown(event: any) { }
    onMouseDown(event: any) { }
    onMouseMove(event: any) { }
    onMouseUp(event: any) { }
    onMouseWheel(event: any) { }
    onKeyDown(event: any) { }
    onKeyUp(event: any) { }
    onResize(size: ISizeLike) { }
    onUpdate(deltaTime: number) { }
    onDesignResolutionChange() { }
    refresh() { }
    updateGrid() { }

    showGrid(visible: boolean) {
        this._gridMeshComp.node.active = visible;
        if (visible && this._isGridVisible) {
            this.updateGrid();
        }
    }

    set isGridVisible(value: boolean) {
        this._isGridVisible = value;
        this.showGrid(this._isGridVisible);
    }

    get isGridVisible() {
        return this._isGridVisible;
    }

    set active(_value: boolean) { }

    rotateCameraToDir(dir: Vec3, rotateByViewDist: boolean) { }
    changeProjection() { }
    zoomUp() { }
    zoomDown() { }
    zoomReset() { }
}

export default CameraControllerBase;
