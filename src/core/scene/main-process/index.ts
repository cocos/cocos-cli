import { SceneProxy } from './proxy/scene-proxy';
import { NodeProxy } from './proxy/node-proxy';
import { sceneWorker } from './scene-worker';

export const Scene = {
    ...SceneProxy,
    ...NodeProxy,

    // 场景进程
    worker: sceneWorker
}

