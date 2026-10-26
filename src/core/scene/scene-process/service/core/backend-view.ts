import { Camera, CCObject, director, Node, Quat, Vec3 } from 'cc';
import { Rpc } from '../../rpc';
import { BaseService } from './base-service';
import { register, queryRegisteredService, Service } from './decorator';

/** Non-interactive scene context for API calculations and ephemeral reference-image nodes. */
@register('BackendView')
class BackendView extends BaseService<Record<string, never>> {
    is2D = false;
    private root: Node | null = null;
    private camera: Camera | null = null;

    async init() {
        const config = await Rpc.getInstance().request('sceneConfigInstance', 'get', ['gizmo']);
        this.is2D = Boolean((config as any)?.is2D);
    }
    getBackground(): Node {
        const scene = director.getScene();
        if (!scene) throw new Error('No scene is open.');
        if (!this.root || !this.root.isValid || this.root.scene !== scene) {
            this.root?.destroy();
            this.root = new Node('CLI scene context');
            this.root.objFlags |= CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
            this.root.parent = scene;
            this.camera = null;
        }
        return this.root;
    }
    async getCamera(): Promise<Camera> {
        const host = queryRegisteredService<any>('Camera');
        const interactiveCamera = host?.getCamera?.();
        if (interactiveCamera) return interactiveCamera;
        const root = this.getBackground();
        if (!this.camera?.isValid) {
            const node = new Node('CLI measurement camera');
            node.objFlags |= CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
            node.parent = root;
            this.camera = node.addComponent(Camera);
            this.camera.inEditorMode = true; // Attach to the worker's offscreen main window.
            this.camera.visibility = 0; // Used for projection calculations, never for editor rendering.
        }
        const config: any = await Rpc.getInstance().request('sceneConfigInstance', 'get', ['camera', 'local']);
        const infos: any = await Rpc.getInstance().request('sceneConfigInstance', 'get', ['camera-infos', 'local']);
        const session = (Service.Editor as any).getEditorSession();
        const saved = infos?.[session.uuid];
        this.camera.fov = config?.fov ?? 45;
        this.camera.near = config?.near ?? 0.01;
        this.camera.far = config?.far ?? 10000;
        if (saved?.position) this.camera.node.setWorldPosition(new Vec3(saved.position.x, saved.position.y, saved.position.z));
        else this.camera.node.setWorldPosition(new Vec3(10, 10, 10));
        if (saved?.rotation) this.camera.node.setWorldRotation(new Quat(saved.rotation.x, saved.rotation.y, saved.rotation.z, saved.rotation.w));
        else this.camera.node.lookAt(Vec3.ZERO);
        this.camera.camera?.update(true);
        return this.camera;
    }
    onEditorClosed() { this.root?.destroy(); this.root = null; this.camera = null; }
}

export const backendView = queryRegisteredService<BackendView>('BackendView')!;
