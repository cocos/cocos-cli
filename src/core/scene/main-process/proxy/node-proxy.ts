import type { INodeManager, INodeInfo, ICreateNodeOptions, IDeleteNodeOptions, IUpdateNodeOptions } from '../../common';
import { Ipc } from '../scene-worker';

export const NodeProxy: INodeManager = {
    createNode(params: ICreateNodeOptions): Promise<INodeInfo | null> {
        return Ipc.request('node', 'createNode', [params]);
    },
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo | null> {
        return Ipc.request('node', 'deleteNode', [params]);
    },
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo | null> {
        return Ipc.request('node', 'updateNode', [params]);
    },
    queryNode(): Promise<INodeInfo | null> {
        return Ipc.request('node', 'queryNode');
    }
}
