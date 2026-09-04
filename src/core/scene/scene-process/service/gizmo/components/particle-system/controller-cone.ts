'use strict';

import { Node, Vec3, MeshRenderer, Vec2, Color } from 'cc';

import ControllerShape from '../../utils/controller-shape';
import ControllerUtils from '../../utils/controller-utils';
import type { GizmoMouseEvent } from '../../utils/defines';
import { getModel, updatePositions, setMeshColor } from '../../utils/engine-utils';

import EditableController from '../../controller/editable';

const tempVec3 = new Vec3();

/**
 * 粒子系统专用的圆锥体发射器控制器：
 * 与通用 ConeController（用于 ConeCollider/SpotLight）不同，粒子系统的圆锥发射器
 * 需要同时编辑顶部半径（radius）、高度（height）与底部半径（bottomRadius），
 * 因此在此单独实现，避免影响现有的碰撞体/灯光圆锥控制器。
 * 与 cocos-editor 中 components/particle-system/controller-cone.ts 保持一致。
 */
class ParticleSystemConeController extends EditableController {
    private _oriDir: Vec3 = new Vec3(0, 0, -1);
    private _center: Vec3 = new Vec3();
    private _radius = 100;
    private _height = 100;
    private _bottomRadius = 120;
    private _deltaRadius = 0;
    private _deltaHeight = 0;
    private _deltaBottomRadius = 0;
    private _coneLineNode: Node | null = null;
    private _circleNode: Node | null = null;
    private _bottomCircleNode: Node | null = null;
    private _circleFromDir = new Vec3(1, 0, 0);
    private _coneLineMR: MeshRenderer | null = null;
    private _circleMR: MeshRenderer | null = null;
    private _bottomCircleMR: MeshRenderer | null = null;
    private _mouseDeltaPos: Vec2 = new Vec2();
    private _curDistScalar = 0;
    private _axisDir: any = {};

    constructor(rootNode: Node) {
        super(rootNode);

        // top circle
        this._axisDir.x = new Vec3(1, 0, 0);
        this._axisDir.y = new Vec3(0, 1, 0);
        this._axisDir.neg_x = new Vec3(-1, 0, 0);
        this._axisDir.neg_y = new Vec3(0, -1, 0);

        // bottom circle
        this._axisDir.bottom_x = new Vec3(1, 0, 0);
        this._axisDir.bottom_y = new Vec3(0, 1, 0);
        this._axisDir.bottom_neg_x = new Vec3(-1, 0, 0);
        this._axisDir.bottom_neg_y = new Vec3(0, -1, 0);
        this._axisDir.bottom_neg_z = new Vec3(0, 0, -1);

        this._editHandleKeys = Object.keys(this._axisDir);

        this.initShape();
    }

    get radius() {
        return this._radius;
    }
    set radius(value) {
        this.updateSize(this._center, value, this._height, this._bottomRadius);
    }

    get height() {
        return this._height;
    }
    set height(value) {
        this.updateSize(this._center, this._radius, value, this._bottomRadius);
    }

    setColor(color: Color) {
        setMeshColor(this._coneLineNode!, color);
        setMeshColor(this._circleNode!, color);
        setMeshColor(this._bottomCircleNode!, color);

        this.setEditHandlesColor(color);

        this._color = color;
    }

    _updateEditHandle(axisName: string) {
        const node = this._handleDataMap[axisName].topNode;
        const dir = this._axisDir[axisName];

        const offset = new Vec3();

        if (axisName.substr(0, 6) === 'bottom') {
            Vec3.multiplyScalar(offset, this._oriDir, this._height);
            if (axisName !== 'bottom_neg_z') {
                Vec3.multiplyScalar(tempVec3, dir, this._bottomRadius);
                offset.add(tempVec3);
            }
        } else {
            Vec3.multiplyScalar(tempVec3, dir, this._radius);
            offset.add(tempVec3);
        }
        const pos = new Vec3(offset);
        pos.add(this._center);
        Vec3.multiply(pos, pos, this.getScale());
        node.setPosition(pos);
    }

