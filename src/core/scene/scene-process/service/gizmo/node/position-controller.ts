'use strict';

import { Layers, Vec3, Node, Color, Vec2, Quat, MeshRenderer } from 'cc';

import ControllerBase from '../controller/base';
import ControllerUtils from '../utils/controller-utils';
import type { GizmoMouseEvent } from '../utils/defines';
import {
    setNodeOpacity,
    create3DNode,
    getModel,
    getRaycastResultsByNodes,
} from '../utils/engine-utils';

const panPlaneLayer = Layers.Enum.EDITOR;
const axisDirMap = ControllerUtils.axisDirectionMap;
const SnapPlaneName = 'SnapPlane';

const TempVec3A = new Vec3();
const TempVec3B = new Vec3();
const TempQuatA = new Quat();

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

/**
 * 获取 Service
 */
function getService(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

let _controller: PositionController | null = null;

class PositionController extends ControllerBase {
    private _deltaPosition: Vec3 = new Vec3();
    private _mouseDownPos: Vec3 = new Vec3();
    private _ctrlPlaneGroup!: Node;
    private _mouseDownAxis = '';
    private _curDistScalar = 0;
    private _dragPanPlane: Node | undefined | null = null;
    private _isInPanDrag = false;
    private _mouseDownOnPlanePos: Vec3 = new Vec3();
    private _snapDragPlane!: Node;
    static readonly baseArrowHeadHeight = 12.5;
    static readonly baseArrowHeadRadius = 5;
    static readonly baseArrowBodyHeight = 70;
    static readonly planeWidth = 12.5;
    static readonly scale2D = new Vec3(2, 2, 2);
    static readonly scale3D = new Vec3(1, 1, 1);

    constructor(rootNode: Node) {
        super(rootNode);
        this._lockSize = true;
        this.initShape();
        this.onDimensionChanged();
    }

    static getInstance(rootNode: Node): PositionController {
        if (!_controller) {
            _controller = new PositionController(rootNode);
        }
        return _controller;
    }

    public onCameraFovChanged = (fov: number) => {
        if (this.transformToolData?.is2D) {
            return;
        }
        const vec = Vec3.multiplyScalar(new Vec3(), PositionController.scale3D, fov / 45);
        this.setScale(vec);
    };

    onDimensionChanged() {
        super.onDimensionChanged?.();
        const is2D = this.transformToolData?.is2D ?? false;
        this.setScale(is2D ? PositionController.scale2D : PositionController.scale3D);
    }

    createAxis(axisName: string, color: Color, rotation: Vec3) {
        const axisNode = ControllerUtils.arrow(
            PositionController.baseArrowHeadHeight,
            PositionController.baseArrowHeadRadius,
            PositionController.baseArrowBodyHeight,
            color,
            { priority: 1000 },
        );
        axisNode.name = axisName + 'Axis';
        axisNode.parent = this.shape;
        axisNode.setRotationFromEuler(rotation);
        this.initHandle(axisNode, axisName);
    }

    createControlPlane(axisName: string, color: Color, rotation: Vec3) {
        const halfPlaneWidth = PositionController.planeWidth / 2;

        const pos = new Vec3();
        for (let i = 0; i < axisName.length; i++) {
            const deltaPos = new Vec3();
            Vec3.multiplyScalar(deltaPos, axisDirMap[axisName.charAt(i)], halfPlaneWidth);
            pos.add(deltaPos);
        }

        const opacity = 128;
        const borderPlane = ControllerUtils.borderPlane(
            PositionController.planeWidth,
            PositionController.planeWidth,
            color,
            opacity,
        );
        borderPlane.name = axisName + 'Plane';
        borderPlane.parent = this.shape;
        borderPlane.setRotationFromEuler(rotation);
        borderPlane.setPosition(pos.x, pos.y, pos.z);

        const panPlane = ControllerUtils.quad(new Vec3(), 100000000, 100000000, new Vec3(0, 0, 1), color);
        panPlane.parent = this._ctrlPlaneGroup;
        panPlane.name = axisName + 'PanPlane';
        panPlane.active = false;
        panPlane.layer = panPlaneLayer;
        panPlane.setRotationFromEuler(rotation);
        setNodeOpacity(panPlane, 0);
        this.initHandle(borderPlane, axisName);

        const axisData = this._handleDataMap[axisName];
        axisData.panPlane = panPlane;

        const is2D = this.transformToolData?.is2D ?? false;
        if (is2D) {
            // 为了让中间蓝色的 plane 优先检测到
            const position = borderPlane.position.clone();
            position.z = 5;
            borderPlane.position = position;
            const panPosition = panPlane.position.clone();
            panPosition.z = 5;
            panPlane.position = panPosition;
        }
    }

    createSnapPlane() {
        this._snapDragPlane = ControllerUtils.quad(
            new Vec3(0, 0, 0),
            PositionController.planeWidth,
            PositionController.planeWidth,
            new Vec3(0, 0, 1),
            Color.WHITE,
            { unlit: true },
        );
        this._snapDragPlane.parent = this.shape;
        setNodeOpacity(this._snapDragPlane, 80);
        this._snapDragPlane.active = false;
        this.initHandle(this._snapDragPlane, SnapPlaneName);
    }

    initShape() {
        this.createShapeNode('PositionController');
        this.registerEvents();

        // x axis
        this.createAxis('x', Color.RED, new Vec3(-90, -90, 0));
        // y axis
        this.createAxis('y', Color.GREEN, new Vec3());
        // z axis
        this.createAxis('z', Color.BLUE, new Vec3(90, 0, 90));

        const ctrlPlaneGroup = create3DNode('ctrlPlaneGroup');
        ctrlPlaneGroup.parent = this._rootNode;
        this._ctrlPlaneGroup = ctrlPlaneGroup;

        // control plane
        // x-y plane
        this.createControlPlane('xy', Color.BLUE, new Vec3());
        // x-z plane
        this.createControlPlane('xz', Color.GREEN, new Vec3(-90, -90, 0));
        // y-z plane
        this.createControlPlane('yz', Color.RED, new Vec3(0, 90, 90));

        // snap plane
        this.createSnapPlane();

        this.hide();
    }

    /** 获取偏移值在 controller 的某一轴的投影 */
    getDeltaPositionOfAxis(out: Vec3 | undefined, name: 'x' | 'y' | 'z'): Vec3 {
        out ??= new Vec3();
        const dir = axisDirMap[name];
        Vec3.transformQuat(TempVec3A, dir, this.getRotation());
        return Vec3.project(out, this._deltaPosition, TempVec3A);
    }

    /** 获取偏移值 */
    getDeltaPosition() {
        return this._deltaPosition;
    }

    onMouseDown(event: GizmoMouseEvent) {
        event.propagationStopped = true;

        this._deltaPosition.set(0, 0, 0);
        this._mouseDownPos = this.getPosition();
        this._mouseDownAxis = event.handleName;
        this._curDistScalar = this.getDistScalar();

        // 吸附逻辑
        if (this.isSnapping()) {
            if (this.onControllerMouseDown) {
                this.onControllerMouseDown(event);
            }
            return;
        }

        this._dragPanPlane = this.getPanPlane(event.handleName);
        if (this._dragPanPlane) {
            this._isInPanDrag = true;
            this._ctrlPlaneGroup.setPosition(this.getPosition());
            this._ctrlPlaneGroup.setRotation(this.getRotation());
            this._dragPanPlane.active = true;
            // hack 手动更新model的世界包围盒
            const planeMR = getModel(this._dragPanPlane) as MeshRenderer;
            planeMR?.model?.updateTransform(-1);
            this.getPositionOnPanPlane(this._mouseDownOnPlanePos, event.x, event.y, this._dragPanPlane);
        }

        if (this.onControllerMouseDown) {
            this.onControllerMouseDown(event);
        }
    }

    getPanPlane(axisName: string) {
        let panPlane = null;
        if (axisName.length > 1) {
            panPlane = this._handleDataMap[axisName]?.panPlane;
        } else {
            // 计算最朝向Camera的可拖动平面
            const allAxis = 'xyz';
            const otherAxis = allAxis.replace(axisName, '');
            let maxDot = 0.00001;
            const editorCamera = getEditorCamera();
            for (let i = 0; i < otherAxis.length; i++) {
                const axis = otherAxis.charAt(i);
                const axisDir = axisDirMap[axis];
                const worldAxisDir = TempVec3A;
                Vec3.transformQuat(worldAxisDir, axisDir, this.getRotation());
                Vec3.normalize(worldAxisDir, worldAxisDir);
                const cameraPos = TempVec3B;
                editorCamera?.node?.getWorldPosition(cameraPos);
                const cameraToCtrl = new Vec3();
                Vec3.subtract(cameraToCtrl, cameraPos, this.getPosition());
                Vec3.normalize(cameraToCtrl, cameraToCtrl);
                const dot = Math.abs(Vec3.dot(worldAxisDir, cameraToCtrl));
                if (dot > maxDot) {
                    const planeName = allAxis.replace(axis, '');
                    panPlane = this._handleDataMap[planeName]?.panPlane;
                    maxDot = dot;
                }
            }
        }
        return panPlane;
    }

    static isXYZ(controllerName: string): controllerName is 'x' | 'y' | 'z' {
        return controllerName.length === 1 && ['x', 'y', 'z'].includes(controllerName);
    }

    static isPlane(controllerName: string): controllerName is 'xy' | 'yz' | 'xz' {
        return controllerName.length === 2 && ['xy', 'yz', 'xz'].includes(controllerName);
    }

    getAlignAxisDeltaPosition(axisName: string, curMouseDeltaPos: Vec2) {
        const axisDir = axisDirMap[axisName];
        const alignAxisMoveDist = this.getAlignAxisMoveDistance(this.localToWorldDir(axisDir), curMouseDeltaPos);
        const deltaPosition = new Vec3();
        Vec3.multiplyScalar(deltaPosition, axisDir, alignAxisMoveDist * this._curDistScalar);
        return deltaPosition;
    }

    onMouseMove(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.isSnapping()) {
            if (this.onControllerMouseMove) {
                this.onControllerMouseMove(event);
            }
            return;
        }
        if (this._isMouseDown) {
            if (this._isInPanDrag) {
                const hitPos = new Vec3();
                if (this._dragPanPlane && this.getPositionOnPanPlane(hitPos, event.x, event.y, this._dragPanPlane)) {
                    this._deltaPosition.set(hitPos);
                    this._deltaPosition.subtract(this._mouseDownOnPlanePos);

                    if (PositionController.isXYZ(this._mouseDownAxis)) {
                        // 单个轴时需要投影到那个轴上
                        this.getDeltaPositionOfAxis(this._deltaPosition, this._mouseDownAxis);
                    }
                }

                const out = new Vec3(this._mouseDownPos);
                out.add(this._deltaPosition);
                // 如果 controller 锁死，只需要发送事件，而不更新自身坐标
                if (this.isLock) {
                    if (this.onControllerMouseMove) {
                        this.onControllerMouseMove(event);
                    }
                    return;
                }
                this.setPosition(out);

                if (this.onControllerMouseMove) {
                    this.onControllerMouseMove(event);
                }

                this.updateController();
            }
        }
    }

    onMouseUp(event: GizmoMouseEvent) {
        event.propagationStopped = true;
        if (this.isSnapping()) {
            if (this.onControllerMouseUp) {
                this.onControllerMouseUp(event);
            }
            return;
        }
        if (this._isInPanDrag) {
            this._dragPanPlane && (this._dragPanPlane.active = false);
            this._isInPanDrag = false;
        }

        if (this.onControllerMouseUp) {
            this.onControllerMouseUp(event);
        }
    }

    onMouseLeave(event: GizmoMouseEvent) {
        this.onMouseUp(event);
    }

    onHoverIn(event: GizmoMouseEvent) {
        this.setHandleColor(event.handleName, Color.YELLOW);
    }

    onHoverOut(event: GizmoMouseEvent<{ hoverInNodeMap: Map<Node, boolean> }>) {
        this.resetHandleColor(event);
    }

    onShow() {
        this.registerEvents();
        const fov = getService()?.Camera?.getCameraFov?.() ?? 45;
        fov && this.onCameraFovChanged(fov);

        const is2D = this.transformToolData?.is2D ?? false;
        this.setScale(is2D ? PositionController.scale2D : PositionController.scale3D);
        if (is2D) {
            this._handleDataMap.z.topNode.active = false;
            this._handleDataMap.xz.topNode.active = false;
            this._handleDataMap.yz.topNode.active = false;
            this.updateController();
        } else {
            this._handleDataMap.z.topNode.active = true;
            this._handleDataMap.xz.topNode.active = true;
            this._handleDataMap.yz.topNode.active = true;
        }
    }

    onHide() {
        this.unregisterEvents();
    }

    isSnapping(): boolean {
        return this._snapDragPlane.active;
    }

    updateSnapUI(active: boolean) {
        this._snapDragPlane.active = active;

        if (active) {
            const editorCamera = getEditorCamera();
            const cameraRot = TempQuatA;
            editorCamera?.node?.getWorldRotation(cameraRot);
            this._snapDragPlane.setWorldRotation(cameraRot);

            this._handleDataMap.xy.topNode.active = false;
            this._handleDataMap.xz.topNode.active = false;
            this._handleDataMap.yz.topNode.active = false;
        } else {
            this._handleDataMap.xy.topNode.active = true;
            this._handleDataMap.xz.topNode.active = true;
            this._handleDataMap.yz.topNode.active = true;
        }
    }
}

export default PositionController;
