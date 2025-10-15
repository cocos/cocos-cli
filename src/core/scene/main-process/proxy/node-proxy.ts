import type { INodeService, INode, ICreateNodeParams, IQueryNodeParams, IUpdateNodeParams, IDeleteNodeParams, IUpdateNodeResult, IDeleteNodeResult } from '../../common';
import { Rpc } from '../rpc';

export const NodeProxy: INodeService = {
    createNode(params: ICreateNodeParams): Promise<INode | null> {
        return Rpc.request('Node', 'createNode', [params]);
    },
    deleteNode(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        return Rpc.request('Node', 'deleteNode', [params]);
    },
    updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult | null> {
        return Rpc.request('Node', 'updateNode', [params]);
    },
    queryNode(params: IQueryNodeParams): Promise<INode | null> {
        return Rpc.request('Node', 'queryNode', [params]);
    }
}
