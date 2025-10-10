import type { ICreateSceneOptions, ISaveSceneOptions, IOpenSceneOptions, ISceneManager, ISceneInfo } from '../../common';
import { sceneWorker } from '../scene-worker';

export const SceneProxy: ISceneManager = {
    closeScene(): Promise<ISceneInfo | null> {
        return sceneWorker.request('scene', 'closeScene');
    },
    createScene(params: ICreateSceneOptions): Promise<ISceneInfo | null> {
        return sceneWorker.request<ISceneInfo | null>('scene', 'createScene', [params]);
    },
    getCurrentScene(): Promise<ISceneInfo | null> {
        return sceneWorker.request<ISceneInfo | null>('scene', 'getCurrentScene');
    },
    openScene(params: IOpenSceneOptions): Promise<ISceneInfo | null> {
        return sceneWorker.request('scene', 'openScene', [params]);
    },
    saveScene(params: ISaveSceneOptions): Promise<ISceneInfo | null> {
        return sceneWorker.request('scene', 'saveScene', [params]);
    }
}
