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
}

//
scriptManager.on('pack-build-end', (targetName: string) => {
    if (targetName === 'editor') {
        void ScriptProxy.investigatePackerDriver();
    }
});

assetManager.on('asset-db:asset-add', (uuid: string, info: any, meta: any) => {
    switch (info && info.importer) {
        case 'typescript':
        case 'javascript':
            void ScriptProxy.loadScript(uuid);
            break;
    }
});

assetManager.on('asset-db:asset-change', (uuid: string, info: any, meta: any) => {
    switch (info && info.importer) {
        case 'typescript':
        case 'javascript':
            void ScriptProxy.scriptChange(info);
            break;
    }
});

assetManager.on('asset-db:asset-delete', (uuid: string, info: any, meta: any) => {
    switch (info && info.importer) {
        case 'typescript':
        case 'javascript':
            void ScriptProxy.removeScript(info);
            break;
    }
});

