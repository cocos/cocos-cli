'use strict';

import { js, SkinnedMeshRenderer, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import BoxController from '../../controller/box';
import { LightProbeTetraHelper } from '../../utils/light-probe-tetra';
import { registerGizmo } from '../../gizmo-defines';

const tempSize = new Vec3();
const tempCenter = new Vec3();

class SkinningModelComponentGizmo extends GizmoBase<SkinnedMeshRenderer> {
    private _controller!: BoxController;
    private _tetraHelper!: LightProbeTetraHelper;

    init() {
        this._controller = new BoxController(this.getGizmoRoot());
        this._controller.setOpacity(150);
        this._tetraHelper = new LightProbeTetraHelper(this.getGizmoRoot());
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
        this._tetraHelper.hide();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const rootBoneNode = this.target.skinningRoot;
        if (!rootBoneNode) {
            this._controller.hide();
            this._tetraHelper.hide();
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

        // 影响该物体的光照探针四面体连线（仅当开启“使用光照探针”时显示）
        this._tetraHelper.update(this.target);
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

    onLightProbeChanged() {
        this._tetraHelper.invalidate();
        if (this.target) this._tetraHelper.update(this.target);
    }

    onDestroy() {
        this._tetraHelper?.destroy();
    }
}

export const name = js.getClassName(SkinnedMeshRenderer);
export const SelectGizmo = SkinningModelComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
