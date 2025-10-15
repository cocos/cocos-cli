import { ApiBase } from '../base/api-base';
import {
    SchemaCreateComponentInfo,
    SchemaComponentInfo,
    SchemaSetPropertyOptions,
    TCreateComponentInfo,
    TComponentInfo,
    TSetPropertyOptions,
    TComponentDumpInfoResult,
} from './component-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/scheme-base';
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
    @result(SchemaComponentInfo)
    async createComponent(@param(SchemaCreateComponentInfo) createComponentInfo: TCreateComponentInfo): Promise<CommonResultType<TComponentInfo>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TComponentInfo> = {
            code: code,
            data: {
                uuid: 'unknown',
            },
        };

        try {
            const componentInfo = await Scene.createComponent(createComponentInfo);
            if (componentInfo) {
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
    @result(SchemaComponentInfo)
    async removeComponent(@param(SchemaComponentInfo) componentInfo: TComponentInfo): Promise<CommonResultType<boolean>> {
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
    @result(SchemaComponentInfo)
    async queryComponent(@param(SchemaComponentInfo) componentInfo: TComponentInfo): Promise<CommonResultType<TComponentDumpInfoResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TComponentDumpInfoResult> = {
            code: code,
            data: {
                value: {},
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
    @tool('scene-set-property-component')
    @title('设置组件属性')
    @description('设置组件属性')
    @result(SchemaComponentInfo)
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
