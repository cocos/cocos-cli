import { ApiBase } from '../base/api-base';
import {
    SchemaAddComponentInfo,
    SchemaComponent,
    SchemaSetPropertyOptions,
    SchemaComponentInfoResult,
    SchemaBooleanResult,
    TAddComponentInfo,
    TComponent,
    TSetPropertyOptions,
    TComponentInfoResult,
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
    @description('添加组件到节点中')
    @result(SchemaComponent)
    async addComponent(@param(SchemaAddComponentInfo) addComponentInfo: TAddComponentInfo): Promise<CommonResultType<TComponent>> {
        try {
            const componentInfo = await Scene.addComponent(addComponentInfo);
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
     * 移除组件
     */
    @tool('scene-remove-component')
    @title('移除组件')
    @description('移除节点组件')
    @result(SchemaBooleanResult)
    async removeComponent(@param(SchemaComponent) component: TComponent): Promise<CommonResultType<boolean>> {
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
    @description('查询组件信息')
    @result(SchemaComponentInfoResult)
    async queryComponent(@param(SchemaComponent) component: TComponent): Promise<CommonResultType<TComponentInfoResult | null>> {
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
    @description('设置组件属性')
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
}
