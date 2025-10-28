import {
    ICloseSceneOptions,
    ICreateSceneOptions,
    IOpenSceneOptions, IPublicSceneService,
    ISaveSceneOptions,
    IScene,
    ISceneIdentifier,
    ISoftReloadSceneOptions
} from '../../common';
import { Rpc } from '../rpc';

export const SceneProxy: IPublicSceneService = {
    open(params: IOpenSceneOptions): Promise<IScene> {
        return Rpc.getInstance().request('Scene', 'open', [params]);
    },
    close(params: ICloseSceneOptions): Promise<boolean> {
        return Rpc.getInstance().request('Scene', 'close', [params]);
    },
    save(params: ISaveSceneOptions): Promise<boolean> {
        return Rpc.getInstance().request('Scene', 'save', [params]);
    },
    reload(): Promise<boolean> {
        return Rpc.getInstance().request('Scene', 'reload');
    },
    softReload(params: ISoftReloadSceneOptions): Promise<IScene> {
        return Rpc.getInstance().request('Scene', 'softReload', [params]);
    },
    create(params: ICreateSceneOptions): Promise<ISceneIdentifier> {
        return Rpc.getInstance().request('Scene', 'create', [params]);
    },
    queryCurrentScene(): Promise<IScene | null> {
        return Rpc.getInstance().request('Scene', 'queryCurrentScene');
    },
    queryScenes(): Promise<IScene[]> {
        return Rpc.getInstance().request('Scene', 'queryScenes');
    }
};