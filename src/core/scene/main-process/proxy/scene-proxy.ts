import type { ICreateSceneOptions, ISaveSceneOptions, IOpenSceneOptions, ISceneManager, ISceneInfo } from '../../interfaces';
import { ipc } from '../ipc';

export const SceneProxy: ISceneManager = {
    closeScene(): Promise<ISceneInfo | null> {
        return ipc.send('scene', 'closeScene');
    },
    createScene(params: ICreateSceneOptions): Promise<ISceneInfo> {
        return ipc.send('scene', 'createScene', params);
    },
    getCurrentScene(): Promise<ISceneInfo | null> {
        return ipc.request<ISceneInfo | null>('scene', 'getCurrentScene');
    },
    openScene(params: IOpenSceneOptions): Promise<ISceneInfo> {
        return ipc.send('scene', 'openScene', params);
    },
    saveScene(params: ISaveSceneOptions): Promise<ISceneInfo> {
        return ipc.send('scene', 'saveScene', params);
    }
}