import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { DirectionalLight, Material, Mesh, MeshRenderer, Scene, Node } from 'cc';
import { loadPreviewAsset } from './asset-reload';

export class MeshPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;
    private _modelComp!: MeshRenderer;
    private _defaultMat!: Material;

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Mesh Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;

        this._modelNode = new Node('Mesh Preview Mesh');
        this._modelNode.parent = scene;
        this._modelComp = this._modelNode.addComponent(MeshRenderer);
        this._defaultMat = new Material();
        this._defaultMat.initialize({ effectName: 'builtin-standard' });
        this._modelComp.material = this._defaultMat;
    }

    public async setMesh(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to set mesh in Mesh preview, by uuid: ${uuid}`);
            return null;
        }

        try {
            const meshAsset = await loadPreviewAsset<Mesh>(uuid, 'mesh');

            this._modelComp.mesh = meshAsset;
            this._modelNode!.parent = this.scene;

            for (let i = 0; i < this._modelComp.mesh!.struct.primitives.length; i++) {
                this._modelComp.setMaterial(this._defaultMat, i);
            }
            this.cameraComp.enabled = true;
            this.resetCameraView();
        } catch (e) {
            console.warn(e);
        }
    }

    public resetCameraView() {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode]));
        }
    }
}
