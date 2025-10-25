import { sceneWorker } from './scene-worker';
import { SceneProxy } from './proxy/scene-proxy';
import { ScriptProxy } from './proxy/script-proxy';
import { NodeProxy } from './proxy/node-proxy';
import { ComponentProxy } from './proxy/component-proxy';
import { assetManager } from '../../assets';
import scriptManager from '../../scripting';

export interface IMainModule {
    'assetManager': typeof assetManager;
    'programming': typeof scriptManager;
}

export const Scene = {
    ...SceneProxy,
    ...ScriptProxy,
    ...NodeProxy,
    ...ComponentProxy,

    // 场景进程
    worker: sceneWorker,
};

