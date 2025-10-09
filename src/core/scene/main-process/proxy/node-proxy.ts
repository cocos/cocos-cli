import type { INodeManager, INodeInfo, ICreateNodeOptions, IDeleteNodeOptions, IUpdateNodeOptions } from '../../interfaces';
import { ipc } from '../ipc';

export const NodeProxy: INodeManager = {
    createNode(params: ICreateNodeOptions): Promise<INodeInfo> {
        return ipc.send('node', 'createNode');
    },
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo> {
        return ipc.send('node', 'deleteNode');
    },
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo> {
        return ipc.send('node', 'updateNode');
    },
    queryNode(): Promise<INodeInfo> {
        return ipc.send('node', 'queryNode');
    }
}