import type { INodeService, IQueryNodeResultItem, ICreateNodeParams, IQueryNodeParams, IUpdateNodeParams, IDeleteNodeParams, IUpdateNodeResult } from '../../common';
import { Rpc } from '../rpc';

export const NodeProxy: INodeService = {
    createNode(params: ICreateNodeParams): Promise<IQueryNodeResultItem | null> {
        return Rpc.request('Node', 'createNode', [params]);
    },
    deleteNode(params: IDeleteNodeParams): Promise<boolean> {
        return Rpc.request('Node', 'deleteNode', [params]);
    },
    updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult | null> {
        return Rpc.request('Node', 'updateNode', [params]);
    },
    queryNode(identifier: IQueryNodeParams): Promise<IQueryNodeResultItem | null> {
        return Rpc.request('Node', 'queryNode', [identifier]);
    }
}
