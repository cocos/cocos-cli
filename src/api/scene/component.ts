import { ApiBase } from '../base/api-base';
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
    @description('添加组件到节点中，输入节点名，组件类型，内置组件或自定义组件, 成功返回所有的组件详细信息，可以通过 scene-query-all-component 查询到所有组件的名称')
    @result(SchemaComponentResult)
    async addComponent(@param(SchemaAddComponentInfo) addComponentInfo: TAddComponentInfo): Promise<CommonResultType<TComponentResult>> {
        try {
            const component = await Scene.addComponent({ nodePath: addComponentInfo.nodePath, component: addComponentInfo.component });
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
    @description('删除节点组件，如果组件不存在，删除则会返回 false')
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
    @description('设置组件属性，输入组件path（唯一索引的组件）、属性名称、属性值，修改对应属性的信息，属性的类型可以通过 scene-query-component 查询到')
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
     * 查询所有组件
     */
    @tool('scene-query-all-component')
    @title('查询所有组件')
    @description('查询所有组件，可以查询到所有组件的信息的组件名称')
    @result(SchemaQueryAllComponentResult)
    async queryAllComponent(): Promise<CommonResultType<TQueryAllComponentResult>> {
        try {
            const components = await Scene.queryAllComponent();
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
