import type { ICreateNodeOptions, IDeleteNodeOptions, INodeInfo, INodeManager, IUpdateNodeOptions } from '../../interfaces';

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
export class NodeManager implements INodeManager {
    createNode(params: ICreateNodeOptions): Promise<INodeInfo> {
        throw new Error('Method not implemented.');
    }
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo> {
        throw new Error('Method not implemented.');
    }
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo> {
        throw new Error('Method not implemented.');
    }
    queryNode(): Promise<INodeInfo | null> {
        throw new Error('Method not implemented.');
    }
}

export const nodeManager = new NodeManager();
