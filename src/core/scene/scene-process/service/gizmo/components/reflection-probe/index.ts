'use strict';

import { Color, js, Quat, ReflectionProbe, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import BoxController from '../../controller/box';
import { registerGizmo } from '../../gizmo-defines';

const tempVec3 = new Vec3();
const tempQuat_a = new Quat();

/**
 * 反射探针（ReflectionProbe）选中 Gizmo：
 * 画出影响区域包围盒线框，并支持拖拽包围盒面手柄修改 size。
 * 注意 ReflectionProbe.size 是 AABB 半长，线框全尺寸 = size * 2。
 * PLANAR 类型的 size 为扁平值（默认 5,0.5,5），会显示成一块薄盒（平面）。
 */
class ReflectionProbeComponentGizmo extends GizmoBase<ReflectionProbe> {
    private _controller!: BoxController;
    private _size: Vec3 = new Vec3();
    private _scale: Vec3 = new Vec3();
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
        this._controller = new BoxController(gizmoRoot);
        // 青色以区别于碰撞盒的绿色
        this._controller.setColor(new Color(0, 200, 255));
        this._controller.editable = true;
        this._controller.hoverColor = Color.YELLOW;
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) return;
        this._size = this.target.size.clone();
        this._scale = this.target.node.getWorldScale();
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
            const deltaSize = this._controller.getDeltaSize();
            // size 为半长：手柄位移即半长增量，除以世界缩放换算到本地，不乘 2
            Vec3.divide(deltaSize, deltaSize, this._scale);
            const newSize = Vec3.add(tempVec3, this._size, deltaSize);
            newSize.x = Math.max(0, newSize.x);
            newSize.y = Math.max(0, newSize.y);
            newSize.z = Math.max(0, newSize.z);
            this.target.size = newSize;
            this.onComponentChanged(this.target.node);
        }
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target == null) return;
        if (this.target instanceof ReflectionProbe) {
            const node = this.target.node;
            this._controller.show();
            this._controller.checkEdit();
            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setScale(worldScale);
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);
            // 影响盒中心即节点原点，全尺寸 = 半长 * 2
            const fullSize = Vec3.multiplyScalar(tempVec3, this.target.size, 2);
            this._controller.updateSize(Vec3.ZERO, fullSize);
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
}

export const name = js.getClassName(ReflectionProbe);
// 仅选中 ReflectionProbe 节点时显示影响盒（对齐 Creator 的选中态；图标/预览球后续再加）。
export const SelectGizmo = ReflectionProbeComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
