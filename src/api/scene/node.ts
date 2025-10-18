import { ApiBase } from '../base/api-base';
import {
    NodeCreateSchema,
    NodeUpdateSchema,
    NodeDeleteSchema,
    NodeQuerySchema,
    TNodeDetail,
    TNodeUpdateResult,
    TNodeDeleteResult,
    TCreateNodeOptions,
    TUpdateNodeOptions,
    TQueryNodeOptions,
    TDeleteNodeOptions,
    NodeQueryResultSchema,
    NodeDeleteResultSchema,
    NodeUpdateResultSchema
} from './node-schema';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { MobilityMode, NodeType, Scene } from '../../core/scene';


export class NodeApi extends ApiBase {

    constructor() {
        super();
    }

    async init(): Promise<void> {
        // 节点 API 依赖场景，确保在 场景Api 初始化后调用
        console.log('初始化 节点 API');
    }


    private _generateDefaultNodeInfo(): TNodeDetail {
        return {
            nodeId: '',
            path: '',
            name: '',
            properties: {
                position: { x: 0, y: 0, z: 0 },
                worldPosition: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                worldRotation: { x: 0, y: 0, z: 0, w: 1 },
                eulerAngles: { x: 0, y: 0, z: 0 },
                angle: 0,
                scale: { x: 1, y: 1, z: 1 },
                worldScale: { x: 1, y: 1, z: 1 },
                worldMatrix: { m00: 0, m01: 0, m02: 0, m03: 0, m04: 0, m05: 0, m06: 0, m07: 0, m08: 0, m09: 0, m10: 0, m11: 0, m12: 0, m13: 0, m14: 0, m15: 0 },
                forward: { x: 0, y: 0, z: 0 },
                up: { x: 0, y: 1, z: 0 },
                right: { x: 1, y: 0, z: 0 },
                mobility: MobilityMode.Static,
                layer: 0,
                hasChangedFlags: 0,
                active: false,
                activeInHierarchy: false
            },
            component: []
        };
    }

    /**
     * 创建节点
     */
    @tool('scene-create-node')
    @title('创建节点')
    @description('在当前打开的场景中，创建一个新的节点，节点的路径必须是唯一的。')
    @result(NodeDeleteResultSchema)
    async createNode(@param(NodeCreateSchema) options: TCreateNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: this._generateDefaultNodeInfo(),
        };
        try {
            const nodeInfo = await Scene.createNode({
                path: options.path,
                name: options.name,
                nodeType: options.nodeType as NodeType,
                workMode: options.workMode,
                keepWorldTransform: options.keepWorldTransform
            });
            if (nodeInfo) {
                ret.data = nodeInfo;
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
    @description('在 Cocos Creator 项目中删除节点。')
    @result(NodeDeleteResultSchema)
    async deleteNode(@param(NodeDeleteSchema) options: TDeleteNodeOptions): Promise<CommonResultType<TNodeDeleteResult>> {
        const ret: CommonResultType<TNodeDeleteResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: {
                path: '',
            },
        };

        try {
            const result = await Scene.deleteNode(options);
            if (ret.data && result?.path) {
                ret.data.path = result.path;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('删除节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 更新节点
     */
    @tool('scene-update-node')
    @title('更新节点')
    @description('在 Cocos Creator 项目中修改节点。')
    @result(NodeUpdateResultSchema)
    async updateNode(@param(NodeUpdateSchema) options: TUpdateNodeOptions): Promise<CommonResultType<TNodeUpdateResult>> {
        const ret: CommonResultType<TNodeUpdateResult> = {
            code: COMMON_STATUS.SUCCESS,
            data: {
                path: '',
            },
        };

        try {
            const result = await Scene.updateNode(options);
            if (ret.data && result?.path) {
                ret.data.path = result.path;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('更新节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
    * 查询节点
    */
    @tool('scene-query-node')
    @title('查询节点')
    @description('在 Cocos Creator 项目中查询节点。')
    @result(NodeQueryResultSchema)
    async queryNode(@param(NodeQuerySchema) options: TQueryNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        const ret: CommonResultType<TNodeDetail> = {
            code: COMMON_STATUS.SUCCESS,
            data: this._generateDefaultNodeInfo(),
        };

        try {
            const result = await Scene.queryNode(options);
            if (result) {
                ret.data = result;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('查询节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
