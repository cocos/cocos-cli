import { register, expose } from './decorator';
import type { ICreateNodeParams, IDeleteNodeParams, INodeService, IUpdateNodeParams, IUpdateNodeResult, IQueryNodeParams, INode, IDeleteNodeResult } from '../../common';
import { Rpc } from '../rpc';
/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Node')
export class NodeService implements INodeService {
    _nodeConfigJson: Record<string, object> = {};
    _

    constructor() {
        this._nodeConfigJson = JSON.parse("../../common/node-config.json");
    }

    @expose()
    async createNode(params: ICreateNodeParams): Promise<INode | null> {
        //create from prefab resource
        const scene = cc.director().getScene();
        if (params.assetPath) {
            const uuid = await Rpc.request('assetManager', 'queryUUID', [params.assetPath]);
            return null;
        }

        const createOptions = this._nodeConfigJson[params.nodeType];
        if (!createOptions) {
            throw new Error('NodeService.createNode nodeType ${params.nodeType} not implement .');
        }
        return null;
    }

    @expose()
    async deleteNode(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        // TODO: 实现节点删除逻辑
        console.log('NodeService.deleteNode called with params:', params);
        throw new Error('NodeService.deleteNode not implemented yet.');
    }

    @expose()
    async updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult | null> {
        // TODO: 实现节点更新逻辑
        console.log('NodeService.updateNode called with params:', params);
        throw new Error('NodeService.updateNode not implemented yet.');
    }

    @expose()
    async queryNode(params: IQueryNodeParams): Promise<INode | null> {
        // TODO: 实现节点查询逻辑
        console.log('NodeService.queryNode called');
        throw new Error('NodeService.queryNode not implemented yet.');
    }
}
