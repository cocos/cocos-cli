'use strict';

import { geometry, Scene, Vec3 } from 'cc';
import GizmoBase from '../base/gizmo-base';
import BoxController from '../controller/box';

function repaintEngine(): void {
    try {
        const { Service } = require('../../core/decorator');
        Service.Engine?.repaintInEditMode?.();
    } catch (e) {
        // not ready
    }
}

class SceneGizmo extends GizmoBase {
    private _controller!: BoxController;
    private _octreeBoundingBox: geometry.AABB = new geometry.AABB();
    private _octreeBBSize: Vec3 = new Vec3();

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateControllerTransform();
    }

    onHide() {
        this._controller.hide();
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        this._controller = new BoxController(gizmoRoot);
        this._controller.setOpacity(150);
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    updateControllerData() {
        if (!this._isInitialized || !this.target) {
            this._controller && this._controller.hide();
            return;
        }

        const sceneNode: Scene = this.target.node as any as Scene;
        const octree = (sceneNode as any).globals?.octree;

        if (octree && octree.enabled) {
            geometry.AABB.fromPoints(this._octreeBoundingBox, octree.minPos, octree.maxPos);
            Vec3.multiplyScalar(this._octreeBBSize, this._octreeBoundingBox.halfExtents, 2);
            this._controller.updateSize(this._octreeBoundingBox.center, this._octreeBBSize);
            repaintEngine();
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

export default SceneGizmo;
