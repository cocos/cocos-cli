'use strict';

import { geometry, js, MeshRenderer, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import BoxController from '../../controller/box';
import { LightProbeTetraHelper } from '../../utils/light-probe-tetra';
import { registerGizmo } from '../../gizmo-defines';

const tempQuat_a = new Quat();
const tempSize = new Vec3();

class ModelComponentGizmo extends GizmoBase<MeshRenderer> {
    private _controller!: BoxController;
    private _tetraHelper!: LightProbeTetraHelper;

    init() {
        this._controller = new BoxController(this.getGizmoRoot());
        this._tetraHelper = new LightProbeTetraHelper(this.getGizmoRoot());
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
        this._tetraHelper.hide();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const node = this.target.node;
        const boundingBox = this.getBoundingBox(this.target);
        if (boundingBox) {
            this._controller.show();

            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setScale(worldScale);
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);

            Vec3.multiplyScalar(tempSize, boundingBox.halfExtents, 2);
            this._controller.updateSize(boundingBox.center, tempSize);
        } else {
            this._controller.hide();
        }

        // 影响该物体的光照探针四面体连线（仅当开启“使用光照探针”时显示）
        this._tetraHelper.update(this.target);
    }

    private getBoundingBox(component: MeshRenderer): geometry.AABB | null {
        let bb = component.model && component.model.modelBounds;
        if (!bb) {
            const mesh = component.mesh;
            if (mesh && mesh.minPosition && mesh.maxPosition) {
                bb = geometry.AABB.fromPoints(geometry.AABB.create(), mesh.minPosition, mesh.maxPosition);
            }
        }
        return bb || null;
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }

    onUpdate() {
        // 每帧调用，靠 helper 内部签名缓存兜底：签名含 tetrahedronIndex/volume/reduceRinging/
        // 顶点位置/SH 首系数，未变化时廉价短路，变化时（含移动跨四面体、球体积/reduceRinging 调整）才重建。
        if (this.target) this._tetraHelper.update(this.target);
    }

    // 探针数据变化（探针组重生成/烘焙等，可能不改 index/签名输入）时失效缓存并强制刷新
    onLightProbeChanged() {
        this._tetraHelper.invalidate();
        if (this.target) this._tetraHelper.update(this.target);
    }

    onDestroy() {
        this._tetraHelper?.destroy();
    }
}

export const name = js.getClassName(MeshRenderer);
export const SelectGizmo = ModelComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
