import { InteractivePreview } from './interactive-preview';
import { DirectionalLight, Scene, Node, Vec3 } from 'cc';
import { Service } from '../core/decorator';
import { loadPreviewAsset } from './asset-reload';

export class SkeletonPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;
    private jointNodes: Node[] = [];

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Skeleton Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;
    }

    public async setSkeleton(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to set skeleton in Skeleton preview, by uuid: ${uuid}`);
            return;
        }

        this.clearJoints();

        try {
            const skeleton = await loadPreviewAsset<any>(uuid, 'skeleton');

            if (!skeleton || !skeleton.joints) {
                return;
            }

            this._modelNode = new Node('Skeleton Root');
            this._modelNode.parent = this.scene;

            const joints = skeleton.joints;
            const bindposes = skeleton.bindposes;

            for (let i = 0; i < joints.length; i++) {
                const jointNode = new Node(`Joint_${i}`);
                jointNode.parent = this._modelNode;

                if (bindposes && bindposes[i]) {
                    const bp = bindposes[i];
                    jointNode.setWorldPosition(new Vec3(bp.m12, bp.m13, bp.m14));
                }
                this.jointNodes.push(jointNode);
            }

            this.cameraComp.enabled = true;
            this.resetCameraView();

            const geometryRenderer = (Service.Engine as any).getGeometryRenderer?.();
            if (geometryRenderer) {
                this.drawSkeletonLines(geometryRenderer);
            }
        } catch (e) {
            console.warn(e);
        }
    }

    private drawSkeletonLines(geometryRenderer: any) {
        if (!this.jointNodes.length) return;

        for (let i = 1; i < this.jointNodes.length; i++) {
            const joint = this.jointNodes[i];
            const parent = this.jointNodes[0];
            if (joint && parent) {
                try {
                    geometryRenderer.addLine(
                        parent.worldPosition,
                        joint.worldPosition,
                        cc.Color.GREEN,
                    );
                } catch {
                    // geometryRenderer may not support addLine
                }
            }
        }
    }

    private clearJoints() {
        if (this._modelNode && this._modelNode.isValid) {
            this._modelNode.destroy();
            this._modelNode.parent = null;
        }
        this.jointNodes = [];
    }

    public resetCameraView() {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.autoPerfectCameraViewOnModel(this._modelNode);
        }
    }
}
