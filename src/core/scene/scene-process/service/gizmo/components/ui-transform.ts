'use strict';

import { Color, js, Quat, UITransform, Vec2, Vec3 } from 'cc';
import GizmoBase from '../base/gizmo-base';
import { registerGizmo } from '../gizmo-defines';
import { RectangleController } from '../node/rectangle-controller';

const tempQuat_a = new Quat();

function hasUISkewInSelfOrParent(node: any): boolean {
    for (let current = node; current; current = current.parent) {
        if (current._uiProps?._uiSkewComp) {
            return true;
        }
    }
    return false;
}

class UITransformComponentGizmo extends GizmoBase<UITransform> {
    private _controller!: RectangleController;

    init() {
        this.createController();
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
        this._controller.setColor(new Color(0, 153, 255));

        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    onControllerMouseDown() {}

    onControllerMouseMove() {}

    onControllerMouseUp() {}

    updateControllerTransform() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const node = this.target.node;
        if (hasUISkewInSelfOrParent(node)) {
            this._controller.setWorldMatrix(node.worldMatrix);
            return;
        }

        const worldPos = node.getWorldPosition();
        node.getWorldRotation(tempQuat_a);
        const worldScale = node.getWorldScale();

        this._controller.setPosition(worldPos);
        this._controller.setRotation(tempQuat_a);
        this._controller.setScale(worldScale);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const uiTransComp = this.target;
        if (uiTransComp) {
            const size = uiTransComp.contentSize;
            const anchor = uiTransComp.anchorPoint;
            const center = new Vec3();
            center.x = (0.5 - anchor.x) * size.width;
            center.y = (0.5 - anchor.y) * size.height;
            this._controller.updateSize(center, new Vec2(size.width, size.height));
        } else {
            this._controller.hide();
        }
    }

    updateController() {
        this.updateControllerTransform();
        this.updateControllerData();
    }

    onTargetUpdate() {
        this.updateController();
    }

    onNodeChanged() {
        this.updateController();
    }
}

export const name = js.getClassName(UITransform);
export const SelectGizmo = UITransformComponentGizmo;

registerGizmo(name, { SelectGizmo });
