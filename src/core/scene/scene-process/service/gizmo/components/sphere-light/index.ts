'use strict';

import { Color, js, Quat, SphereLight, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import { IconGizmoBase } from '../../base';
import SphereController from '../../controller/sphere';
import { registerGizmo } from '../../gizmo-defines';
import { create3DNode } from '../../utils/engine-utils';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

class SphereLightComponentGizmo extends GizmoBase<SphereLight> {
    private _lightGizmoColor: Color = new Color(255, 255, 50);
    private _lightCtrlHoverColor: Color = new Color(0, 255, 0);

    private _range = 0;
    private _glowSize = 0.4;

    private _controller!: SphereController;
    private _sizeSphereCtrl!: SphereController;

    private _propPath: string | null = null;

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this._sizeSphereCtrl.show();
        this.updateController();
    }

    onHide() {
        this._controller.hide();
        this._sizeSphereCtrl.hide();
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        const SphereLightGizmoRoot = create3DNode('SphereLightGizmo');
        SphereLightGizmoRoot.parent = gizmoRoot;
        this._controller = new SphereController(SphereLightGizmoRoot);
        this._controller.setColor(this._lightGizmoColor);

        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        this._controller.editable = true;
        this._controller.hoverColor = this._lightCtrlHoverColor;

        this._sizeSphereCtrl = new SphereController(SphereLightGizmoRoot);
        this._sizeSphereCtrl.editable = false;
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        this._range = this.target.range;
        this._propPath = this.getCompPropPath('range');
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
            const node = this.target.node;

            const deltaRange = this._controller.getDeltaRadius();
            let newRange = this._range + deltaRange;
            newRange = toPrecision(newRange, 3);
            newRange = Math.abs(newRange);
            this.target.range = newRange;

            this.onComponentChanged(node);
        }
    }

    updateControllerTransform() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        const node = this.target.node;
        const worldPos = node.getWorldPosition();

        this._controller.setPosition(worldPos);
        this._sizeSphereCtrl.setPosition(worldPos);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        this._controller.checkEdit();
        const lightComp = this.target;
        this._controller.radius = lightComp.range;

        const color = lightComp.color.clone();

        if (lightComp.useColorTemperature) {
            // @ts-ignore
            const colorTemperatureRGB = lightComp._light?.colorTemperatureRGB;
            if (colorTemperatureRGB) {
                color.r *= colorTemperatureRGB.x;
                color.g *= colorTemperatureRGB.y;
                color.b *= colorTemperatureRGB.z;
            }
        }

        this._sizeSphereCtrl.setColor(color);
        this._sizeSphereCtrl.radius = lightComp.size;
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

class SphereLightIconGizmo extends IconGizmoBase<SphereLight> {
    disableOnSelected = true;
    createController() {
        super.createController();
        this._controller.setTextureByUUID('c78f78a5-3553-4d1f-ad3b-177fe55af68b@6c48a');

        this.updateController();
    }

    updateController() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        this.updateControllerTransform();

        const lightComp = this.target;
        const color = lightComp.color.clone();
        if (lightComp.useColorTemperature) {
            // @ts-ignore
            const colorTemperatureRGB = lightComp._light?.colorTemperatureRGB;
            if (colorTemperatureRGB) {
                color.r *= colorTemperatureRGB.x;
                color.g *= colorTemperatureRGB.y;
                color.b *= colorTemperatureRGB.z;
            }
        }

        this._controller.setColor(color);
    }
}

export const name = js.getClassName(SphereLight);
export const SelectGizmo = SphereLightComponentGizmo;
export const IconGizmo = SphereLightIconGizmo;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo, IconGizmo });
