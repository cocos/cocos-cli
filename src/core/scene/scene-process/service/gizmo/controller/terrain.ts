import { MeshRenderer, Node, Vec3 } from 'cc';
import ControllerBase from './base';
import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import type { GizmoMouseEvent } from '../utils/defines';
import { getModel, setNodeOpacity, updateBoundingBox, updatePositions } from '../utils/engine-utils';

/** Invisible quad used because TerrainBlock geometry is not a raycast target. */
export default class TerrainController extends ControllerBase {
    private _quadNode: Node | null = null;
    private _quadMR: MeshRenderer | null = null;
    private _size = 10;

    constructor(rootNode: Node, opts: any = {}) {
        super(rootNode); this.initShape(opts);
    }
    initShape(opts: any) {
        this.createShapeNode('TerrainController');
        const quad = ControllerUtils.quad(new Vec3(), this._size, this._size, new Vec3(0, 1, 0), undefined, opts);
        quad.parent = this.shape; this._quadNode = quad; this._quadMR = getModel(quad);
        setNodeOpacity(quad, 0); this.registerMouseEvents(quad, 'quad');
    }
    onMouseDown(event: GizmoMouseEvent) { this.onControllerMouseDown?.(event); }
    onMouseMove(event: GizmoMouseEvent) { this.onControllerMouseMove?.(event); }
    onMouseUp(event: GizmoMouseEvent) { this.onControllerMouseUp?.(event); }
    onHoverIn(_event: GizmoMouseEvent) {}
    onHoverOut(event: GizmoMouseEvent<{ hoverInNodeMap: Map<Node, boolean> }>) { this.onControllerHoverOut?.(event); }
    onShow() {
        if (!this._eventsRegistered) { this.registerCameraMovedEvent(); this._eventsRegistered = true; }
    }
    onHide() {
        if (this._eventsRegistered) { this.unregisterCameraMoveEvent(); this._eventsRegistered = false; }
    }
    updateWorldPosition(value: Vec3) { this._quadNode?.setWorldPosition(value); }
    updateSize(width: number, height: number) {
        const data = ControllerShape.calcQuadData(new Vec3(width / 2, 0, height / 2), width, height, new Vec3(0, 1, 0));
        if (this._quadMR) { updatePositions(this._quadMR, data.positions); updateBoundingBox(this._quadMR, data.minPos, data.maxPos); }
    }
}
