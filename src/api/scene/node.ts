import {
    NodeCreateByAssetSchema,
    NodeCreateByTypeSchema,
    NodeUpdateSchema,
    NodeDeleteSchema,
    NodeQuerySchema,
    TNodeDetail,
    TNodeUpdateResult,
    TNodeDeleteResult,
    TCreateNodeByAssetOptions,
    TCreateNodeByTypeOptions,
    TUpdateNodeOptions,
    TQueryNodeOptions,
    TDeleteNodeOptions,
    NodeQueryResultSchema,
    NodeDeleteResultSchema,
    NodeUpdateResultSchema,
} from './node-schema';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { ICreateByNodeTypeParams, Scene } from '../../core/scene';

export class NodeApi {

    /**
     * 创建节点
     */
    @tool('scene-create-node-by-type')
    @title('根据类型创建节点')
    @description('在当前打开的场景中的 path 路径下创建一个名字为 name，类型为 nodeType 的节点，节点的路径必须是唯一的，如果有多级节点没创建，会自动补全空节点。')
    @result(NodeQueryResultSchema)
    async createNodeByType(@param(NodeCreateByTypeSchema) options: TCreateNodeByTypeOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };
        try {
            const resultNode = await Scene.createNodeByType(options as ICreateByNodeTypeParams);
            if (resultNode) {
                ret.data = resultNode;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('创建节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }


    /**
     * 创建节点
     */
    @tool('scene-create-node-by-asset')
    @title('根据资源创建节点')
    @description('在当前打开的场景中的 path 路径下使用 dbURL 资源，创建一个名字为 name 的节点，节点的路径必须是唯一的，如果有多级节点没创建，会自动补全空节点，资源的 dbURL 格式举例：db://assets/sample.prefab')
    @result(NodeQueryResultSchema)
    async createNodeByAsset(@param(NodeCreateByAssetSchema) options: TCreateNodeByAssetOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };
        try {
            const resultNode = await Scene.createNodeByAsset(options);
            if (resultNode) {
                ret.data = resultNode;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('创建节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }


    /**
     * 删除节点
     */
    @tool('scene-delete-node')
    @title('删除节点')
    @description('在当前打开的场景中删除节点，需要传入节点的路径，比如：Canvas/Node1')
    @result(NodeDeleteResultSchema)
    async deleteNode(@param(NodeDeleteSchema) options: TDeleteNodeOptions): Promise<CommonResultType<TNodeDeleteResult>> {
        const ret: CommonResultType<TNodeDeleteResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };

        try {
            const result = await Scene.deleteNode(options);
            if (!result) throw new Error(`node not found at path: ${options.path}`);
            ret.data = {
                path: result.path,
            };
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('删除节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
            delete ret.data;
        }

        return ret;
    }

    /**
     * 更新节点
     */
    @tool('scene-update-node')
    @title('更新节点')
    @description('在当前打开的场景中更新节点，需要传入节点的路径，比如：Canvas/Node1')
    @result(NodeUpdateResultSchema)
    async updateNode(@param(NodeUpdateSchema) options: TUpdateNodeOptions): Promise<CommonResultType<TNodeUpdateResult>> {
        const ret: CommonResultType<TNodeUpdateResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };

        try {
            const result = await Scene.updateNode(options);
            if (result?.path) {
                ret.data = { path: result.path };
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('更新节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
            delete ret.data;
        }

        return ret;
    }

    /**
    * 查询节点
    */
    @tool('scene-query-node')
    @title('查询节点')
    @description('在当前打开的场景中查询节点，需要传入节点的路径，比如：Canvas/Node1')
    @result(NodeQueryResultSchema)
    async queryNode(@param(NodeQuerySchema) options: TQueryNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };

        try {
            const result = await Scene.queryNode(options);
            if (!result) throw new Error(`node not found at path: ${options.path}`);
            ret.data = result;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('查询节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
