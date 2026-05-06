'use strict';

import { Vec3, Vec2, Node, Color, MeshRenderer, EAxisDirection, Quat } from 'cc';

import EditableController from './editable';
import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import type { GizmoMouseEvent } from '../utils/defines';
import { setMeshColor, getModel, updatePositions } from '../utils/engine-utils';

const axisDirMap = ControllerUtils.axisDirectionMap;
const AxisName = ControllerUtils.AxisName;

const tempVec3A = new Vec3();
const tempVec3B = new Vec3();
const tempVec3C = new Vec3();
const tempVec3D = new Vec3();
const tempVec3E = new Vec3();
const tempQuatA = new Quat();

class ConeController extends EditableController {
    private _oriDir = new Vec3(0, 0, -1);
    private _center = new Vec3();
    private _radius = 100;
    private _height = 100;
    private _halfHeight = this._height / 2;
    private _deltaRadius = 0;
    private _deltaHeight = 0;
    private _circleFromDir = new Vec3(1, 0, 0);
    private _sideLineMR: MeshRenderer | null = null;
    private _lowerCapMR: MeshRenderer | null = null;

    private _sideLineNode: Node | null = null;
    private _lowerCapNode: Node | null = null;
    private _mouseDeltaPos: Vec2 = new Vec2();
    private _curDistScalar = 0;

