import { ApiBase } from '../base/api-base';
import {
    SchemeCreateNodeOptions,
    SchemeUpdateNodeOptions,
    SchemeDeleteNodeOptions,
    SchemeQueryNodeOptions,
    SchemeCreateNodeResult,
    TNodeDetail,
    TCreateNodeOptions,
    TUpdateNodeOptions,
    TQueryNodeOptions,
    TDeleteNodeOptions
} from './node-scheme';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/scheme-base';
import { NodeType, Scene } from '../../core/scene';


export class NodeApi extends ApiBase {

    constructor() {
        super();
    }

    async init(): Promise<void> {
        // 节点 API 依赖场景，确保在 场景Api 初始化后调用
        console.log('初始化 节点 API');
    }


    /**
     * 创建节点
     */
    @tool('scene-createNode')
    @title('创建节点')
    @description('在 Cocos Creator 项目中创建新的节点。')
    @result(SchemeCreateNodeResult)
    async createNode(@param(SchemeCreateNodeOptions) options: TCreateNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TNodeDetail> = {
            code: code,
            data: {
                path: 'unknown',
                name: '',
            },
        }

        try {
            const nodeInfo = await Scene.createNode({
                path: options.path,
                name: options.name,
                nodeType: options.nodeType as NodeType,
                workMode: options.workMode,
                keepWorldTransform: options.keepWorldTransform
            });
            if (nodeInfo) {
                ret.data.path = nodeInfo.path;
                ret.data.name = nodeInfo.name;
                ret.data.index = nodeInfo.index;
                ret.data.children = nodeInfo.children;
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
    @tool('scene-deleteNode')
    @title('删除节点')
    @description('在 Cocos Creator 项目中删除节点。')
    @result(SchemeCreateNodeResult)
    async deleteNode(@param(SchemeDeleteNodeOptions) options: TDeleteNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TNodeDetail> = {
            code: code,
            data: {
                path: 'unknown',
                name: '',
            },
        }

        try {
            const params: any = {
                path: options.path,
            };
            if (options.index !== undefined) {
                params.index = options.index;
            }
            if (options.keepWorldTransform !== undefined) {
                params.keepWorldTransform = options.keepWorldTransform;
            }

            const nodeInfo = await Scene.deleteNode(params);
            if (nodeInfo) {
                ret.data.path = nodeInfo.path;
                ret.data.name = nodeInfo.name;
                ret.data.index = nodeInfo.index;
                ret.data.children = nodeInfo.children;
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
    @tool('scene-updateNode')
    @title('更新节点')
    @description('在 Cocos Creator 项目中修改节点。')
    @result(SchemeCreateNodeResult)
    async updateNode(@param(SchemeUpdateNodeOptions) options: TUpdateNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TNodeDetail> = {
            code: code,
            data: {
                path: 'unknown',
                name: '',
            },
        }

        try {
            const params: any = {
                path: options.path,
            };
            if (options.index !== undefined) {
                params.index = options.index;
            }
            if (options.fields !== undefined) {
                params.fields = options.fields;
            }

            const nodeInfo = await Scene.updateNode(params);
            if (nodeInfo) {
                ret.data.path = nodeInfo.path;
                ret.data.name = nodeInfo.name;
                ret.data.index = nodeInfo.index;
                ret.data.children = nodeInfo.children;
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
    @tool('scene-queryNode')
    @title('查询节点')
    @description('在 Cocos Creator 项目中查询节点。')
    @result(SchemeCreateNodeResult)
    async queryNode(@param(SchemeQueryNodeOptions) options: TQueryNodeOptions): Promise<CommonResultType<TNodeDetail>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TNodeDetail> = {
            code: code,
            data: {
                path: 'unknown',
                name: '',
            },
        }

        try {
            const params: any = {
                path: options.path,
            };
            if (options.index !== undefined) {
                params.index = options.index;
            }

            const nodeInfo = await Scene.queryNode(params);
            if (nodeInfo) {
                ret.data.path = nodeInfo.path;
                ret.data.name = nodeInfo.name;
                ret.data.index = nodeInfo.index;
                ret.data.children = nodeInfo.children;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('查询节点失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
