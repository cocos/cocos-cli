import {
    SchemaNodeCreateByAsset,
    SchemaNodeCreateByType,
    SchemaNodeUpdate,
    SchemaNodeDelete,
    SchemaNodeQuery,
    TNodeDetail,
    TNodeUpdateResult,
    TNodeDeleteResult,
    TCreateNodeByAssetOptions,
    TCreateNodeByTypeOptions,
    TUpdateNodeOptions,
    TQueryNodeOptions,
    TDeleteNodeOptions,
    SchemaNodeQueryResult,
    SchemaNodeDeleteResult,
    SchemaNodeUpdateResult,
} from './node-schema';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { ICreateByNodeTypeParams, INodeInfo, Scene } from '../../core/scene';

export class NodeApi {

    /**
     * Create Node // 创建节点
     */
    @tool('scene-create-node-by-type')
    @title('Create Node By Type') // 根据类型创建节点
    @description('Create a node named name with type nodeType under the path in the currently opened scene. The node path must be unique. If multi-level nodes are not created, empty nodes will be automatically completed.') // 在当前打开的场景中的 path 路径下创建一个名字为 name，类型为 nodeType 的节点，节点的路径必须是唯一的，如果有多级节点没创建，会自动补全空节点。
    @result(SchemaNodeQueryResult)
    async createNodeByType(@param(SchemaNodeCreateByType) options: TCreateNodeByTypeOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };
        try {
            const resultNode = await Scene.Node.createByType(options as ICreateByNodeTypeParams);
            if (resultNode) {
                ret.data = resultNode;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('Failed to create node:', e); // 创建节点失败:
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }


    /**
     * Create Node // 创建节点
     */
    @tool('scene-create-node-by-asset')
    @title('Create Node By Asset') // 根据资源创建节点
    @description('Create a node named name using dbURL asset under the path in the currently opened scene. The node path must be unique. If multi-level nodes are not created, empty nodes will be automatically completed. Example of resource dbURL format: db://assets/sample.prefab') // 在当前打开的场景中的 path 路径下使用 dbURL 资源，创建一个名字为 name 的节点，节点的路径必须是唯一的，如果有多级节点没创建，会自动补全空节点，资源的 dbURL 格式举例：db://assets/sample.prefab
    @result(SchemaNodeQueryResult)
    async createNodeByAsset(@param(SchemaNodeCreateByAsset) options: TCreateNodeByAssetOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };
        try {
            const resultNode = await Scene.Node.createByAsset(options);
            if (resultNode) {
                ret.data = resultNode;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('Failed to create node:', e); // 创建节点失败:
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }


    /**
     * Delete Node // 删除节点
     */
    @tool('scene-delete-node')
    @title('Delete Node') // 删除节点
    @description('Delete a node in the currently opened scene. You need to pass in the path of the node, such as: Canvas/Node1') // 在当前打开的场景中删除节点，需要传入节点的路径，比如：Canvas/Node1
    @result(SchemaNodeDeleteResult)
    async deleteNode(@param(SchemaNodeDelete) options: TDeleteNodeOptions): Promise<CommonResultType<TNodeDeleteResult>> {
        const ret: CommonResultType<TNodeDeleteResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };

        try {
            const result = await Scene.Node.delete(options);
            if (!result) throw new Error(`node not found at path: ${options.path}`);
            ret.data = {
                path: result.path,
            };
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('Failed to delete node:', e); // 删除节点失败:
            ret.reason = e instanceof Error ? e.message : String(e);
            delete ret.data;
        }

        return ret;
    }

    /**
     * Update Node // 更新节点
     */
    @tool('scene-update-node')
    @title('Update Node') // 更新节点
    @description('Update a node in the currently opened scene. You need to pass in the path of the node, such as: Canvas/Node1') // 在当前打开的场景中更新节点，需要传入节点的路径，比如：Canvas/Node1
    @result(SchemaNodeUpdateResult)
    async updateNode(@param(SchemaNodeUpdate) options: TUpdateNodeOptions): Promise<CommonResultType<TNodeUpdateResult>> {
        try {
            const data = await Scene.Node.update(options);
            return {
                data: data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error('Failed to update node:', e); // 更新节点失败:
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
    * Query Node // 查询节点
    */
    @tool('scene-query-node')
    @title('Query Node') // 查询节点
    @description('Query a node (NOT a component) in the currently opened scene. The path must be a node path like "Canvas/Node1" — do NOT append a component type (e.g. do NOT use "Canvas/Node1/cc.Label"). To query a component, use scene-query-component instead.') // 在当前打开的场景中查询节点（不是组件），需要传入节点路径，比如：Canvas/Node1。不要追加组件类型名称（例如不要用 Canvas/Node1/cc.Label），如需查询组件请使用 scene-query-component
    @result(SchemaNodeQueryResult)
    async queryNode(@param(SchemaNodeQuery) options: TQueryNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: undefined,
        };

        try {
            const result = await Scene.Node.query(options) as INodeInfo | null;
            if (!result) throw new Error(`node not found at path: ${options.path}`);
            ret.data = result;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('Failed to query node:', e); // 查询节点失败:
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
