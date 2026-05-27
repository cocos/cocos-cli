import {
    SchemaAddComponentInfo,
    SchemaSetPropertyOptions,
    SchemaComponentResult,
    SchemaBooleanResult,
    SchemaQueryAllComponentResult,
    SchemaQueryComponent,
    SchemaRemoveComponent,

    TAddComponentInfo,
    TSetPropertyOptions,
    TComponentResult,
    TQueryAllComponentResult,
    TRemoveComponentOptions,
    TQueryComponentOptions,
} from './component-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
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
                code: COMMON_STATUS.FAIL,
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
            const result = await Scene.Component.remove(component);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
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
            const componentInfo = await Scene.Component.query(component);
            if (!componentInfo) {
                throw new Error(`component not found: ${component.path}`);
            }
            return {
                code: COMMON_STATUS.SUCCESS,
                data: componentInfo as IComponentInfo
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * Set component property // 设置组件属性
     */
    @tool('scene-set-component-property')
    @title('Set component property') // 设置组件属性
    @description('Set component property. Input component path (unique index of component), property name, property value to modify corresponding property info. Property types can be queried via scene-query-component') // 设置组件属性，输入组件path（唯一索引的组件）、属性名称、属性值，修改对应属性的信息，属性的类型可以通过 scene-query-component 查询到
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
                code: COMMON_STATUS.FAIL,
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
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }
}
