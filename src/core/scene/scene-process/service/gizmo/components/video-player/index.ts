'use strict';

import { Quat, UITransform, Vec3, Vec2, js, VideoPlayer } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import ImageController from '../../controller/image';
import { registerGizmo } from '../../gizmo-defines';

const tempQuat = new Quat();

class VideoPlayerPersistentGizmo extends GizmoBase {
    protected _controller!: ImageController;

    init() {
        const gizmoRoot = this.getGizmoRoot();
        this._controller = new ImageController(gizmoRoot, { texture: true });
    }

    onShow() {
        this._controller.show();
        this.updateController();
    }

    onHide() {
        this._controller.hide();
    }

    updateControllerData() {
        if (!this._isInitialized || !this.target) return;
        const uiTransComp = this.target.node.getComponent(UITransform);
        if (!uiTransComp) return;
        const contentSize = uiTransComp.contentSize;
        this._controller.updateSize(new Vec3(), new Vec2(contentSize.width, -contentSize.height));
        this._controller.show();
    }

    updateControllerTransform() {
        if (!this._isInitialized || !this.target) return;
        const node = this.target.node;
        const worldPos = node.getWorldPosition();
        node.getWorldRotation(tempQuat);
        this._controller.setPosition(worldPos);
        this._controller.setRotation(tempQuat);
    }

    updateController() {
        this.updateControllerData();
        this.updateControllerTransform();
    }

    onTargetUpdate() {
        this.updateController();
    }

    onNodeChanged() {
        this.updateController();
    }
}

export const name = js.getClassName(VideoPlayer);
export const SelectGizmo = null;
export const IconGizmo = null;
export const PersistentGizmo = VideoPlayerPersistentGizmo;

registerGizmo(name, { PersistentGizmo });
