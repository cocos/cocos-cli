import type { IAddComponentOptions, ISetPropertyOptions, IComponent, IComponentService, IRemoveComponentOptions, IQueryComponentOptions } from '../../common';
import dumpUtil from './dump';
import { register, expose } from './decorator';
import compMgr from './component/index';
import { Component, Constructor } from 'cc';
import componentUtils from './component/utils';
import { Rpc } from '../rpc';

const NodeMgr = EditorExtends.Node;

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Component')
export class ComponentService implements IComponentService {
    private async addComponentImpl(path: string, componentNameOrUUIDOrURL: string): Promise<IComponent> {
        const node = NodeMgr.getNodeByPath(path);
        if (!node) {
            throw new Error(`create component failed: ${path} does not exist`);
        }
        if (!componentNameOrUUIDOrURL || componentNameOrUUIDOrURL.length <= 0) {
            throw new Error(`create component failed: ${componentNameOrUUIDOrURL} does not exist`);
        }
        // 需要单独处理 missing script
        if (componentNameOrUUIDOrURL === 'MissingScript' || componentNameOrUUIDOrURL === 'cc.MissingScript') {
            throw new Error('Reset Component failed: MissingScript does not exist');
        }

        // 处理 URL 与 Uuid
        const isURL = componentNameOrUUIDOrURL.startsWith('db://');
        const isUuid = componentUtils.isUUID(componentNameOrUUIDOrURL);
        let uuid;
        if (isUuid) {
            uuid = componentNameOrUUIDOrURL;
        } else if (isURL) {
            uuid = await Rpc.request('assetManager', 'queryUUID', [componentNameOrUUIDOrURL]);
        }
        if (uuid) {
            // @ts-ignore hack 后续需要正常的去调用 decorator 里面的 Script
            const cid = await (globalThis.cce as any).Script.queryScriptCid(uuid);
            if (cid && cid !== 'MissingScript' && cid !== 'cc.MissingScript') {
                componentNameOrUUIDOrURL = cid;
            }
        }

        let comp = null;
        let ctor = cc.js.getClassById(componentNameOrUUIDOrURL);
        if (!ctor) {
            ctor = cc.js.getClassByName(componentNameOrUUIDOrURL);
        }
        if (cc.js.isChildClassOf(ctor, Component)) {
            comp = node.addComponent(ctor as Constructor<Component>); // 触发引擎上节点添加组件
        } else {
            console.error(`ctor with name ${componentNameOrUUIDOrURL} is not child class of Component `);
            throw new Error(`ctor with name ${componentNameOrUUIDOrURL} is not child class of Component `);
        }
        return (dumpUtil.dumpComponent(comp as Component));
    }

    @expose()
    async addComponent(params: IAddComponentOptions): Promise<IComponent> {
        const component = await this.addComponentImpl(params.nodePath, params.component);
        return component;
    }

    @expose()
    async removeComponent(params: IRemoveComponentOptions): Promise<boolean> {
        const comp = compMgr.query(params.path);
        if (!comp) {
            throw new Error(`Remove component failed: ${params.path} does not exist`);
        }
        return compMgr.removeComponent(comp);
    }

    @expose()
    async queryComponent(params: IQueryComponentOptions): Promise<IComponent | null> {
        const comp = compMgr.query(params.path);
        if (!comp) {
            console.warn(`Query component failed: ${params.path} does not exist`);
            return null;
        }
        return (dumpUtil.dumpComponent(comp as Component));
    }

    @expose()
    async setProperty(options: ISetPropertyOptions): Promise<boolean> {
        return this.setPropertyImp(options);
    }

    private async setPropertyImp(options: ISetPropertyOptions): Promise<boolean> {
        const component = compMgr.query(options.componentPath);
        if (!component) {
            throw new Error(`Set property failed: ${options.componentPath} does not exist`);
        }
        const compProperties = (dumpUtil.dumpComponent(component as Component));
        const properties = Object.entries(options.properties);
        for (const [key, value] of properties) {
            if (!compProperties.properties[key]) {
                continue;
            }
            const compProperty = compProperties.properties[key];
            if (compProperty.type === 'array') {
                compProperty.items = value;
            } else {
                compProperty.value = value;
            }
            // 恢复数据
            await dumpUtil.restoreProperty(component, key, compProperty);
        }
        return true;
    }

    @expose()
    async queryAllComponent() {
        const keys = Object.keys(cc.js._registeredClassNames);
        const components: string[] = [];
        keys.forEach((key) => {
            try {
                const cclass = new cc.js._registeredClassNames[key];
                if (cclass instanceof cc.Component) {
                    components.push(cc.js.getClassName(cclass));
                }
            } catch (e) { }

        });
        return components;
    }
}
