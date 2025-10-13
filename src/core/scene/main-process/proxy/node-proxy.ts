import type { INodeService, INodeInfo, ICreateNodeOptions, INodeIdentifier, IUpdateNodeOptions, IDeleteNodeOptions } from '../../common';
import { Rpc } from '../rpc';

export const NodeProxy: INodeService = {
    createNode(params: ICreateNodeOptions): Promise<INodeInfo | null> {
        return Rpc.request('Node', 'createNode', [params]);
    },
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo | null> {
        return Rpc.request('Node', 'deleteNode', [params]);
    },
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo | null> {
        return Rpc.request('Node', 'updateNode', [params]);
    },
    queryNode(identifier: INodeIdentifier): Promise<INodeInfo | null> {
        return Rpc.request('Node', 'queryNode', [identifier]);
    }
}
