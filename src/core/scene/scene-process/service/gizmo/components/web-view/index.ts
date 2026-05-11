'use strict';

import { Quat, size, UITransform, Vec3, Vec2, js, WebView } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import ImageController from '../../controller/image';
import { registerGizmo } from '../../gizmo-defines';

const tempQuat = new Quat();
const imageSize = size(200, 150);

class WebViewPersistentGizmo extends GizmoBase {
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

    syncImageControllerData() {
        if (!this._isInitialized || !this.target) return;
        const uiTransComp = this.target.node.getComponent(UITransform);
        if (!uiTransComp) return;
        const contentSize = uiTransComp.contentSize;
        this._controller.setTextureByUUID('b9f47df4-b2f0-4270-bd8a-07bb344a8253@6c48a');
        this._controller.show();

        let scaleX = 1, scaleY = 1;
        if (imageSize.width > contentSize.width) {
            scaleX = contentSize.width / imageSize.width;
        }
        if (imageSize.height > contentSize.height) {
            scaleY = contentSize.height / imageSize.height;
        }
        const scale = scaleX < scaleY ? scaleX : scaleY;
        this._controller.updateSize(new Vec3(), new Vec2(imageSize.width * scale, -imageSize.height * scale));
    }

    updateControllerTransform() {
        if (!this._isInitialized || !this.target) return;
        const node = this.target.node;
        const worldPos = node.getWorldPosition();
        node.getWorldRotation(tempQuat);
        this._controller.setPosition(worldPos);
        this._controller.setRotation(tempQuat);

        const worldScale = node.getWorldScale();
        this._controller.setScale(worldScale);
    }

    updateController() {
        this.syncImageControllerData();
        this.updateControllerTransform();
    }

    onTargetUpdate() {
        this.updateController();
    }

    onNodeChanged() {
        this.updateController();
    }
}

export const name = js.getClassName(WebView);
export const SelectGizmo = null;
export const IconGizmo = null;
export const PersistentGizmo = WebViewPersistentGizmo;

registerGizmo(name, { PersistentGizmo });
