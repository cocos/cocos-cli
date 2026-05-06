'use strict';

import { Color, js, Quat, SphereCollider, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import SphereController from '../../controller/sphere';
import { registerGizmo } from '../../gizmo-defines';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

const tempQuat_a = new Quat();

class SphereColliderComponentGizmo extends GizmoBase<SphereCollider> {
    private _controller!: SphereController;
    private _radius = 0;
    private _maxScale = 1;
    private _propPath: string | null = null;

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        this._controller = new SphereController(gizmoRoot);
        this._controller.setColor(Color.GREEN);
        this._controller.editable = true;
        this._controller.hoverColor = Color.YELLOW;
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const worldScale = this.target.node.getWorldScale();
        this._maxScale = this.getMaxScale(worldScale);
        this._radius = this.target.radius;

        this._propPath = this.getCompPropPath('radius');
    }

    onControllerMouseMove() {
        this.updateDataFromController();
    }

    onControllerMouseUp() {
        this.onControlEnd(this._propPath);
    }

    getMaxScale(inScale: Vec3) {
        return Math.max(inScale.x, inScale.y, inScale.z);
    }

    updateDataFromController() {
        if (this._controller.updated && this.target) {
            this.onControlUpdate(this._propPath);

            const deltaRadius = this._controller.getDeltaRadius();

            let newRadius = this._radius + deltaRadius / this._maxScale;
            newRadius = Math.abs(newRadius);
            newRadius = toPrecision(newRadius, 3);
            this.target.radius = newRadius;

            const node = this.target.node;
            this.onComponentChanged(node);
        }
    }

    updateControllerData() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        if (this.target instanceof SphereCollider) {
            const node = this.target.node;

            this._controller.show();
            this._controller.checkEdit();

            const worldScale = node.getWorldScale();
            const maxScale = this.getMaxScale(worldScale);
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setScale(new Vec3(maxScale, maxScale, maxScale));
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);
            this._controller.updateSize(this.target.center, this.target.radius);
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
}

export const name = js.getClassName(SphereCollider);
export const SelectGizmo = SphereColliderComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
