'use strict';

import { Layers, Node, Vec3, Vec2, Color, MeshRenderer, Quat } from 'cc';

import EditableController from '../controller/editable';
import ControllerShape from '../utils/controller-shape';
import ControllerUtils from '../utils/controller-utils';
import type { IRectangleControllerOption, GizmoMouseEvent } from '../utils/defines';
import {
    getModel,
    updatePositions,
    setMeshColor,
    setNodeOpacity,
    getNodeOpacity,
    updateBoundingBox,
} from '../utils/engine-utils';

const panPlaneLayer = Layers.Enum.EDITOR;

/**
 * 获取编辑器摄像机组件（惰性访问避免循环依赖）
 */
function getEditorCamera(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Camera?.getCamera?.();
    } catch (e) {
        return null;
    }
}

const tempVec3 = new Vec3();
const tempQuat_a = new Quat();

enum RectHandleType {
    None = 'none',
    TopLeft = 'tl',
    TopRight = 'tr',
    BottomLeft = 'bl',
    BottomRight = 'br',

    Left = 'neg_x',
    Right = 'x',
    Top = 'y',
    Bottom = 'neg_y',

    Area = 'area',
    Anchor = 'anchor',
}

type AxisDir = {
    x?: Vec3;
    y?: Vec3;
} & Partial<Record<RectHandleType, Vec3>>;

class RectangleController extends EditableController {
    public static RectHandleType = RectHandleType;
    public anchorLocked = false;
    public contentSizeLocked = false;

    private _center: Vec3 = new Vec3();
    protected _size: Vec2 = new Vec2(100, 100);
    private _deltaSize = new Vec3();
    private _curHandleType: RectHandleType = RectHandleType.None;
    private _rectNode: Node | null = null;
    private _panPlane: Node | null = null;
    private _areaNode!: Node;
    private _areaMR: MeshRenderer | null = null;
    private _rectMR: MeshRenderer | null = null;
    private _mouseDownOnPlanePos: Vec3 = new Vec3();
    private _areaColor: Color = Color.GREEN;
    private _areaOpacity = 0;
    private _axisDir: AxisDir = {};

    constructor(rootNode: Node, opts: IRectangleControllerOption = {}) {
        super(rootNode);
        this._defaultEditHandleSize = 10;

        this._axisDir.x = new Vec3(1, 0, 0);
        this._axisDir.y = new Vec3(0, 1, 0);
        this._axisDir[RectHandleType.Left] = new Vec3(-1, 0, 0);
        this._axisDir[RectHandleType.Bottom] = new Vec3(0, -1, 0);
        this._axisDir[RectHandleType.TopLeft] = new Vec3(-1, 1, 0);
        this._axisDir[RectHandleType.TopRight] = new Vec3(1, 1, 0);
        this._axisDir[RectHandleType.BottomLeft] = new Vec3(-1, -1, 0);
        this._axisDir[RectHandleType.BottomRight] = new Vec3(1, -1, 0);
        if (opts.needAnchor) {
            this._axisDir[RectHandleType.Anchor] = new Vec3();
        }

        this._editHandleKeys = Object.keys(this._axisDir);
        this._hoverColor = Color.YELLOW;

        this.initShape();
    }

    setColor(color: Color) {
        if (this._rectNode) {
            this._color = color;
            setMeshColor(this._rectNode, color);
        }
    }

