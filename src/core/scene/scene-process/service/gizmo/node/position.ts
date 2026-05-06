'use strict';

import { CCObject, IVec3Like, Node, Quat, Vec3 } from 'cc';
import type { GizmoMouseEvent } from '../utils/defines';
import TransformBaseGizmo from './transform-base';
import PositionController from './position-controller';

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

const TempVec3A = new Vec3();
const TempVec3B = new Vec3();
const TempQuatA = new Quat();

const ArrowKeys = ['arrowleft', 'arrowright', 'arrowdown', 'arrowup'];

let _controller: PositionController | null = null;

class PositionGizmo extends TransformBaseGizmo {
    public disableUndo = false;
    public disableSnap = false;
    private readonly _nodesWorldPosList: Vec3[] = [];
    private _mouseDown = false;
    private _handler: ReturnType<typeof setTimeout> | null = null;
    private _event: GizmoMouseEvent | null = null;

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

    createController() {
        if (_controller) {
            this._controller = _controller;
        } else {
            const posCtrl = new PositionController(this.getGizmoRoot());
            this._controller = _controller = posCtrl;
        }
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

        this._nodesWorldPosList.length = 0;
        const nodes = this.nodes;
        for (let i = 0; i < nodes.length; ++i) {
            this._nodesWorldPosList.push(nodes[i].getWorldPosition());
        }
    }

    onControllerMouseMove(event: GizmoMouseEvent) {
        this.checkLock(event);
        this.updateDataFromController(event);
    }

    onControllerMouseUp(_event: GizmoMouseEvent) {
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
    }

    onKeyDown(event: any): undefined | false | true {
        // 没有选中节点
        if (!this.nodes.length) {
            return;
        }
        // 处理上下左右事件
        if (!this.onArrowDown(event)) {
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

                // grid snap
                this.updateSnapPosition(deltaPos, this._event as GizmoMouseEvent);

                const isZero = deltaPos.equals(Vec3.ZERO);
                if (!isZero) {
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
        if (!node || !force && this._mouseDown) {
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

        if (_controller.transformToolData?.coordinate !== 'global') {
            node.getWorldRotation(worldRot);
        }
        _controller.setPosition(worldPos);
        _controller.setRotation(worldRot);
    }

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

    /**
     * 计算 grid snap 模式下的实际偏移值
     */
    updateSnapPosition(pos: Vec3, event: GizmoMouseEvent) {
        if (this.disableSnap || !_controller) {
            return;
        }

        const snapConfigs = _controller.transformToolData?.snapConfigs;
        if (!snapConfigs) return;

        // grid mode only (surface/vertex snap removed for CLI)
        if (this.isControlKeyPressed(event) || snapConfigs.isPositionSnapEnabled) {
            this.applySnapIncrement(pos, snapConfigs.position, event.handleName);
            this.updateControllerTransform(true);
        }
    }
}

export default PositionGizmo;
