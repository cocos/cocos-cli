'use strict';

import { Color, ConeCollider, js, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import ConeController from '../../controller/cone';
import { registerGizmo } from '../../gizmo-defines';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

const tempQuat_a = new Quat();

class ConeColliderComponentGizmo extends GizmoBase<ConeCollider> {
    private _controller!: ConeController;
    private _maxScale = 1;
    private _radius = 0;
    private _height = 0;
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
        this._controller = new ConeController(gizmoRoot);

        this._controller.setColor(Color.GREEN);
        this._controller.editable = true;
        this._controller.hoverColor = Color.YELLOW;
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        this._radius = this.target.radius;
        this._height = this.target.height;
        const worldScale = this.target.node.getWorldScale();
        this._maxScale = this.getMaxScale(worldScale);

        this._propPath = this.getCompPropPath('size');
    }

    onControllerMouseMove() {
        this.updateDataFromController();
    }

    onControllerMouseUp() {
        this.onControlEnd(this._propPath);
    }

    updateDataFromController() {
        if (this._controller.updated && this.target) {
            this.onControlUpdate(this._propPath);
            const deltaRadius = this._controller.getDeltaRadius();
            const newRadius = toPrecision(this._radius + deltaRadius / this._maxScale, 3);
            this.target.radius = newRadius;

            const deltaHeight = this._controller.getDeltaHeight();
            const newHeight = toPrecision(this._height + deltaHeight / this._maxScale, 3);
            this.target.height = newHeight;

            const node = this.target.node;
            this.onComponentChanged(node);
        }
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        if (this.target instanceof ConeCollider) {
            const node = this.target.node;

            this._controller.show();
            this._controller.checkEdit();

            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            const xzNorm = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.z));
            this._controller.setScale(new Vec3(xzNorm, worldScale.y, xzNorm));
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);

            this._controller.direction = this.target.direction;
            this._controller.updateSize(this.target.center, this.target.radius, this.target.height);
        } else {
            this._controller.hide();
        }
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }

    private getMaxScale(inScale: Vec3) {
        return Math.max(inScale.x, inScale.y, inScale.z);
    }
}

export const name = js.getClassName(ConeCollider);
export const SelectGizmo = ConeColliderComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
