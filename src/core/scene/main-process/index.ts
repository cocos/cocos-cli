import { sceneWorker } from './scene-worker';
import { EditorProxy } from './proxy/editor-proxy';
import { ScriptProxy } from './proxy/script-proxy';
import { NodeProxy } from './proxy/node-proxy';
import { ComponentProxy } from './proxy/component-proxy';
import { AssetProxy } from './proxy/asset-proxy';
import { EngineProxy } from './proxy/engine-proxy';
import { PrefabProxy } from './proxy/prefab-proxy';

import { assetManager } from '../../assets';
import scriptManager from '../../scripting';

export interface IMainModule {
    'assetManager': typeof assetManager;
    'programming': typeof scriptManager;
}

export const Scene = {
    ...EditorProxy,
    ...ScriptProxy,
    ...NodeProxy,
    ...ComponentProxy,
    ...AssetProxy,
    ...EngineProxy,
    ...PrefabProxy,

    // 场景进程
    worker: sceneWorker,
};
