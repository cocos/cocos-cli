import {
    SchemaAddComponentInfo,
    SchemaSetPropertyOptions,
    SchemaComponentResult,
    SchemaBooleanResult,
    SchemaQueryAllComponentResult,
    SchemaQueryComponent,
    SchemaRemoveComponent,
    SchemaRegeneratePolygon2DPointsOptions,
    SchemaRegeneratePolygon2DPointsResult,
    SchemaRecalculateLODGroupBoundsOptions,
    SchemaLODGroupBoundsResult,
    SchemaInsertLODOptions,
    SchemaEraseLODOptions,
    SchemaQueryLODGroupRelativeHeightOptions,
    SchemaLODGroupLevelsResult,
    SchemaLODGroupRelativeHeightResult,

    TAddComponentInfo,
    TSetPropertyOptions,
    TComponentResult,
    TQueryAllComponentResult,
    TRemoveComponentOptions,
    TQueryComponentOptions,
    TRegeneratePolygon2DPointsOptions,
    TRegeneratePolygon2DPointsResult,
    TRecalculateLODGroupBoundsOptions,
    TLODGroupBoundsResult,
    TInsertLODOptions,
    TEraseLODOptions,
    TQueryLODGroupRelativeHeightOptions,
    TLODGroupLevelsResult,
    TLODGroupRelativeHeightResult,
} from './component-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, getCommonErrorStatus } from '../base/schema-base';
import { Scene, IComponentInfo } from '../../core/scene';
import { ISetPropertyOptionsInfo } from '../../core/scene/common/cli/component';

export class ComponentApi {

