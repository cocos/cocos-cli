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
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/schema-base';
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
    @tool('scene-create-component')
    @title('创建组件')
    @description('创建一个组件添加到节点中')
    @result(SchemaComponent)
    async addComponent(@param(SchemaAddComponentInfo) createComponentInfo: TAddComponentInfo): Promise<CommonResultType<TComponent>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TComponent> = {
            code: code,
            data: {
                uuid: 'unknown',
            },
        };

        try {
            const componentInfo = await Scene.addComponent(createComponentInfo);
            if (componentInfo && ret.data) {
                ret.data.uuid = componentInfo.uuid;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('创建组件失败失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 移除组件
     */
    @tool('scene-remove-component')
    @title('移除组件')
    @description('移除 节点 组件')
    @result(SchemaBooleanResult)
    async removeComponent(@param(SchemaComponent) componentInfo: TComponent): Promise<CommonResultType<boolean>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<boolean> = {
            code: code,
            data: false,
        };

        try {
            const sceneInfo = await Scene.removeComponent(componentInfo);
            if (sceneInfo) {
                ret.data = false;

            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('移除组件失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 查询组件
     */
    @tool('scene-query-component')
    @title('查询组件')
    @description('查询组件信息')
    @result(SchemaComponentInfoResult)
    async queryComponent(@param(SchemaComponent) componentInfo: TComponent): Promise<CommonResultType<TComponentInfoResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TComponentInfoResult> = {
            code: code,
            data: {
                value: { value: {} },
                uuid: '',
                enabled: false,
            },
        };

        try {
            const componentDumpInfo = await Scene.queryComponent(componentInfo);

            if (componentDumpInfo) {
                ret.data = JSON.parse(JSON.stringify(componentInfo));
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('查询组件信息失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 设置组件属性
     */
    @tool('scene-set-component-property')
    @title('设置组件属性')
    @description('设置组件属性')
    @result(SchemaBooleanResult)
    async setProperty(@param(SchemaSetPropertyOptions) setPropertyOptions?: TSetPropertyOptions): Promise<CommonResultType<boolean>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<boolean> = {
            code: code,
            data: false,
        };

        try {
            const sceneInfo = await Scene.setProperty(setPropertyOptions as ISetPropertyOptions);
            if (sceneInfo) {
                ret.data = true;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('设置属性失败:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
