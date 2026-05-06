'use strict';

import { geometry, js, MeshRenderer, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import BoxController from '../../controller/box';
import { registerGizmo } from '../../gizmo-defines';

const tempQuat_a = new Quat();
const tempSize = new Vec3();

class ModelComponentGizmo extends GizmoBase<MeshRenderer> {
    private _controller!: BoxController;

    init() {
        this._controller = new BoxController(this.getGizmoRoot());
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
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const node = this.target.node;
        const boundingBox = this.getBoundingBox(this.target);
        if (boundingBox) {
            this._controller.show();

            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setScale(worldScale);
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);

            Vec3.multiplyScalar(tempSize, boundingBox.halfExtents, 2);
            this._controller.updateSize(boundingBox.center, tempSize);
        } else {
            this._controller.hide();
        }
    }

    private getBoundingBox(component: MeshRenderer): geometry.AABB | null {
        let bb = component.model && component.model.modelBounds;
        if (!bb) {
            const mesh = component.mesh;
            if (mesh && mesh.minPosition && mesh.maxPosition) {
                bb = geometry.AABB.fromPoints(geometry.AABB.create(), mesh.minPosition, mesh.maxPosition);
            }
        }
        return bb || null;
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }
}

export const name = js.getClassName(MeshRenderer);
export const SelectGizmo = ModelComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
