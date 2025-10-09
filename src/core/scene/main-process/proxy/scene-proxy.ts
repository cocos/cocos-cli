import type { ICreateSceneOptions, ISaveSceneOptions, IOpenSceneOptions, ISceneManager, ISceneInfo } from '../../interfaces';
import { sceneManager } from '../../scene-process';

export const SceneProxy: ISceneManager = {
    closeScene(): Promise<ISceneInfo | null> {
        return sceneManager.closeScene();
    },
    createScene(params: ICreateSceneOptions): Promise<ISceneInfo> {
        return sceneManager.createScene(params);
    },
    getCurrentScene(): Promise<ISceneInfo | null> {
        return sceneManager.getCurrentScene();
    },
    openScene(params: IOpenSceneOptions): Promise<ISceneInfo> {
        return sceneManager.openScene(params);
    },
    saveScene(params: ISaveSceneOptions): Promise<ISceneInfo> {
        return sceneManager.saveScene(params);
    }
}