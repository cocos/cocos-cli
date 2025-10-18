import {
    ICloseSceneOptions,
    ICreateSceneOptions,
    IOpenSceneOptions,
    ISaveSceneOptions,
    IScene,
    ISceneIdentifier,
    ISceneService,
    ISoftReloadSceneOptions
} from '../../common';
import { Rpc } from '../rpc';

export const SceneProxy: ISceneService = {
    open(params: IOpenSceneOptions): Promise<IScene> {
        return Rpc.request('Scene', 'open', [params]);
    },
    close(params: ICloseSceneOptions): Promise<boolean> {
        return Rpc.request('Scene', 'close', [params]);
    },
    save(params: ISaveSceneOptions): Promise<boolean> {
        return Rpc.request('Scene', 'save', [params]);
    },
    reload(): Promise<boolean> {
        return Rpc.request('Scene', 'reload');
    },
    softReload(params: ISoftReloadSceneOptions): Promise<IScene> {
        return Rpc.request('Scene', 'softReload', [params]);
    },
    create(params: ICreateSceneOptions): Promise<ISceneIdentifier> {
        return Rpc.request('Scene', 'create', [params]);
    },
    queryCurrentScene(): Promise<IScene | null> {
        return Rpc.request('Scene', 'queryCurrentScene', []);
    },
    queryScenes(): Promise<IScene[]> {
        return Rpc.request('Scene', 'queryScenes');
    }
}