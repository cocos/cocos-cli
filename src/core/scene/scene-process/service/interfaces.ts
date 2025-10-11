import { ISceneServer, INodeServer } from '../../common';

/**
 * 场景进程开发出去的模块与接口
 */
export interface ISceneModule {
    Scene: ISceneServer;
    Node: INodeServer
}
