'use strict';

import { Color, js, Layers, Mat4, MeshRenderer, Node, PolygonCollider2D, Quat, Vec2, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import EditableController from '../../controller/editable';
import LineController from '../../controller/line';
import ControllerUtils from '../../utils/controller-utils';
import ControllerShape from '../../utils/controller-shape';
import type { GizmoMouseEvent, IHandleData } from '../../utils/defines';
import {
    getModel,
    updatePositions,
    updateIB,
    setMeshColor,
    setNodeOpacity,
    getNodeOpacity,
    updateBoundingBox,
    create3DNode,
} from '../../utils/engine-utils';
import { registerGizmo } from '../../gizmo-defines';
import { queryRegisteredService } from '../../../core/decorator';

function toPrecision(val: number, n: number): number {
    return Math.round(val * Math.pow(10, n)) / Math.pow(10, n);
}

function makeVec3InPrecision(v: Vec3, p: number): Vec3 {
    const pow = Math.pow(10, p);
    v.x = Math.round(v.x * pow) / pow;
    v.y = Math.round(v.y * pow) / pow;
    v.z = Math.round(v.z * pow) / pow;
    return v;
}

const panPlaneLayer = Layers.Enum.EDITOR;

enum PolygonHandleType {
    None = 'none',
    Point = 'point',
    Line = 'line',
    Area = 'area',
}

interface IPolygonHandleData {
    type: string;
    deltaPos: Vec3;
    index: number;
    hitPos?: Vec3;
}

const flat = (arr: any, fn: any) => {
    return arr.map(fn).reduce((acc: any, val: any) => acc.concat(val), []);
};

const tempVec3_a = new Vec3();
const tempVec3_b = new Vec3();

class PolygonController extends EditableController {
    public static PolygonHandleType = PolygonHandleType;
    private _panPlane: Node | null = null;
    private _panPlaneMeshRenderer: MeshRenderer | null = null;
    private _points: Vec3[] = [];
    private _mouseDownOnPlanePos: Vec3 = new Vec3();
    private _curHandleData: IPolygonHandleData = { type: PolygonHandleType.None, deltaPos: new Vec3(), index: -1 };
    private _lineGroup: Node | null = null;
    private _pointsHandleData: IHandleData[] = [];
    private _linesHandleData: IHandleData[] = [];
    private _hitPoint: Vec3 | null = null;
    private _areaNode: Node | null = null;
    private _areaMR: MeshRenderer | null = null;
    private _areaOpacity = 80;
    private _panSize = 100000;

    public get points() {
        return this._points;
    }

    constructor(
        rootNode: Node,
        public gizmo: PolygonCollider2DGizmo,
    ) {
        super(rootNode);
        this._hoverColor = Color.YELLOW;
        this.initShape();
    }

    initShape() {
        this.createShapeNode('PolygonController');
        this._lineGroup = create3DNode('LineGroup');
        this._lineGroup.parent = this.shape;
    }

    onInitEditHandles() {
        const panPlane = ControllerUtils.quad(new Vec3(), this._panSize, this._panSize);
        panPlane.parent = this._rootNode;
        panPlane.name = 'RectPanPlane';
        panPlane.active = false;
        panPlane.layer = panPlaneLayer;
        setNodeOpacity(panPlane, 0);
        this._panPlane = panPlane;
        this._panPlaneMeshRenderer = getModel(panPlane);

        this.createPolygonAreaHandle();
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

    createPolygonAreaHandle() {
        const polygonData = ControllerShape.calcPolygonData(this._points);
        const areaNode = ControllerUtils.createShapeByData(polygonData, this._color, { unlit: true });
        areaNode.name = 'RectArea';
        areaNode.parent = this.shape;
        areaNode.setPosition(new Vec3(0, 0, -0.1));
        setNodeOpacity(areaNode, this._areaOpacity);
        this._areaNode = areaNode;
        this._areaMR = getModel(areaNode);
        this.initHandle(areaNode, PolygonHandleType.Area);
    }

    setColor(color: Color) {
        if (this._lineGroup) {
            this._color = color;
            this._lineGroup.children.forEach((child: Node) => {
                setMeshColor(child, color);
            });
        }
    }

    updateData(points: Vec3[]) {
        this.updatePanRectByPoints(points);
        this.resetEditHandlesFromPoints(points);
    }

    updatePanRectByPoints(points: Vec3[]) {
        if (!this._panPlane || !this._panPlaneMeshRenderer || !this.gizmo || !this.gizmo.target) return;

        let maxX = 0, maxY = 0;
        points.forEach((point) => {
            maxX = Math.max(maxX, Math.abs(point.x));
            maxY = Math.max(maxY, Math.abs(point.y));
        });

        const center = this.gizmo.target.node.position;
        const size = (maxX > maxY ? maxX : maxY) * 2 + 1000;
        if (size < this._panSize) return;

        this._panSize = size;
        const quadData = ControllerShape.calcPositionData(center, size, size, new Vec3(0, 0, 1), true);
        updatePositions(this._panPlaneMeshRenderer, quadData.positions);
        updateBoundingBox(this._panPlaneMeshRenderer, quadData.minPos, quadData.maxPos);
    }

    resetEditHandlesFromPoints(points: Vec3[]) {
        this._points = points;

        if (this._editHandlesShape) {
            this._editHandleKeys = [];
            this._points.forEach((_point: Vec3, index: number) => {
                this._editHandleKeys.push('p' + index);
            });

            if (this._points.length > this._pointsHandleData.length) {
                const curLen = this._pointsHandleData.length;
                for (let i = curLen; i < this._points.length; i++) {
                    const handleData = this.createEditHandle(this._editHandleKeys[i], this._editHandleColor);
                    handleData.customData = {};
                    handleData.customData.index = i;
                    this._pointsHandleData.push(handleData);
                }
            } else if (this._points.length < this._pointsHandleData.length) {
                for (let i = this._pointsHandleData.length - 1; i >= this._points.length; i--) {
                    this._editHandlesShape.removeChild(this._pointsHandleData[i].topNode);
                    this.removeHandle('p' + i);
                }
                this._pointsHandleData.length = this._points.length;
            }

            this._editHandleKeys.forEach((key: string) => {
                this._updateEditHandle(key);
            });

            this.adjustEditHandlesSize();
        }

        if (this._lineGroup) {
            if (this._points.length < 2) {
                this._lineGroup.removeAllChildren();
                this._linesHandleData.forEach((data) => {
                    this.removeHandle(data.name);
                });
                this._linesHandleData = [];
            }

            if (this._points.length > this._linesHandleData.length) {
                const curLen = this._linesHandleData.length;
                for (let i = curLen; i < this._points.length; i++) {
                    const next_i = i === this._points.length - 1 ? 0 : i + 1;
                    const startPos = this._points[i];
                    const endPos = this._points[next_i];

                    const handleData = this.createLineHandle(startPos, endPos, i);
                    handleData.customData = {};
                    handleData.customData.index = i;
                    handleData.customData.lineMR = getModel(handleData.topNode);
                    this._linesHandleData.push(handleData);
                }
            } else if (this._points.length < this._linesHandleData.length) {
                for (let i = this._linesHandleData.length - 1; i >= this._points.length; i--) {
                    this._lineGroup.removeChild(this._linesHandleData[i].topNode);
                    this.removeHandle('l' + i);
                }
                this._linesHandleData.length = this._points.length;
            }

            this._updateLinesHandle();
        }

        if (this._areaNode && this._areaMR) {
            const polygonData = ControllerShape.calcPolygonData(this._points);
            updatePositions(this._areaMR, polygonData.positions);
            try {
                const { earcut } = require('cc/editor/2d-misc');
                const flatPositions = flat(polygonData.positions, (v: Vec3) => [v.x, v.y, v.z]);
                const indices = earcut(flatPositions, [], 3);
                updateIB(this._areaMR, indices);
            } catch {
                // earcut not available in CLI context
            }
            updateBoundingBox(this._areaMR, polygonData.minPos, polygonData.maxPos);
        }
    }

    createLineHandle(startPos: Vec3, endPos: Vec3, index: number) {
        const lineNode: Node = ControllerUtils.lineTo(startPos, endPos, this._color, { unlit: true });
        lineNode.parent = this._lineGroup;
        return this.initHandle(lineNode, 'l' + index);
    }

    _updateLinesHandle() {
        this._linesHandleData.forEach((handleData: IHandleData, i: number) => {
            const next_i = i === this._points.length - 1 ? 0 : i + 1;
            const startPos = this._points[i];
            const endPos = this._points[next_i];
            const lineData = ControllerShape.calcLineData(startPos, endPos);
            updatePositions(handleData.customData.lineMR, lineData.positions);
            updateBoundingBox(handleData.customData.lineMR, lineData.minPos, lineData.maxPos);
        });
    }

    _updateEditHandle(handleName: string) {
        if (handleName) {
            const handleData = this._handleDataMap[handleName];
            const handleNode = handleData.topNode;
            const index = handleData.customData.index;
            const pos = this._points[index];
            tempVec3_a.set(pos);
            const curScale = this.getScale();
            const baseScale = this._editHandleScales[handleName];
            handleNode.setScale(baseScale / curScale.x, baseScale / curScale.y, baseScale / curScale.z);
            Vec3.multiply(tempVec3_a, tempVec3_a, curScale);
            handleNode.setPosition(tempVec3_a);
        }
    }

    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (!this.edit || !this._panPlane) {
            return;
        }

        if (event.handleName.charAt(0) === 'l') {
            this._curHandleData.type = PolygonHandleType.Line;
            this._curHandleData.hitPos = event.hitPoint;
            const lineData = this._handleDataMap[event.handleName];
            this._curHandleData.index = lineData.customData.index;
        } else if (event.handleName.charAt(0) === 'p') {
            this._curHandleData.type = PolygonHandleType.Point;
            this._curHandleData.hitPos = event.hitPoint;
            const lineData = this._handleDataMap[event.handleName];
            this._curHandleData.index = lineData.customData.index;
        } else if (event.handleName === PolygonHandleType.Area) {
            this._curHandleData.type = PolygonHandleType.Area;
            this._curHandleData.deltaPos = new Vec3();
        }

        this._panPlane.active = true;
        this._mouseDownOnPlanePos = new Vec3();

        this.getPositionOnPanPlane(this._mouseDownOnPlanePos, event.x, event.y, this._panPlane);
        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (!this.edit || !this._panPlane) {
            return;
        }

        if (this._isMouseDown) {
            if (event.handleName.charAt(0) !== 'l') {
                const hitPos = new Vec3();
                if (this.getPositionOnPanPlane(hitPos, event.x, event.y, this._panPlane)) {
                    if (event.handleName.charAt(0) === 'p') {
                        const deltaPos = new Vec3(hitPos);
                        deltaPos.subtract(this._mouseDownOnPlanePos);
                        this._curHandleData.type = PolygonHandleType.Point;
                        this._curHandleData.deltaPos = deltaPos;
                        this._curHandleData.index = this._handleDataMap[event.handleName].customData.index;
                    } else if (event.handleName === PolygonHandleType.Area) {
                        const deltaPos = new Vec3(hitPos);
                        deltaPos.subtract(this._mouseDownOnPlanePos);
                        this._curHandleData.type = PolygonHandleType.Area;
                        this._curHandleData.deltaPos = deltaPos;
                    }
                }
            }
        }

        if (this.onControllerMouseMove) {
            this.onControllerMouseMove(event);
        }
    }

    onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (!this.edit || !this._panPlane) {
            return;
        }
        this._hitPoint = null;
        this._panPlane.active = false;
        this._curHandleData.type = PolygonHandleType.None;
        this._curHandleData.deltaPos = new Vec3();

        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }

    onHoverIn(event: GizmoMouseEvent<{ index: number }>) {
        if (!this.edit) {
            return;
        }

        if (event.handleName.charAt(0) === 'p' ||
            event.handleName.charAt(0) === 'l') {
            const handleData = this._handleDataMap[event.handleName];
            event.customData = { index: handleData.customData.index };
            this.setHandleColor(event.handleName, this._hoverColor);
        } else if (event.handleName === PolygonHandleType.Area) {
            if (this._areaNode) {
                const opacity = getNodeOpacity(this._areaNode);
                if (opacity > 0) {
                    this.setHandleColor(event.handleName, this._hoverColor, opacity);
                }
            }
        }

        if (this.onControllerHoverIn) {
            this.onControllerHoverIn(event);
        }
    }

    onHoverOut(event: GizmoMouseEvent<{ hoverInNodeMap: Map<Node, boolean> }>) {
        super.onHoverOut(event);
        if (this.onControllerHoverOut) {
            this.onControllerHoverOut(event);
        }
    }

    getHitPoint() {
        return this._hitPoint;
    }

    getHandleData() {
        return this._curHandleData;
    }
}

