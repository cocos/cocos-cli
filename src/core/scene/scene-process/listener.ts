import { Service, ServiceEvents } from './service/core';
import type { IScriptEvents, INodeEvents, IComponentEvents, ISceneEvents } from '../common';

function onScriptExecutionFinished () {
    console.log('[Scene] Script execution-finished');
    Service.Scene.queryCurrentScene().then((scene) => {
        if (scene) {
            // releaseAsset 资源，为了让 Prefab 资源能够加载到新的脚本，在脚本更新后需要遍历释放所有的 prefab 资源
            cc.assetManager.assets.forEach((asset: any) => {
                if (asset instanceof cc.Prefab) {
                    cc.assetManager.releaseAsset(asset);
                }
            });
            console.log('[Scene] Script suspend soft reload');
            Service.Script.suspend(Promise.resolve(Service.Scene.softReload({})));
        }
    });
}

function onRepaintInEditMode () {
    void Service.Engine.repaintInEditMode();
}

export function startupListener () {
    // 移除事件
    unregisterListener();
    //
    ServiceEvents.on<IScriptEvents>('script:execution-finished', onScriptExecutionFinished);
    ServiceEvents.on<ISceneEvents>('scene:open', onRepaintInEditMode);
    ServiceEvents.on<ISceneEvents>('scene:soft-reload', onRepaintInEditMode);
    ServiceEvents.on<INodeEvents>('node:add', onRepaintInEditMode);
    ServiceEvents.on<INodeEvents>('node:remove', onRepaintInEditMode);
    ServiceEvents.on<INodeEvents>('node:update', onRepaintInEditMode);
    ServiceEvents.on<IComponentEvents>('component:add', onRepaintInEditMode);
    ServiceEvents.on<IComponentEvents>('component:remove', onRepaintInEditMode);
    ServiceEvents.on<IComponentEvents>('component:set-property', onRepaintInEditMode);
}

function unregisterListener () {
    ServiceEvents.off<IScriptEvents>('script:execution-finished', onScriptExecutionFinished);
    ServiceEvents.off<ISceneEvents>('scene:open', onRepaintInEditMode);
    ServiceEvents.off<ISceneEvents>('scene:soft-reload', onRepaintInEditMode);
    ServiceEvents.off<INodeEvents>('node:add', onRepaintInEditMode);
    ServiceEvents.off<INodeEvents>('node:remove', onRepaintInEditMode);
    ServiceEvents.off<INodeEvents>('node:update', onRepaintInEditMode);
    ServiceEvents.off<IComponentEvents>('component:add', onRepaintInEditMode);
    ServiceEvents.off<IComponentEvents>('component:remove', onRepaintInEditMode);
    ServiceEvents.off<IComponentEvents>('component:set-property', onRepaintInEditMode);
}