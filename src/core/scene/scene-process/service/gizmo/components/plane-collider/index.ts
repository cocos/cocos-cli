'use strict';

import { Color, js, Node, PlaneCollider, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import ControllerUtils from '../../utils/controller-utils';
import ControllerBase from '../../controller/base';
import { setNodeOpacity } from '../../utils/engine-utils';
import { registerGizmo } from '../../gizmo-defines';

const tempVec3_a = new Vec3();
const tempQuat_a = new Quat();

class PlaneController extends ControllerBase {
    private _planeNode: Node | null = null;
    private _arrowNode: Node | null = null;

    constructor(rootNode: Node) {
        super(rootNode);
        this._color = Color.GREEN;
        this._lockSize = true;
        this.initShape();
        this.registerCameraMovedEvent();
    }

    initShape() {
        this.createShapeNode('PlaneController');
        this._planeNode = ControllerUtils.quad(Vec3.ZERO, 200, 200, Vec3.UNIT_Y, this._color, { unlit: true });
        setNodeOpacity(this._planeNode, 128);
        this._planeNode.parent = this.shape;
        this._arrowNode = ControllerUtils.lineTo(Vec3.ZERO, new Vec3(0, 100, 0), this._color, {
            forwardPipeline: true,
        });
        this._arrowNode.parent = this.shape;
    }

    updateData(center: Vec3, normal: Vec3) {
        this._planeNode?.setPosition(center);
        this._arrowNode?.setPosition(center);

        Vec3.normalize(tempVec3_a, normal);
        Quat.rotationTo(tempQuat_a, Vec3.UNIT_Y, tempVec3_a);
        this._planeNode?.setRotation(tempQuat_a);
        this._arrowNode?.setRotation(tempQuat_a);
    }
}

class PlaneColliderGizmo extends GizmoBase<PlaneCollider> {
    private _controller!: PlaneController;

    init() {
        this._controller = new PlaneController(this.getGizmoRoot());
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        if (this.target instanceof PlaneCollider) {
            const node = this.target.node;

            this._controller.show();

            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);

            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);

            const planeCollider = this.target;
            this._controller.updateData(planeCollider.center, planeCollider.normal);
        }
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }
}

export const name = js.getClassName(PlaneCollider);
export const SelectGizmo = PlaneColliderGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
