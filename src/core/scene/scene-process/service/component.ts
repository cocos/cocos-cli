import { Component, Constructor } from 'cc';
import { Rpc } from '../rpc';
import { register, Service, BaseService } from './core';
import {
    IComponentEvents,
    IAddComponentOptions,
    IComponent,
    IComponentService,
    IQueryComponentOptions,
    IRemoveComponentOptions,
    ISetPropertyOptions, NodeEventType
} from '../../common';
import dumpUtil from './dump';
import compMgr from './component/index';
import componentUtils from './component/utils';
import { isEditorNode } from './node/node-utils';

const NodeMgr = EditorExtends.Node;

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Component')
export class ComponentService extends BaseService<IComponentEvents> implements IComponentService {
    private async addComponentImpl(path: string, componentNameOrUUIDOrURL: string): Promise<IComponent> {
        const node = NodeMgr.getNodeByPath(path);
        if (!node) {
            throw new Error(`add component failed: ${path} does not exist`);
        }
        if (!componentNameOrUUIDOrURL || componentNameOrUUIDOrURL.length <= 0) {
            throw new Error(`add component failed: ${componentNameOrUUIDOrURL} does not exist`);
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
            uuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [componentNameOrUUIDOrURL]);
        }
        if (uuid) {
            const cid = await Service.Script.queryScriptCid(uuid);
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

        this.emit('component:add', comp);

        return dumpUtil.dumpComponent(comp as Component);
    }

    async addComponent(params: IAddComponentOptions): Promise<IComponent> {
        return await this.addComponentImpl(params.nodePath, params.component);
    }

    async removeComponent(params: IRemoveComponentOptions): Promise<boolean> {
        const comp = compMgr.queryFromPath(params.path);
        if (!comp) {
            throw new Error(`Remove component failed: ${params.path} does not exist`);
        }

        this.emit('component:before-remove', comp);
        const result = compMgr.removeComponent(comp);
        // 需要立刻执行removeComponent操作，否则会延迟到下一帧
        cc.Object._deferredDestroy();
        this.emit('component:remove', comp);

        return result;
    }

    async queryComponent(params: IQueryComponentOptions): Promise<IComponent | null> {
        const comp = compMgr.queryFromPath(params.path);
        if (!comp) {
            console.warn(`Query component failed: ${params.path} does not exist`);
            return null;
        }
        return (dumpUtil.dumpComponent(comp as Component));
    }

    async setProperty(options: ISetPropertyOptions): Promise<boolean> {
        return this.setPropertyImp(options);
    }

    private async setPropertyImp(options: ISetPropertyOptions): Promise<boolean> {
        const component = compMgr.queryFromPath(options.componentPath);
        if (!component) {
            throw new Error(`Failed to set property: Target component(${options.componentPath}) not found`);
        }
        const compProperties = (dumpUtil.dumpComponent(component as Component));
        const properties = Object.entries(options.properties);

        const idx = component.node.components.findIndex(comp => comp === component);
        for (const [key, value] of properties) {
            if (!compProperties.properties[key]) {
                throw new Error(`Failed to set property: Target property(${key}) not found`);
                // continue;
            }
            const compProperty = compProperties.properties[key];
            compProperty.value = value;
            // 恢复数据
            await dumpUtil.restoreProperty(component, key, compProperty);

            this.emit('component:set-property', component, {
                type: NodeEventType.SET_PROPERTY,
                propPath: `__comps__.${idx}.${key}`,
            });
        }
        return true;
    }

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

    public init() {
        this.registerCompMgrEvents();
    }

    private readonly CompMgrEventHandlers = {
        ['add']: 'add',
        ['remove']: 'remove',
    } as const;
    private compMgrEventHandlers = new Map<string, (...args: []) => void>();
    /**
     * 注册引擎 Node 管理相关事件的监听
     */
    registerCompMgrEvents() {
        this.unregisterCompMgrEvents();
        Object.entries(this.CompMgrEventHandlers).forEach(([eventType, handlerName]) => {
            const handler = (this as any)[handlerName].bind(this);
            EditorExtends.Component.on(eventType, handler);
            this.compMgrEventHandlers.set(eventType, handler);
        });
    }

    unregisterCompMgrEvents() {
        Object.keys(this.CompMgrEventHandlers).forEach(eventType => {
            const handler = this.compMgrEventHandlers.get(eventType);
            if (handler) {
                EditorExtends.Component.off(eventType, handler);
                this.compMgrEventHandlers.delete(eventType);
            }
        });
    }

    /**
     * 添加到组件缓存
     * @param {String} uuid
     * @param {cc.Component} component
     */
    add(uuid: string, component: Component) {
        if (isEditorNode(component.node)) {
            return;
        }
        this.emit('component:added', component);
    }

    /**
     * 移除组件缓存
     * @param {String} uuid
     * @param {cc.Component} component
     */
    remove(uuid: string, component: Component) {
        if (isEditorNode(component.node)) {
            return;
        }
        this.emit('component:removed', component);
    }
}
