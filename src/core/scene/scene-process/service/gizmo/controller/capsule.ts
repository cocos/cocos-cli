'use strict';

import { Color, MeshRenderer, Node, Vec2, Vec3, Quat, EAxisDirection } from 'cc';

import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import EditableController from './editable';
import type { GizmoMouseEvent } from '../utils/defines';
import { setMeshColor, getModel, updatePositions } from '../utils/engine-utils';

const axisDirMap = ControllerUtils.axisDirectionMap;

const tempVec3_a = new Vec3();
const tempVec3_b = new Vec3();
const tempVec3_c = new Vec3();
const tempVec3_d = new Vec3();
const tempVec3_e = new Vec3();
const tempQuat_a = new Quat();

class CapsuleController extends EditableController {
    get radius() {
        return this._radius;
    }
    set radius(value) {
        this.updateSize(this._center, value, this._height);
    }

    get height() {
        return this._height;
    }
    set height(value) {
        this.updateSize(this._center, this._radius, value);
    }
    get direction() {
        return this._direction;
    }
    set direction(value) {
        this._direction = value;
    }
    private _oriDir = new Vec3(0, 1, 0);
    private _direction: EAxisDirection = EAxisDirection.Y_AXIS;
    private _center = new Vec3();
    private _radius = 100;
    private _height = 100;
    private _halfHeight = this._height / 2;
    private _deltaRadius = 0;
    private _deltaHeight = 0;

    private _mouseDeltaPos: Vec2 = new Vec2();
    private _curDistScalar = 0;

    private _upperCapMC: (MeshRenderer | null)[] = [];
    private _lowerCapMC: (MeshRenderer | null)[] = [];
    private _sideLineMC: MeshRenderer | null = null;

    private _upperCapNode: Node[] = [];
    private _lowerCapNode: Node[] = [];
    private _sideLineNode!: Node;

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

        setMeshColor(this._sideLineNode, color);

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
        this.createShapeNode('CapsuleController');

        const upperData = this.getUpperCapData(this._center, this._radius, this._height);
        upperData.forEach((data: any, index: number) => {
            this._upperCapNode[index] = ControllerUtils.createShapeByData(data, this._color);
            this._upperCapNode[index].parent = this.shape;
            this._upperCapMC[index] = getModel(this._upperCapNode[index]);
        });

        const lowerData = this.getLowerCapData(this._center, this._radius, this._height);
        lowerData.forEach((data: any, index: number) => {
            this._lowerCapNode[index] = ControllerUtils.createShapeByData(data, this._color);
            this._lowerCapNode[index].parent = this.shape;
            this._lowerCapMC[index] = getModel(this._lowerCapNode[index]);
        });

        const sideLinesData = this.getSideLinesData(this._center, this._radius, this._height);
        this._sideLineNode = ControllerUtils.createShapeByData(sideLinesData, this._color);
        this._sideLineNode.parent = this.shape;
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
            const mesh = this._upperCapMC[i];
            if (mesh) {
                updatePositions(mesh, data.positions);
            }
        });

        const lowerData = this.getLowerCapData(this._center, this._radius, this._height);
        lowerData.forEach((data: any, i: number) => {
            const mesh = this._lowerCapMC[i];
            if (mesh) {
                updatePositions(mesh, data.positions);
            }
        });

        const lineData = this.getSideLinesData(this._center, this._radius, this._height);
        this._sideLineMC && updatePositions(this._sideLineMC, lineData.positions);

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
            const deltaDist = this.getAlignAxisMoveDistance(this.localToWorldDir(colliderDir), this._mouseDeltaPos) * this._curDistScalar;
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
        const curForward = Vec3.copy(tempVec3_c, this._forward);
        const upperCenter = tempVec3_d;
        const offset = tempVec3_e.set(0, halfHeight, 0);
        if (this._direction !== EAxisDirection.Y_AXIS) {
            const colliderDir = this._directionAxis[this._direction];
            const rot = tempQuat_a;
            Quat.rotationTo(rot, this._up, colliderDir);
            Vec3.transformQuat(offset, offset, rot);
            Vec3.transformQuat(curUp, curUp, rot);
            Vec3.transformQuat(curRight, curRight, rot);
            Vec3.transformQuat(curForward, curForward, rot);
        }

        Vec3.add(upperCenter, center, offset);
        upperData[0] = ControllerShape.calcArcData(upperCenter, curUp, curRight, this._twoPI, radius);
        upperData[1] = ControllerShape.calcArcData(upperCenter, curRight, curForward, -Math.PI, radius);
        upperData[2] = ControllerShape.calcArcData(upperCenter, curForward, curRight, Math.PI, radius);

        return upperData;
    }

    private getLowerCapData(center: Vec3, radius: number, height: number) {
        const lowerData: any = [];
        const halfHeight = height / 2;
        const curUp = Vec3.copy(tempVec3_a, this._up);
        const curRight = Vec3.copy(tempVec3_b, this._right);
        const curForward = Vec3.copy(tempVec3_c, this._forward);
        const lowerCenter = tempVec3_d;
        const offset = tempVec3_e.set(0, -halfHeight, 0);

        if (this._direction !== EAxisDirection.Y_AXIS) {
            const colliderDir = this._directionAxis[this._direction];
            const rot = tempQuat_a;
            Quat.rotationTo(rot, this._up, colliderDir);
            Vec3.transformQuat(offset, offset, rot);
            Vec3.transformQuat(curUp, curUp, rot);
            Vec3.transformQuat(curRight, curRight, rot);
            Vec3.transformQuat(curForward, curForward, rot);
        }

        Vec3.add(lowerCenter, center, offset);
        lowerData[0] = ControllerShape.calcArcData(lowerCenter, curUp, curRight, this._twoPI, radius);
        lowerData[1] = ControllerShape.calcArcData(lowerCenter, curRight, curForward, Math.PI, radius);
        lowerData[2] = ControllerShape.calcArcData(lowerCenter, curForward, curRight, -Math.PI, radius);

        return lowerData;
    }

    private getSideLinesData(center: Vec3, radius: number, height: number) {
        const vertices: Vec3[] = [];
        const indices: number[] = [];
        const halfHeight = height / 2;
        const sideLineHeight = halfHeight;

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

export default CapsuleController;
