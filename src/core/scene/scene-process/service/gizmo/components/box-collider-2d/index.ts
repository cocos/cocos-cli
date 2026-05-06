'use strict';

import { BoxCollider2D, Color, js, Mat4, Quat, Size, Vec2, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import { RectangleController } from '../../node/rectangle-controller';
import { registerGizmo } from '../../gizmo-defines';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

function makeVec2InPrecision(v: Vec2, p: number): Vec2 {
    const pow = Math.pow(10, p);
    v.x = Math.round(v.x * pow) / pow;
    v.y = Math.round(v.y * pow) / pow;
    return v;
}

const HandleType = RectangleController.RectHandleType;

const tempQuat_a = new Quat();
const tempMat4 = new Mat4();
const tempVec2 = new Vec2();

class BoxCollider2DGizmo extends GizmoBase<BoxCollider2D> {
    private _controller!: RectangleController;

    private _size: Size = new Size();
    private _offset: Vec2 = new Vec2();
    private _anchor: Vec2 = new Vec2(0.5, 0.5);
    private _altKey = false;
    private _propPath: string | null = null;

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
        this._controller = new RectangleController(this.getGizmoRoot());
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
        this._size = this.target.size.clone();
        this._offset = this.target.offset.clone();
        this._propPath = this.getCompPropPath('size');
    }

    onControllerMouseMove() {
        if (this._controller.updated) {
            this.onControlUpdate(this._propPath);
            const handleType = this._controller.getCurHandleType();
            const deltaSize = this._controller.getDeltaSize();
            if (handleType === HandleType.Area) {
                this.handleAreaMove(deltaSize);
            } else {
                const keepCenter: boolean = this._altKey;
                this.handleTargetSize(handleType, deltaSize, keepCenter);
            }
        }
    }

    onControllerMouseUp() {
        this.onControlEnd(this._propPath);
    }

    onKeyDown(event: any) {
        this._altKey = event.altKey;
    }

    onKeyUp(event: any) {
        this._altKey = event.altKey;
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

        posDelta.z = 0;
        tempVec2.set(this._offset);
        tempVec2.add2f(posDelta.x, posDelta.y);
        makeVec2InPrecision(tempVec2, 1);

        this.target.offset.set(tempVec2);
        this.onComponentChanged(node);
    }

    modifyPosDeltaWithAnchor(type: any, posDelta: Vec3, sizeDelta: Vec2, anchor: Vec2, keepCenter: boolean) {
        if (type === HandleType.Right ||
            type === HandleType.TopRight ||
            type === HandleType.BottomRight) {
            if (keepCenter) {
                sizeDelta.x /= (1 - anchor.x);
            }
            posDelta.x = sizeDelta.x * anchor.x;
        } else {
            if (keepCenter) {
                sizeDelta.x /= anchor.x;
            }
            posDelta.x = -sizeDelta.x * (1 - anchor.x);
        }

        if (type === HandleType.Bottom ||
            type === HandleType.BottomRight ||
            type === HandleType.BottomLeft) {
            if (keepCenter) {
                sizeDelta.y /= anchor.y;
            }
            posDelta.y = -sizeDelta.y * (1 - anchor.y);
        } else {
            if (keepCenter) {
                sizeDelta.y /= (1 - anchor.y);
            }
            posDelta.y = sizeDelta.y * anchor.y;
        }
    }

    handleTargetSize(type: any, delta: Vec3, keepCenter: boolean) {
        const posDelta = delta.clone();
        const sizeDelta = new Vec2(delta.x, delta.y);

        sizeDelta.x = toPrecision(sizeDelta.x, 3);
        sizeDelta.y = toPrecision(sizeDelta.y, 3);

        this.modifyPosDeltaWithAnchor(type, posDelta, sizeDelta, this._anchor, keepCenter);

        if (!this.target) {
            return;
        }
        const node = this.target.node;
        node.getWorldMatrix(tempMat4);
        Mat4.invert(tempMat4, tempMat4);
        tempMat4.m12 = tempMat4.m13 = 0;
        Vec3.transformMat4(posDelta, posDelta, tempMat4);

        if (!keepCenter) {
            const localRot = tempQuat_a;
            node.getRotation(localRot);
            Vec3.transformQuat(posDelta, posDelta, localRot);
            posDelta.z = 0;
            tempVec2.set(this._offset);
            tempVec2.add2f(posDelta.x, posDelta.y);
            makeVec2InPrecision(tempVec2, 1);
            this.target.offset.set(tempVec2);
        }

        const worldScale = new Vec3();
        node.getWorldScale(worldScale);
        sizeDelta.x = sizeDelta.x / worldScale.x;
        sizeDelta.y = sizeDelta.y / worldScale.y;

        let width = this._size.width + sizeDelta.x;
        let height = this._size.height + sizeDelta.y;
        width = toPrecision(width, 1);
        height = toPrecision(height, 1);
        this.target.size.set(new Size(width, height));

        this.onComponentChanged(node);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        const boxCollider2D = this.target;
        if (boxCollider2D) {
            const node = boxCollider2D.node;
            if (node) {
                node.getWorldMatrix(tempMat4);
            }

            const size = boxCollider2D.size;
            const offset = boxCollider2D.offset;
            const center = new Vec3();
            center.x = offset.x;
            center.y = offset.y;
            const worldScale = node.getWorldScale();
            Vec3.transformMat4(center, center, tempMat4);
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setPosition(center);
            this._controller.setRotation(worldRot);
            this._controller.updateSize(Vec3.ZERO, new Vec2(size.width * worldScale.x, size.height * worldScale.y));
            this._controller.edit = boxCollider2D.editing;
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

export const name = js.getClassName(BoxCollider2D);
export const SelectGizmo = BoxCollider2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
