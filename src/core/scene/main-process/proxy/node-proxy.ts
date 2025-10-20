import type { INodeService, INode, ICreateByNodeTypeParams, ICreateByAssetParams, IQueryNodeParams, IUpdateNodeParams, IDeleteNodeParams, IUpdateNodeResult, IDeleteNodeResult } from '../../common';
import { Rpc } from '../rpc';

export const NodeProxy: INodeService = {
    createNodeByType(params: ICreateByNodeTypeParams): Promise<INode | null> {
        return Rpc.request('Node', 'createNodeByType', [params]);
    },
    createNodeByAsset(params: ICreateByAssetParams): Promise<INode | null> {
        return Rpc.request('Node', 'createNodeByAsset', [params]);
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
