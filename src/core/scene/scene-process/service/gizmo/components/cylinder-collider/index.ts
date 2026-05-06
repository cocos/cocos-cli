'use strict';

import { Color, CylinderCollider, EAxisDirection, js, MeshRenderer, Node, Quat, Vec2, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import EditableController from '../../controller/editable';
import ControllerShape from '../../utils/controller-shape';
import ControllerUtils from '../../utils/controller-utils';
import type { GizmoMouseEvent } from '../../utils/defines';
import { setMeshColor, getModel, updatePositions } from '../../utils/engine-utils';
import { registerGizmo } from '../../gizmo-defines';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

const axisDirMap = ControllerUtils.axisDirectionMap;
const tempVec3_a = new Vec3();
const tempVec3_b = new Vec3();
const tempVec3_c = new Vec3();
const tempVec3_d = new Vec3();
const tempVec3_e = new Vec3();
const tempQuat_a = new Quat();
const tempQuat_gizmo = new Quat();

class CylinderController extends EditableController {
    get radius() { return this._radius; }
    set radius(value) {
        this.updateSize(this._center, value, this._height);
    }

    get height() { return this._height; }
    set height(value) {
        this.updateSize(this._center, this._radius, value);
    }

    get direction() { return this._direction; }
    set direction(value) {
        this._direction = value;
    }

    private _direction: EAxisDirection = EAxisDirection.Y_AXIS;
    private _center = new Vec3();
    private _radius = 100;
    private _height = 100;
    private _halfHeight = this._height / 2;
    private _deltaRadius = 0;
    private _deltaHeight = 0;

    private _mouseDeltaPos: Vec2 = new Vec2();
    private _curDistScalar = 0;

    private _upperCapMC: MeshRenderer[] = [];
    private _lowerCapMC: MeshRenderer[] = [];
    private _sideLineMC: MeshRenderer | null = null;

    private _upperCapNode: Node[] = [];
    private _lowerCapNode: Node[] = [];
    private _sideLineNode: Node | null = null;

    private _up = new Vec3(0, 1, 0);
    private _right = new Vec3(1, 0, 0);
    private _forward = new Vec3(0, 0, 1);
    private _directionAxis: Vec3[] = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];

    constructor(rootNode: Node) {
        super(rootNode);
        this._editHandleKeys = Object.keys(axisDirMap);
        this.initShape();
    }

    public setColor(color: Color) {
        this._upperCapNode.forEach((node) => {
            setMeshColor(node, color);
        });
        this._lowerCapNode.forEach((node) => {
            setMeshColor(node, color);
        });
        setMeshColor(this._sideLineNode!, color);
        this.setEditHandlesColor(color);
        this._color = color;
    }

    public _updateEditHandle(axisName: string) {
        const node = this._handleDataMap[axisName].topNode;
        const dir = axisDirMap[axisName];

        const colliderDir = tempVec3_a.set(this._directionAxis[this._direction]);

        const offset = tempVec3_b;
        offset.set(0, 0, 0);

        if (axisName === 'y') {
            Vec3.multiplyScalar(offset, colliderDir, this._halfHeight);
        } else if (axisName === 'neg_y') {
            Vec3.multiplyScalar(offset, colliderDir, -this._halfHeight);
        } else {
            Vec3.multiplyScalar(offset, dir, this._radius);
            if (this._direction !== EAxisDirection.Y_AXIS) {
                const rot = tempQuat_a;
                Quat.rotationTo(rot, this._up, colliderDir);
                Vec3.transformQuat(offset, offset, rot);
            }
        }

        offset.add(this._center);
        Vec3.multiply(offset, offset, this.getScale());
        node.setPosition(offset);
    }

    public initShape() {
        this.createShapeNode('CylinderController');

        const upperData = this.getUpperCapData(this._center, this._radius, this._height);
        upperData.forEach((data: any, index: number) => {
            this._upperCapNode[index] = ControllerUtils.createShapeByData(data, this._color);
            this._upperCapNode[index].parent = this.shape;
            this._upperCapMC[index] = getModel(this._upperCapNode[index])!;
        });

        const lowerData = this.getLowerCapData(this._center, this._radius, this._height);
        lowerData.forEach((data: any, index: number) => {
            this._lowerCapNode[index] = ControllerUtils.createShapeByData(data, this._color);
            this._lowerCapNode[index].parent = this.shape;
            this._lowerCapMC[index] = getModel(this._lowerCapNode[index])!;
        });

        const sideLinesData = this.getSideLinesData(this._center, this._radius, this._height);
        this._sideLineNode = ControllerUtils.createShapeByData(sideLinesData, this._color);
        this._sideLineNode!.parent = this.shape;
        this._sideLineMC = getModel(this._sideLineNode);

        this.hide();
    }

    public updateSize(center: Vec3, radius: number, height: number) {
        this._center = center;
        this._radius = radius;
        this._height = height;
        this._halfHeight = height / 2;

        const upperData = this.getUpperCapData(this._center, this._radius, this._height);
        upperData.forEach((data: any, i: number) => {
            updatePositions(this._upperCapMC[i], data.positions);
        });

        const lowerData = this.getLowerCapData(this._center, this._radius, this._height);
        lowerData.forEach((data: any, i: number) => {
            updatePositions(this._lowerCapMC[i], data.positions);
        });

        const lineData = this.getSideLinesData(this._center, this._radius, this._height);
        updatePositions(this._sideLineMC!, lineData.positions);

        if (this._edit) {
            this.updateEditHandles();
        }

        this.adjustEditHandlesSize();
    }

    public onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        this._mouseDeltaPos = new Vec2(0, 0);
        this._curDistScalar = super.getDistScalar();
        this._deltaRadius = 0;
        this._deltaHeight = 0;

        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    public onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this._isMouseDown) {
            this._mouseDeltaPos.x += event.moveDeltaX;
            this._mouseDeltaPos.y += event.moveDeltaY;

            const axisDir = axisDirMap[event.handleName];

            const colliderDir = tempVec3_a.set(this._directionAxis[this._direction]);
            const rot = tempQuat_a;
            Quat.rotationTo(rot, this._up, colliderDir);
            Vec3.transformQuat(colliderDir, axisDir, rot);
            const deltaDist = this.getAlignAxisMoveDistance(this.localToWorldDir(colliderDir),
                this._mouseDeltaPos) * this._curDistScalar;
            if (event.handleName === 'y' || event.handleName === 'neg_y') {
                this._deltaHeight = deltaDist;
            } else {
                this._deltaRadius = deltaDist;
            }

            if (this.onControllerMouseMove) {
                this.onControllerMouseMove(event);
            }
        }
    }

    public onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }

    public onMouseLeave(event: GizmoMouseEvent) {
        this.onMouseUp(event);
    }

    public getDeltaRadius() {
        return this._deltaRadius;
    }

    public getDeltaHeight() {
        return this._deltaHeight;
    }

    private getUpperCapData(center: Vec3, radius: number, height: number) {
        const upperData: any = [];
        const halfHeight = height / 2;
        const curUp = Vec3.copy(tempVec3_a, this._up);
        const curRight = Vec3.copy(tempVec3_b, this._right);
        const _curForward = Vec3.copy(tempVec3_c, this._forward);
        const upperCenter = tempVec3_d;
        const offset = tempVec3_e.set(0, halfHeight, 0);
        if (this._direction !== EAxisDirection.Y_AXIS) {
            const colliderDir = this._directionAxis[this._direction];
            const rot = tempQuat_a;
            Quat.rotationTo(rot, this._up, colliderDir);
            Vec3.transformQuat(offset, offset, rot);
            Vec3.transformQuat(curUp, curUp, rot);
            Vec3.transformQuat(curRight, curRight, rot);
            Vec3.transformQuat(_curForward, _curForward, rot);
        }

        Vec3.add(upperCenter, center, offset);
        upperData[0] = ControllerShape.calcArcData(upperCenter, curUp, curRight, this._twoPI, radius);

        return upperData;
    }

    private getLowerCapData(center: Vec3, radius: number, height: number) {
        const lowerData: any = [];
        const halfHeight = height / 2;
        const curUp = Vec3.copy(tempVec3_a, this._up);
        const curRight = Vec3.copy(tempVec3_b, this._right);
        const _curForward = Vec3.copy(tempVec3_c, this._forward);
        const lowerCenter = tempVec3_d;
        const offset = tempVec3_e.set(0, -halfHeight, 0);

        if (this._direction !== EAxisDirection.Y_AXIS) {
            const colliderDir = this._directionAxis[this._direction];
            const rot = tempQuat_a;
            Quat.rotationTo(rot, this._up, colliderDir);
            Vec3.transformQuat(offset, offset, rot);
            Vec3.transformQuat(curUp, curUp, rot);
            Vec3.transformQuat(curRight, curRight, rot);
            Vec3.transformQuat(_curForward, _curForward, rot);
        }

        Vec3.add(lowerCenter, center, offset);
        lowerData[0] = ControllerShape.calcArcData(lowerCenter, curUp, curRight, this._twoPI, radius);

        return lowerData;
    }

    private getSideLinesData(center: Vec3, radius: number, height: number) {
        const vertices: Vec3[] = [];
        const indices: number[] = [];
        const sideLineHeight = height / 2;

        vertices.push(new Vec3(radius, sideLineHeight, 0));
        vertices.push(new Vec3(radius, -sideLineHeight, 0));
        vertices.push(new Vec3(-radius, sideLineHeight, 0));
        vertices.push(new Vec3(-radius, -sideLineHeight, 0));
        vertices.push(new Vec3(0, sideLineHeight, radius));
        vertices.push(new Vec3(0, -sideLineHeight, radius));
        vertices.push(new Vec3(0, sideLineHeight, -radius));
        vertices.push(new Vec3(0, -sideLineHeight, -radius));

        vertices.forEach((vert, index) => {
            if (this._direction !== EAxisDirection.Y_AXIS) {
                const colliderDir = this._directionAxis[this._direction];
                const rot = tempQuat_a;
                Quat.rotationTo(rot, this._up, colliderDir);
                Vec3.transformQuat(vert, vert, rot);
            }
            Vec3.add(vert, vert, center);
            indices.push(index);
        });

        return ControllerShape.calcLinesData(vertices, indices, false);
    }
}

