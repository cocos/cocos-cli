import type { INodeManager, INodeInfo, ICreateNodeOptions, IDeleteNodeOptions, IUpdateNodeOptions } from '../../interfaces';
import { ipc } from '../ipc';

export const NodeProxy: INodeManager = {
    createNode(params: ICreateNodeOptions): Promise<INodeInfo> {
        return ipc.send('node', 'createNode', params);
    },
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo> {
        return ipc.send('node', 'deleteNode', params);
    },
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo> {
        return ipc.send('node', 'updateNode', params);
    },
    queryNode(): Promise<INodeInfo | null> {
        return ipc.request<INodeInfo | null>('node', 'queryNode');
    }
}