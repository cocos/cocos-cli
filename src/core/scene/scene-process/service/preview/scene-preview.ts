import { Layers, Camera, CameraComponent } from 'cc';
import PreviewBuffer from './buffer';
import { PreviewBase } from './preview-base';

const editorMask = Layers.makeMaskInclude([Layers.Enum.GIZMOS, Layers.Enum.SCENE_GIZMO, Layers.Enum.EDITOR]);

export class ScenePreview extends PreviewBase {
    device: any;
    width = 0;
    height = 0;

    public init(registerName: string, queryName: string) {
        this.device = cc.director.root.device;
        this.width = this.device.width;
        this.height = this.device.height;

        this.previewBuffer = new PreviewBuffer(registerName, queryName);
        this.previewBuffer.on('loadScene', this.detachSceneCameras.bind(this));
    }

    public onComponentAdded(comp: CameraComponent) {
        if (!comp) return;
        if (comp instanceof Camera) {
            if (comp.node?.layer & editorMask) return;
            Promise.resolve().then(() => {
                if (comp.camera) comp.camera.detachCamera();
            });
        }
    }

    detachSceneCameras() {
        const cameras = this.previewBuffer.renderScene!.cameras;
        for (const camera of cameras) {
            if (camera.node.layer & editorMask) {
                continue;
            }
            const comp = camera.node.getComponent('cc.Camera');
            if (comp && !camera.node.isPrivatePreview) {
                camera.detachCamera();
            }
        }
        cc.director.root.tempWindow = this.previewBuffer.window;
    }
}

export const scenePreview = new ScenePreview();
