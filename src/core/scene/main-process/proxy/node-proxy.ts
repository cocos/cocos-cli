import {
    INode,
    INodeForEditor,
    INodeTreeItem,
    ICreateByNodeTypeParams,
    ICreateByAssetParams,
    IQueryNodeParams,
    IQueryNodeTreeParams,
    IUpdateNodeParams,
    IDeleteNodeParams,
    IUpdateNodeResult,
    IDeleteNodeResult,
    IPublicNodeService,
} from '../../common';
import { type ISceneForEditor } from '../../common/editor/scene';
import { Rpc } from '../rpc';

export const NodeProxy: IPublicNodeService = {
    createByType(params: ICreateByNodeTypeParams): Promise<INode | null> {
        return Rpc.getInstance().request('Node', 'createByType', [params]);
    },
    createByAsset(params: ICreateByAssetParams): Promise<INode | null> {
        return Rpc.getInstance().request('Node', 'createByAsset', [params]);
    },
    delete(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        return Rpc.getInstance().request('Node', 'delete', [params]);
    },
    update(params: IUpdateNodeParams): Promise<IUpdateNodeResult> {
        return Rpc.getInstance().request('Node', 'update', [params]);
    },
    query(params?: IQueryNodeParams | string): Promise<INode | INodeForEditor | ISceneForEditor | null> {
        return Rpc.getInstance().request('Node', 'query', [params]);
    },
    queryNodeTree(params: IQueryNodeTreeParams): Promise<INodeTreeItem | null> {
        return Rpc.getInstance().request('Node', 'queryNodeTree', [params]);
    },
};
