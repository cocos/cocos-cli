import { ISceneService } from './scene';

/**
 * 节点信息
 */
export interface INodeInfo {
    
}

/**
 * 创建节点参数
 */
export interface ICreateNodeOptions {

}

/**
 * 删除节点参数
 */
export interface IDeleteNodeOptions {

}

/**
 * 更新节点参数
 */
export interface IUpdateNodeOptions {

}

/**
 * 节点的相关处理接口
 */
export interface INodeService {
    /**
     * 创建节点
     * @param params
     */
    createNode(params: ICreateNodeOptions): Promise<INodeInfo | null>;
    /**
     * 删除节点
     * @param params 
     */
    deleteNode(params: IDeleteNodeOptions): Promise<INodeInfo | null>;
    /**
     * 更新节点
     * @param params
     */
    updateNode(params: IUpdateNodeOptions): Promise<INodeInfo | null>;
    /**
     * 查询节点
     */
    queryNode(): Promise<INodeInfo | null>;
}