class CylinderColliderComponentGizmo extends GizmoBase<CylinderCollider> {
    private _controller!: CylinderController;
    private _maxScale = 1;
    private _radius = 0;
    private _height = 0;
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
        this._controller = new CylinderController(gizmoRoot);

        this._controller.setColor(Color.GREEN);
        this._controller.editable = true;
        this._controller.hoverColor = Color.YELLOW;
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        this._radius = this.target.radius;
        this._height = this.target.height;
        const worldScale = this.target.node.getWorldScale();
        this._maxScale = this.getMaxScale(worldScale);

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
            const deltaRadius = this._controller.getDeltaRadius();
            const newRadius = toPrecision(this._radius + deltaRadius / this._maxScale, 3);
            this.target.radius = newRadius;

            const deltaHeight = this._controller.getDeltaHeight();
            const newHeight = toPrecision(this._height + deltaHeight / this._maxScale, 3);
            this.target.height = newHeight;

            const node = this.target.node;
            this.onComponentChanged(node);
        }
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }

        if (this.target instanceof CylinderCollider) {
            const node = this.target.node;

            this._controller.show();
            this._controller.checkEdit();

            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_gizmo;
            node.getWorldRotation(worldRot);
            const xzNorm = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.z));
            this._controller.setScale(new Vec3(xzNorm, worldScale.y, xzNorm));
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);

            this._controller.direction = this.target.direction;
            this._controller.updateSize(this.target.center, this.target.radius, this.target.height);
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

    private getMaxScale(inScale: Vec3) {
        return Math.max(inScale.x, inScale.y, inScale.z);
    }
}

export const name = js.getClassName(CylinderCollider);
export const SelectGizmo = CylinderColliderComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
