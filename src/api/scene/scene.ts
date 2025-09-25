import { ApiBase } from "../base/api-base";
import { director, Scene, Node } from 'cc';

export class SceneApi extends ApiBase {
    scene: Scene | null = null;
    async init(): Promise<void> {
        // noop
    }
    createScene(name: string): void {
        this.scene = new Scene(name);
        director.runSceneImmediate(this.scene);
    }
    createNode(name: string): void {
        if (!this.scene) {
            return;
        }
        const node = new Node(name);
        this.scene.addChild(node);
    }
    deleteNode(path: string): void {
        this.scene?.getChildByPath(path)?.destroy();
    }
}
