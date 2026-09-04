'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */
// Allow using CommonJS require in this module without forcing consumers to install
// @types/node. The require usage is deliberate and lazy to avoid circular
// import/evaluation order issues.
declare const require: any;

import { Color, geometry, js, Node, ParticleSystem, Quat, Vec3 } from 'cc';
import { registerGizmo } from '../../gizmo-defines';
import { create3DNode } from '../../utils/engine-utils';

import BoxController from '../../controller/box';
import CircleController from '../../controller/circle';
import HemisphereController from '../../controller/hemisphere';
import SphereController from '../../controller/sphere';
import ParticleSystemConeController from './controller-cone';

// Lazily require base classes to avoid circular import / evaluation order issues that
// lead to "Class extends value undefined" during test import-time evaluation.
let GizmoBase: any;
let IconGizmoBase: any;
try {
    GizmoBase = require('../../base/gizmo-base').default;
    IconGizmoBase = require('../../base/gizmo-icon').default;
} catch (e) {
    // Fallback to minimal classes to avoid runtime crash in environments where bases
    // are not yet available during circular evaluation. Real behavior depends on
    // successful require in usual environments.
    GizmoBase = class {};
    IconGizmoBase = class {};
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

// 与引擎 ParticleShapeType 枚举值保持一致（Box=0, Circle=1, Cone=2, Sphere=3, Hemisphere=4）
const ShapeType = {
    Box: 0,
    Circle: 1,
    Cone: 2,
    Sphere: 3,
    Hemisphere: 4,
};

// 与引擎 CurveRange.Mode 枚举值保持一致
const CurveRangeMode = {
    Constant: 0,
    Curve: 1,
    TwoCurves: 2,
    TwoConstants: 3,
};

const tempVec3 = new Vec3();
const tempQuat_a = new Quat();

type TShapeController =
    | BoxController
    | SphereController
    | CircleController
    | ParticleSystemConeController
    | HemisphereController;

/**
 * ParticleSystem 组件选中 Gizmo：
 * - 依据 shapeModule.shapeType 显示对应形状（Box/Circle/Cone/Sphere/Hemisphere）线框，
 *   支持拖拽手柄修改发射器大小；
 * - 支持显示/编辑粒子剔除用的 AABB 包围盒（renderCulling 开启且 _isShowBB 为 true 时）。
 * 与 cocos-editor 中 components/particle-system 保持一致。
 */
class ParticleSystemComponentGizmo extends (GizmoBase as any) {
    // init 里初始化了，所以一定存在
    private _boundingBoxController!: BoxController;

    private _curEmitterShape = ShapeType.Box;
    private _shapeControllers: any = {};
    private _PSGizmoColor: Color = new Color(100, 100, 255);
    private _activeController: TShapeController | null = null;
    private _pSGizmoRoot: Node | null = null;

    // common
    private _scale = new Vec3();

    // for box
    private _size = new Vec3();

    // for sphere/circle/cone
    private _radius = 0;

    // for circle
    private _arc = 0;

    // for cone
    private _coneHeight = 0;
    private _coneAngle = 0;
    private _bottomRadius = 0;

    // for bounding box
    private _bbHalfSize = new Vec3();

    init() {
        this.createController();
        this._isInitialized = true;
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        this._boundingBoxController = new BoxController(gizmoRoot);
        this._boundingBoxController.setColor(Color.GREEN);
        this._boundingBoxController.editable = true;
        this._boundingBoxController.onControllerMouseDown = this.onBBControllerMouseDown.bind(this);
        this._boundingBoxController.onControllerMouseMove = this.onBBControllerMouseMove.bind(this);
        this._boundingBoxController.onControllerMouseUp = this.onBBControllerMouseUp.bind(this);
    }

    onShow() {
        this.updateControllerData();
    }

    onHide() {
        this._activeController?.hide();
        this._boundingBoxController.hide();
    }

    createControllerByShape(shape: any): TShapeController | null {
        const gizmoRoot = this.getGizmoRoot();
        const PSGizmoRoot = create3DNode('ParticleSystemGizmo');
        PSGizmoRoot.parent = gizmoRoot;
        this._pSGizmoRoot = PSGizmoRoot;
        let controller: TShapeController | null = null;

        switch (shape) {
            case ShapeType.Box:
                controller = new BoxController(PSGizmoRoot);
                break;
            case ShapeType.Sphere:
                controller = new SphereController(PSGizmoRoot);
                break;
            case ShapeType.Circle:
                controller = new CircleController(PSGizmoRoot);
                break;
            case ShapeType.Cone:
                controller = new ParticleSystemConeController(PSGizmoRoot);
                break;
            case ShapeType.Hemisphere:
                controller = new HemisphereController(PSGizmoRoot);
                break;
            default:
                console.error('Invalid Type:', shape);
        }

        if (controller) {
            controller.editable = true;
            controller.setColor(this._PSGizmoColor);
            controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
            controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
            controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        }

        return controller;
    }

    getControllerByShape(shape: any): TShapeController | null {
        let controller = this._shapeControllers[shape];
        if (!controller) {
            controller = this.createControllerByShape(shape);
            this._shapeControllers[shape] = controller;
        } else {
            controller.setRoot(this._pSGizmoRoot!); // 复用controller时，要更改根节点到当前的GizmoRoot
        }

        return controller;
    }

    getConeData(psComp: ParticleSystem) {
        const shapeModule = psComp.shapeModule;

        // 引擎里 ShapeModule 类里的默认值
        const topRadius = shapeModule ? shapeModule.radius : 1;
        const height = shapeModule ? shapeModule.length : 5;

        let coneAngle = shapeModule ? shapeModule.angle : 0;

        let deltaRadius = 0;
        if (coneAngle < 0) {
            coneAngle = 0;
        }

        if (coneAngle >= 90) {
            deltaRadius = 1000;
        } else {
            deltaRadius = Math.tan(coneAngle * D2R) * height;
        }

        const bottomRadius = topRadius + deltaRadius;

        return { topRadius, height, bottomRadius, coneAngle };
    }

    modifyConeData(psComp: ParticleSystem, deltaTopRadius: number, deltaHeight: number, deltaBottomRadius: number) {
        const shapeModule = psComp.shapeModule;

        if (!shapeModule) {
            return;
        }

        if (deltaTopRadius !== 0) {
            let topRadius = this._radius + deltaTopRadius;
            topRadius = toPrecision(topRadius, 3);
            if (topRadius < 0) {
                topRadius = 0.0001;
            }

            shapeModule.radius = topRadius;
        } else if (deltaHeight !== 0) {
            let height = this._coneHeight + deltaHeight;
            height = toPrecision(height, 3);
            if (height <= 0) {
                height = 0.0001;
            }

            shapeModule.length = height;
        } else if (deltaBottomRadius !== 0) {
            let bottomRadius = this._bottomRadius + deltaBottomRadius;
            if (bottomRadius < this._radius) {
                bottomRadius = this._radius;
            }

            const coneAngle = Math.atan2(bottomRadius - this._radius, this._coneHeight) * R2D;
            shapeModule.angle = toPrecision(coneAngle, 3);
        }
    }

    setCurveRangeInitValue(curve: any, value: any) {
        let kf;
        switch (curve.mode) {
            case CurveRangeMode.Constant:
                curve.constant = value;
                break;
            case CurveRangeMode.Curve:
                kf = curve.curve.keyFrames[0];
                if (kf) {
                    kf.value = value;
                }
                break;
            case CurveRangeMode.TwoCurves:
                kf = curve.curveMax.keyFrames[0];
                if (kf) {
                    kf.value = value;
                }
                break;
            case CurveRangeMode.TwoConstants:
                curve.constantMax = value;
                break;
            default:
                console.error('unknown cure range mode:', curve.mode);
        }
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        const shapeModule = this.target.shapeModule!;
        this._curEmitterShape = shapeModule.shapeType;

        this._scale = this.target.node.getWorldScale();

        let coneData;
        switch (this._curEmitterShape) {
            case ShapeType.Box:
                this._size = shapeModule.scale.clone();
                break;
            case ShapeType.Sphere:
                this._radius = shapeModule.radius;
                break;
            case ShapeType.Circle:
                this._radius = shapeModule.radius;
                this._arc = shapeModule.arc;
                break;
            case ShapeType.Cone:
                coneData = this.getConeData(this.target);
                this._radius = coneData.topRadius;
                this._coneHeight = coneData.height;
                this._coneAngle = coneData.coneAngle;
                this._bottomRadius = coneData.bottomRadius;
                break;
            case ShapeType.Hemisphere:
                this._radius = shapeModule.radius;
                break;
        }
    }

    onControllerMouseMove(/* event */) {
        this.updateDataFromController();
    }

    onControllerMouseUp() {
        this.commitChanges();
    }

    getScaledDeltaRadius(deltaRadius: number, controlDir: Vec3, scale: Vec3) {
        if (controlDir.x !== 0) {
            deltaRadius /= scale.x;
        } else if (controlDir.y !== 0) {
            deltaRadius /= scale.y;
        } else if (controlDir.z !== 0) {
            deltaRadius /= scale.z;
        }

        return deltaRadius;
    }

    updateDataFromController() {
        if (this._activeController?.updated && this.target) {
            this.recordChanges();
            const node = this.target.node;
            const shapeModule = this.target.shapeModule!;

            switch (this._curEmitterShape) {
                case ShapeType.Box: {
                    const deltaSize = (this._activeController as BoxController).getDeltaSize();
                    Vec3.divide(deltaSize, deltaSize, this._scale);
                    Vec3.multiplyScalar(deltaSize, deltaSize, 2);
                    const newSize = Vec3.add(tempVec3, this._size, deltaSize);
                    newSize.x = toPrecision(Math.abs(newSize.x), 3);
                    newSize.y = toPrecision(Math.abs(newSize.y), 3);
                    newSize.z = toPrecision(Math.abs(newSize.z), 3);
                    shapeModule.scale = newSize;
                    break;
                }
                case ShapeType.Sphere: {
                    let deltaRadius = (this._activeController as SphereController).getDeltaRadius();
                    const controlDir = (this._activeController as SphereController).getControlDir();
                    deltaRadius = this.getScaledDeltaRadius(deltaRadius, controlDir, this._scale);
                    let newRadius = this._radius + deltaRadius;
                    newRadius = Math.abs(newRadius);
                    newRadius = toPrecision(newRadius, 3);
                    shapeModule.radius = newRadius;
                    break;
                }
                case ShapeType.Circle: {
                    let deltaRadius = (this._activeController as CircleController).getDeltaRadius();
                    const controlDir = (this._activeController as CircleController).getControlDir();
                    if (controlDir.x !== 0) {
                        deltaRadius /= this._scale.x;
                    } else if (controlDir.y !== 0) {
                        deltaRadius /= this._scale.y;
                    }
                    let newRadius = this._radius + deltaRadius;
                    newRadius = Math.abs(newRadius);
                    newRadius = toPrecision(newRadius, 3);
                    shapeModule.radius = newRadius;
                    break;
                }
                case ShapeType.Cone: {
                    const deltaTopRadius = (this._activeController as ParticleSystemConeController).getDeltaRadius();
                    const deltaHeight = (this._activeController as ParticleSystemConeController).getDeltaHeight();
                    const deltaBottomRadius = (this._activeController as ParticleSystemConeController).getDeltaBottomRadius();

                    this.modifyConeData(this.target, deltaTopRadius, deltaHeight, deltaBottomRadius);
                    break;
                }
                case ShapeType.Hemisphere: {
                    let deltaRadius = (this._activeController as HemisphereController).getDeltaRadius();
                    const controlDir = (this._activeController as HemisphereController).getControlDir();

                    deltaRadius = this.getScaledDeltaRadius(deltaRadius, controlDir, this._scale);
                    let newRadius = this._radius + deltaRadius;
                    newRadius = Math.abs(newRadius);
                    newRadius = toPrecision(newRadius, 3);
                    shapeModule.radius = newRadius;
                    break;
                }
            }

            // 发送节点修改消息
            this.onComponentChanged(node);
        }
    }

    updateControllerTransform() {
        if (this.target && this.target.shapeModule) {
            const shapeModule = this.target.shapeModule;

            if (shapeModule.enable && this._pSGizmoRoot) {
                const node = this.target.node;
                const worldRot = tempQuat_a;
                const worldPos = node.getWorldPosition();

                node.getWorldRotation(worldRot);
                const worldScale = node.getWorldScale();

                this._pSGizmoRoot.setWorldPosition(worldPos);
                this._pSGizmoRoot.setWorldRotation(worldRot);
                this._pSGizmoRoot.setWorldScale(worldScale);

                const shapeRot = shapeModule.rotation;
                const rot = tempQuat_a;
                Quat.fromEuler(rot, shapeRot.x, shapeRot.y, shapeRot.z);
                if (this._activeController) {
                    this._activeController.setPosition(shapeModule.position);
                    this._activeController.setRotation(rot);
                    this._activeController.setScale(shapeModule.scale);
                }
            }
        }
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        const shapeModule = this.target.shapeModule!;

        if (shapeModule.enable) {
            if (this._activeController) {
                const isMouseDown = (this._activeController as any)['isMouseDown'];
                this._activeController.hide();
                (this._activeController as any)['_isMouseDown'] = isMouseDown;
            }

            this._activeController = this.getControllerByShape(shapeModule.shapeType);
            this._activeController?.checkEdit();
            this.updateControllerTransform();
            switch (shapeModule.shapeType) {
                case ShapeType.Box: {
                    const boxController = this._activeController as BoxController;
                    if (boxController.edit) {
                        boxController.updateEditHandles();
                    }
                    boxController.adjustEditHandlesSize();
                    break;
                }
                case ShapeType.Sphere:
                    (this._activeController as SphereController).radius = shapeModule.radius;
                    break;
                case ShapeType.Circle:
                    (this._activeController as CircleController).updateSize(Vec3.ZERO, shapeModule.radius, shapeModule.arc);
                    break;
                case ShapeType.Cone: {
                    const coneData = this.getConeData(this.target);
                    coneData &&
                        (this._activeController as ParticleSystemConeController).updateSize(
                            Vec3.ZERO,
                            coneData.topRadius,
                            coneData.height,
                            coneData.bottomRadius,
                        );
                    break;
                }
                case ShapeType.Hemisphere:
                    (this._activeController as HemisphereController).radius = shapeModule.radius;
            }

            this._activeController?.show();
        } else {
            this._activeController?.hide();
        }

        this.updateBBControllerData();
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }

    updateDataFromBBController() {
        if (this._boundingBoxController.updated && this.target) {
            this.recordChanges();
            const node = this.target.node;

            const deltaSize = this._boundingBoxController.getDeltaSize();
            Vec3.add(tempVec3, this._bbHalfSize, deltaSize);
            const psComp: ParticleSystem = this.target;
            psComp.aabbHalfX = tempVec3.x;
            psComp.aabbHalfY = tempVec3.y;
            psComp.aabbHalfZ = tempVec3.z;

            // 发送节点修改消息
            this.onComponentChanged(node);
        }
    }

    updateBBControllerData() {
        if (!this.target) {
            return;
        }
        const psComp: ParticleSystem = this.target;
        const boundingBox: geometry.AABB | null = (psComp as any)._boundingBox;
        if (psComp.renderCulling && boundingBox && psComp._isShowBB) {
            this._boundingBoxController.edit = true;
            this._boundingBoxController.setPosition(boundingBox.center);
            const halfExtents = boundingBox.halfExtents;
            this._boundingBoxController.updateSize(
                Vec3.ZERO,
                tempVec3.set(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
            );
            this._boundingBoxController.show();
        } else {
            this._boundingBoxController.hide();
        }
    }

    onBBControllerMouseDown() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const psComp: ParticleSystem = this.target;

        this._bbHalfSize.set(psComp.aabbHalfX, psComp.aabbHalfY, psComp.aabbHalfZ);
    }

    // for bounding box edit
    onBBControllerMouseMove(/* event */) {
        this.updateDataFromBBController();
    }

    onBBControllerMouseUp() {
        this.commitChanges();
    }

    public showBoundingBox(isShow: boolean) {
        if (!this.target) {
            return;
        }
        const psComp: ParticleSystem = this.target;
        if (psComp) {
            psComp._isShowBB = isShow;
        }

        this.updateBBControllerData();
    }

    public isShowBoundingBox() {
        return this.target?._isShowBB;
    }
}

class ParticleSystemIconGizmo extends (IconGizmoBase as any) {
    disableOnSelected = true;
    createController() {
        super.createController();
        this._controller.setTextureByUUID('55052bc6-9909-43c1-b2fc-8818060fb069@6c48a');
    }
}

export const name = js.getClassName(ParticleSystem);
export const SelectGizmo = ParticleSystemComponentGizmo;
export const IconGizmo = ParticleSystemIconGizmo;
export const PersistentGizmo = null;

/**
 * 获取 Gizmo Service（惰性访问，避免循环依赖）
 */
function getGizmoService(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Gizmo;
    } catch (e) {
        return null;
    }
}

// 与 cocos-editor 一致：暴露 showBoundingBox/isShowBoundingBox 供面板 UI 调用。
// 目前场景面板尚无接入点，先按节点 uuid 定位当前选中的 gizmo 实例进行调用，
// 待面板支持粒子系统包围盒开关 UI 时可直接复用。
export const methods = {
    showBoundingBox(uuid: string, isShow: boolean) {
        getGizmoService()?.forEachInstanceList?.('component', name, (gizmo: any) => {
            if (gizmo?.target?.node?.uuid === uuid) {
                gizmo.showBoundingBox(isShow);
            }
        });
    },
    isShowBoundingBox(uuid: string) {
        let result: boolean | undefined;
        getGizmoService()?.forEachInstanceList?.('component', name, (gizmo: any) => {
            if (gizmo?.target?.node?.uuid === uuid) {
                result = gizmo.isShowBoundingBox();
            }
        });
        return result;
    },
};

registerGizmo(name, { SelectGizmo, IconGizmo, methods });