import { ApiBase } from '../base/api-base';
import {
    SchemeCreateComponentInfo,
    SchemeComponentInfo,
    SchemeSetPropertyOptions,
    TSchemeCreateComponentInfo,
    TComponentInfo,
    TSetPropertyOptions,
    TComponentDumpInfoResult,
} from './component-scheme';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/scheme-base';
import { Scene, SetPropertyOptions } from '../../core/scene';

export class ComponentApi extends ApiBase {

    constructor() {
        super();
    }

    async init(): Promise<void> {
    }

    /**
     * 创建组件
     */
    @tool('scene-createComponent')
    @title('创建组件')
    @description('创建一个组件添加到节点中')
    @result(SchemeComponentInfo)
    async createComponent(@param(SchemeCreateComponentInfo) createComponentInfo: TSchemeCreateComponentInfo): Promise<CommonResultType<TComponentInfo>> {
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
    @tool('scene-removeComponent')
    @title('移除组件')
    @description('移除 节点 组件')
    @result(SchemeComponentInfo)
    async removeComponent(@param(SchemeComponentInfo) componentInfo: TComponentInfo): Promise<CommonResultType<boolean>> {
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
    @tool('scene-queryComponent')
    @title('查询组件')
    @description('查询组件信息')
    @result(SchemeComponentInfo)
    async queryComponent(@param(SchemeComponentInfo) componentInfo: TComponentInfo): Promise<CommonResultType<TComponentDumpInfoResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TComponentDumpInfoResult> = {
            code: code,
            data: {
                value: {
                    uuid: '',
                    name: '',
                    enabled: false,
                },
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
    @tool('scene-setProperty')
    @title('设置组件属性')
    @description('设置组件属性')
    @result(SchemeComponentInfo)
    async setProperty(@param(SchemeSetPropertyOptions) setPropertyOptions?: TSetPropertyOptions): Promise<CommonResultType<boolean>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<boolean> = {
            code: code,
            data: false,
        };

        try {
            const sceneInfo = await Scene.setProperty(setPropertyOptions as SetPropertyOptions);
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