    /**
     * Add component // 添加组件
     */
    @tool('scene-add-component')
    @title('Add component') // 添加组件
    @description('Add component to node, input node name, component type, built-in or custom component. Returns all component details on success. Can query all component names via scene-query-all-component') // 添加组件到节点中，输入节点名，组件类型，内置组件或自定义组件, 成功返回所有的组件详细信息，可以通过 scene-query-all-component 查询到所有组件的名称
    @result(SchemaComponentResult)
    async addComponent(@param(SchemaAddComponentInfo) addComponentInfo: TAddComponentInfo): Promise<CommonResultType<TComponentResult>> {
        try {
            const component = await Scene.Component.add({ nodePath: addComponentInfo.nodePath, component: addComponentInfo.component });
            return {
                code: COMMON_STATUS.SUCCESS,
                data: component
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * Remove component // 移除组件
     */
    @tool('scene-delete-component')
    @title('Remove component') // 删除组件
    @description('Remove node component, returns true on success, false on failure') // 删除节点组件，移除成功返回 true， 移除失败返回 false
    @result(SchemaBooleanResult)
    async removeComponent(@param(SchemaRemoveComponent) component: TRemoveComponentOptions): Promise<CommonResultType<boolean>> {
        try {
            const result = await Scene.Component.remove({ path: component.componentPath });
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * Query component // 查询组件
     */
    @tool('scene-query-component')
    @title('Query component') // 查询组件
    @description('Query a component (NOT a node) on a node. The path must be a component path = node path + "/" + component type name, e.g. "Canvas/Node1/cc.Label". Do NOT pass a bare node path like "Canvas/Node1" — that has no component type suffix and will fail. To query a node use scene-query-node instead.') // 查询组件信息（不是节点），路径必须是组件路径 = 节点路径 + "/" + 组件类型名称，例如 Canvas/Node1/cc.Label。不要传裸节点路径，如需查询节点请使用 scene-query-node
    @result(SchemaComponentResult)
    async queryComponent(@param(SchemaQueryComponent) component: TQueryComponentOptions): Promise<CommonResultType<TComponentResult | null>> {
        try {
            const componentInfo = await Scene.Component.query({ path: component.componentPath });
            if (!componentInfo) {
                throw new Error(`component not found: ${component.componentPath}`);
            }
            return {
                code: COMMON_STATUS.SUCCESS,
                data: componentInfo as IComponentInfo
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * Set component property // 设置组件属性
     */
    @tool('scene-set-component-property')
    @title('Set component property') // 设置组件属性
    @description('Set component properties. Query scene-query-component first and match each Asset reference to the returned property type. Asset values use { uuid: "..." }; uuid may be an exact UUID or db:// URL. If a parent asset has exactly one compatible sub-asset, it is normalized automatically; incompatible or ambiguous references return 400 without modifying the component.') // 设置组件属性前先查询属性类型；Asset 引用必须匹配类型，唯一兼容子资源会自动规范化，失配或歧义时不修改组件并返回 400
    @result(SchemaBooleanResult)
    async setProperty(@param(SchemaSetPropertyOptions) setPropertyOptions?: TSetPropertyOptions): Promise<CommonResultType<boolean>> {
        try {
            const result = await Scene.Component.setProperty(setPropertyOptions as ISetPropertyOptionsInfo);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * Query all components // 查询所有组件
     */
    @tool('scene-query-all-component')
    @title('Query all components') // 查询所有组件
    @description('Query all components, can query component names of all component info') // 查询所有组件，可以查询到所有组件的信息的组件名称
    @result(SchemaQueryAllComponentResult)
    async queryAllComponent(): Promise<CommonResultType<TQueryAllComponentResult>> {
        try {
            const components = await Scene.Component.queryAll();
            return {
                code: COMMON_STATUS.SUCCESS,
                data: components,
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * Regenerate PolygonCollider2D points // 重新生成 PolygonCollider2D 顶点
     */
    @tool('scene-regenerate-polygon-2d-points')
    @title('Regenerate PolygonCollider2D points')
    @description('Regenerate cc.PolygonCollider2D points from the alpha contour of a Sprite on the same node. Falls back to the UITransform rectangle when no usable Sprite source exists. This overwrites the current points and records undo by default.')
    @result(SchemaRegeneratePolygon2DPointsResult)
    async regeneratePolygon2DPoints(
        @param(SchemaRegeneratePolygon2DPointsOptions) options: TRegeneratePolygon2DPointsOptions,
    ): Promise<CommonResultType<TRegeneratePolygon2DPointsResult>> {
        try {
            const result = await Scene.Component.regeneratePolygon2DPoints(options);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result,
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * Recalculate LODGroup bounds // 重新计算 LODGroup 包围盒
     */
    @tool('scene-recalculate-lod-group-bounds')
    @title('Recalculate LODGroup bounds') // 重新计算 LODGroup 包围盒
    @description('Recalculate localBoundaryCenter and objectSize from all Renderers referenced by a cc.LODGroup. The path must identify a cc.LODGroup component, e.g. "Root/LOD/cc.LODGroup". Returns zero values when no valid Renderer exists.') // 根据 LODGroup 引用的 Renderer 重算边界；路径必须指向 cc.LODGroup 组件
    @result(SchemaLODGroupBoundsResult)
    async recalculateLODGroupBounds(
        @param(SchemaRecalculateLODGroupBoundsOptions) options: TRecalculateLODGroupBoundsOptions,
    ): Promise<CommonResultType<TLODGroupBoundsResult>> {
        try {
            const bounds = await Scene.Component.recalculateLODGroupBounds(options);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: bounds,
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * Insert an LOD level // 插入 LOD 层级
     */
    @tool('scene-insert-lod')
    @title('Insert LOD level') // 插入 LOD 层级
    @description('Insert an LOD level into a cc.LODGroup. Index must be from 0 through lodCount, at most 8 levels are allowed, and screenUsagePercentage must be in (0, 1]. Omit screenUsagePercentage to let the engine calculate it.')
    @result(SchemaLODGroupLevelsResult)
    async insertLOD(
        @param(SchemaInsertLODOptions) options: TInsertLODOptions,
    ): Promise<CommonResultType<TLODGroupLevelsResult>> {
        try {
            const lodState = await Scene.Component.insertLOD(options);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: lodState,
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * Erase an LOD level // 删除 LOD 层级
     */
    @tool('scene-erase-lod')
    @title('Erase LOD level') // 删除 LOD 层级
    @description('Erase an LOD level from a cc.LODGroup. Index must identify an existing level, and at least one LOD level must remain.')
    @result(SchemaLODGroupLevelsResult)
    async eraseLOD(
        @param(SchemaEraseLODOptions) options: TEraseLODOptions,
    ): Promise<CommonResultType<TLODGroupLevelsResult>> {
        try {
            const lodState = await Scene.Component.eraseLOD(options);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: lodState,
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * Query LODGroup relative height // 查询 LODGroup 屏幕相对高度
     */
    @tool('scene-query-lod-group-relative-height')
    @title('Query LODGroup relative height') // 查询 LODGroup 屏幕相对高度
    @description('Query the raw screen-relative height of a cc.LODGroup under the current editor camera. Supports perspective and orthographic cameras; the result is not clamped to [0, 1].')
    @result(SchemaLODGroupRelativeHeightResult)
    async queryLODGroupRelativeHeight(
        @param(SchemaQueryLODGroupRelativeHeightOptions) options: TQueryLODGroupRelativeHeightOptions,
    ): Promise<CommonResultType<TLODGroupRelativeHeightResult>> {
        try {
            const relativeHeight = await Scene.Component.queryLODGroupRelativeHeight(options);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: relativeHeight,
            };
        } catch (e) {
            return {
                code: getCommonErrorStatus(e),
                reason: e instanceof Error ? e.message : String(e),
            };
        }
    }
}
