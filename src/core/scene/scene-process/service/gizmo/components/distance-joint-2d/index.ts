'use strict';

import { DistanceJoint2D, js } from 'cc';
import LineController from '../../controller/line';
import { registerGizmo } from '../../gizmo-defines';
import { SelectGizmo as Joint2DGizmo } from '../joint-2d';

class DistanceJoint2DGizmo extends Joint2DGizmo<DistanceJoint2D> {
    private _anchorLineController!: LineController;

    protected override createController(): void {
        super.createController();

        this._anchorLineController = new LineController(this.getGizmoRoot());
        this._anchorLineController.setColor(this._anchorColor);
        this._anchorLineController.setOpacity(128);
    }

    protected override onHide(): void {
        super.onHide();
        this._anchorLineController.hide();
    }

    protected override updateAnchorControllerData(): boolean {
        const updated = super.updateAnchorControllerData();
        if (!updated) {
            this._anchorLineController.hide();
            return false;
        }

        this._anchorLineController.updateData(
            this._anchorWorldPosition,
            this._connectedAnchorWorldPosition,
        );
        this._anchorLineController.show();
        return true;
    }

    override destroy(): void {
        super.destroy();
        this._anchorLineController?.shape?.destroy();
    }
}

export const name = js.getClassName(DistanceJoint2D);
export const SelectGizmo = DistanceJoint2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