const HandleType = PolygonController.PolygonHandleType;

const tempVec3_gizmo = new Vec3();
const tempQuat_gizmo = new Quat();
const tempMat4 = new Mat4();
const tempVec2 = new Vec2();

class PolygonCollider2DGizmo extends GizmoBase<PolygonCollider2D> {
    private _controller!: PolygonController;

    private _leftDeleteLine!: LineController;
    private _rightDeleteLine!: LineController;
    private _offset: Vec2 = new Vec2();
    private _ctrlKey = false;
    private _metaKey = false;
    private _propPath: string | null = null;
    private _3dPoints: Vec3[] = [];
    private _points: Vec2[] = [];
    private _dragTarget: PolygonCollider2D | null = null;
    private _dragOffsetPath: string | null = null;
    private _dragPointIndex = -1;

    private _curHoverInHandleType: string = HandleType.None;
    private _curHoverInElemIndex = -1;
    private _isDeletePointKeyDown = false;

    public get isDeletePointKeyDown() {
        return this._isDeletePointKeyDown;
    }

    public set isDeletePointKeyDown(value: boolean) {
        this._isDeletePointKeyDown = value;
        if (value && this.curHoverInHandleType === HandleType.Point) {
            this.changePointer('alias');
            this.highlightDeleteLine(true);
        } else {
            if (this.curHoverInHandleType === HandleType.Point) {
                this.changePointer('default');
            }
            this.highlightDeleteLine(false);
        }
    }

