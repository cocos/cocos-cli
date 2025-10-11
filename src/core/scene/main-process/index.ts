import { sceneWorker } from './scene-worker';
import { SceneProxy } from './proxy/scene-proxy';
import { NodeProxy } from './proxy/node-proxy';
import { assetManager } from '../../assets';

export interface IMainModule {
    'assetManager': typeof assetManager;
}

export const Scene = {
    ...SceneProxy,
    ...NodeProxy,

    // 场景进程
    worker: sceneWorker
}

