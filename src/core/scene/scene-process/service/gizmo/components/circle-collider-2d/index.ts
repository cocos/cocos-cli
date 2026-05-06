'use strict';

import { CircleCollider2D, Color, js, Mat4, Quat, Vec2, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import DiscController from '../../controller/disc';
import { registerGizmo } from '../../gizmo-defines';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

function makeVec3InPrecision(v: Vec3, p: number): Vec3 {
    const pow = Math.pow(10, p);
    v.x = Math.round(v.x * pow) / pow;
    v.y = Math.round(v.y * pow) / pow;
    v.z = Math.round(v.z * pow) / pow;
    return v;
}

const HandleType = DiscController.DiscHandleType;

const tempQuat_a = new Quat();
const tempMat4 = new Mat4();
const tempVec2 = new Vec2();

class CircleCollider2DGizmo extends GizmoBase<CircleCollider2D> {
    private _controller!: DiscController;

    private _radius = 0;
    private _offset: Vec2 = new Vec2();
    private _propRadiusPath: string | null = null;
    private _propOffsetPath: string | null = null;
    private _curHandleType: any;
    private _maxScale = 1;

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateController();
    }

    onHide() {
        this._controller.hide();
    }

    createController() {
        this._controller = new DiscController(this.getGizmoRoot());
        this._controller.editable = true;
        this._controller.setColor(new Color(107, 194, 53));
        this._controller.setEditHandlesColor(new Color(107, 194, 53));
        this._controller.setAreaOpacity(50);

        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    onControllerMouseDown() {
        if (!this.target) {
            return;
        }
        this._radius = this.target.radius;
        this._offset = this.target.offset.clone();
        this._propRadiusPath = this.getCompPropPath('radius');
        this._propOffsetPath = this.getCompPropPath('offset');
        const worldScale = this.target.node.getWorldScale();
        this._maxScale = Math.max(worldScale.x, worldScale.y, worldScale.z);
    }

    onControllerMouseMove() {
        if (this._controller.updated) {
            const handleType = this._controller.getCurHandleType();
            this._curHandleType = handleType;
            if (handleType === HandleType.Area) {
                this.onControlUpdate(this._propRadiusPath);
                const deltaPos = this._controller.getDeltaPos();
                this.handleAreaMove(deltaPos);
            } else {
                const deltaRadius = this._controller.getDeltaRadius();
                this.handleRadius(deltaRadius);
            }
        }
    }

    onControllerMouseUp() {
        if (this._curHandleType === HandleType.Area) {
            this.onControlEnd(this._propOffsetPath);
        } else {
            this.onControlEnd(this._propRadiusPath);
        }
    }

    handleAreaMove(delta: Vec3) {
        if (!this.target) {
            return;
        }
        const node = this.target.node;

        const posDelta: Vec3 = delta.clone();
        if (node) {
            node.getWorldMatrix(tempMat4);
            Mat4.invert(tempMat4, tempMat4);
            tempMat4.m12 = tempMat4.m13 = 0;
            Vec3.transformMat4(posDelta, posDelta, tempMat4);
        }
        makeVec3InPrecision(posDelta, 1);
        posDelta.z = 0;
        tempVec2.set(this._offset);
        tempVec2.add2f(posDelta.x, posDelta.y);
        this.target.offset = tempVec2;
        this.onComponentChanged(node);
    }

    handleRadius(deltaRadius: number) {
        if (!this.target) {
            return;
        }
        const newRadius = toPrecision(this._radius + deltaRadius / this._maxScale, 1);
        this.target.radius = newRadius;
        this.onComponentChanged(this.target.node);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        const circleCollider2D = this.target;
        if (circleCollider2D) {
            const node = this.target.node;
            node.getWorldMatrix(tempMat4);

            const radius = circleCollider2D.radius;
            const offset = circleCollider2D.offset;
            const center = new Vec3();
            center.x = offset.x;
            center.y = offset.y;
            const worldScale = node.getWorldScale();
            Vec3.transformMat4(center, center, tempMat4);
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setPosition(center);
            this._controller.setRotation(worldRot);
            const scale = worldScale.x;
            this._controller.updateSize(Vec3.ZERO, radius * scale);
            this._controller.edit = circleCollider2D.editing;
        } else {
            this._controller.hide();
        }
    }

    updateController() {
        this.updateControllerData();
    }

    onTargetUpdate() {
        this.updateController();
    }

    onNodeChanged() {
        this.updateController();
    }
}

export const name = js.getClassName(CircleCollider2D);
export const SelectGizmo = CircleCollider2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
