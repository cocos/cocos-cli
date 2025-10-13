import { register, expose } from './decorator';
import type { ICreateNodeOptions, IDeleteNodeOptions, INodeInfo, INodeService, IUpdateNodeOptions, INodeIdentifier } from '../../common';
import { Node } from 'cc';
/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Node')
export class NodeService implements INodeService {
    _nodeConfigJson = {};

    constructor() {
        this._nodeConfigJson = JSON.parse("../../common/node-config.json");
    }

    @expose()
    async createNode(params: ICreateNodeOptions): Promise<INodeInfo> {
        console.log('NodeService.createNode called with params:', params);
        throw new Error('NodeService.createNode not implemented yet.');
    }
    
    @expose()
    async deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo> {
        // TODO: 实现节点删除逻辑
        console.log('NodeService.deleteNode called with params:', params);
        throw new Error('NodeService.deleteNode not implemented yet.');
    }
    
    @expose()
    async updateNode(params: IUpdateNodeOptions): Promise<INodeInfo> {
        // TODO: 实现节点更新逻辑
        console.log('NodeService.updateNode called with params:', params);
        throw new Error('NodeService.updateNode not implemented yet.');
    }
    
    @expose()
    async queryNode(params: INodeIdentifier): Promise<INodeInfo | null> {
        // TODO: 实现节点查询逻辑
        console.log('NodeService.queryNode called');
        throw new Error('NodeService.queryNode not implemented yet.');
    }
}
