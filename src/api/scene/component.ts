import { ApiBase } from '../base/api-base';
import { globalComponentType } from '../../core/scene';
import {
    SchemaAddComponentInfo,
    SchemaComponent,
    SchemaSetPropertyOptions,
    SchemaComponentResult,
    SchemaBooleanResult,
    SchemaBuildinComponentTypes,
    SchemaQueryComponent,
    SchemaRemoveComponent,
    TAddComponentInfo,
    TComponentIdentifier,
    TSetPropertyOptions,
    TComponentResult,
    TBuildinComponentTypes,
    TRemoveComponentOptions,
    TQueryComponentOptions,
} from './component-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { Scene, ISetPropertyOptions } from '../../core/scene';

export class ComponentApi extends ApiBase {

    constructor() {
        super();
    }

    async init(): Promise<void> {
    }

    /**
     * 创建组件
     */
    @tool('scene-add-component')
    @title('添加组件')
    @description('添加组件到节点中，输入节点名，组件类型，内置组件或自定义组件, 返回所有的组件操作')
    @result(SchemaComponentResult)
    async addComponent(@param(SchemaAddComponentInfo) addComponentInfo: TAddComponentInfo): Promise<CommonResultType<TComponentResult>> {
        try {
            let componentName = globalComponentType[addComponentInfo.component as keyof typeof globalComponentType];
            if (!componentName) {
                componentName = addComponentInfo.component;
            }
            const component = await Scene.addComponent({ nodePath: addComponentInfo.nodePath, component: componentName });
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
     * 移除组件
     */
    @tool('scene-delete-component')
    @title('删除组件')
    @description('删除节点组件，如果组件不存在，删除则会返回false')
    @result(SchemaBooleanResult)
    async removeComponent(@param(SchemaRemoveComponent) component: TRemoveComponentOptions): Promise<CommonResultType<boolean>> {
        try {
            const result = await Scene.removeComponent(component);
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
     * 查询组件
     */
    @tool('scene-query-component')
    @title('查询组件')
    @description('查询组件信息，返回所有组件的属性')
    @result(SchemaComponentResult)
    async queryComponent(@param(SchemaQueryComponent) component: TQueryComponentOptions): Promise<CommonResultType<TComponentResult | null>> {
        try {
            const componentInfo = await Scene.queryComponent(component);
            if (!componentInfo) {
                throw new Error(`component not fount at path ${component.path}`);
            }
            return {
                code: COMMON_STATUS.SUCCESS,
                data: componentInfo
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * 设置组件属性
     */
    @tool('scene-set-component-property')
    @title('设置组件属性')
    @description('设置组件属性，输入组件path（唯一索引的组件），属性类型、属性名称、属性值，包括不同类型的值：boolean，string等')
    @result(SchemaBooleanResult)
    async setProperty(@param(SchemaSetPropertyOptions) setPropertyOptions?: TSetPropertyOptions): Promise<CommonResultType<boolean>> {
        try {
            const result = await Scene.setProperty(setPropertyOptions as ISetPropertyOptions);
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
     * 获取所有内置组件类型
     */
    @tool('scene-get-buildin-component-types')
    @title('获取所有内置组件类型')
    @description('获取所有内置组件类型，用于创建组件输入的组件名称')
    @result(SchemaBuildinComponentTypes)
    async getBuiltinComponentTypes(): Promise<CommonResultType<TBuildinComponentTypes>> {
        try {
            return {
                code: COMMON_STATUS.SUCCESS,
                data: Object.keys(globalComponentType) as [string, ...string[]],
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }
}
