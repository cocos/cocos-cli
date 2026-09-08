'use strict';

import { Node, Vec3, Color, MeshRenderer, Vec2 } from 'cc';

import EditableController from './editable';
import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import type { GizmoMouseEvent } from '../utils/defines';
import { setMeshColor, getModel, updatePositions } from '../utils/engine-utils';

const axisDirMap = ControllerUtils.axisDirectionMap;
const AxisName = ControllerUtils.AxisName;
const tempVec3 = new Vec3();

/**
 * 平面圆形控制器，主要用于粒子系统 Circle 类型发射器的半径编辑。
 * 与 cocos-editor 中的 controller/circle.ts 保持一致。
 */
class CircleController extends EditableController {
    private _oriDir: Vec3 = new Vec3(0, 0, -1);
    private _center: Vec3 = new Vec3();
    private _radius = 100;
    private _arc = 360;
    private _deltaRadius = 0;
    private _circleNode: Node | null = null;
    private _circleFromDir = new Vec3(1, 0, 0);
    private _circleMR: MeshRenderer | null = null;

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
        ];

        this.initShape();
    }

    get radius() {
        return this._radius;
    }
    set radius(value) {
        this.updateSize(this._center, value, this._arc);
    }

    setColor(color: Color) {
        this._circleNode && setMeshColor(this._circleNode, color);

        this.setEditHandlesColor(color);

        this._color = color;
    }

    _updateEditHandle(axisName: string) {
        const node = this._handleDataMap[axisName].topNode;
        const dir = axisDirMap[axisName];

        const offset = new Vec3();
        Vec3.multiplyScalar(tempVec3, dir, this._radius);
        offset.add(tempVec3);

        Vec3.multiply(offset, offset, this.getScale());
        const pos = new Vec3(offset);
        pos.add(this._center);
        node.setPosition(pos);
    }

    initShape() {
        this.createShapeNode('CircleController');

        // for circle
        const circleNode = ControllerUtils.arc(this._center, this._oriDir, this._circleFromDir, this._twoPI, this._radius, this._color);
        circleNode.parent = this.shape;

        this._circleNode = circleNode;
        this._circleMR = getModel(circleNode);

        this.hide();
    }

    updateSize(center: Vec3, radius: number, arc: number) {
        this._center = center;
        this._radius = radius;
        this._arc = arc;

        // update circle
        const circlePoints = ControllerShape.calcArcPoints(
            this._center,
            this._oriDir,
            this._circleFromDir,
            -this._arc * this._degreeToRadianFactor,
            this._radius,
        );
        this._circleMR && updatePositions(this._circleMR, circlePoints);

        if (this._edit) {
            this.updateEditHandles();
        }

        this.adjustEditHandlesSize();
    }

    // mouse events
    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        this._mouseDeltaPos = new Vec2(0, 0);
        this._curDistScalar = super.getDistScalar();
        this._deltaRadius = 0;
        this._controlDir = new Vec3();

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

            const deltaDist = this.getAlignAxisMoveDistance(this.localToWorldDir(axisDir), this._mouseDeltaPos) * this._curDistScalar;

            this._deltaRadius = deltaDist;

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

export default CircleController;
