import { Node, Component } from 'cc';
import type { IUndoScope } from '../../../../common';
import {
    broadcastAnimationPropertyCommitted,
    normalizeAnimationPropertyCommitPath,
} from '../../animation/property-commit-event';

type BroadcastService = {
    broadcast?(event: string, ...args: unknown[]): void;
};

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

/**
 * 获取全局事件总线（惰性访问，避免循环依赖）。
 * 广播事件必须走 ServiceEvents，而不是 getService()：后者返回的是 Service 注册表 Proxy，
 * 其 get 陷阱对未注册的名字（如 'broadcast'）会 throw，`?.` 挡不住抛错，导致事件永远发不出去。
 */
function getServiceEvents(): any {
    try {
        const { ServiceEvents } = require('../../core/global-events');
        return ServiceEvents;
    } catch (e) {
        return null;
    }
}

class GizmoBase<T extends Component = Component> {
    private _hidden = true;
    private _target: T | null;
    protected _isInitialized = false;
    protected _isControlBegin = false;
    protected _recorded = false;
    protected _nodeSelected = false;

    protected init?(): void;
    protected onShow?(): void;
    protected onHide?(): void;
    protected onTargetUpdate?(): void;

    public onUpdate?(deltaTime: number): void;
    public onDestroy?(): void;
    public onNodeChanged?(event: any): void;
    public onKeyDown?(event: any): boolean | void;
    public onKeyUp?(event: any): boolean | void;
    public onCameraControlModeChanged?(mode: number): void;
    public shouldRegisterGizmoOperationEvent = false;
    public undoID = '';

    constructor(target: T | null) {
        this._target = target;
    }

    get target(): T | null {
        return this._target;
    }

    set target(value: T | null) {
        this._target = value;
        if (this.onTargetUpdate && this.checkVisible()) {
            this.onTargetUpdate();
            try {
                const svc = getService();
                svc?.Engine?.repaintInEditMode?.();
            } catch (e) {
                // not ready
            }
        }
        if (this.nodes.length <= 0) {
            this.hide();
        }
    }

    get nodes(): Node[] {
        if (!this.target) return [];
        return [this.target.node];
    }

    layer() {
        return 'scene';
    }

    protected getGizmoRoot() {
        try {
            const svc = getService();
            return svc?.Gizmo?.gizmoRootNode ?? null;
        } catch (e) {
            return null;
        }
    }

    onControlBegin(propPath: string | null) {
        this._isControlBegin = true;
        this.recordChanges(propPath);
        try {
            const svcEvents = getServiceEvents();
            svcEvents?.broadcast?.('gizmo:control-begin', propPath);
        } catch (e) {
            // not ready
        }
    }

    onControlUpdate(propPath: string | null) {
        if (!this._isControlBegin) {
            this.onControlBegin(propPath);
        }
    }

    async onControlEnd(propPath: string | null) {
        this._isControlBegin = false;
        await this.commitChanges();
        try {
            const svcEvents = getServiceEvents();
            svcEvents?.broadcast?.('gizmo:control-end', propPath);
        } catch (e) {
            console.warn('[Gizmo] Failed to broadcast legacy control-end event:', e);
        }
        this.broadcastAnimationPropertyCommitted(propPath);
    }

    recordChanges(propPath?: string | null) {
        if (!this._recorded) {
            const uuids = this.nodes.map(n => n.uuid);
            try {
                const svc = getService();
                this.undoID = svc?.Undo?.beginRecording?.(uuids, {
                    label: propPath ? `Gizmo ${propPath}` : 'Gizmo Change',
                    scope: this.createRecordingScope(propPath),
                }) ?? '';
            } catch (e) {
                this.undoID = '';
            }
            this._recorded = true;
        }
    }

    async commitChanges() {
        this._recorded = false;
        if (this.undoID !== '') {
            const undoID = this.undoID;
            try {
                const svc = getService();
                await svc?.Undo?.endRecording?.(undoID);
            } catch (e) {
                console.warn('[Gizmo] Failed to end undo recording:', e);
            }
        }
        this.undoID = '';
    }

    private createRecordingScope(propPath?: string | null): IUndoScope | undefined {
        const nodes = this.nodes;
        if (!propPath || nodes.length !== 1) {
            return undefined;
        }
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        const nodePath = EditorExtends?.Node?.getNodePath?.(nodes[0]);
        if (!nodePath) {
            return undefined;
        }
        return {
            editorType: 'scene',
            nodePath,
            propPath: normalizeAnimationPropertyCommitPath(propPath),
        };
    }

    public checkVisible(): boolean {
        // CLI 中简化：始终返回 true（不需要可见性 toggle UI）
        return true;
    }

    visible() {
        return !this._hidden;
    }

    initialize() {
        if (!this._isInitialized) {
            if (this.init) {
                this.init();
            }
            this._isInitialized = true;
        }
    }

    destroy() {
        // 拖拽还没正常结束时，gizmo 也可能因为节点删除、场景切换、工具切换被销毁。
        // 这种情况下 onControlEnd 不会触发，所以这里主动结束录制，
        // 避免该节点一直被认为正在录制，导致后续修改不再记录 undo。
        // 没有开始录制时，commitChanges 不会产生额外影响。
        void this.commitChanges();
        if (this.onDestroy) {
            this.onDestroy();
        }
        this.hide();
        this._target = null;
    }

    show() {
        if (!this._hidden || !this.checkVisible()) return;
        this.initialize();
        if (this.onShow) {
            this.onShow();
        }
        this._hidden = false;
    }

    hide() {
        if (this._hidden) return;
        if (this.onHide) {
            this.onHide();
        }
        this._hidden = true;
    }

    update(deltaTime: number) {
        if (this.onUpdate) {
            this.onUpdate(deltaTime);
        }
    }

    getCompPropPath(propName: string) {
        const target = this.target;
        if (target) {
            const node = target.node;
            const compIdx = (node as any)['_components'].indexOf(target);
            return '_components.' + compIdx + '.' + propName;
        }
        return null;
    }

    private broadcastAnimationPropertyCommitted(propPath: string | null): void {
        if (!propPath) {
            return;
        }
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        for (const node of this.nodes) {
            const nodePath = EditorExtends?.Node?.getNodePath?.(node);
            if (!nodePath) {
                continue;
            }
            broadcastAnimationPropertyCommitted({
                nodePath,
                propPath,
                source: 'engine',
            });
        }
    }

    protected onComponentChanged(_node: Node) {
        // broadcast node change（CLI 中暂不实现）
    }

    public onEditorCameraMoved() {}

    public registerCameraMovedEvent() {
        try {
            const svc = getService();
            svc?.Camera?.getCamera?.()?.node?.on('transform-changed', this.onEditorCameraMoved, this);
        } catch (e) {
            // not ready
        }
    }

    public unregisterCameraMoveEvent() {
        try {
            const svc = getService();
            svc?.Camera?.getCamera?.()?.node?.off('transform-changed', this.onEditorCameraMoved, this);
        } catch (e) {
            // not ready
        }
    }

    public onNodeSelectionChanged(selection: boolean) {
        this._nodeSelected = selection;
    }
}

export default GizmoBase;