    public get curHoverInHandleType() {
        return this._curHoverInHandleType;
    }

    public set curHoverInHandleType(value: string) {
        this._curHoverInHandleType = value;
        switch (value) {
            case HandleType.None:
            case HandleType.Area:
                this.changePointer('default');
                this.highlightDeleteLine(false);
                break;
            case HandleType.Point:
                this.changePointer(this.isDeletePointKeyDown ? 'alias' : 'default');
                this.highlightDeleteLine(this.isDeletePointKeyDown);
                break;
            case HandleType.Line:
                this.changePointer('copy');
                this.highlightDeleteLine(false);
                break;
        }
    }

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateController();
    }

    onHide() {
        this.finishControl();
        this._controller.hide();
        this._ctrlKey = false;
        this._metaKey = false;
        this._isDeletePointKeyDown = false;
        this.clearHoverFeedback();
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        this._controller = new PolygonController(gizmoRoot, this);
        this._controller.editable = true;
        this._controller.setColor(new Color(107, 194, 53));
        this._controller.setEditHandlesColor(new Color(107, 194, 53));

        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        this._controller.onControllerHoverIn = this.onControllerHoverIn.bind(this);
        this._controller.onControllerHoverOut = this.onControllerHoverOut.bind(this);

        this._leftDeleteLine = new LineController(gizmoRoot);
        this._leftDeleteLine.setColor(Color.RED);
        this._leftDeleteLine.hide();
        this._rightDeleteLine = new LineController(gizmoRoot);
        this._rightDeleteLine.setColor(Color.RED);
        this._rightDeleteLine.hide();
    }

    onControllerMouseDown(event?: GizmoMouseEvent) {
        this.finishControl();
        const handleData = this._controller.getHandleData();
        const offsetPath = this.getCompPropPath('offset');
        if (!handleData || !this.target || !offsetPath || this.target.isValid === false || this.target.node.isValid === false || this.target.editing === false) {
            return;
        }
        if (event) {
            this._ctrlKey = event.ctrlKey;
            this._metaKey = event.metaKey;
            this.isDeletePointKeyDown = this._ctrlKey || this._metaKey;
        }
        this._dragTarget = this.target;
        this._dragOffsetPath = offsetPath;
        this._offset = this.target.offset.clone();
        this._points = this.target.points.map(point => point.clone());

        if (handleData.type === HandleType.Line) {
            const hitPoint = handleData.hitPos;
            if (hitPoint) {
                this._propPath = this.getCompPropPath('points');
                this.onControlUpdate(this._propPath);
                const points = this.target.points;
                this.worldToLocalPos(tempVec3_gizmo, hitPoint);
                const offset = this.target.offset;
                const posX = toPrecision(tempVec3_gizmo.x - offset.x, 1);
                const posY = toPrecision(tempVec3_gizmo.y - offset.y, 1);

                points.splice(handleData.index + 1, 0, new Vec2(posX, posY));
                this.target.points = points;
                this.onComponentChanged(this.target.node);
            }
        } else if (handleData.type === HandleType.Point) {
            this._propPath = this.getCompPropPath('points');
            if (this.isDeletePointKeyDown) {
                this.onControlUpdate(this._propPath);
                const points = this.target.points;
                points.splice(handleData.index, 1);
                this.target.points = points;
                this.onComponentChanged(this.target.node);
                this.curHoverInHandleType = HandleType.None;
                this._curHoverInElemIndex = -1;
            } else {
                this._dragPointIndex = handleData.index;
            }
        } else if (handleData.type === HandleType.Area) {
            this._propPath = this.getCompPropPath('offset');
        }
    }

    onControllerMouseMove(event: GizmoMouseEvent) {
        // Hover events also carry current modifiers, including after a missed KeyUp.
        this._ctrlKey = event.ctrlKey;
        this._metaKey = event.metaKey;
        this.isDeletePointKeyDown = this._ctrlKey || this._metaKey;
        if (!this._dragTarget) return;
        if (!this.isDragTargetValid() || this.target?.editing === false) {
            this.finishControl();
            return;
        }
        if (this._controller.updated) {
            const handleData = this._controller.getHandleData();
            if (handleData.type === HandleType.Point && handleData.index === this._dragPointIndex) {
                this.onControlUpdate(this._propPath);
                this.handlePoints(handleData);
            } else if (handleData.type === HandleType.Area) {
                this.onControlUpdate(this._propPath);
                this.handleAreaMove(handleData.deltaPos);
            }
        }
    }

    onControllerMouseUp() {
        this.finishControl();
    }

    private isDragTargetValid(): boolean {
        const target = this._dragTarget;
        return !!target && this.target === target && target.isValid !== false && target.node.isValid !== false
            && this.getCompPropPath('offset') === this._dragOffsetPath;
    }

    private finishControl(commitProperty = true) {
        const target = this._dragTarget;
        const changed = this.isDragTargetValid() && target && (
            target.offset.x !== this._offset.x || target.offset.y !== this._offset.y
            || target.points.length !== this._points.length
            || target.points.some((point, index) => point.x !== this._points[index].x || point.y !== this._points[index].y)
        );
        this._dragTarget = null;
        this._dragOffsetPath = null;
        this._dragPointIndex = -1;
        if (this._isControlBegin) {
            if (commitProperty && changed) {
                void this.onControlEnd(this._propPath);
            } else {
                this._isControlBegin = false;
                void this.commitChanges();
            }
        }
        this._propPath = null;
    }

    onControllerHoverIn(event: GizmoMouseEvent<{ index: number }>) {
        if (event.handleName.charAt(0) === 'l') {
            const index = event.customData?.index;
            if (index === undefined) {
                return;
            }
            this._curHoverInElemIndex = index;
            this.curHoverInHandleType = HandleType.Line;
        } else if (event.handleName.charAt(0) === 'p') {
            const index = event.customData?.index;
            if (index === undefined) {
                return;
            }
            this._curHoverInElemIndex = index;
            this.curHoverInHandleType = HandleType.Point;
        } else if (event.handleName === HandleType.Area) {
            this.curHoverInHandleType = HandleType.Area;
        }
    }

    onControllerHoverOut(event: GizmoMouseEvent) {
        if (event.handleName.charAt(0) === 'l') {
            if (this.curHoverInHandleType === HandleType.Line) {
                this.curHoverInHandleType = HandleType.None;
                this._curHoverInElemIndex = -1;
            }
        } else if (event.handleName.charAt(0) === 'p') {
            if (this.curHoverInHandleType === HandleType.Point) {
                this.curHoverInHandleType = HandleType.None;
                this._curHoverInElemIndex = -1;
            }
        } else if (event.handleName === HandleType.Area) {
            if (this.curHoverInHandleType === HandleType.Area) {
                this.curHoverInHandleType = HandleType.None;
            }
        }
    }

    onKeyDown(event: any) {
        this._ctrlKey = event.ctrlKey;
        this._metaKey = event.metaKey;
        this.isDeletePointKeyDown = this._ctrlKey || this._metaKey;
    }

    onKeyUp(event: any) {
        this._ctrlKey = event.ctrlKey;
        this._metaKey = event.metaKey;
        this.isDeletePointKeyDown = this._ctrlKey || this._metaKey;
    }

    highlightDeleteLine(active: boolean) {
        if (!active || this._curHoverInElemIndex < 0 || !this.target || this.target.editing === false) {
            this._leftDeleteLine.hide();
            this._rightDeleteLine.hide();
            this.repaintInEditMode();
            return;
        }

        const points = this.target.points;
        const pointsWithOffset = this._controller.points;
        if (points.length < 2 || pointsWithOffset.length < 2 || this._curHoverInElemIndex >= pointsWithOffset.length) {
            this._leftDeleteLine.hide();
            this._rightDeleteLine.hide();
        } else if (points.length === 2) {
            this._leftDeleteLine.updateData(pointsWithOffset[0], pointsWithOffset[1]);
            this._leftDeleteLine.show();
            this._rightDeleteLine.hide();
        } else {
            const curIndex = this._curHoverInElemIndex;
            const preIndex = curIndex === 0 ? pointsWithOffset.length - 1 : curIndex - 1;
            const nextIndex = curIndex === pointsWithOffset.length - 1 ? 0 : curIndex + 1;
            this._leftDeleteLine.updateData(pointsWithOffset[preIndex], pointsWithOffset[curIndex]);
            this._rightDeleteLine.updateData(pointsWithOffset[curIndex], pointsWithOffset[nextIndex]);
            this._leftDeleteLine.show();
            this._rightDeleteLine.show();
        }
        this.repaintInEditMode();
    }

    private clearHoverFeedback() {
        if (this._curHoverInHandleType === HandleType.None && this._curHoverInElemIndex < 0) {
            return;
        }
        this._curHoverInElemIndex = -1;
        this.curHoverInHandleType = HandleType.None;
    }

    private changePointer(type: string) {
        queryRegisteredService<{ changePointer(pointerType: string): void }>('Operation')?.changePointer(type);
    }

    private repaintInEditMode() {
        queryRegisteredService<{ repaintInEditMode(): void }>('Engine')?.repaintInEditMode();
    }

    worldToLocalPos(out: Vec3, inPos: Vec3) {
        if (this.target) {
            const node = this.target.node;
            node.getWorldMatrix(tempMat4);
            Mat4.invert(tempMat4, tempMat4);
            Vec3.transformMat4(out, inPos, tempMat4);
        }
    }

    handleAreaMove(delta: Vec3) {
        if (!this.target) {
            return;
        }
        const node = this.target.node;

        const posDelta: Vec3 = delta.clone();
        node.getWorldMatrix(tempMat4);
        Mat4.invert(tempMat4, tempMat4);
        tempMat4.m12 = tempMat4.m13 = 0;
        Vec3.transformMat4(posDelta, posDelta, tempMat4);
        makeVec3InPrecision(posDelta, 1);
        posDelta.z = 0;
        tempVec2.set(this._offset);
        tempVec2.add2f(posDelta.x, posDelta.y);

        this.target.offset.set(tempVec2);
        this.onComponentChanged(node);
    }

    handlePoints(handleMoveData: IPolygonHandleData) {
        const index = handleMoveData.index;
        if (index < 0 || !this.target || index >= this._points.length || index >= this.target.points.length) {
            return;
        }

        const posDelta = handleMoveData.deltaPos.clone();

        const node = this.target.node;
        node.getWorldMatrix(tempMat4);
        Mat4.invert(tempMat4, tempMat4);
        tempMat4.m12 = tempMat4.m13 = 0;
        Vec3.transformMat4(posDelta, posDelta, tempMat4);

        const targetPoints = this.target.points;
        const point = this._points[index];

        let posX = point.x + posDelta.x;
        let posY = point.y + posDelta.y;
        posX = toPrecision(posX, 1);
        posY = toPrecision(posY, 1);
        targetPoints[index].set(posX, posY);
        this.target.points = targetPoints;

        this.onComponentChanged(node);
    }

    updateControllerData() {
        if (!this._isInitialized || this.target === null) {
            return;
        }
        if (this.target.isValid === false || this.target.node.isValid === false || !this.getCompPropPath('offset')) {
            this._controller.hide();
            this.clearHoverFeedback();
            return;
        }

        const polygonCollider2D = this.target as PolygonCollider2D;
        if (polygonCollider2D) {
            const offset = polygonCollider2D.offset;
            const center = tempVec3_gizmo;
            center.x = offset.x;
            center.y = offset.y;
            center.z = 0;

            const node = this.target.node;
            if (node) {
                node.getWorldMatrix(tempMat4);
            }

            if (this._3dPoints.length < polygonCollider2D.points.length) {
                const len = polygonCollider2D.points.length - this._3dPoints.length;
                for (let i = 0; i < len; i++) {
                    this._3dPoints.push(new Vec3(0, 0, 0));
                }
            } else {
                this._3dPoints.length = polygonCollider2D.points.length;
            }
            polygonCollider2D.points.forEach((point: Vec2, index: number) => {
                this._3dPoints[index].set(point.x + center.x, point.y + center.y, 0);
                Vec3.transformMat4(this._3dPoints[index], this._3dPoints[index], tempMat4);
            });
            this._controller.updateData(this._3dPoints);
            this._controller.edit = polygonCollider2D.editing;
            if (!polygonCollider2D.editing) {
                this.finishControl();
                this.clearHoverFeedback();
            } else if (this.isDeletePointKeyDown && this.curHoverInHandleType === HandleType.Point) {
                // Input can keep the same modifier state while node:change updates
                // the vertices. Refresh from the newly computed world points.
                this.highlightDeleteLine(true);
            }
        } else {
            this._controller.hide();
        }
    }

    updateController() {
        this.updateControllerData();
    }

    onTargetUpdate() {
        if (!this._isInitialized) return;
        this.finishControl(false);
        this.clearHoverFeedback();
        this.updateController();
    }

    onNodeChanged() {
        if (this._dragTarget && (!this.isDragTargetValid() || this.target?.editing === false)) this.finishControl();
        this.updateController();
    }

    override destroy() {
        this.finishControl();
        super.destroy();
    }
}

export const name = js.getClassName(PolygonCollider2D);
export const SelectGizmo = PolygonCollider2DGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
