import { Node, Component } from 'cc';

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
            const svc = getService();
            svc?.broadcast?.('gizmo:control-begin', propPath);
        } catch (e) {
            // not ready
        }
    }

    onControlUpdate(propPath: string | null) {
        if (!this._isControlBegin) {
            this.onControlBegin(propPath);
        }
    }

    onControlEnd(propPath: string | null) {
        this._isControlBegin = false;
        this.commitChanges();
        try {
            const svc = getService();
            svc?.broadcast?.('gizmo:control-end', propPath);
        } catch (e) {
            // not ready
        }
    }

    recordChanges(propPath?: string | null) {
        if (!this._recorded) {
            const uuids = this.nodes.map(n => n.uuid);
            try {
                const svc = getService();
                this.undoID = svc?.Undo?.beginRecording?.(uuids, {
                    label: propPath ? `Gizmo ${propPath}` : 'Gizmo Change',
                }) ?? '';
            } catch (e) {
                this.undoID = '';
            }
            this._recorded = true;
        }
    }

    commitChanges() {
        this._recorded = false;
        if (this.undoID !== '') {
            const undoID = this.undoID;
            try {
                const svc = getService();
                void svc?.Undo?.endRecording?.(undoID)?.catch?.((_error: unknown) => {});
            } catch (e) {
                // 服务还没初始化完成。
            }
        }
        this.undoID = '';
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
        this.commitChanges();
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
