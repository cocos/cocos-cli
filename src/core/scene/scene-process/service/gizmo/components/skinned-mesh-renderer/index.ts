'use strict';

import { js, SkinnedMeshRenderer, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import BoxController from '../../controller/box';
import { registerGizmo } from '../../gizmo-defines';

const tempSize = new Vec3();
const tempCenter = new Vec3();

class SkinningModelComponentGizmo extends GizmoBase<SkinnedMeshRenderer> {
    private _controller!: BoxController;

    init() {
        this._controller = new BoxController(this.getGizmoRoot());
        this._controller.setOpacity(150);
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

        const rootBoneNode = this.target.skinningRoot;
        if (!rootBoneNode) {
            this._controller.hide();
            return;
        }

        const bounds = this.target.model && this.target.model.worldBounds;
        if (bounds) {
            Vec3.multiplyScalar(tempSize, bounds.halfExtents, 2);
            Vec3.copy(tempCenter, bounds.center);
            this._controller.updateSize(tempCenter, tempSize);
        } else {
            this._controller.hide();
        }
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

    onUpdate() {
        this.updateControllerData();
    }
}

export const name = js.getClassName(SkinnedMeshRenderer);
export const SelectGizmo = SkinningModelComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
