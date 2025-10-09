import type { ICreateSceneOptions, ISaveSceneOptions, IOpenSceneOptions, ISceneManager, ISceneInfo } from '../../interfaces';
import { sceneHandler } from '../../scene-subprocess';

export const SceneProxy: ISceneManager = {
    closeScene(): Promise<ISceneInfo | null> {
        return sceneHandler.closeScene();
    },
    createScene(params: ICreateSceneOptions): Promise<ISceneInfo> {
        return sceneHandler.createScene(params);
    },
    getCurrentScene(): Promise<ISceneInfo | null> {
        return sceneHandler.getCurrentScene();
    },
    openScene(params: IOpenSceneOptions): Promise<ISceneInfo> {
        return sceneHandler.openScene(params);
    },
    saveScene(params: ISaveSceneOptions): Promise<ISceneInfo> {
        return sceneHandler.saveScene(params);
    }
}