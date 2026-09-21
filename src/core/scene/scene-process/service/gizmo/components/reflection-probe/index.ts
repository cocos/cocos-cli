'use strict';

import { assetManager, CCObject, Color, instantiate, js, Layers, Material, MeshRenderer, Node, Prefab, Quat, ReflectionProbe, ReflectionProbeType, renderer, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import IconGizmoBase from '../../base/gizmo-icon';
import BoxController from '../../controller/box';
import { registerGizmo } from '../../gizmo-defines';

const tempVec3 = new Vec3();
const tempQuat_a = new Quat();
const SPHERE_PREFAB = '655c9519-1a37-472b-bae6-29fefac0b550';

/**
 * 反射探针（ReflectionProbe）选中 Gizmo：
 * 画出影响区域包围盒线框，并支持拖拽包围盒面手柄修改 size。
 * 注意 ReflectionProbe.size 是 AABB 半长，线框全尺寸 = size * 2。
 * PLANAR 类型的 size 为扁平值（默认 5,0.5,5），会显示成一块薄盒（平面）。
 */
class ReflectionProbeComponentGizmo extends GizmoBase<ReflectionProbe> {
    private _controller!: BoxController;
    private _size: Vec3 = new Vec3();
    private _scale: Vec3 = new Vec3();
    private _propPath: string | null = null;
    private _sphere: Node | null = null;
    private _previewMaterial: Material | null = null;
    private _previewTarget: ReflectionProbe | null = null;
    private _previewVisible = false;
    private _loadingPreview = false;
    private _destroyed = false;

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._previewVisible = true;
        this._controller.show();
        this.updateControllerData();
        this.loadPreviewSphere();
    }

    onHide() {
        this._previewVisible = false;
        this._controller.hide();
        this.updatePreviewSphere();
    }

    onDestroy() {
        this._destroyed = true;
        this._previewVisible = false;
        this.updatePreviewSphere();
        this._sphere?.destroy();
        this._sphere = null;
        this._previewMaterial?.destroy();
        this._previewMaterial = null;
    }

    private loadPreviewSphere() {
        if (this._sphere || this._loadingPreview || this._destroyed) return;
        this._loadingPreview = true;
        assetManager.loadAny(SPHERE_PREFAB, (error, prefab) => {
            this._loadingPreview = false;
            if (this._destroyed) return;
            if (error || !(prefab instanceof Prefab)) {
                console.warn('[ReflectionProbe Gizmo] Failed to load preview sphere:', error ?? 'Invalid sphere prefab');
                return;
            }
            const root = this.getGizmoRoot();
            if (!root?.isValid) return;
            const sphere = instantiate(prefab);
            sphere.active = false;
            const meshRenderer = sphere.getComponent(MeshRenderer);
            if (!meshRenderer) {
                sphere.destroy();
                return;
            }
            const material = new Material();
            try {
                material.initialize({ effectName: 'builtin-reflection-probe-preview', technique: 0 });
                meshRenderer.setSharedMaterial(material, 0);
                meshRenderer.bakeSettings.reflectionProbe = ReflectionProbeType.BAKED_CUBEMAP;
                meshRenderer.bakeSettings.bakeToReflectionProbe = false;
                meshRenderer.bakeSettings.bakeable = false;
                const markEditorOnly = (node: Node) => {
                    node.layer = Layers.Enum.IGNORE_RAYCAST | Layers.Enum.GIZMOS;
                    node._objFlags |= CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
                    node.children.forEach(markEditorOnly);
                };
                markEditorOnly(sphere);
                sphere.name = 'Reflection Probe Sphere';
                sphere.parent = root;
                this._sphere = sphere;
                this._previewMaterial = material;
                this.updatePreviewSphere();
            } catch (error) {
                this._sphere = null;
                this._previewMaterial = null;
                sphere.destroy();
                material.destroy();
                console.warn('[ReflectionProbe Gizmo] Failed to create preview sphere:', error);
                return;
            }
            // Lazy access follows the other gizmos and avoids service registration cycles.
            const { Service } = require('../../../core/decorator');
            void Service.Engine.repaintInEditMode();
        });
    }

    private updatePreviewSphere() {
        const target = this.target;
        const visible = this._previewVisible && !this._destroyed && target?.isValid
            && target.enabledInHierarchy && target.probeType === renderer.scene.ProbeType.CUBE;
        if (this._previewTarget && (!visible || this._previewTarget !== target)) {
            if (this._previewTarget.isValid && this._previewTarget.previewSphere === this._sphere) {
                this._previewTarget.previewSphere = null;
            }
            this._previewTarget = null;
        }
        if (!this._sphere) return;
        this._sphere.active = !!visible;
        if (visible && target) {
            this._sphere.setWorldPosition(target.node.worldPosition);
            if (target.previewSphere !== this._sphere) target.previewSphere = this._sphere;
            this._previewTarget = target;
        }
    }

    onUpdate() {
        this.updatePreviewSphere();
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        this._controller = new BoxController(gizmoRoot);
        // 青色以区别于碰撞盒的绿色
        this._controller.setColor(new Color(0, 200, 255));
        this._controller.editable = true;
        this._controller.hoverColor = Color.YELLOW;
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) return;
        this._size = this.target.size.clone();
        this._scale = this.target.node.getWorldScale();
        this._propPath = this.getCompPropPath('size');
    }

    onControllerMouseMove() {
        this.updateDataFromController();
    }

    onControllerMouseUp() {
        this.onControlEnd(this._propPath);
    }

    updateDataFromController() {
        if (this._controller.updated && this.target) {
            const deltaSize = this._controller.getDeltaSize();
            // size 为半长：手柄位移即半长增量，除以世界缩放换算到本地，不乘 2
            Vec3.divide(deltaSize, deltaSize, this._scale);
            const newSize = Vec3.add(tempVec3, this._size, deltaSize);
            newSize.x = Math.max(0, newSize.x);
            newSize.y = Math.max(0, newSize.y);
            newSize.z = Math.max(0, newSize.z);
            // Keep the authoritative size synchronous for Save/Undo, but avoid
            // rebuilding probe/model data for repeated or clamped pointer input.
            if (Vec3.strictEquals(this.target.size, newSize)) return;
            this.onControlUpdate(this._propPath);
            this.target.size = newSize;
            this.onComponentChanged(this.target.node);
        }
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    updateControllerData() {
        this.updatePreviewSphere();
        if (!this._isInitialized || this.target == null) return;
        if (this.target instanceof ReflectionProbe) {
            const node = this.target.node;
            this._controller.show();
            this._controller.checkEdit();
            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setScale(worldScale);
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);
            // 影响盒中心即节点原点，全尺寸 = 半长 * 2
            const fullSize = Vec3.multiplyScalar(tempVec3, this.target.size, 2);
            this._controller.updateSize(Vec3.ZERO, fullSize);
        } else {
            this._controller.hide();
        }
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }
}

class ReflectionProbeIconGizmo extends IconGizmoBase<ReflectionProbe> {
    public disableOnSelected = true;

    createController() {
        super.createController();
        this._controller.setTextureByUUID('dee6f7cc-ba21-4091-948f-4f508495f260@6c48a');
    }
}

export const name = js.getClassName(ReflectionProbe);
// 对齐 Creator：选中时显示影响盒及 Cube 预览球，未选中时显示图标。
export const SelectGizmo = ReflectionProbeComponentGizmo;
export const IconGizmo = ReflectionProbeIconGizmo;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo, IconGizmo });
