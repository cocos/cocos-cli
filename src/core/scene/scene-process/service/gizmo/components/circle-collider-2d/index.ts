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
const MIN_RADIUS_SCALE = 1e-6;

class CircleCollider2DGizmo extends GizmoBase<CircleCollider2D> {
    private _controller!: DiscController;

    private _radius = 0;
    private _offset: Vec2 = new Vec2();
    private _propRadiusPath: string | null = null;
    private _propOffsetPath: string | null = null;
    private _curHandleType: any;
    private _radiusScale = 1;
    private _dragTarget: CircleCollider2D | null = null;

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateController();
    }

    onHide() {
        this.finishControl();
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
        this.finishControl();
        const radiusPath = this.getCompPropPath('radius');
        if (!this.target || !radiusPath || this.target.isValid === false || this.target.node.isValid === false || this.target.editing === false) {
            return;
        }
        this._dragTarget = this.target;
        this._radius = this.target.radius;
        this._offset = this.target.offset.clone();
        this._propRadiusPath = radiusPath;
        this._propOffsetPath = this.getCompPropPath('offset');
        const worldScale = this.target.node.getWorldScale();
        this._radiusScale = Math.abs(worldScale.x);
        this._curHandleType = this._controller.getCurHandleType();
    }

    onControllerMouseMove() {
        if (!this._dragTarget) return;
        if (!this.isDragTargetValid() || this.target?.editing === false) {
            this.finishControl();
            return;
        }
        if (this._controller.updated) {
            const handleType = this._controller.getCurHandleType();
            this._curHandleType = handleType;
            if (handleType === HandleType.Area) {
                this.onControlUpdate(this._propOffsetPath);
                const deltaPos = this._controller.getDeltaPos();
                this.handleAreaMove(deltaPos);
            } else if (this._radiusScale > MIN_RADIUS_SCALE) {
                this.onControlUpdate(this._propRadiusPath);
                const deltaRadius = this._controller.getDeltaRadius();
                this.handleRadius(deltaRadius);
            }
        }
    }

    onControllerMouseUp() {
        this.finishControl();
    }

    private isDragTargetValid(): boolean {
        const target = this._dragTarget;
        return !!target && this.target === target && target.isValid !== false && target.node.isValid !== false
            && this.getCompPropPath('radius') === this._propRadiusPath;
    }

    private finishControl(commitProperty = true) {
        const target = this._dragTarget;
        const changed = this.isDragTargetValid() && target && (
            target.radius !== this._radius || target.offset.x !== this._offset.x || target.offset.y !== this._offset.y
        );
        this._dragTarget = null;
        if (!this._isControlBegin) {
            return;
        }
        if (!commitProperty || !changed) {
            this._isControlBegin = false;
            void this.commitChanges();
        } else if (this._curHandleType === HandleType.Area) {
            void this.onControlEnd(this._propOffsetPath);
        } else {
            void this.onControlEnd(this._propRadiusPath);
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
        this.target.offset.set(this._offset.x + posDelta.x, this._offset.y + posDelta.y);
        this.onComponentChanged(node);
    }

    handleRadius(deltaRadius: number) {
        if (!this.target) {
            return;
        }
        if (this._radiusScale <= MIN_RADIUS_SCALE) {
            return;
        }
        const newRadius = toPrecision(this._radius + deltaRadius / this._radiusScale, 1);
        this.target.radius = newRadius;
        this.onComponentChanged(this.target.node);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }
        if (this.target.isValid === false || this.target.node.isValid === false || !this.getCompPropPath('radius')) {
            this._controller.hide();
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
            const scale = Math.abs(worldScale.x);
            this._controller.updateSize(Vec3.ZERO, Math.abs(radius) * scale);
            this._controller.edit = circleCollider2D.editing;
        } else {
            this._controller.hide();
        }
    }

    updateController() {
        this.updateControllerData();
    }

    onTargetUpdate() {
        if (!this._isInitialized) return;
        this.finishControl(false);
        this.updateController();
    }

    onNodeChanged() {
        if (this._dragTarget && (!this.isDragTargetValid() || this.target?.editing === false)) this.finishControl();
        this.updateController();
    }

    override destroy() {
        this.finishControl();
        super.destroy();
    }
}

export const name = js.getClassName(CircleCollider2D);
export const SelectGizmo = CircleCollider2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
