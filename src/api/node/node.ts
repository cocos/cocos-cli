import { ApiBase } from '../base/api-base';
import { NodeQueryScheme, NodeQueryResultScheme, NodeUpdateScheme, NodeUpdateResultScheme, TNodeQueryOptions, TNodeQueryResult, TNodeUpdateOptions, TNodeUpdateResult } from './scheme';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/scheme-base';
import { Scene } from '../../core/scene';

export class NodeApi extends ApiBase {

    constructor(
        private projectPath: string,
        private enginePath: string
    ) {
        super();
    }

    async init(): Promise<void> {
    }

    /**
     * 查询节点
     */
    @tool('node-query-nodes')
    @title('查询节点')
    @description('在 Cocos Creator 项目的当前场景中查询节点。可以根据 UUID、节点路径、名称、模式匹配等条件查询节点，并指定查询深度，查询的结果是传入的信息的交集。返回匹配的节点信息，包括节点的基本信息和组件列表。')
    @result(NodeQueryResultScheme)
    async queryNodes(@param(NodeQueryScheme) options: TNodeQueryOptions): Promise<CommonResultType<TNodeQueryResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TNodeQueryResult> = {
            code: code,
            data: [],
        };

        try {
            // 这里需要实现具体的节点查询逻辑
            // 目前核心模块中的 NodeService.queryNode 还未实现
            // 我们先返回一个示例结果，等待核心模块完善
            
            // 检查当前是否有打开的场景
            const currentScene = await Scene.getCurrentScene();
            if (!currentScene) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = '当前没有打开的场景，无法查询节点';
                return ret;
            }

            // TODO: 实现具体的节点查询逻辑
            // 当前核心模块的 NodeService.queryNode 方法还未实现
            // 这里先返回空结果，等待核心模块完善后再实现具体逻辑
            console.log('查询节点参数:', options);
            console.log('当前场景:', currentScene);
            
            // 暂时返回空结果
            ret.data = [];
            
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('查询节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 更新节点属性
     */
    @tool('node-update-properties')
    @title('更新节点属性')
    @description('更新 Cocos Creator 项目当前场景中指定节点的属性。可以更新节点的位置、缩放等属性，支持部分更新。')
    @result(NodeUpdateResultScheme)
    async updateNodeProperties(@param(NodeUpdateScheme) options: TNodeUpdateOptions): Promise<CommonResultType<TNodeUpdateResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TNodeUpdateResult> = {
            code: code,
            data: {
                nodeId: '',
                path: options.path,
            },
        };

        try {
            // 检查当前是否有打开的场景
            const currentScene = await Scene.getCurrentScene();
            if (!currentScene) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = '当前没有打开的场景，无法更新节点';
                return ret;
            }

            // TODO: 实现具体的节点更新逻辑
            // 当前核心模块的 NodeService.updateNode 方法还未实现
            // 这里先返回示例结果，等待核心模块完善后再实现具体逻辑
            console.log('更新节点参数:', options);
            console.log('当前场景:', currentScene);
            
            // 暂时返回成功结果
            ret.data.path = options.path;
            
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('更新节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}