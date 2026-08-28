import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { Scene, Node, assetManager, DirectionalLight, Canvas } from 'cc';
import { Service } from '../core/decorator';
import type { ISpinePreviewInstance } from '../../../common/preview';
import { loadPreviewAsset } from './asset-reload';

export class SpinePreview extends InteractivePreview implements ISpinePreviewInstance {
    protected is2D = true;
    protected enableViewToggle = false;
    protected orthoScale = 0.6;

    private skeletonComponent: any = null;
    private _spineData: any = null;
    private _animTimer: NodeJS.Timeout | null = null;

    public createNodes(scene: Scene) {
        const lightNode = new Node('Spine Preview Light');
        lightNode.addComponent(DirectionalLight);
        lightNode.setRotationFromEuler(-45, -45, 0);
        scene.addChild(lightNode);

        const canvasNode = new Node('Canvas');
        canvasNode.addComponent(Canvas);
        scene.addChild(canvasNode);

        this._modelNode = new Node('Spine');
        this._modelNode.setPosition(0, 0, 0);
        canvasNode.addChild(this._modelNode);

        const SpineClass = cc.js.getClassByName('sp.Skeleton');
        if (SpineClass) {
            this.skeletonComponent = this._modelNode.addComponent(SpineClass as any);
        }
    }

    public async setSpine(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to set spine in Spine preview, by uuid: ${uuid}`);
            return;
        }

        if (!this.skeletonComponent) {
            console.warn('[SpinePreview] sp.Skeleton component not available');
            return;
        }

        this.close();

        try {
            const skeletonData = await loadPreviewAsset<any>(uuid, 'spine');

            this.skeletonComponent.node.active = true;
            this.skeletonComponent.skeletonData = skeletonData;

            this.cameraComp.enabled = true;
            this.resetCamera(this.skeletonComponent.node);
            this.perfectCameraView(getBoundaryOfMeshNodes([this.skeletonComponent.node]));

            this._spineData = {
                skins: this.skeletonComponent.getSkins?.() || [],
                animations: this.skeletonComponent.getAnimations?.() || [],
            };

            if (this._spineData.animations.length > 0) {
                this.skeletonComponent.animation = this._spineData.animations[0];
            }

            this.startAnimationUpdate();
        } catch (e) {
            console.warn(e);
        }
    }

    public getSpineData() {
        return this._spineData;
    }

    public play() {
        if (this.skeletonComponent) {
            this.skeletonComponent.paused = false;
        }
    }

    public pause() {
        if (this.skeletonComponent) {
            this.skeletonComponent.paused = true;
        }
    }

    public stop() {
        if (this.skeletonComponent) {
            this.skeletonComponent.clearAnimation(0);
        }
    }

    public setSkinIndex(index: number) {
        if (this.skeletonComponent && this._spineData?.skins?.[index]) {
            this.skeletonComponent.setSkin(this._spineData.skins[index]);
        }
    }

    public setAnimationIndex(index: number) {
        if (this.skeletonComponent && this._spineData?.animations?.[index]) {
            this.skeletonComponent.animation = this._spineData.animations[index];
        }
    }

    private startAnimationUpdate() {
        this.stopAnimationUpdate();
        this._animTimer = setInterval(() => {
            Service.Engine.repaintInEditMode();
        }, 1000 / 30);
    }

    private stopAnimationUpdate() {
        if (this._animTimer) {
            clearInterval(this._animTimer);
            this._animTimer = null;
        }
    }

    public close() {
        this.stopAnimationUpdate();
        if (this.skeletonComponent) {
            if (this.skeletonComponent.skeletonData) {
                const uuid = this.skeletonComponent.skeletonData.uuid;
                if (uuid && assetManager.assets.has(uuid)) {
                    assetManager.releaseAsset(assetManager.assets.get(uuid)!);
                    assetManager.assets.remove(uuid);
                }
            }
            this.skeletonComponent.node.active = false;
        }
        this._spineData = null;
    }

    public resetCameraView() {
        if (!this.skeletonComponent) return;
        this.resetCamera(this.skeletonComponent.node);
        this.perfectCameraView(getBoundaryOfMeshNodes([this.skeletonComponent.node]));
    }
}
