import { sceneWorker } from './scene-worker';
import { EditorProxy } from './proxy/editor-proxy';
import { ScriptProxy } from './proxy/script-proxy';
import { NodeProxy } from './proxy/node-proxy';
import { ComponentProxy } from './proxy/component-proxy';
import { AssetProxy } from './proxy/asset-proxy';
import { EngineProxy } from './proxy/engine-proxy';
import { PrefabProxy } from './proxy/prefab-proxy';
import { ReflectionProbeProxy } from './proxy/reflection-probe-proxy';
import { reflectionProbeRenderer } from './reflection-probe-renderer';
import { ReferenceImageProxy } from './proxy/reference-image-proxy';

import { assetManager } from '../../assets';
import scriptManager from '../../scripting';
import { sceneConfigInstance } from '../scene-configs';
import i18n from '../../base/i18n';
import { referenceImageFiles } from './reference-image-files';
import { referenceImageStore } from './reference-image-store';

export interface IMainModule {
    'assetManager': typeof assetManager;
    'programming': typeof scriptManager;
    'sceneConfigInstance': typeof sceneConfigInstance;
    'i18n': typeof i18n;
    'reflectionProbeRenderer': typeof reflectionProbeRenderer;
    'referenceImageFiles': typeof referenceImageFiles;
    'referenceImageStore': typeof referenceImageStore;
}

export const Scene = {
    ...EditorProxy,
    ...ScriptProxy,
    ...AssetProxy,
    ...EngineProxy,
    ...PrefabProxy,
    ReferenceImage: ReferenceImageProxy,
    // 节点相关的接口
    Node: NodeProxy,
    // 组件相关的接口
    Component: ComponentProxy,
    ReflectionProbe: ReflectionProbeProxy,
    // 场景进程
    worker: sceneWorker,
};
