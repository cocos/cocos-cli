'use strict';

import { Color, js, Quat, EAxisDirection, Vec3, SpotLight } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import { IconGizmoBase } from '../../base';
import ConeController from '../../controller/cone';
import SphereController from '../../controller/sphere';
import { registerGizmo } from '../../gizmo-defines';
import { create3DNode } from '../../utils/engine-utils';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

const tempQuat_a = new Quat();

class SpotLightComponentGizmo extends GizmoBase<SpotLight> {
    private _lightGizmoColor: Color = new Color(255, 255, 50);
    private _lightCtrlHoverColor: Color = new Color(0, 255, 0);

    private _range = 0;
    private _angle = 0;
    private _baseSize = 0.5;
    private _glowSize = 0.4;

    private _controller!: ConeController;
    private _sizeSphereCtrl!: SphereController;

    private _rangePropPath: string | null = null;
    private _anglePropPath: string | null = null;

    private _rangeChanged = false;
    private _angleChanged = false;

    private _coneTopPos = new Vec3();

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this._sizeSphereCtrl.show();
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
        this._sizeSphereCtrl.hide();
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        const SpotLightGizmoRoot = create3DNode('SpotLightGizmo');
        SpotLightGizmoRoot.parent = gizmoRoot;
        this._controller = new ConeController(SpotLightGizmoRoot);
        this._controller.direction = EAxisDirection.Z_AXIS;
        this._controller.setColor(this._lightGizmoColor);

        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        this._controller.editable = true;
        this._controller.hoverColor = this._lightCtrlHoverColor;

        this._sizeSphereCtrl = new SphereController(SpotLightGizmoRoot);
        this._sizeSphereCtrl.editable = false;
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        this._range = this.target.range;
        this._angle = this.target.spotAngle;

        this._rangePropPath = this.getCompPropPath('range');
        this._anglePropPath = this.getCompPropPath('spotAngle');

        this._rangeChanged = false;
        this._angleChanged = false;
    }

    onControllerMouseMove() {
        this.updateDataFromController();
    }

    onControllerMouseUp() {
        if (this._rangeChanged) {
            this.onControlEnd(this._rangePropPath);
        }
        if (this._angleChanged) {
            this.onControlEnd(this._anglePropPath);
        }
    }

    getConeRadius(angle: number, height: number) {
        return Math.tan((angle / 2) * D2R) * height;
    }

    updateDataFromController() {
        if (this._controller.updated && this.target) {
            const node = this.target.node;

            const deltaRadius = this._controller.getDeltaRadius();
            const deltaHeight = this._controller.getDeltaHeight();

            let newHeight = this._range;
            if (deltaHeight !== 0) {
                newHeight = this._range + deltaHeight;
                newHeight = toPrecision(newHeight, 3);
                newHeight = Math.abs(newHeight);
                if (newHeight < 0.01) {
                    newHeight = 0.01;
                }

                this._rangeChanged = true;
            }

            let newRadius = this.getConeRadius(this._angle, newHeight);
            let angle = this._angle;
            if (deltaRadius !== 0) {
                newRadius = this.getConeRadius(this._angle, newHeight) + deltaRadius;
                newRadius = Math.abs(newRadius);

                angle = Math.atan2(newRadius, newHeight) * 2;
                if (angle < D2R) {
                    angle = D2R;
                }
                angle = angle * R2D;
                angle = toPrecision(angle, 3);

                this._angleChanged = true;
            }

            if (this._rangeChanged) {
                this.onControlUpdate(this._rangePropPath);
            }
            if (this._angleChanged) {
                this.onControlUpdate(this._anglePropPath);
            }

            this.target.spotAngle = angle;
            this.target.range = newHeight;

            this.onComponentChanged(node);
        }
    }

    updateControllerTransform() {
        if (!this.target) {
            return;
        }
        const node = this.target.node;
        const worldRot = tempQuat_a;
        node.getWorldRotation(worldRot);
        const worldPos = node.getWorldPosition();

        this._controller.setPosition(worldPos);
        this._controller.setRotation(worldRot);
        this._sizeSphereCtrl.setPosition(worldPos);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        this.updateControllerTransform();

        this._controller.checkEdit();
        const lightComp = this.target;
        const radius = this.getConeRadius(lightComp.spotAngle, lightComp.range);
        this._controller.updateSize(this._coneTopPos.set(0, 0, -lightComp.range / 2), radius, lightComp.range);

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

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }
}

class SpotLightIconGizmo extends IconGizmoBase<SpotLight> {
    disableOnSelected = true;
    createController() {
        super.createController();
        this._controller.setTextureByUUID('191b676f-175b-41fa-8283-ac539875bfd8@6c48a');
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

export const name = js.getClassName(SpotLight);
export const SelectGizmo = SpotLightComponentGizmo;
export const IconGizmo = SpotLightIconGizmo;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo, IconGizmo });