    setOpacity(opacity: number) {
        if (this._rectNode) {
            setNodeOpacity(this._rectNode, opacity);
        }
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

    isBorder(axisName: string) {
        return (
            axisName === RectHandleType.Left ||
            axisName === RectHandleType.Right ||
            axisName === RectHandleType.Top ||
            axisName === RectHandleType.Bottom
        );
    }

    isCorner(axisName: string) {
        return (
            axisName === RectHandleType.TopLeft ||
            axisName === RectHandleType.TopRight ||
            axisName === RectHandleType.BottomLeft ||
            axisName === RectHandleType.BottomRight
        );
    }

    isAreaOrAnchor(handleName: string): boolean {
        return handleName === RectHandleType.Area || handleName === RectHandleType.Anchor;
    }

    onInitEditHandles() {
        // for pan
        const panPlane = ControllerUtils.quad(new Vec3(), 100000, 100000);
        panPlane.parent = this._rootNode;
        panPlane.name = 'RectPanPlane';
        panPlane.active = false;
        panPlane.layer = panPlaneLayer;
        setNodeOpacity(panPlane, 0);
        this._panPlane = panPlane;

        // for center move
        const areaNode = ControllerUtils.quad(new Vec3(), 100, 100, new Vec3(0, 0, 1), this._areaColor, { unlit: true });
        areaNode.name = 'RectArea';
        areaNode.parent = this.shape;
        areaNode.setPosition(new Vec3(0, 0, -0.1)); // 不会挡到控制点的射线检测
        setNodeOpacity(areaNode, this._areaOpacity);
        this._areaNode = areaNode;
        this._areaMR = getModel(areaNode);
        this.initHandle(areaNode, RectHandleType.Area);
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

    _updateEditHandle(axisName: string) {
        const handleData = this._handleDataMap[axisName];
        if (!handleData) return;
        const node = handleData.topNode;
        const dir = this._axisDir[axisName as keyof AxisDir];
        if (!dir) return;
        const baseScale = this._editHandleScales[axisName];
        if (axisName === RectHandleType.Anchor) {
            const controllerScale = this.getScale();
            node.setScale(
                baseScale / controllerScale.x,
                baseScale / controllerScale.y,
                baseScale / controllerScale.z,
            );
            node.setWorldPosition(this.getPosition());
        } else {
            const offset = new Vec3();
            offset.x = (dir.x * this._size.x) / 2;
            offset.y = (dir.y * this._size.y) / 2;

            const pos = new Vec3(offset);
            pos.add(this._center);
            const controllerScale = this.getScale();
            node.setScale(
                baseScale / controllerScale.x,
                baseScale / controllerScale.y,
                baseScale / controllerScale.z,
            );
            Vec3.multiply(pos, pos, controllerScale);
            node.setPosition(pos.x, pos.y, pos.z);
        }
    }

    initShape() {
        this.createShapeNode('RectangleController');
        this._rectNode = ControllerUtils.rectangle(this._center, Quat.IDENTITY, this._size, this._color, { unlit: true });
        this._rectNode!.parent = this.shape;
        this._rectMR = getModel(this._rectNode);
        const editorCamera = getEditorCamera();
        editorCamera?.node?.on('transform-changed', this.onEditorCameraMoved, this);
    }

    updateSize(center: Readonly<Vec3>, size: Vec2) {
        this._center.set(center);
        this._size.set(size);

        if (this._size.x < 0 || this._size.y < 0) {
            setMeshColor(this._rectNode!, Color.RED);
        } else {
            setMeshColor(this._rectNode!, this._color);
        }

        const rectData = ControllerShape.calcRectanglePoints(this._center, Quat.IDENTITY, this._size);
        updatePositions(this._rectMR!, rectData.vertices);

        if (this._edit) {
            this.updateEditHandles();

            const quadData = ControllerShape.calcQuadData(this._center, this._size.x, this._size.y);
            updatePositions(this._areaMR!, quadData.positions as Vec3[]);
            updateBoundingBox(this._areaMR!, quadData.minPos, quadData.maxPos);
        }

        this.adjustEditHandlesSize();
    }

    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (!this.edit) {
            return;
        }
        this._curHandleType = event.handleName as RectHandleType;

        Vec3.set(this._deltaSize, 0, 0, 0);

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
            const hitPos = new Vec3();
            // 如果内容锁住，仅仅能够拖拽和改变锚点
            if (this.contentSizeLocked && !this.isAreaOrAnchor(event.handleName)) {
                return;
            }
            if (this.anchorLocked && event.handleName === RectHandleType.Anchor) {
                return;
            }

            if (this.getPositionOnPanPlane(hitPos, event.x, event.y, this._panPlane!)) {
                const deltaPos = new Vec3(hitPos);
                deltaPos.subtract(this._mouseDownOnPlanePos);
                let deltaDist = 0;
                if (this.isBorder(event.handleName)) {
                    const axisDir = this._axisDir[event.handleName as keyof AxisDir];
                    if (!axisDir) return;
                    Vec3.transformQuat(tempVec3, axisDir, this.getRotation());
                    deltaDist = deltaPos.dot(tempVec3);
                    if (this._curHandleType === RectHandleType.Left || this._curHandleType === RectHandleType.Right) {
                        this._deltaSize.x = deltaDist;
                    } else {
                        this._deltaSize.y = deltaDist;
                    }
                } else if (this.isCorner(event.handleName)) {
                    const axisDir = this._axisDir[event.handleName as keyof AxisDir];
                    if (!axisDir) return;
                    tempVec3.x = axisDir.x;
                    tempVec3.y = 0;
                    tempVec3.z = 0;
                    Vec3.transformQuat(tempVec3, tempVec3, this.getRotation());
                    deltaDist = deltaPos.dot(tempVec3);
                    this._deltaSize.x = deltaDist;

                    tempVec3.x = 0;
                    tempVec3.y = axisDir.y;
                    tempVec3.z = 0;
                    Vec3.transformQuat(tempVec3, tempVec3, this.getRotation());
                    deltaDist = deltaPos.dot(tempVec3);
                    this._deltaSize.y = deltaDist;
                } else {
                    this._deltaSize.set(deltaPos);
                }
            }
            if (this.onControllerMouseMove) {
                this.onControllerMouseMove(event);
            }
        }
    }

    onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        this._curHandleType = RectHandleType.None;
        this._panPlane!.active = false;
        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }

    onMouseLeave(event: GizmoMouseEvent) {
        if (!this.isCorner(this._curHandleType)) {
            this.onMouseUp(event);
        }
    }

    onHoverIn(event: GizmoMouseEvent) {
        if (!this.edit) {
            return;
        }

        if (event.handleName !== RectHandleType.Area) {
            this.setHandleColor(event.handleName, this._hoverColor);
        } else {
            // for area
            const opacity = getNodeOpacity(this._areaNode);
            if (opacity > 0) {
                this.setHandleColor(event.handleName, this._hoverColor, opacity);
            }
        }
    }

    onHoverOut(event: GizmoMouseEvent<{ hoverInNodeMap: Map<Node, boolean> }>) {
        this.resetHandleColor(event);
    }

    onHide() {
        super.onHide();
        this.anchorLocked = false;
        this.contentSizeLocked = false;
    }

    // 返回局部坐标系下的宽高delta
    getDeltaSize() {
        this._deltaSize.z = 0;
        return this._deltaSize;
    }

    getCurHandleType() {
        return this._curHandleType;
    }

    reset() {
        this._curHandleType = RectHandleType.None;
        this._isMouseDown = false;
        this.resetHandleColor();
    }
}

export { RectangleController, RectHandleType };
