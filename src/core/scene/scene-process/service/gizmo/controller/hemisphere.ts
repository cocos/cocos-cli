'use strict';

import { Node, Vec3, MeshRenderer, Vec2, Color } from 'cc';

import EditableController from './editable';
import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import type { GizmoMouseEvent } from '../utils/defines';
import { getModel, updatePositions, setMeshColor } from '../utils/engine-utils';

const TWO_PI = Math.PI * 2;

const axisDirMap = ControllerUtils.axisDirectionMap;
const AxisName = ControllerUtils.AxisName;

/**
 * 半球控制器，主要用于粒子系统 Hemisphere 类型发射器的半径编辑。
 * 由两条经线圆弧（半圆）与一条底部赤道圆（整圆）组成，与
 * cocos-editor 中的 controller/hemisphere.ts 保持一致。
 */
class HemisphereController extends EditableController {
    private _center: Vec3 = new Vec3();
    private _radius = 100;
    private _deltaRadius = 0;
    private _circleDataMap: any = {};
    private _mouseDeltaPos: Vec2 = new Vec2();
    private _curDistScalar = 0;
    private _controlDir: Vec3 = new Vec3();

    constructor(rootNode: Node) {
        super(rootNode);

        this._editHandleKeys = [
            AxisName.x,
            AxisName.y,
            AxisName.neg_x,
            AxisName.neg_y,
            AxisName.neg_z,
        ];

        this.initShape();
    }

    get radius() {
        return this._radius;
    }
    set radius(value) {
        this.updateSize(this._center, value);
    }

    setColor(color: Color) {
        Object.keys(this._circleDataMap).forEach((key) => {
            const curData = this._circleDataMap[key];
            setMeshColor(curData.arcMR.node, color);
        });
        this.setEditHandlesColor(color);
        this._color = color;
    }

    createCircleByAxis(axisName: string, fromAxisName: string, color: Color) {
        const normalDir = axisDirMap[axisName];
        const fromDir = axisDirMap[fromAxisName];
        let rad = Math.PI;
        if (axisName === 'neg_z') {
            rad = TWO_PI;
        }
        const arcNode = ControllerUtils.arc(this._center, normalDir, fromDir, rad, this._radius, color);
        arcNode.parent = this.shape;

        const axisData: any = {};
        axisData.arcMR = getModel(arcNode);
        axisData.normalDir = normalDir;
        axisData.fromDir = fromDir;
        this._circleDataMap[axisName] = axisData;
    }

    _updateEditHandle(axisName: string) {
        const node = this._handleDataMap[axisName].topNode;
        const dir = axisDirMap[axisName];

        const offset = new Vec3();
        Vec3.multiplyScalar(offset, dir, this._radius);
        const pos = new Vec3(offset);
        pos.add(this._center);
        Vec3.multiply(pos, pos, this.getScale());
        node.setPosition(pos.x, pos.y, pos.z);
    }

    initShape() {
        this.createShapeNode('HemisphereController');

        this._circleDataMap = {};

        this.createCircleByAxis('x', 'neg_y', this._color);
        this.createCircleByAxis('y', 'x', this._color);
        this.createCircleByAxis('neg_z', 'x', this._color);

        this.hide();
    }

    updateSize(center: Vec3, radius: number) {
        this._center = center;
        this._radius = radius;

        Object.keys(this._circleDataMap).forEach((key) => {
            const normalDir = this._circleDataMap[key].normalDir;
            const fromDir = this._circleDataMap[key].fromDir;
            const arcMR = this._circleDataMap[key].arcMR;
            let rad = Math.PI;
            if (key === 'neg_z') {
                rad = TWO_PI;
            }
            this.updateArcMesh(arcMR, this._center, normalDir, fromDir, rad, this._radius);
        });

        if (this._edit) {
            this.updateEditHandles();
        }

        this.adjustEditHandlesSize();
    }

    updateArcMesh(model: MeshRenderer, center: Vec3, normal: Vec3, from: Vec3, radian: number, radius: number) {
        const arcPositions = ControllerShape.calcArcPoints(center, normal, from, radian, radius);

        updatePositions(model, arcPositions);
    }

    // mouse events
    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        this._mouseDeltaPos = new Vec2(0, 0);
        this._curDistScalar = super.getDistScalar();
        this._controlDir = new Vec3(0, 0, 0);

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
            this._controlDir = axisDir;
            this._deltaRadius = this.getAlignAxisMoveDistance(this.localToWorldDir(axisDir), this._mouseDeltaPos) * this._curDistScalar;

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
    // mouse events end

    getDeltaRadius() {
        return this._deltaRadius;
    }

    getControlDir() {
        return this._controlDir;
    }
}

export default HemisphereController;
