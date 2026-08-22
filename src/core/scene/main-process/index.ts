import { sceneWorker } from './scene-worker';
import { EditorProxy } from './proxy/editor-proxy';
import { ScriptProxy } from './proxy/script-proxy';
import { NodeProxy } from './proxy/node-proxy';
import { ComponentProxy } from './proxy/component-proxy';
import { AssetProxy } from './proxy/asset-proxy';
import { EngineProxy } from './proxy/engine-proxy';
import { PrefabProxy } from './proxy/prefab-proxy';
import { ScreenshotProxy } from './proxy/screenshot-proxy';

import { assetManager } from '../../assets';
import scriptManager from '../../scripting';
import { sceneConfigInstance } from '../scene-configs';
import i18n from '../../base/i18n';
import { browserSceneState } from '../browser-scene-state';

export interface IMainModule {
    'assetManager': typeof assetManager;
    'programming': typeof scriptManager;
    'sceneConfigInstance': typeof sceneConfigInstance;
    'i18n': typeof i18n;
    'browserSceneState': typeof browserSceneState;
}

export const Scene = {
    ...EditorProxy,
    ...ScriptProxy,
    ...AssetProxy,
    ...EngineProxy,
    ...PrefabProxy,
    // 节点相关的接口
    Node: NodeProxy,
    // 组件相关的接口
    Component: ComponentProxy,
    // 场景截图
    Screenshot: ScreenshotProxy,
    // 场景进程
    worker: sceneWorker,
};
