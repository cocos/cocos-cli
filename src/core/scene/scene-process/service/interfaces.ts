import {
    IPublicSceneService,
    IPublicNodeService,
    IPublicComponentService,
    IPublicScriptService,
    ISceneService,
    INodeService,
    IComponentService,
    IScriptService
} from '../../common';

/**
 * 场景进程开放出去的模块与接口
 */
export interface IPublicServiceManager {
    Scene: IPublicSceneService;
    Node: IPublicNodeService;
    Component: IPublicComponentService;
    Script: IPublicScriptService,
}

export interface IServiceManager {
    Scene: ISceneService;
    Node: INodeService;
    Component: IComponentService;
    Script: IScriptService,
}
