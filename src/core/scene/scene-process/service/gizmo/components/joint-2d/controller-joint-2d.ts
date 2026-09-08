'use strict';

import { Color, Layers, MeshRenderer, Node, Vec3 } from 'cc';
import EditableController from '../../controller/editable';
import ControllerUtils from '../../utils/controller-utils';
import ControllerShape from '../../utils/controller-shape';
import type { GizmoMouseEvent } from '../../utils/defines';
import {
    getModel,
    setMeshColor,
    setNodeOpacity,
    updateBoundingBox,
    updatePositions,
    updateVBAttr,
} from '../../utils/engine-utils';

const tempVec3 = new Vec3();
const panPlaneLayer = Layers.Enum.EDITOR;
const panPlaneSize = 100000;

/**
 * Joint2D 的通用可视化控制器。
 *
 * 绘制锚点 Handle 与刚体中心到锚点的虚线，并把 Handle 的鼠标位置
 * 投影到世界 XY 平面，供 Joint2DGizmo 完成坐标换算和属性写回。
 */
export class Joint2DController extends EditableController {
    private _lineNode: Node | null = null;
    private _lineRenderer: MeshRenderer | null = null;
    private _panPlane: Node | null = null;
    private readonly _anchor = new Vec3();
    private readonly _center = new Vec3();
    private readonly _dragWorldPosition = new Vec3();
    private _dragging = false;

    constructor(rootNode: Node) {
        super(rootNode);
        this._editHandleColor = Color.BLUE;
        this._hoverColor = Color.YELLOW;
        this._editHandleKeys = ['Head'];
        this.initShape();
    }

    public setColor(color: Color): void {
        this.setEditHandlesColor(color);
        if (this._lineNode) {
            setMeshColor(this._lineNode, color);
        }
    }

    public override onInitEditHandles(): void {
        const panPlane = ControllerUtils.quad(Vec3.ZERO, panPlaneSize, panPlaneSize);
        panPlane.name = 'Joint2DPanPlane';
        panPlane.parent = this._rootNode;
        panPlane.active = false;
        panPlane.layer = panPlaneLayer;
        setNodeOpacity(panPlane, 0);
        this._panPlane = panPlane;
    }

    public getDragWorldPosition(out: Vec3): Vec3 {
        return out.set(this._dragWorldPosition);
    }

    public cancelDrag(): void {
        this._dragging = false;
        if (this._panPlane) {
            this._panPlane.active = false;
        }
    }

    override createEditHandle(handleName: string, color: Color) {
        const editHandleNode = this.createHeadNode(handleName, color);
        setNodeOpacity(editHandleNode, 80);
        editHandleNode.parent = this._editHandlesShape;
        this._editHandleScales[handleName] = 1;
        return this.initHandle(editHandleNode, handleName);
    }

    private createHeadNode(name: string, color: Color): Node {
        const headData = ControllerShape.calcDiscData(Vec3.ZERO, Vec3.UNIT_Z, 10);
        const headNode = ControllerUtils.createShapeByData(headData, color, { unlit: true });
        headNode.name = name;

        const circleData = ControllerShape.calcCircleData(Vec3.ZERO, Vec3.UNIT_Z, 10);
        const circleNode = ControllerUtils.createShapeByData(circleData, color, { unlit: true });
        circleNode.parent = headNode;

        const centerDiscData = ControllerShape.calcDiscData(Vec3.ZERO, Vec3.UNIT_Z, 3);
        const centerDiscNode = ControllerUtils.createShapeByData(centerDiscData, color, { unlit: true });
        centerDiscNode.parent = headNode;

        return headNode;
    }

    private initShape(): void {
        this.createShapeNode('Joint2DController');

        const lineData = ControllerShape.calcLineData(this._center, this._anchor);
        this._lineNode = ControllerUtils.createShapeByData(lineData, this._color, {
            unlit: true,
            dashed: true,
        });
        this._lineNode.name = 'JointLine';
        this._lineNode.parent = this.shape;
        this._lineRenderer = getModel(this._lineNode);
    }

    override _updateEditHandle(handleName: string): void {
        const handleData = this._handleDataMap[handleName];
        if (!handleData) {
            return;
        }

        const node = handleData.topNode;
        const baseScale = this._editHandleScales[handleName];
        const scale = this.getScale();
        node.setScale(baseScale / scale.x, baseScale / scale.y, baseScale / scale.z);
        Vec3.multiply(tempVec3, this._anchor, scale);
        node.setPosition(tempVec3);
    }

    public updatePosition(center: Readonly<Vec3>, anchor: Readonly<Vec3>): void {
        this._center.set(center);
        this._anchor.set(anchor);

        if (this._lineRenderer) {
            const lineData = ControllerShape.calcLineData(this._center, this._anchor);
            updateVBAttr(this._lineRenderer, 'a_lineDistance', [0, Vec3.distance(this._center, this._anchor)]);
            updatePositions(this._lineRenderer, lineData.positions);
            updateBoundingBox(this._lineRenderer, lineData.minPos, lineData.maxPos);
        }

        if (this.edit) {
            this.updateEditHandles();
        }
        this.adjustControllerSize();
    }

    protected override onMouseDown(event: GizmoMouseEvent): void {
        event.propagationStopped = true;
        if (!this.edit || !this._panPlane) {
            return;
        }

        this._panPlane.setPosition(0, 0, this._anchor.z);
        this._panPlane.active = true;
        this._dragging = this.getPositionOnPanPlane(
            this._dragWorldPosition,
            event.x,
            event.y,
            this._panPlane,
        );
        if (this._dragging) {
            this.onControllerMouseDown?.(event);
        } else {
            this._panPlane.active = false;
        }
    }

    protected override onMouseMove(event: GizmoMouseEvent): void {
        event.propagationStopped = true;
        if (!this.edit || !this._panPlane || !this._dragging || !this._isMouseDown) {
            return;
        }

        if (this.getPositionOnPanPlane(this._dragWorldPosition, event.x, event.y, this._panPlane)) {
            this.onControllerMouseMove?.(event);
        }
    }

    protected override onMouseUp(event: GizmoMouseEvent): void {
        event.propagationStopped = true;
        if (!this._dragging) {
            return;
        }

        this.endDrag(event);
    }

    protected override onMouseLeave(event: GizmoMouseEvent): void {
        if (this._dragging) {
            this.endDrag(event);
        }
    }

    public override onHide(): void {
        this.cancelDrag();
        // Handle 使用 EditableController 独立的 _editHandlesShape，和中心虚线的
        // shape 不是同一个节点。必须继续执行父类隐藏逻辑，否则切换选择时线会
        // 消失，但圆形 Handle 仍留在屏幕上并保持可命中。
        super.onHide();
    }

    private endDrag(event: GizmoMouseEvent): void {
        this._dragging = false;
        if (this._panPlane) {
            this._panPlane.active = false;
        }
        this.onControllerMouseUp?.(event);
    }

    public destroy(): void {
        this.cancelDrag();
        this.unregisterEvents();
        this._editHandlesShape?.destroy();
        this._editHandlesShape = null;
        this.shape?.destroy();
        this._panPlane?.destroy();
        this._panPlane = null;
        this._lineNode = null;
        this._lineRenderer = null;
    }
}

export default Joint2DController;
