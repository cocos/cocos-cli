import {
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
import { INodeInfo } from '../../common/cli/node';
import { Rpc } from '../rpc';
import { DumpConverter } from './dump-converter';

export interface INodeProxy extends Omit<IPublicNodeService, 'createByType' | 'createByAsset' | 'query'> {
    createByType(params: ICreateByNodeTypeParams): Promise<INodeInfo | null>;
    createByAsset(params: ICreateByAssetParams): Promise<INodeInfo | null>;
    query(params?: IQueryNodeParams): Promise<INodeInfo | null>;
}

export const NodeProxy: INodeProxy = {
    async createByType(params: ICreateByNodeTypeParams): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'createByType', [params]);
        return result ? DumpConverter.toNode(result, { children: true }) : null;
    },
    async createByAsset(params: ICreateByAssetParams): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'createByAsset', [params]);
        return result ? DumpConverter.toNode(result, { children: true }) : null;
    },
    delete(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        return Rpc.getInstance().request('Node', 'delete', [params]);
    },
    update(params: IUpdateNodeParams): Promise<IUpdateNodeResult> {
        return Rpc.getInstance().request('Node', 'update', [params]);
    },
    async query(params?: IQueryNodeParams): Promise<INodeInfo | null> {
        const result: any = await Rpc.getInstance().request('Node', 'query', [params]);
        if (!result) return null;
        return DumpConverter.toNode(result, { path: params?.path, fullComponents: true });
    },
    queryNodeTree(params: IQueryNodeTreeParams): Promise<INodeTreeItem | null> {
        return Rpc.getInstance().request('Node', 'queryNodeTree', [params]);
    },
};
