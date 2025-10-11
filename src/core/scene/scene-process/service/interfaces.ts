import { ISceneService, INodeService } from '../../common';

/**
 * 场景进程开放出去的模块与接口
 */
export interface ISceneModule {
    Scene: ISceneService;
    Node: INodeService,
}
