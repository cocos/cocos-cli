import { description, param, result, title, tool } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { SchemaNode, TNode } from './node-schema';
import { Scene } from '../../core/scene';
import {
    SchemaApplyPrefabChangesOptions,
    SchemaApplyPrefabChangesResult,
    SchemaCreatePrefabFromNodeOptions,
    SchemaGetPrefabInfoOptions,
    SchemaGetPrefabResult,
    SchemaIsPrefabInstanceOptions,
    SchemaIsPrefabInstanceResult,
    SchemaRevertToPrefabOptions,
    SchemaRevertToPrefabResult,
    SchemaUnpackPrefabInstanceOptions,
    TApplyPrefabChangesOptions,
    TApplyPrefabChangesResult,
    TCreatePrefabFromNodeOptions,
    TGetPrefabInfoParams,
    TGetPrefabResult,
    TIsPrefabInstanceOptions,
    TIsPrefabInstanceResult,
    TRevertToPrefabOptions,
    TRevertToPrefabResult,
    TUnpackPrefabInstanceOptions
} from './prefab-schema';

export class PrefabApi {

    @tool('scene-prefab-create-from-node')
    @title('将节点转换为预制体资源')
    @description('将指定节点及其子节点转换为预制体资源，并保存到指定路径')
    @result(SchemaNode)
    async createPrefabFromNode(@param(SchemaCreatePrefabFromNodeOptions) options: TCreatePrefabFromNodeOptions): Promise<CommonResultType<TNode>> {
        try {
            const data = await Scene.createPrefabFromNode(options);
            return {
                data: data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-prefab-apply-changes')
    @title('应用预制体修改')
    @description('将预制体实例的修改应用回预制体资源')
    @result(SchemaApplyPrefabChangesResult)
    async applyPrefabChanges(@param(SchemaApplyPrefabChangesOptions) options: TApplyPrefabChangesOptions): Promise<CommonResultType<TApplyPrefabChangesResult>> {
        try {
            const data = await Scene.applyPrefabChanges(options);
            return {
                data: data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-prefab-revert')
    @title('重置预制体实例')
    @description('将预制体实例重置到预制体资源的原始状态')
    @result(SchemaRevertToPrefabResult)
    async revertToPrefab(@param(SchemaRevertToPrefabOptions) options: TRevertToPrefabOptions): Promise<CommonResultType<TRevertToPrefabResult>> {
        try {
            const data = await Scene.revertToPrefab(options);
            return {
                data: data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-prefab-unpack')
    @title('解耦预制体实例')
    @description('将预制体实例解耦，使其成为普通节点，不再与预制体资源关联')
    @result(SchemaNode)
    async unpackPrefabInstance(@param(SchemaUnpackPrefabInstanceOptions) options: TUnpackPrefabInstanceOptions): Promise<CommonResultType<TNode>> {
        try {
            const data = await Scene.unpackPrefabInstance(options);
            return {
                data: data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-prefab-is-instance')
    @title('检查是否为预制体实例')
    @description('检查指定节点是否为预制体实例')
    @result(SchemaIsPrefabInstanceResult)
    async isPrefabInstance(@param(SchemaIsPrefabInstanceOptions) options: TIsPrefabInstanceOptions): Promise<CommonResultType<TIsPrefabInstanceResult>> {
        try {
            const data = await Scene.isPrefabInstance(options);
            return {
                data: data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('scene-prefab-get-info')
    @title('获取预制体信息')
    @description('获取指定节点的预制体相关信息')
    @result(SchemaGetPrefabResult)
    async getPrefabInfo(@param(SchemaGetPrefabInfoOptions) options: TGetPrefabInfoParams): Promise<CommonResultType<TGetPrefabResult>> {
        try {
            const data = await Scene.getPrefabInfo(options);
            return {
                data: data,
                code: COMMON_STATUS.SUCCESS,
            };
        } catch (e) {
            console.error(e);
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }
}