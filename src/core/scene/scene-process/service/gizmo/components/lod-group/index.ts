import { js, LODGroup, Quat, Vec2, Vec3 } from 'cc';
import { LODGroupEditorUtility } from 'cc/editor/lod-group-utils';

import GizmoBase from '../../base/gizmo-base';
import { registerGizmo } from '../../gizmo-defines';
import LODController from './controller-lod';

function getService(): any {
    try {
        const { Service } = require('../../../core/decorator');
        return Service;
    } catch (error) {
        return null;
    }
}

const tempCameraRotation = new Quat();

class LODGroupGizmo extends GizmoBase<LODGroup> {
    private _controller!: LODController;

    init(): void {
        this._controller = new LODController(this.getGizmoRoot());
    }

    onEditorCameraMoved(): void {
        this.updateController();
    }

    onShow(): void {
        this._controller.show();
        this.registerCameraMovedEvent();
        this.updateController();
    }

    onHide(): void {
        this.unregisterCameraMoveEvent();
        this._controller.hide();
    }

    destroy(): void {
        // GizmoBase.destroy() 会先执行隐藏逻辑；随后再销毁 Canvas，避免 onHide 操作已销毁节点。
        super.destroy();
        this._controller?.destroy();
    }

    onTargetUpdate(): void {
        this.updateController();
    }

    onNodeChanged(): void {
        this.updateController();
    }

    private updateController(): void {
        if (!this._isInitialized) {
            return;
        }

        const target = this.target;
        const editorCamera = getService()?.Camera?.getCamera?.();
        if (!target || !editorCamera?.camera || !editorCamera.node) {
            this._controller.hide();
            return;
        }

        const { x, y, z } = target.node.scale;
        const maxScale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
        const size = maxScale * target.objectSize;
        this._controller.show();
        this._controller.updateSize(Vec3.ZERO, new Vec2(size, size));

        const level = LODGroupEditorUtility.getVisibleLOD(target, editorCamera.camera);
        this._controller.setString(level === -1 ? 'Culled' : `LOD ${level}`);
        this._controller.setPosition(target.node.getWorldPosition());
        editorCamera.node.getWorldRotation(tempCameraRotation);
        this._controller.setRotation(tempCameraRotation);
        getService()?.Engine?.repaintInEditMode?.();
    }
}

export const name = js.getClassName(LODGroup);
export const SelectGizmo = LODGroupGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