    private _directionAxis: Vec3[] = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];
    private _direction: EAxisDirection = EAxisDirection.Y_AXIS;

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

    get direction() { return this._direction; }
    set direction(value) {
        this._direction = value;
    }

    constructor(rootNode: Node) {
        super(rootNode);

        this._editHandleKeys = [
            AxisName.x,
            AxisName.z,
            AxisName.neg_x,
            AxisName.neg_y,
            AxisName.neg_z,
        ];

        this.initShape();
    }

    setColor(color: Color) {
        setMeshColor(this._sideLineNode!, color);
        setMeshColor(this._lowerCapNode!, color);

        this.setEditHandlesColor(color);

        this._color = color;
    }

    _updateEditHandle(axisName: string) {
        const node = this._handleDataMap[axisName].topNode;
        const dir = axisDirMap[axisName];

        const colliderDir = tempVec3A.set(this._directionAxis[this._direction]);

        const offset = tempVec3B;
        offset.set(0, 0, 0);

        if (axisName === 'neg_y') {
            Vec3.multiplyScalar(offset, colliderDir, -this._halfHeight);
        } else {
            Vec3.multiplyScalar(offset, dir, this._radius);
            Vec3.multiplyScalar(tempVec3C, Vec3.UNIT_Y, -this._halfHeight);
            offset.add(tempVec3C);
            if (this._direction !== EAxisDirection.Y_AXIS) {
                const rot = tempQuatA;
                Quat.rotationTo(rot, Vec3.UNIT_Y, colliderDir);
                Vec3.transformQuat(offset, offset, rot);
            }
        }

        offset.add(this._center);
        Vec3.multiply(offset, offset, this.getScale());
        node.setPosition(offset);
    }

    initShape() {
        this.createShapeNode('ConeController');

        this._circleFromDir = new Vec3(1, 0, 0);
        const sideLinesData = this.getSideLinesData(this._center, this._radius, this._height);
        this._sideLineNode = ControllerUtils.createShapeByData(sideLinesData, this._color, { name: 'sideLines', forwardPipeline: true });
        this._sideLineNode!.parent = this.shape;
        this._sideLineMR = getModel(this._sideLineNode);

        const lowerCapData = this.getLowerCapData(this._center, this._radius, this._height);
        this._lowerCapNode = ControllerUtils.createShapeByData(lowerCapData, this._color, { name: 'lowerCap' });
        this._lowerCapNode!.parent = this.shape;
        this._lowerCapMR = getModel(this._lowerCapNode);

        this.hide();
    }

    getSideLinesData(center: Vec3, radius: number, height: number) {
        const vertices: Vec3[] = [];
        const indices: number[] = [];
        const sideLineHeight = height / 2;

        vertices.push(new Vec3(0, sideLineHeight, 0));
        vertices.push(new Vec3(radius, -sideLineHeight, 0));

        vertices.push(new Vec3(0, sideLineHeight, 0));
        vertices.push(new Vec3(-radius, -sideLineHeight, 0));

        vertices.push(new Vec3(0, sideLineHeight, 0));
        vertices.push(new Vec3(0, -sideLineHeight, radius));

        vertices.push(new Vec3(0, sideLineHeight, -0));
        vertices.push(new Vec3(0, -sideLineHeight, -radius));

        vertices.forEach((vert, index) => {
            if (this._direction !== EAxisDirection.Y_AXIS) {
                const colliderDir = this._directionAxis[this._direction];
                const rot = tempQuatA;
                Quat.rotationTo(rot, Vec3.UNIT_Y, colliderDir);
                Vec3.transformQuat(vert, vert, rot);
            }
            Vec3.add(vert, vert, center);
            indices.push(index);
        });

        return ControllerShape.calcLinesData(vertices, indices, false);
    }

    getLowerCapData(center: Vec3, radius: number, height: number) {
        let lowerData: any;
        const halfHeight = height / 2;
        const curUp = Vec3.copy(tempVec3A, Vec3.UNIT_Y);
        const curRight = Vec3.copy(tempVec3B, Vec3.UNIT_X);
        const curForward = Vec3.copy(tempVec3C, Vec3.UNIT_Z);
        const lowerCenter = tempVec3D;
        const offset = tempVec3E.set(0, -halfHeight, 0);

        if (this._direction !== EAxisDirection.Y_AXIS) {
            const colliderDir = this._directionAxis[this._direction];
            const rot = tempQuatA;
            Quat.rotationTo(rot, Vec3.UNIT_Y, colliderDir);
            Vec3.transformQuat(offset, offset, rot);
            Vec3.transformQuat(curUp, curUp, rot);
            Vec3.transformQuat(curRight, curRight, rot);
            Vec3.transformQuat(curForward, curForward, rot);
        }

        Vec3.add(lowerCenter, center, offset);
        lowerData = ControllerShape.calcArcData(lowerCenter, curUp, curRight, this._twoPI, radius);

        return lowerData;
    }

    updateSize(center: Vec3, radius: number, height: number) {
        this._center = center;
        this._radius = radius;
        this._height = height;

        this._halfHeight = this._height / 2;

        const lineData = this.getSideLinesData(this._center, this._radius, this._height);
        updatePositions(this._sideLineMR!, lineData.positions);

        const lowerCapData = this.getLowerCapData(this._center, this._radius, this._height);
        updatePositions(this._lowerCapMR!, lowerCapData.positions);

        if (this._edit) {
            this.updateEditHandles();
        }

        this.adjustEditHandlesSize();
    }

    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        this._mouseDeltaPos = new Vec2(0, 0);
        this._curDistScalar = super.getDistScalar();
        this._deltaRadius = 0;
        this._deltaHeight = 0;

        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this._isMouseDown) {
            this._mouseDeltaPos.x += event.moveDeltaX;
            this._mouseDeltaPos.y += event.moveDeltaY;

            const axisDir = axisDirMap[event.handleName];
            const colliderDir = tempVec3A.set(this._directionAxis[this._direction]);
            const rot = tempQuatA;
            Quat.rotationTo(rot, Vec3.UNIT_Y, colliderDir);
            Vec3.transformQuat(colliderDir, axisDir, rot);
            const deltaDist = this.getAlignAxisMoveDistance(this.localToWorldDir(colliderDir), this._mouseDeltaPos) * this._curDistScalar;
            if (event.handleName === 'neg_y') {
                this._deltaHeight = deltaDist;
            } else {
                this._deltaRadius = deltaDist;
            }

            if (this.onControllerMouseMove) {
                this.onControllerMouseMove(event);
            }
        }
    }

    onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }

    onMouseLeave(event: GizmoMouseEvent) {
        this.onMouseUp(event);
    }

    getDeltaRadius() {
        return this._deltaRadius;
    }

    getDeltaHeight() {
        return this._deltaHeight;
    }
}

export default ConeController;