    initShape() {
        this.createShapeNode('ParticleSystemConeController');

        // for cone line
        const lineData = this.getConeLineData();
        const coneLineNode = ControllerUtils.createShapeByData(lineData, this._color, { name: 'coneLines' });
        coneLineNode.parent = this.shape;
        this._coneLineNode = coneLineNode;
        this._coneLineMR = getModel(coneLineNode);

        // for circle
        const circleNode = ControllerUtils.arc(this._center, this._oriDir, this._circleFromDir, this._twoPI, this._radius, this._color);
        circleNode.parent = this.shape;
        this._circleNode = circleNode;
        this._circleMR = getModel(circleNode);

        // for bottom circle
        const bottomCircleNode = ControllerUtils.arc(
            this._center,
            this._oriDir,
            this._circleFromDir,
            this._twoPI,
            this._bottomRadius,
            this._color,
        );
        bottomCircleNode.parent = this.shape;
        const pos = new Vec3();
        Vec3.multiplyScalar(pos, this._oriDir, this._height);
        bottomCircleNode.setPosition(pos.x, pos.y, pos.z);
        this._bottomCircleNode = bottomCircleNode;
        this._bottomCircleMR = getModel(bottomCircleNode);

        this.hide();
    }

    getConeLineData() {
        const vertices = [];
        const indices = [];

        let arcPoints = ControllerShape.calcArcPoints(this._center, this._oriDir, this._circleFromDir, this._twoPI, this._radius, 5);
        arcPoints = arcPoints.slice(0, arcPoints.length - 1);

        const offset = new Vec3();
        Vec3.multiplyScalar(offset, this._oriDir, this._height);
        const bottomCenter = new Vec3();
        Vec3.add(bottomCenter, this._center, offset);
        let bottomArcPoints = ControllerShape.calcArcPoints(
            bottomCenter,
            this._oriDir,
            this._circleFromDir,
            this._twoPI,
            this._bottomRadius,
            5,
        );
        bottomArcPoints = bottomArcPoints.slice(0, bottomArcPoints.length - 1);

        for (let i = 0; i < arcPoints.length; i++) {
            vertices.push(arcPoints[i]);
            vertices.push(bottomArcPoints[i]);
            const idx = i * 2;
            indices.push(idx, idx + 1);
        }

        return ControllerShape.calcLinesData(vertices, indices, false);
    }

    updateSize(center: Vec3, radius: number, height: number, bottomRadius: number) {
        this._center = center;
        this._radius = radius;
        this._height = height;
        this._bottomRadius = bottomRadius;

        // update cone line
        const lineData = this.getConeLineData();
        updatePositions(this._coneLineMR!, lineData.positions);

        // update circle
        const circlePoints = ControllerShape.calcArcPoints(this._center, this._oriDir, this._circleFromDir, this._twoPI, this._radius);
        updatePositions(this._circleMR!, circlePoints);

        const bottomCirclePoints = ControllerShape.calcArcPoints(
            this._center,
            this._oriDir,
            this._circleFromDir,
            this._twoPI,
            this._bottomRadius,
        );
        updatePositions(this._bottomCircleMR!, bottomCirclePoints);
        const pos = new Vec3();
        Vec3.multiplyScalar(pos, this._oriDir, this._height);
        this._bottomCircleNode!.setPosition(pos.x, pos.y, pos.z);

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
        this._deltaHeight = 0;
        this._deltaBottomRadius = 0;

        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this._isMouseDown) {
            this._mouseDeltaPos.x += event.moveDeltaX;
            this._mouseDeltaPos.y += event.moveDeltaY;

            const axisDir = this._axisDir[event.handleName];

            const deltaDist = this.getAlignAxisMoveDistance(this.localToWorldDir(axisDir), this._mouseDeltaPos) * this._curDistScalar;
            if (event.handleName === 'bottom_neg_z') {
                this._deltaHeight = deltaDist;
            } else {
                if (event.handleName.substr(0, 6) === 'bottom') {
                    this._deltaBottomRadius = deltaDist;
                } else {
                    this._deltaRadius = deltaDist;
                }
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
    // mouse events end

    getDeltaRadius() {
        return this._deltaRadius;
    }

    getDeltaHeight() {
        return this._deltaHeight;
    }

    getDeltaBottomRadius() {
        return this._deltaBottomRadius;
    }
}

export default ParticleSystemConeController;
