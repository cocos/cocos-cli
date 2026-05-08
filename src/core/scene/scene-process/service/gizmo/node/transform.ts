import GizmoBase from '../base/gizmo-base';
import PositionGizmo from './position';
import RotationGizmo from './rotation';
import ScaleGizmo from './scale';
import RectGizmo from './rectangle';
import ViewGizmo from './view';
import TransformBaseGizmo from './transform-base';
import type { TransformToolDataToolNameType } from '../transform-tool';
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

function repaintEngine(): void {
    try {
        const { Service } = require('../../core/decorator');
        Service.Engine?.repaintInEditMode?.();
    } catch (e) {
        // not ready
    }
}

const gizmoMap: Record<TransformToolDataToolNameType, TransformBaseGizmo> = {
    view: new ViewGizmo(null),
    position: new PositionGizmo(null),
    rotation: new RotationGizmo(null),
    scale: new ScaleGizmo(null),
    rect: new RectGizmo(null),
};

class TransformGizmo extends GizmoBase<Component> {
    private _gizmo: TransformBaseGizmo;
    protected updateControllerTransform?(): void;

    constructor(target: Component | null) {
        super(target);
        const toolName = getService()?.Gizmo?.transformToolData?.toolName ?? 'position';
        this._gizmo = gizmoMap[toolName as TransformToolDataToolNameType] ?? gizmoMap['position'];
    }

    public get nodes(): Node[] {
        return this._gizmo.nodes;
    }

    set target(value: Component | null) {
        this._gizmo.target = value;
        // 调用父类 setter
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(Object.getPrototypeOf(this)),
            'target',
        )?.set?.call(this, value);
    }

    get target() {
        return this._gizmo.target;
    }

    public changeTool(name: TransformToolDataToolNameType) {
        const target = this._gizmo.target;
        this._gizmo.hide();
        // 因为全局共用一个 controller，如果有多个 transform gizmo 都需要更改
        // 后面的 target 就会被设置为 null，所以这里不需要清空旧的 target
        this._gizmo.target = null;
        const changeToGizmo = gizmoMap[name];
        if (this._gizmo.constructor !== changeToGizmo.constructor) {
            // HACK: 如果是切换不同的 gizmo 需要强制隐藏
            this._gizmo.onHide?.();
        }
        this._gizmo = changeToGizmo;
        this._gizmo.target = this._gizmo.target || target;
        this._gizmo.show();
    }

    private _eventMap: { [key: string]: () => void } = {
        toolNameChanged: () => {
            const toolName = getService()?.Gizmo?.transformToolData?.toolName ?? 'position';
            this.changeTool(toolName as TransformToolDataToolNameType);
        },
    };

    init() {
        (this._gizmo as any).init?.();
    }

    show() {
        super.show();
        this._gizmo.show();
    }

    hide() {
        super.hide();
        this._gizmo.hide();
    }

    onShow() {
        if (super.onShow) {
            super.onShow();
        }

        const svc = getService();
        const toolName = svc?.Gizmo?.transformToolData?.toolName ?? 'position';
        this.changeTool(toolName as TransformToolDataToolNameType);

        this._eventMap.toolNameChanged = () => {
            const tn = getService()?.Gizmo?.transformToolData?.toolName ?? 'position';
            this.changeTool(tn as TransformToolDataToolNameType);
        };

        this._eventMap.viewModeChanged = () => {
            repaintEngine();
        };
        this._eventMap.pivotChanged = () => {
            (this._gizmo as any).updateControllerTransform?.();
            repaintEngine();
        };
        this._eventMap.coordinateChanged = () => {
            (this._gizmo as any).updateControllerTransform?.();
            repaintEngine();
        };

        const ttd = svc?.Gizmo?.transformToolData;
        ttd?.addListener?.('tool-name-changed', this._eventMap.toolNameChanged);
        ttd?.addListener?.('view-mode-changed', this._eventMap.viewModeChanged);
        ttd?.addListener?.('pivot-changed', this._eventMap.pivotChanged);
        ttd?.addListener?.('coordinate-changed', this._eventMap.coordinateChanged);

        // 直接调用 onShow
        this._gizmo.onShow?.();
    }

    onHide() {
        if (super.onHide) {
            super.onHide();
        }

        const svc = getService();
        const ttd = svc?.Gizmo?.transformToolData;
        ttd?.removeListener?.('tool-name-changed', this._eventMap.toolNameChanged);
        ttd?.removeListener?.('view-mode-changed', this._eventMap.viewModeChanged);
        ttd?.removeListener?.('pivot-changed', this._eventMap.pivotChanged);
        ttd?.removeListener?.('coordinate-changed', this._eventMap.coordinateChanged);

        this._gizmo.onHide?.();
    }

    public onUpdate(deltaTime: number): void {
        this._gizmo.onUpdate?.(deltaTime);
    }

    public onDestroy(): void {
        this._gizmo.onDestroy?.();
    }

    public onNodeChanged(event: any): void {
        this._gizmo.onNodeChanged?.(event);
    }

    public onKeyDown(event: any) {
        return this._gizmo.onKeyDown?.(event);
    }

    public onKeyUp(event: any) {
        return this._gizmo.onKeyUp?.(event);
    }

    public onVertexSnapMove(event: any) {
        if ((this._gizmo as any).onVertexSnapMove) {
            return (this._gizmo as any).onVertexSnapMove(event);
        }
        return;
    }

    public onCameraControlModeChanged(mode: number): void {
        this._gizmo.onCameraControlModeChanged?.(mode);
    }
}

export default TransformGizmo;
