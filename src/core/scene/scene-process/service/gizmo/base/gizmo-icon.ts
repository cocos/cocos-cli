import { Quat, Component } from 'cc';

import GizmoBase from './gizmo-base';
import IconController from '../controller/icon';

const tempQuat_a = new Quat();

class IconGizmoBase<T extends Component = Component> extends GizmoBase<T> {
    protected _controller!: IconController;
    private _isIconGizmoVisible = false;
    public disableOnSelected = false;

    init() {
        this.createController();
    }

    onShow() {
        this._controller.show();
        this.updateController();
    }

    onHide() {
        this._controller.hide();
    }

    setIconGizmoVisible(visible: boolean) {
        this._isIconGizmoVisible = visible;
        if (visible) {
            this.show();
        } else {
            this.hide();
        }
    }

    setIconGizmo3D(value: boolean) {
        if (!this._controller) return;
        this._controller.is3DIcon = value;
        // 3D 模式下使用默认尺寸 64
    }

    setIconGizmoSize(size: number) {
        if (!this._controller) return;
        this._controller.updateSize(size);
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        this._controller = new IconController(gizmoRoot, { texture: true });
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        // 默认配置：is3DIcon=false，iconGizmoSize=64
        this._controller.is3DIcon = false;
        this._controller.updateSize(2);
        if (!this._isIconGizmoVisible) {
            this._controller.hide();
        }
    }

    onControllerMouseDown() {}

    onControllerMouseMove() {}

    onControllerMouseUp() {
        if (this.target) {
            try {
                const { Service } = require('../../core/decorator');
                const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
                const path = EditorExtends?.Node?.getNodePath?.(this.target.node) ?? '';
                if (path) {
                    Service.Selection?.select(path);
                }
            } catch (e) {
                // not ready
            }
        }
    }

    updateController() {
        this.updateControllerTransform();
    }

    updateControllerTransform() {
        if (!this._isInitialized || this.target === null) return;
        const node = this.target.node;
        const worldPos = node.getWorldPosition();
        node.getWorldRotation(tempQuat_a);
        this._controller.setPosition(worldPos);
        this._controller.setRotation(tempQuat_a);
        this._controller.onEditorCameraMoved();
    }

    onTargetUpdate() {
        this.updateController();
    }

    onNodeChanged(_event: any) {
        this.updateController();
    }

    onNodeSelectionChanged(selection: boolean) {
        super.onNodeSelectionChanged(selection);
        if (selection && this.disableOnSelected) {
            this.hide();
            return;
        }
        if (!selection) {
            this.show();
        }
    }

    public checkVisible() {
        if (!this.target) return false;
        if (!this._isIconGizmoVisible) return false;
        if (this._nodeSelected && this.disableOnSelected) return false;
        if ((this.target.node as any).objFlags & (cc as any).Object.Flags.LockedInEditor) return false;
        return super.checkVisible();
    }
}

export default IconGizmoBase;
