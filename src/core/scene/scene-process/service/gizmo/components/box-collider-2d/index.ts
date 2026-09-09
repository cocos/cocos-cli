'use strict';

import { BoxCollider2D, Color, js, Mat4, Quat, Size, Vec2, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import { RectangleController } from '../../node/rectangle-controller';
import { registerGizmo } from '../../gizmo-defines';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

const HandleType = RectangleController.RectHandleType;

const tempQuat_a = new Quat();
const tempMat4 = new Mat4();

class BoxCollider2DGizmo extends GizmoBase<BoxCollider2D> {
    private _controller!: RectangleController;

    private _size: Size = new Size();
    private _offset: Vec2 = new Vec2();
    private _anchor: Vec2 = new Vec2(0.5, 0.5);
    private _altKey = false;
    private _propPath: string | null = null;
    private _dragTarget: BoxCollider2D | null = null;
    private _dragOffsetPath: string | null = null;

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
        this._altKey = false;
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
        this.finishControl();
        const offsetPath = this.getCompPropPath('offset');
        if (!this.target || !offsetPath || this.target.isValid === false || this.target.node.isValid === false || this.target.editing === false) {
            return;
        }
        this._dragTarget = this.target;
        this._dragOffsetPath = offsetPath;
        this._propPath = this._controller.getCurHandleType() === HandleType.Area
            ? offsetPath : this.getCompPropPath('size');
        this._size = this.target.size.clone();
        this._offset = this.target.offset.clone();
    }

    onControllerMouseMove() {
        if (!this._dragTarget) return;
        if (!this.isDragTargetValid() || this.target?.editing === false) {
            this.finishControl();
            return;
        }
        if (this._controller.updated) {
            const handleType = this._controller.getCurHandleType();
            const deltaSize = this._controller.getDeltaSize();
            if (handleType === HandleType.Area) {
                this.handleAreaMove(deltaSize);
            } else {
                this.handleTargetSize(handleType, deltaSize, this._altKey);
            }
        }
    }

    onControllerMouseUp() {
        this.finishControl();
    }

    private isDragTargetValid(): boolean {
        const target = this._dragTarget;
        return !!target && this.target === target && target.isValid !== false && target.node.isValid !== false
            && this.getCompPropPath('offset') === this._dragOffsetPath;
    }

    private finishControl(commitProperty = true) {
        const target = this._dragTarget;
        const propPath = this._propPath;
        // Scope and animation use the gesture's primary property (Resize: size,
        // Area: offset). The node snapshot still restores all changed properties.
        const primaryChanged = this.isDragTargetValid() && target && (
            propPath === this._dragOffsetPath
                ? target.offset.x !== this._offset.x || target.offset.y !== this._offset.y
                : target.size.width !== this._size.width || target.size.height !== this._size.height
        );
        this._dragTarget = null;
        this._dragOffsetPath = null;
        this._propPath = null;
        if (this._isControlBegin) {
            if (commitProperty && primaryChanged) {
                void this.onControlEnd(propPath);
            } else {
                // Unbound/invalid targets and unchanged gestures must not emit an
                // animation commit. The recorded node UUID still owns the Undo.
                this._isControlBegin = false;
                void this.commitChanges();
            }
        }
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
        const offsetX = toPrecision(this._offset.x + posDelta.x, 1);
        const offsetY = toPrecision(this._offset.y + posDelta.y, 1);
        if (offsetX === this.target.offset.x && offsetY === this.target.offset.y) return;

        this.onControlUpdate(this._propPath);
        this.target.offset.set(offsetX, offsetY);
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
        let offsetX = this.target.offset.x;
        let offsetY = this.target.offset.y;

        if (!keepCenter) {
            // Resize deltas are projected onto the controller axes, in world units.
            // Rotate the center delta into world space before converting to offset's
            // local space, so parent rotation is accounted for as well.
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            Vec3.transformQuat(posDelta, posDelta, worldRot);
            node.getWorldMatrix(tempMat4);
            Mat4.invert(tempMat4, tempMat4);
            tempMat4.m12 = tempMat4.m13 = tempMat4.m14 = 0;
            Vec3.transformMat4(posDelta, posDelta, tempMat4);
            posDelta.z = 0;
            offsetX = toPrecision(this._offset.x + posDelta.x, 1);
            offsetY = toPrecision(this._offset.y + posDelta.y, 1);
        }

        const worldScale = new Vec3();
        node.getWorldScale(worldScale);
        sizeDelta.x = sizeDelta.x / worldScale.x;
        sizeDelta.y = sizeDelta.y / worldScale.y;

        let width = this._size.width + sizeDelta.x;
        let height = this._size.height + sizeDelta.y;
        width = toPrecision(width, 1);
        height = toPrecision(height, 1);
        const sizeChanged = width !== this.target.size.width || height !== this.target.size.height;
        const offsetChanged = offsetX !== this.target.offset.x || offsetY !== this.target.offset.y;
        if (!sizeChanged && !offsetChanged) return;

        // Record before writing, but only after rounding confirms a value change.
        this.onControlUpdate(this._propPath);
        if (offsetChanged) this.target.offset.set(offsetX, offsetY);
        if (sizeChanged) this.target.size.set(new Size(width, height));

        this.onComponentChanged(node);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }
        if (this.target.isValid === false || this.target.node.isValid === false || !this.getCompPropPath('offset')) {
            this._controller.hide();
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

export const name = js.getClassName(BoxCollider2D);
export const SelectGizmo = BoxCollider2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
