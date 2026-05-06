'use strict';

import { Node, Vec3, Color, MeshRenderer, Vec2 } from 'cc';

import EditableController from './editable';
import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import type { GizmoMouseEvent } from '../utils/defines';
import {
    setMeshColor,
    setNodeOpacity,
    getNodeOpacity,
    getModel,
    updatePositions,
    updateBoundingBox,
} from '../utils/engine-utils';

const axisDirMap = ControllerUtils.axisDirectionMap;
const AxisName = ControllerUtils.AxisName;

const panPlaneLayer = 1 << 30;

const tempVec3 = new Vec3();
const tempVec3_a = new Vec3();

enum DiscHandleType {
    None = 'none',
    Left = 'neg_x',
    Right = 'x',
    Top = 'y',
    Bottom = 'neg_y',
    Area = 'area',
}

class DiscController extends EditableController {
    public static DiscHandleType = DiscHandleType;
    private _oriDir: Vec3 = new Vec3(0, 0, -1);
    private _center: Vec3 = new Vec3();
    private _radius = 100;
    private _arc = 360;
    private _deltaRadius = 0;
    private _deltaPos: Vec3 = new Vec3();
    private _circleNode: Node | null = null;
    private _circleFromDir = new Vec3(1, 0, 0);
    private _circleMR: MeshRenderer | null = null;
    private _panPlane: Node | null = null;
    private _areaNode!: Node;
    private _areaMR: MeshRenderer | null = null;
    private _areaColor: Color = Color.GREEN;
    private _areaOpacity = 0;

    private _mouseDeltaPos: Vec2 = new Vec2();
    private _mouseDownOnPlanePos: Vec3 = new Vec3();
    private _curDistScalar = 0;
    private _controlDir: Vec3 = new Vec3();
    private _curHandleType: string = DiscHandleType.None;

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
        setMeshColor(this._circleNode!, color);

        this.setEditHandlesColor(color);

