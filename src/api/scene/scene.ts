import { ApiBase } from "../base/api-base";
import { director, Scene, Node } from 'cc';
import { Description, Title, Tool } from "../decorator/decorator";

export class SceneApi extends ApiBase {
    scene: Scene | null = null;
    async init(): Promise<void> {
        // noop
    }
    /**
     * Create scene
     * @tool Scene
     * @title Create scene
     */
    @Tool('Scene')
    @Title('Create scene')
    @Description('Create a new scene')
    createScene(name: string): void {
        this.scene = new Scene(name);
        director.runSceneImmediate(this.scene);
    }
    /**
     * Create node
     * @tool Scene
     * @title Create node
     * @description Create a new node in current scene
     * @param name Node name
     * @returns void
     */
    @Tool('Scene')
    @Title('Create node')
    @Description('Create a new node in current scene')
    createNode(name: string): void {
        if (!this.scene) {
            return;
        }
        const node = new Node(name);
        this.scene.addChild(node);
    }
    /**
     * Delete node
     * @tool Scene
     * @title Delete node
     * @description Delete a node by path in current scene
     * @param path Node path
     * @return void
     */
    @Tool('Scene')
    @Title('Delete node')
    @Description('Delete a node by path in current scene')
    deleteNode(path: string): void {
        this.scene?.getChildByPath(path)?.destroy();
    }
}
