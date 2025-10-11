import { IpcClient } from '../ipc/ipc-client';
import { assetManager } from '../../assets';
import { IpcServer } from '../ipc/ipc-server';
import { IpcPost } from '../common';
import { managers } from './service'

export const Ipc = new IpcClient(IpcPost.SceneToMain, process, {
    'assetManager': assetManager,
});

// 启动服务器
new IpcServer(IpcPost.MainToScene, process, managers);