        this._color = color;
    }

    setAreaColor(color: Color) {
        this._areaColor = color;
        if (this._areaNode) {
            setMeshColor(this._areaNode, color);
        }
    }

    setAreaOpacity(opacity: number) {
        this._areaOpacity = opacity;
        if (this._areaNode) {
            setNodeOpacity(this._areaNode, opacity);
        }
    }

    showEditHandles() {
        super.showEditHandles();
        if (this._areaNode) {
            this._areaNode.active = true;
        }
    }

    hideEditHandles() {
        super.hideEditHandles();
        if (this._areaNode) {
            this._areaNode.active = false;
        }
    }

    isBorder(axisName: string) {
        if (
            axisName === DiscHandleType.Left ||
            axisName === DiscHandleType.Right ||
            axisName === DiscHandleType.Top ||
            axisName === DiscHandleType.Bottom
        ) {
            return true;
        }

        return false;
    }

    initShape() {
        this.createShapeNode('CircleController');

        const circleNode = ControllerUtils.arc(this._center, this._oriDir, this._circleFromDir, this._twoPI, this._radius, this._color);
        circleNode.parent = this.shape;

        this._circleNode = circleNode;
        this._circleMR = getModel(circleNode);

        this.hide();
    }

    onInitEditHandles() {
        const panPlane = ControllerUtils.quad(new Vec3(), 100000, 100000);
        panPlane.parent = this._rootNode;
        panPlane.name = 'DiscPanPlane';
        panPlane.active = false;
        panPlane.layer = panPlaneLayer;
        setNodeOpacity(panPlane, 0);
        this._panPlane = panPlane;

        const areaNode = ControllerUtils.disc(new Vec3(), new Vec3(0, 0, 1), this._radius, this._areaColor, { unlit: true });
        areaNode.name = 'DiscArea';
        areaNode.parent = this.shape;
        areaNode.setPosition(new Vec3(0, 0, -0.1));
        setNodeOpacity(areaNode, this._areaOpacity);
        this._areaNode = areaNode;
        this._areaMR = getModel(areaNode);
        this.initHandle(areaNode, DiscHandleType.Area);
    }

    _updateEditHandle(axisName: string) {
        const node = this._handleDataMap[axisName].topNode;
        const dir = axisDirMap[axisName];
        const baseScale = this._editHandleScales[axisName];

        const offset = tempVec3_a;
        offset.x = dir.x * this._radius;
        offset.y = dir.y * this._radius;

        const pos = offset;
        pos.add(this._center);
        const curScale = this.getScale();
        node.setScale(baseScale / curScale.x, baseScale / curScale.y, baseScale / curScale.z);
        Vec3.multiply(pos, pos, curScale);
        node.setPosition(pos);
    }

    updateSize(center: Readonly<Vec3>, radius: number, arc = 360) {
        this._center.set(center);
        this._radius = radius;
        this._arc = arc;

        const circlePoints = ControllerShape.calcArcPoints(
            this._center,
            this._oriDir,
            this._circleFromDir,
            -this._arc * this._degreeToRadianFactor,
            this._radius,
        );
        updatePositions(this._circleMR!, circlePoints);

        if (this._edit) {
            this.updateEditHandles();
            const discData = ControllerShape.calcDiscData(this._center, Vec3.UNIT_Z, this._radius);
            updatePositions(this._areaMR!, discData.positions);
            updateBoundingBox(this._areaMR!, discData.minPos, discData.maxPos);
        }

        this.adjustEditHandlesSize();
    }

    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (!this.edit) {
            return;
        }

        this._mouseDeltaPos = new Vec2(0, 0);
        Vec3.set(this._deltaPos, 0, 0, 0);

        this._curDistScalar = super.getDistScalar();
        this._deltaRadius = 0;
        this._controlDir = new Vec3();

        this._panPlane!.active = true;
        this._mouseDownOnPlanePos = new Vec3();
        this.getPositionOnPanPlane(this._mouseDownOnPlanePos, event.x, event.y, this._panPlane!);

        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (!this.edit) {
            return;
        }

        if (this._isMouseDown) {
            this._mouseDeltaPos.x += event.moveDeltaX;
            this._mouseDeltaPos.y += event.moveDeltaY;

            const hitPos = new Vec3();
            if (this.getPositionOnPanPlane(hitPos, event.x, event.y, this._panPlane!)) {
                const deltaPos = new Vec3(hitPos);
                deltaPos.subtract(this._mouseDownOnPlanePos);
                this._curHandleType = event.handleName;
                const axisDir = axisDirMap[event.handleName];
                this._controlDir = axisDir;
                let deltaDist = 0;
                if (this.isBorder(event.handleName)) {
                    Vec3.transformQuat(tempVec3, axisDir, this.getRotation());
                    deltaDist = deltaPos.dot(tempVec3);
                } else {
                    this._deltaPos = deltaPos;
                }
                this._deltaRadius = deltaDist;
            }

            if (this.onControllerMouseMove) {
                this.onControllerMouseMove(event);
            }
        }
    }

    onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        this._curHandleType = DiscHandleType.None;
        this._panPlane!.active = false;

        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }

    onHoverIn(event: GizmoMouseEvent) {
        if (!this.edit) {
            return;
        }

        if (event.handleName !== DiscHandleType.Area) {
            this.setHandleColor(event.handleName, Color.YELLOW);
        } else {
            const opacity = getNodeOpacity(this._areaNode);
            if (opacity > 0) {
                this.setHandleColor(event.handleName, Color.YELLOW, opacity);
            }
        }
    }

    onMouseLeave(event: GizmoMouseEvent) {
        this.onMouseUp(event);
    }

    getDeltaRadius() {
        return this._deltaRadius;
    }

    getControlDir() {
        return this._controlDir;
    }

    getDeltaPos() {
        return this._deltaPos;
    }

    getCurHandleType() {
        return this._curHandleType;
    }
}

export default DiscController;
