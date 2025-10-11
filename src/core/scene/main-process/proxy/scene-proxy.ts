import type { ICreateSceneOptions, ISaveSceneOptions, IOpenSceneOptions, ISceneService, ISceneInfo } from '../../common';
import { Rpc } from '../rpc';

export const SceneProxy: ISceneService = {
    closeScene(): Promise<ISceneInfo | null> {
        return Rpc.request('Scene', 'closeScene');
    },
    createScene(params: ICreateSceneOptions): Promise<ISceneInfo | null> {
        return Rpc.request('Scene', 'createScene', [params]);
    },
    getCurrentScene(): Promise<ISceneInfo | null> {
        return Rpc.request('Scene', 'getCurrentScene');
    },
    openScene(params: IOpenSceneOptions): Promise<ISceneInfo | null> {
        return Rpc.request('Scene', 'openScene', [params]);
    },
    saveScene(params: ISaveSceneOptions): Promise<ISceneInfo | null> {
        return Rpc.request('Scene', 'saveScene', [params]);
    }
}
