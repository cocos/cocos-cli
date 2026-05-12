'use strict';

import { CCObject, Color, IVec3Like, Layers, Node, Quat, Vec3, Vec4 } from 'cc';
import type { GizmoMouseEvent } from '../utils/defines';
import TransformBaseGizmo from './transform-base';
import PositionController from './position-controller';
import OriginAxisController from '../controller/origin-axis';
import {
    getRaycastResultsForSnap,
    raycastAllColliders,
    getMeshVertexAroundMouse,
} from '../utils/engine-utils';
import { CameraUtils } from '../../camera/utils';

function getService(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

function getEditorCamera(): any {
    return getService()?.Camera?.getCamera?.() ?? null;
}

function repaintEngine(): void {
    try {
        const { Service } = require('../../core/decorator');
        Service.Engine?.repaintInEditMode?.();
    } catch (e) {
        // not ready
    }
}

function makeVec3InPrecision(v: Vec3, p: number): Vec3 {
    const f = Math.pow(10, p);
    v.x = Math.round(v.x * f) / f;
    v.y = Math.round(v.y * f) / f;
    v.z = Math.round(v.z * f) / f;
    return v;
}

function getCenterWorldPos3D(nodes: Node[]): Vec3 {
    const center = new Vec3();
    if (nodes.length === 0) return center;
    for (const node of nodes) {
        const wp = node.getWorldPosition();
        center.add(wp);
    }
    center.multiplyScalar(1 / nodes.length);
    return center;
}

function matchShortcut(event: any, message: string): boolean {
    const key = (event.key || '').toLowerCase();
    switch (message) {
        case 'vertex-snap': return key === 'v' && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey;
        case 'surface-snap': return event.shiftKey && event.ctrlKey && /^(control|shift)$/i.test(key);
        default: return false;
    }
}

enum SnapMode {
    Undefined = 0,
    Grid = 1,
    Surface = 2,
    Vertex = 3,
}

// 表面吸附过滤层级
const SURFACE_SNAP_LAYER_MAKE_EXCLUDE = Layers.makeMaskExclude([
    Layers.Enum.GIZMOS,
    Layers.Enum.SCENE_GIZMO,
    Layers.Enum.EDITOR,
    Layers.Enum.UI_2D,
    Layers.Enum.IGNORE_RAYCAST,
]);

// 顶点吸附过滤层
const VERTEX_SNAP_LAYER_MAKE_EXCLUDE = Layers.makeMaskExclude([
    Layers.Enum.GIZMOS,
    Layers.Enum.SCENE_GIZMO,
    Layers.Enum.EDITOR,
    Layers.Enum.UI_2D,
    Layers.Enum.IGNORE_RAYCAST,
]);

const TempVec3A = new Vec3();
const TempVec3B = new Vec3();
const TempQuatA = new Quat();

const ArrowKeys = ['arrowleft', 'arrowright', 'arrowdown', 'arrowup'];

let _controller: PositionController | null = null;

class PositionGizmo extends TransformBaseGizmo {
    public disableUndo = false;
    public disableSnap = false;
    private readonly _nodesWorldPosList: Vec3[] = [];
    private _snapMode: SnapMode = SnapMode.Undefined;
    private _snapMouseDown = false;
    private _mouseDown = false;
    private _handler: ReturnType<typeof setTimeout> | null = null;
    private _event: GizmoMouseEvent | null = null;
    /** 顶点吸附时选中的顶点，相对于节点的位置 */
    private _nodeToSnapVertex: Vec3 = new Vec3(0, 0, 0);
    private _gizmoMouseEventListeners: { [key: string]: any } = {};
    private _axisController: OriginAxisController | null = null;

    getFirstLockNode(): Node | undefined {
        return this.nodes.find(node => this.isNodeLocked(node));
    }

    isNodeLocked(node: Node) {
        if (!node) {
            return false;
        }
        return node.components.some((component: any) => component._objFlags & CCObject.Flags.IsPositionLocked);
    }

    init() {
        this.createController();
    }

    layer() {
        return 'foreground';
    }

    onTargetUpdate() {
        if (_controller) {
            this._controller = _controller;
            _controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
            _controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
            _controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        }
        super.onTargetUpdate();
    }

    createAxisLine() {
        if (this._axisController) return;
        const camera = getEditorCamera()?.camera;
        if (!camera) return;
        this._axisController = new OriginAxisController(this.getGizmoRoot(), camera);
        this._axisController.setColor([Color.WHITE, Color.WHITE, Color.WHITE]);
        this._axisController.setVisible(false, false, false);
    }

    createController() {
        if (_controller) {
            this._controller = _controller;
        } else {
            const posCtrl = new PositionController(this.getGizmoRoot());
            this._controller = _controller = posCtrl;
        }
        this.createAxisLine();
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    get controller() {
        return _controller;
    }

    set controller(val: PositionController | null) {
        _controller = val;
    }

    addMouseEventListener(listener: any): string {
        const id = (performance.now() * 1000000).toString();
        this._gizmoMouseEventListeners[id] = listener;
        return id;
    }

    removeMouseEventListener(id: string) {
        if (id in this._gizmoMouseEventListeners) {
            delete this._gizmoMouseEventListeners[id];
        }
    }

    checkLock(event: GizmoMouseEvent) {
        if (_controller) {
            const snapConfigs = _controller.transformToolData?.snapConfigs;
            const isCenter = _controller.transformToolData?.pivot === 'center';
            const isSomeNodeLocked = this.nodes.some(node => this.isNodeLocked(node));
            const isSnapping = this.isControlKeyPressed(event) || (snapConfigs?.isPositionSnapEnabled ?? false);
            _controller.isLock = isCenter || isSomeNodeLocked || isSnapping;
        }
    }

    onControllerMouseDown(event: GizmoMouseEvent) {
        this.checkLock(event);
        this._mouseDown = true;

        if (!this.disableSnap) {
            CameraUtils.showSnapTip();
            if (this._snapMode === SnapMode.Surface || this._snapMode === SnapMode.Vertex) {
                this._snapMouseDown = true;
            }
        }

        this._nodesWorldPosList.length = 0;
        const nodes = this.nodes;
        for (let i = 0; i < nodes.length; ++i) {
            this._nodesWorldPosList.push(nodes[i].getWorldPosition());
        }

        this.axisControllerHandlerMouseDown(event);
        Object.values(this._gizmoMouseEventListeners).forEach(listener => listener.onControllerMouseDown?.(event));
    }

    onControllerMouseMove(event: GizmoMouseEvent) {
        this.checkLock(event);
        // 顶点吸附鼠标没点击时要修改顶点位置
        this.updateDataFromController(event);
        this.onVertexSnapMove(event);
        this.axisControllerHandlerMouseMove();

        Object.values(this._gizmoMouseEventListeners).forEach(listener => listener.onControllerMouseMove?.(event));
    }

    onControllerMouseUp(_event: GizmoMouseEvent) {
        if (!this.disableSnap) {
            CameraUtils.hideSnapTip();
            this._snapMouseDown = false;
        }
        this._mouseDown = false;
        if (_controller && _controller.updated && !this.disableUndo) {
            this.onControlEnd('position');
        }
        // 任何一个节点都没被锁才恢复位置
        if (this.nodes.every(node => !this.isNodeLocked(node))) {
            this.updateControllerTransform();
        }
        if (this._handler) {
            clearTimeout(this._handler);
            this._handler = null;
        }

        this.axisControllerHandlerMouseUp();
        Object.values(this._gizmoMouseEventListeners).forEach(listener => listener.onControllerMouseUp?.(_event));
    }

    onKeyDown(event: any): undefined | false | true {
        // 没有选中节点
        if (!this.nodes.length) {
            return;
        }
        // 处理上下左右事件
        if (
            !this.onArrowDown(event)
            || !this.onSurfaceSnapDown(event)
            || !this.onVertexSnapDown(event)
        ) {
            return false;
        }
        return super.onKeyDown(event) as undefined | false | true;
    }

    onKeyUp(event: any): boolean {
        if (!this.nodes.length) {
            return true;
        }
        if (!this.onArrowUp(event)) {
            return false;
        }
        if (!this.onSurfaceSnapUp(event)) {
            return false;
        }
        if (!this.onVertexSnapUp(event)) {
            return false;
        }
        return super.onKeyUp(event) as boolean;
    }

    applySnapIncrement(out: Vec3 | undefined, snapStep: IVec3Like, controllerName: string): Vec3 {
        out ??= new Vec3();
        if (!_controller) return out;
        if (PositionController.isPlane(controllerName) || PositionController.isXYZ(controllerName)) {
            const result = new Vec3();
            for (const key of controllerName) {
                if (PositionController.isXYZ(key)) {
                    /** 某一轴向上的偏移值 */
                    const localDelta = _controller.getDeltaPositionOfAxis(new Vec3(), key as 'x' | 'y' | 'z');
                    result.add(this.applySnapIncrementForAxis(localDelta, localDelta, snapStep, key as 'x' | 'y' | 'z'));
                }
            }
            out.set(result);
        }
        return out;
    }

    /** 获取某一轴向应用了单位捕捉增量的值 */
    applySnapIncrementForAxis(out: Vec3 | undefined, deltaPosOfAxis: Readonly<Vec3>, snapStep: IVec3Like, axis: 'x' | 'y' | 'z'): Vec3 {
        out ??= new Vec3();
        const length = deltaPosOfAxis.length();
        Vec3.normalize(out, deltaPosOfAxis).multiplyScalar(this.getSnappedValue(length, snapStep[axis]));
        return out;
    }

    updateDataFromController(event: GizmoMouseEvent) {
        if (!_controller || !_controller.updated) return;

        if (!this.disableUndo) {
            this.onControlUpdate('position');
        }
        this._event = event;
        let forceUpdateControllerTransform = this._mouseDown && _controller.transformToolData?.pivot === 'center';
        if (!this._handler) {
            // 减少触发次数，避免多三角型的吸附非常卡顿
            this._handler = setTimeout(() => {
                if (!_controller) return;
                const deltaPos = _controller.getDeltaPosition();
                const nodes = this.nodes;
                const curNodePos = TempVec3A;

                // grid snap / surface snap / vertex snap
                this.updateSnapPosition(deltaPos, this._event as GizmoMouseEvent);

                const isZero = deltaPos.equals(Vec3.ZERO);
                const isVertexOrSurfaceSnapping = this._snapMode === SnapMode.Surface || this._snapMode === SnapMode.Vertex;

                if (!(isVertexOrSurfaceSnapping && isZero)) {
                    for (let i = 0; i < this._nodesWorldPosList.length; ++i) {
                        const node = nodes[i];
                        curNodePos.set(this._nodesWorldPosList[i]);
                        curNodePos.add(deltaPos);
                        node.setWorldPosition(curNodePos);
                        TempVec3B.set(node.position);
                        makeVec3InPrecision(TempVec3B, 3);
                        node.position = TempVec3B;
                    }
                    forceUpdateControllerTransform = true;
                }
                if (forceUpdateControllerTransform) {
                    this.updateControllerTransform(true);
                }
                this._handler = null;
            }, 16);
        }
        if (forceUpdateControllerTransform) {
            this.updateControllerTransform(true);
        }
    }

    updateControllerTransform(force?: boolean) {
        if (!_controller) return;
        const node: Node | null | undefined = this.getFirstLockNode() ?? this.nodes[0];
        if (!node || !force && (this._mouseDown && !this._snapMouseDown)) {
            return;
        }

        let worldPos: Vec3;
        const worldRot = TempQuatA;
        Quat.identity(worldRot);
        if (_controller.transformToolData?.pivot === 'center') {
            worldPos = getCenterWorldPos3D(this.nodes);
        } else {
            worldPos = node.getWorldPosition();
        }

        // 避免顶点吸附移动时，gizmo的位置被还原
        if (this._snapMouseDown) {
            worldPos.add(this._nodeToSnapVertex);
        }

        if (_controller.transformToolData?.coordinate !== 'global') {
            node.getWorldRotation(worldRot);
        }
        _controller.setPosition(worldPos);
        _controller.setRotation(worldRot);
    }

    // ── Arrow key handling ─────────────────────────────────────────────────────

    /**
     * 处理上下左右按键移动
     */
    onArrowDown(event: any): boolean {
        const keyCode = (event.key || '').toLowerCase();
        if (!ArrowKeys.includes(keyCode)) {
            return true;
        }

        const offset = event.shiftKey ? 10 : 1;

        const dif = new Vec3();
        if (keyCode === 'arrowleft') {
            dif.x = -offset;
        } else if (keyCode === 'arrowright') {
            dif.x = offset;
        } else if (keyCode === 'arrowup') {
            dif.y = offset;
        } else if (keyCode === 'arrowdown') {
            dif.y = -offset;
        }

        !this.disableUndo && this.onControlUpdate('position');

        const curPos = new Vec3();
        this.nodes.forEach((node: Node) => {
            node.getPosition(curPos);
            curPos.add(dif);
            node.setPosition(curPos.x, curPos.y, curPos.z);
        });

        repaintEngine();
        return false;
    }

    onArrowUp(event: any): boolean {
        const keyCode = (event.key || '').toLowerCase();
        if (!ArrowKeys.includes(keyCode)) {
            return true;
        }
        !this.disableUndo && this.onControlEnd('position');
        return false;
    }

    // ── Surface snap ───────────────────────────────────────────────────────────

    // 进入 surface snap 模式
    onSurfaceSnapDown(event: any): boolean {
        if (this.disableSnap) {
            return true;
        }
        if (matchShortcut(event, 'surface-snap')) {
            this._snapMode = SnapMode.Surface;
            this.updateSnapUI(true);
            return false;
        }
        return true;
    }

    onSurfaceSnapUp(event: any): boolean {
        if (this.disableSnap) {
            return true;
        }
        if (matchShortcut(event, 'surface-snap') || this._snapMode === SnapMode.Surface) {
            this._snapMode = SnapMode.Undefined;
            this.updateSnapUI(false);
            return false;
        }
        return true;
    }

    // ── Vertex snap ────────────────────────────────────────────────────────────

    // 进入vertex snap模式
    onVertexSnapDown(event: any): boolean {
        if (this.disableSnap) {
            return true;
        }

        if (event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) {
            if (this._snapMode === SnapMode.Vertex) {
                this._snapMode = SnapMode.Undefined;
                this.updateSnapUI(false);
            }
            return true;
        }
        if (matchShortcut(event, 'vertex-snap')) {
            this._snapMode = SnapMode.Vertex;
            this.updateSnapUI(true);
            return false;
        }
        return true;
    }

    onVertexSnapUp(event: any): boolean {
        if (this.disableSnap) {
            return true;
        }

        if (event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return true;

        if (matchShortcut(event, 'vertex-snap')) {
            this._snapMode = SnapMode.Undefined;
            this.updateSnapUI(false);
            return false;
        }
        return true;
    }

    updateSnapUI(isSnapping: boolean) {
        if (!isSnapping) {
            this._nodeToSnapVertex.set(0, 0, 0);
            // 还原gizmo位置
            if (!(this._mouseDown && !this._snapMouseDown)) {
                this.updateControllerTransform();
            }
        }
        (_controller as any)?.updateSnapUI?.(isSnapping);
        repaintEngine();
    }

    // 顶点吸附的特殊情况，没点击时要接收到移动事件
    onVertexSnapMove(event: GizmoMouseEvent) {
        if (this.disableSnap) {
            return true;
        }

        if (!this._snapMouseDown) {
            if (this._snapMode === SnapMode.Vertex || this._snapMode === SnapMode.Surface) {
                this.updateVertexPos(event);
                return false;
            }
        }
        return;
    }

    /**
     * 顶点吸附模式下，左键没按下时，鼠标移动可以修改想要拖动的顶点
     */
    updateVertexPos(event: GizmoMouseEvent) {
        const node: Node = this.nodes[0];
        if (!node) return;
        const camera = getEditorCamera();
        const vertexs: Vec4[] = getMeshVertexAroundMouse(node, camera, event.x, event.y, 30);
        if (vertexs.length > 0) {
            const t = vertexs[0];

            const scaleAndRotationMatrix = node.getWorldRS();
            this._nodeToSnapVertex = new Vec3(t.x, t.y, t.z).transformMat4(scaleAndRotationMatrix);

            const worldMatrix = node.getWorldMatrix();
            const newPos = new Vec3();
            Vec3.transformMat4(newPos, new Vec3(t.x, t.y, t.z), worldMatrix);
            this.setGizmoPosition(newPos);
        }
    }

    /**
     * 修改gizmo的位置
     */
    setGizmoPosition(pos: Vec3) {
        _controller?.shape?.setPosition(pos);
        repaintEngine();
    }

    /**
     * 计算吸附到目标点需要的delta
     */
    calculateDeltaPos(out: Vec3, snapWorldPos: Vec3) {
        if (!this._nodesWorldPosList[0]) return;

        const worldPos = snapWorldPos.clone();
        const selectedPos = this._nodesWorldPosList[0];
        out.set(worldPos.subtract(this._nodeToSnapVertex).subtract(selectedPos));
    }

    /**
     * 获取非target中的节点(吸附时需要排除自身)
     */
    getNodeExcludeTarget(resultNodes: any[]): any | null {
        if (!resultNodes) { return null; }
        let result = null;
        for (let index = 0; index < resultNodes.length; index++) {
            result = resultNodes[index];
            let node: Node | null = null;
            if (Node.isNode(result)) {
                node = result;
            } else if (result.node) {
                node = result.node;
            } else if (result.collider) {
                node = result.collider.node;
            }
            if (node && !this.nodes.includes(node)) {
                break;
            } else {
                result = null;
            }
        }
        return result;
    }

    /**
     * 计算吸附模式下的实际偏移值
     */
    updateSnapPosition(pos: Vec3, event: GizmoMouseEvent) {
        if (this.disableSnap || !_controller) {
            return;
        }

        if (this._snapMode === SnapMode.Surface) {
            pos.set(0, 0, 0);
            if (!this._snapMouseDown) { return; }

            const camera = getEditorCamera();
            // 优先吸附到collider
            const colliderResults = raycastAllColliders(camera, event.x, event.y);
            const colliderHit = this.getNodeExcludeTarget(colliderResults);
            if (colliderHit && colliderHit.hitPoint) {
                this.calculateDeltaPos(pos, colliderHit.hitPoint);
            } else {
                // 当没有collider时，吸附到mesh
                const meshResults = getRaycastResultsForSnap(
                    camera, event.x, event.y,
                    SURFACE_SNAP_LAYER_MAKE_EXCLUDE,
                );
                const meshHit = this.getNodeExcludeTarget(meshResults);
                if (meshHit) {
                    const hitPoint = meshHit.hitPoint;
                    this.calculateDeltaPos(pos, hitPoint);
                }
            }
        } else if (this._snapMode === SnapMode.Vertex) {
            pos.set(0, 0, 0);
            if (!this._snapMouseDown) { return; }

            const camera = getEditorCamera();
            const meshResults = getRaycastResultsForSnap(
                camera, event.x, event.y,
                VERTEX_SNAP_LAYER_MAKE_EXCLUDE,
            );
            const meshHit = this.getNodeExcludeTarget(meshResults);
            if (meshHit) {
                // 遍历鼠标选中模型的所有顶点，找到最近的顶点吸附过去
                const hitNode = meshHit.node;
                const vertexs: Vec4[] = getMeshVertexAroundMouse(hitNode, camera, event.x, event.y, 100);
                if (vertexs.length > 0) {
                    const t = vertexs[0];
                    const worldMatrix = hitNode.getWorldMatrix();
                    const snapTargetWorldPos = new Vec3();
                    Vec3.transformMat4(snapTargetWorldPos, new Vec3(t.x, t.y, t.z), worldMatrix);
                    this.calculateDeltaPos(pos, snapTargetWorldPos);
                }
            }
        } else {
            // grid mode
            const snapConfigs = _controller.transformToolData?.snapConfigs;
            if (!snapConfigs) return;

            if (this.isControlKeyPressed(event) || snapConfigs.isPositionSnapEnabled) {
                this.applySnapIncrement(pos, snapConfigs.position, event.handleName);
                this.updateControllerTransform(true);
            }
        }
    }

    // ── Axis guidelines ────────────────────────────────────────────────────────

    /**
     * 在 3D 视图中显示根据你拖动的 x y z 显示对应的轴线
     */
    axisControllerHandlerMouseDown(event: GizmoMouseEvent) {
        const svc = getService();
        const is2D = svc?.Gizmo?.transformToolData?.is2D;
        const toolsVisible = svc?.Gizmo?.queryToolsVisibility3d?.() ?? true;
        if (is2D || !toolsVisible || !this._axisController) return;

        const node = this.nodes[0];
        if (!node) return;

        const visible = [false, false, false];
        switch (event.handleName) {
            case 'xy':
                visible[0] = true;
                visible[1] = true;
                break;
            case 'yz':
                visible[1] = true;
                visible[2] = true;
                break;
            case 'xz':
                visible[0] = true;
                visible[2] = true;
                break;
            default: {
                const idx = ['x', 'y', 'z'].indexOf(event.handleName);
                if (idx !== -1) {
                    visible[idx] = true;
                }
                break;
            }
        }

        this._axisController.setVisible(visible[0], visible[1], visible[2]);
        this._axisController.updateTransform(node);
    }

    /**
     * 更新轴线的坐标
     */
    axisControllerHandlerMouseMove() {
        const svc = getService();
        const is2D = svc?.Gizmo?.transformToolData?.is2D;
        const toolsVisible = svc?.Gizmo?.queryToolsVisibility3d?.() ?? true;
        if (is2D || !toolsVisible || !this._axisController) return;

        const node = this.nodes[0];
        if (!node) return;

        this._axisController.updateTransform(node);
    }

    /**
     * 隐藏轴线
     */
    axisControllerHandlerMouseUp() {
        const svc = getService();
        const is2D = svc?.Gizmo?.transformToolData?.is2D;
        const toolsVisible = svc?.Gizmo?.queryToolsVisibility3d?.() ?? true;
        if (is2D || !toolsVisible || !this._axisController) return;

        this._axisController.setVisible(false, false, false);
    }
}

export default PositionGizmo;
