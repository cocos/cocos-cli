import GizmoBase from '../base/gizmo-base';
import ControllerBase from '../controller/base';
import { Node, Component, Scene } from 'cc';
import type { GizmoMouseEvent } from '../utils/defines';
import { ServiceEvents } from '../../core/global-events';

/**
 * 获取 Service（惰性访问，避免循环依赖）
 */
function getService(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

class TransformBaseGizmo extends GizmoBase<Component> {
    protected _controller!: ControllerBase;
    protected updateControllerTransform?(...args: any[]): void;

    protected isNodeLocked(_node: Node) {
        return false;
    }

    public get nodes(): Node[] {
        const svc = getService();
        const paths: string[] = svc?.Selection?.query?.() ?? [];
        const nodes = paths.map((path: string) => {
            const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
            return EditorExtends?.Node?.getNodeByPath?.(path) ?? null;
        });
        return nodes.filter((node: Node | null) => {
            if (node === null || !node.isValid || this.isNodeLocked(node)) {
                return false;
            }
            let parent = node.parent;
            while (parent) {
                if (nodes.includes(parent) && !this.isNodeLocked(parent)) {
                    return false;
                }
                if (!parent.isValid) {
                    return false;
                }
                // 如果父节点是 null 并且不是场景节点说明它是要被删除的节点
                if (parent.parent === null && !(parent instanceof Scene)) {
                    return false;
                }
                parent = parent.parent;
            }
            return true;
        }) as Node[];
    }

    onShow() {
        if (!this._controller || this.nodes.length === 0) {
            return;
        }
        this._controller.show();
        if (this.updateControllerTransform) {
            this.updateControllerTransform();
        }
    }

    onHide() {
        // 由于 Controller 只有全局唯一一个，
        // 所有当选中的 node 列表为 0 的时候不允许隐藏
        // 否则如何出现了选中 A 节点，后隐藏 B 节点，
        // 会把 A 节点 gizmo 隐藏
        if (this.target && this._controller && this.nodes.length === 1) {
            return;
        }

        if (this._controller) {
            this._controller.hide();
        }
    }

    onTargetUpdate() {
        if (this._controller && this.updateControllerTransform) {
            this.updateControllerTransform();
        }
    }

    onNodeChanged(_event?: any) {
        if (this._controller && this.updateControllerTransform) {
            this.updateControllerTransform();
        }
    }

    // 发送节点修改消息
    protected broadcastNodeChangeMessage(node: Node) {
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        ServiceEvents.broadcast('scene:change-node', EditorExtends.Node.getNodePath(node));
    }

    getSnappedValue(inNumber: number, snapStep: number): number {
        return Math.round(inNumber / snapStep) * snapStep;
    }

    isControlKeyPressed(event: GizmoMouseEvent) {
        return event.ctrlKey || event.metaKey;
    }

    /**
     * 默认行为是 controller 被按下就打断
     */
    onKeyDown(_event: any) {
        if (!this.target) {
            return;
        }
        return !this._controller?.isMouseDown;
    }

    /**
     * 默认行为是 controller 被按下就打断
     */
    onKeyUp(_event: any) {
        if (!this.target) {
            return true;
        }
        return !this._controller?.isMouseDown;
    }
}

export default TransformBaseGizmo;
