'use strict';

import { Color, Joint2D, Mat4, Node, Vec2, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import Joint2DController from './controller-joint-2d';

const tempMat4 = new Mat4();
const tempVec3 = new Vec3();

type JointAnchorProperty = 'anchor' | 'connectedAnchor';

interface JointDragState<T extends Joint2D> {
    property: JointAnchorProperty;
    propPath: string;
    target: T;
    jointNode: Node;
    coordinateNode: Node | null;
    connectedBody: T['connectedBody'];
    changed: boolean;
}

function toPrecision(value: number, precision: number): number {
    const factor = Math.pow(10, precision);
    return Math.round(Math.abs(value) * factor) * Math.sign(value) / factor;
}

/**
 * 所有 Joint2D 选择 Gizmo 的共享实现。
 *
 * 同步并显示 anchor、connectedAnchor，把两个 Handle 的世界坐标写回
 * 各自所属坐标空间，并为每次连续拖动建立对应属性的 scoped Undo。
 */
export class Joint2DGizmo<T extends Joint2D = Joint2D> extends GizmoBase<T> {
    protected _anchorController!: Joint2DController;
    protected _connectedAnchorController!: Joint2DController;
    protected readonly _anchorWorldPosition = new Vec3();
    protected readonly _connectedAnchorWorldPosition = new Vec3();
    protected readonly _anchorColor = new Color(16, 180, 245);
    protected readonly _connectedAnchorColor = new Color(207, 105, 40);
    private _dragState: JointDragState<T> | null = null;
    private _trackedConnectedBody: T['connectedBody'] = null;
    private _trackedConnectedNode: Node | null = null;
    private readonly _trackedConnectedWorldMatrix = new Mat4();
    private _hasTrackedConnectedWorldMatrix = false;

    protected init(): void {
        this.createController();
    }

    protected createController(): void {
        const gizmoRoot = this.getGizmoRoot();

        this._anchorController = new Joint2DController(gizmoRoot);
        this._anchorController.editable = true;
        this._anchorController.setColor(this._anchorColor);
        this._anchorController.edit = true;
        this.bindController(this._anchorController, 'anchor');

        this._connectedAnchorController = new Joint2DController(gizmoRoot);
        this._connectedAnchorController.editable = true;
        this._connectedAnchorController.setColor(this._connectedAnchorColor);
        this._connectedAnchorController.edit = true;
        this.bindController(this._connectedAnchorController, 'connectedAnchor');
    }

    private bindController(controller: Joint2DController, property: JointAnchorProperty): void {
        controller.onControllerMouseDown = () => this.onControllerMouseDown(controller, property);
        controller.onControllerMouseMove = () => this.onControllerMouseMove(controller);
        controller.onControllerMouseUp = () => this.onControllerMouseUp();
    }

    protected onShow(): void {
        this._anchorController.show();
        this._connectedAnchorController.show();
        this.updateControllerData();
    }

    protected onHide(): void {
        this.finishActiveDrag(true);
        this.resetConnectedBodySignature();
        this._anchorController.hide();
        this._connectedAnchorController.hide();
    }

    protected updateControllerData(): void {
        if (!this._isInitialized || !this.target) {
            return;
        }
        this.updateAnchorControllerData();
    }

    protected updateAnchorControllerData(): boolean {
        const joint = this.target;
        if (!joint || joint.isValid === false || joint.node.isValid === false) {
            this.resetConnectedBodySignature();
            this._anchorController.hide();
            this._connectedAnchorController.hide();
            return false;
        }

        const node = joint.node;
        const anchor = joint.anchor;
        this._anchorWorldPosition.set(anchor.x, anchor.y, 0);
        node.getWorldMatrix(tempMat4);
        Vec3.transformMat4(this._anchorWorldPosition, this._anchorWorldPosition, tempMat4);
        this._anchorController.updatePosition(node.getWorldPosition(), this._anchorWorldPosition);

        const connectedAnchor = joint.connectedAnchor;
        this._connectedAnchorWorldPosition.set(connectedAnchor.x, connectedAnchor.y, 0);
        const connectedNode = this.getValidConnectedNode(joint);
        if (connectedNode) {
            connectedNode.getWorldMatrix(tempMat4);
            Vec3.transformMat4(this._connectedAnchorWorldPosition, this._connectedAnchorWorldPosition, tempMat4);
            this._connectedAnchorController.updatePosition(
                connectedNode.getWorldPosition(),
                this._connectedAnchorWorldPosition,
            );
        } else {
            this._connectedAnchorController.updatePosition(Vec3.ZERO, this._connectedAnchorWorldPosition);
        }

        this._anchorController.show();
        this._connectedAnchorController.show();
        this.captureConnectedBodySignature(joint, connectedNode);
        return true;
    }

    protected onTargetUpdate(): void {
        // GizmoPool 首次绑定 target 时 Controller 尚未通过 show()/init() 创建。
        // 首次显示的数据初始化由 onShow() 完成；这里只处理已初始化实例的复用和换绑。
        if (!this._isInitialized) {
            return;
        }
        this.finishActiveDrag(false);
        this.resetConnectedBodySignature();
        this._anchorController.cancelDrag();
        this._connectedAnchorController.cancelDrag();
        this.updateControllerData();
    }

    public onNodeChanged(): void {
        this.cancelInvalidDrag();
        this.updateControllerData();
    }

    public onUpdate(): void {
        if (!this._isInitialized || !this.target || !this.visible()) {
            return;
        }

        this.cancelInvalidDrag();
        if (this.hasConnectedBodySignatureChanged()) {
            this.updateControllerData();
        }
    }

    private onControllerMouseDown(controller: Joint2DController, property: JointAnchorProperty): void {
        const target = this.target;
        if (!target) {
            controller.cancelDrag();
            return;
        }

        const propPath = this.getCompPropPath(property);
        if (!propPath) {
            controller.cancelDrag();
            return;
        }

        const connectedBody = target.connectedBody;
        this._dragState = {
            property,
            propPath,
            target,
            jointNode: target.node,
            coordinateNode: property === 'anchor' ? target.node : connectedBody?.node ?? null,
            connectedBody,
            changed: false,
        };
    }

    private onControllerMouseMove(controller: Joint2DController): void {
        const state = this._dragState;
        if (!state || !this.isDragTargetValid(state)) {
            this.finishActiveDrag(this.target === state?.target);
            controller.cancelDrag();
            return;
        }

        controller.getDragWorldPosition(tempVec3);
        this.writeAnchor(state, tempVec3);
    }

    private onControllerMouseUp(): void {
        this.finishActiveDrag(true);
    }

    private finishActiveDrag(commitProperty: boolean): void {
        const state = this._dragState;
        this._dragState = null;
        if (!state?.changed || !this._recorded) {
            return;
        }

        if (commitProperty) {
            void this.onControlEnd(state.propPath);
        } else {
            // target 被替换后 this.nodes 已指向新目标，不能用它广播旧属性的动画提交；
            // 此处仅结束旧节点 UUID 对应的 Undo 录制，避免将提交错误关联到新目标。
            this._isControlBegin = false;
            void this.commitChanges();
        }
    }

    private cancelInvalidDrag(): void {
        const state = this._dragState;
        if (!state || this.isDragTargetValid(state)) {
            return;
        }

        const canCommitProperty = this.target === state.target
            && state.target.isValid !== false
            && state.jointNode.isValid !== false;
        this.finishActiveDrag(canCommitProperty);
        const controller = state.property === 'anchor'
            ? this._anchorController
            : this._connectedAnchorController;
        controller.cancelDrag();
    }

    private isDragTargetValid(state: JointDragState<T>): boolean {
        if (this.target !== state.target
            || state.target.isValid === false
            || state.target.node !== state.jointNode
            || state.jointNode.isValid === false
            || state.coordinateNode?.isValid === false) {
            return false;
        }

        if (state.property === 'connectedAnchor') {
            return state.target.connectedBody === state.connectedBody
                && (!state.connectedBody || state.connectedBody.node === state.coordinateNode);
        }
        return state.coordinateNode === state.jointNode;
    }

    private getValidConnectedNode(joint: T): Node | null {
        const connectedBody = joint.connectedBody;
        if (!connectedBody || connectedBody.isValid === false) {
            return null;
        }
        const connectedNode = connectedBody.node;
        return !connectedNode || connectedNode.isValid === false ? null : connectedNode;
    }

    private captureConnectedBodySignature(joint: T, connectedNode: Node | null): void {
        this._trackedConnectedBody = joint.connectedBody;
        this._trackedConnectedNode = connectedNode;
        this._hasTrackedConnectedWorldMatrix = Boolean(connectedNode);
        if (connectedNode) {
            connectedNode.getWorldMatrix(this._trackedConnectedWorldMatrix);
        }
    }

    private hasConnectedBodySignatureChanged(): boolean {
        const joint = this.target;
        if (!joint || joint.isValid === false || joint.node.isValid === false) {
            return this._trackedConnectedBody !== null
                || this._trackedConnectedNode !== null
                || this._hasTrackedConnectedWorldMatrix;
        }

        const connectedNode = this.getValidConnectedNode(joint);
        if (joint.connectedBody !== this._trackedConnectedBody || connectedNode !== this._trackedConnectedNode) {
            return true;
        }
        if (!connectedNode) {
            return this._hasTrackedConnectedWorldMatrix;
        }

        connectedNode.getWorldMatrix(tempMat4);
        return !this._hasTrackedConnectedWorldMatrix
            || !Mat4.equals(tempMat4, this._trackedConnectedWorldMatrix);
    }

    private resetConnectedBodySignature(): void {
        this._trackedConnectedBody = null;
        this._trackedConnectedNode = null;
        this._hasTrackedConnectedWorldMatrix = false;
    }

    private writeAnchor(state: JointDragState<T>, worldPosition: Readonly<Vec3>): void {
        tempVec3.set(worldPosition);
        if (state.coordinateNode) {
            state.coordinateNode.getWorldMatrix(tempMat4);
            Mat4.invert(tempMat4, tempMat4);
            Vec3.transformMat4(tempVec3, tempVec3, tempMat4);
        }

        const x = toPrecision(tempVec3.x, 1);
        const y = toPrecision(tempVec3.y, 1);
        const current = state.target[state.property];
        if (current.x === x && current.y === y) {
            return;
        }

        this.onControlUpdate(state.propPath);
        state.changed = true;
        state.target[state.property] = new Vec2(x, y);
        this.onComponentChanged(state.target.node);
        this.updateControllerData();
    }

    override destroy(): void {
        this.finishActiveDrag(true);
        this.resetConnectedBodySignature();
        super.destroy();
        this._anchorController?.destroy();
        this._connectedAnchorController?.destroy();
    }
}

export default Joint2DGizmo;
