import {
    INode,
    INodeTreeItem,
    INodeForEditor,
    ICreateByNodeTypeParams,
    ICreateByAssetParams,
    IQueryNodeParams,
    IQueryNodeTreeParams,
    IUpdateNodeParams,
    IDeleteNodeParams,
    IUpdateNodeResult,
    IDeleteNodeResult,
    IPublicNodeService,
    ISetPropertyOptionsForEditor,
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
    },
    queryNodeTree(params: IQueryNodeTreeParams): Promise<INodeTreeItem | null> {
        return Rpc.getInstance().request('Node', 'queryNodeTree', [params]);
    },
    queryNodeDump(uuid: string): Promise<INodeForEditor | null> {
        return Rpc.getInstance().request('Node', 'queryNodeDump', [uuid]);
    },
    previewSetNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
        return Rpc.getInstance().request('Node', 'previewSetNodeProperty', [options]);
    },
    cancelPreviewSetNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
        return Rpc.getInstance().request('Node', 'cancelPreviewSetNodeProperty', [options]);
    },
    setNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
        return Rpc.getInstance().request('Node', 'setNodeProperty', [options]);
    },
    resetNode(uuid: string): Promise<boolean> {
        return Rpc.getInstance().request('Node', 'resetNode', [uuid]);
    },
    resetNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
        return Rpc.getInstance().request('Node', 'resetNodeProperty', [options]);
    },
    updateNodePropertyFromNull(options: ISetPropertyOptionsForEditor): Promise<boolean> {
        return Rpc.getInstance().request('Node', 'updateNodePropertyFromNull', [options]);
    },
    setNodeAndChildrenLayer(options: ISetPropertyOptionsForEditor): Promise<void> {
        return Rpc.getInstance().request('Node', 'setNodeAndChildrenLayer', [options]);
    },
};
