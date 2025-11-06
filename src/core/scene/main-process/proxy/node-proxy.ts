import {
    INode,
    ICreateByNodeTypeParams,
    ICreateByAssetParams,
    IQueryNodeParams,
    IUpdateNodeParams,
    IDeleteNodeParams,
    IUpdateNodeResult,
    IDeleteNodeResult,
    IPublicNodeService,
} from '../../common';
import { Rpc } from '../rpc';

export const NodeProxy: IPublicNodeService = {
    createNodeByType(params: ICreateByNodeTypeParams): Promise<INode | null> {
        return Rpc.getInstance().request('Node', 'createNodeByType', [params]);
    },
    createNodeByAsset(params: ICreateByAssetParams): Promise<INode | null> {
        return Rpc.getInstance().request('Node', 'createNodeByAsset', [params]);
    },
    deleteNode(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        return Rpc.getInstance().request('Node', 'deleteNode', [params]);
    },
    updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult> {
        return Rpc.getInstance().request('Node', 'updateNode', [params]);
    },
    queryNode(params: IQueryNodeParams): Promise<INode | null> {
        return Rpc.getInstance().request('Node', 'queryNode', [params]);
    }
};
