import type { INodeManager, INodeInfo, ICreateNodeOptions, IDeleteNodeOptions, IUpdateNodeOptions } from '../../common';
import { sceneWorker } from '../scene-worker';

export const NodeProxy: INodeManager = {
    createNode(params: ICreateNodeOptions): Promise<INodeInfo | null> {
        return sceneWorker.request('node', 'createNode', [params]);
    },
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo | null> {
        return sceneWorker.request('node', 'deleteNode', [params]);
    },
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo | null> {
        return sceneWorker.request('node', 'updateNode', [params]);
    },
    queryNode(): Promise<INodeInfo | null> {
        return sceneWorker.request<INodeInfo | null>('node', 'queryNode');
    }
}
