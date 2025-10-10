import { IpcClient } from '../ipc/ipc-client';
import { assetManager } from '../../assets/manager/asset';

export const Ipc = new IpcClient(process, {
    'assetManager': assetManager,
});
