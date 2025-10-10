import type { INodeManager, INodeInfo, ICreateNodeOptions, IDeleteNodeOptions, IUpdateNodeOptions } from '../../interfaces';
import { ipc } from '../ipc';

export const NodeProxy: INodeManager = {
    createNode(params: ICreateNodeOptions): Promise<INodeInfo | null> {
        return ipc.request('node', 'createNode', [params]);
    },
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo | null> {
        return ipc.request('node', 'deleteNode', [params]);
    },
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo | null> {
        return ipc.request('node', 'updateNode', [params]);
    },
    queryNode(): Promise<INodeInfo | null> {
        return ipc.request<INodeInfo | null>('node', 'queryNode');
    }
}
