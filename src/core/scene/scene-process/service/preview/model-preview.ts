import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { DirectionalLight, Scene, Node, Prefab, instantiate } from 'cc';
import { Service } from '../core/decorator';
import { Rpc } from '../../rpc';
import { loadPreviewAsset, removePreviewAssetCache } from './asset-reload';

export class ModelPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Model Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;
    }

    // For gltf/fbx root assets, resolve to the Prefab sub-asset UUID
    // (the root asset has no .json library file — only sub-assets do)
    private async resolvePrefabUuid(uuid: string): Promise<string | null> {
        // Creator's FBX inspector explicitly passes the generated cc.Prefab
        // child to ModelPreview. A source FBX/GLTF root has no library .json,
        // therefore it must never be used as a fallback load target.
        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid, ['subAssets']]);
        if (assetInfo?.type === 'cc.Prefab') {
            return assetInfo.uuid || uuid;
        }
        for (const sub of Object.values(assetInfo?.subAssets || {}) as any[]) {
            if (sub?.type === 'cc.Prefab' || sub?.importer === 'gltf-scene') {
                return sub.uuid;
            }
        }
        return null;
    }

    public async setModel(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to set model in Model preview, by uuid: ${uuid}`);
            return null;
        }

        const prefabUuid = await this.resolvePrefabUuid(uuid);
        if (!prefabUuid) {
            throw new Error(`Unable to preview model ${uuid}: the imported cc.Prefab sub-asset is unavailable.`);
        }

        removePreviewAssetCache(uuid);
        const prefabAsset = await loadPreviewAsset<Prefab>(prefabUuid, 'model', { reloadAsset: true });

        this.cameraComp.enabled = true;

        if (this._modelNode) {
            this.scene.removeChild(this._modelNode);
            if (this._modelNode.isValid) {
                this._modelNode.destroy();
            }
        }

        this._modelNode = instantiate(prefabAsset) as Node;
        this._modelNode.parent = this.scene;

        this.resetCamera(this._modelNode);

        return await new Promise((resolve) => {
            cc.director.once(cc.Director.EVENT_AFTER_DRAW, () => {
                this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode!]));
                const engine = Service.Engine as any;
                if (typeof engine.forceRepaintInEditMode === 'function') {
                    engine.forceRepaintInEditMode();
                }
                resolve(null);
            });
            const engine = Service.Engine as any;
            if (typeof engine.forceRepaintInEditMode === 'function') {
                engine.forceRepaintInEditMode();
            } else {
                Service.Engine.repaintInEditMode();
            }
        });
    }

    public resetCameraView() {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode]));
        }
    }

    public setLightEnable(enable: boolean) {
        if (this.lightComp.enabled !== enable) {
            this.lightComp.enabled = enable;
        }
    }
}
