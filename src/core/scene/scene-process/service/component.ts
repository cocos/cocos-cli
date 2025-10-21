import type { IAddComponentOptions, ISetPropertyOptions, IComponentIdentifier, IComponent, IComponentService, IRemoveComponentOptions, IQueryComponentOptions } from '../../common';
import dumpUtil from './dump'
import { IProperty } from '../../@types/public';
import { register, expose } from './decorator';
import compMgr from './component/index';

const NodeMgr = EditorExtends.Node;

import {
    js,
    Component,
    Constructor
} from 'cc';

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Component')
export class ComponentService implements IComponentService {
    private addComponentImpl(path: string, componentName: string): IComponent {
        if (Array.isArray(path)) {
            path.forEach((p) => {
                this.addComponentImpl(p, componentName);
            });
            throw new Error('don\'t add component to more than one node at one time');
        }
        const node = NodeMgr.getNodeByPath(path);
        if (!node) {
            throw new Error(`create component failed: ${path} does not exist`);
        }
        if (!componentName || componentName.length <= 0) {
            throw new Error(`create component failed: ${componentName} does not exist`);
        }
        // 需要单独处理 missing script
        if (componentName === 'MissingScript' || componentName === 'cc.MissingScript') {
            throw new Error('Reset Component failed: MissingScript does not exist');
        }
        let comp = null;
        try {
            /**
             * 增加编辑器对外 create-component 接口的兼容性
             * getClassById(string) 查不到的时候，再查一次 getClassByName(string)
             */
            let ctor = cc.js.getClassById(componentName);
            if (!ctor) {
                ctor = cc.js.getClassByName(componentName);
            }
            if (cc.js.isChildClassOf(ctor, Component)) {
                comp = node.addComponent(ctor as Constructor<Component>); // 触发引擎上节点添加组件
            } else {
                console.log(`ctor with name ${componentName} is not child class of Component `);
                throw new Error(`ctor with name ${componentName} is not child class of Component `);
            }
            return (dumpUtil.dumpComponent(comp as Component));
        } catch (error) {
            throw error;
        }
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
        return await this.setPropertyImp(options.componentPath, options.mountPath, options.properties);
    }

    private setPropertyImp(componentPath: string, path: string, properties: IProperty, record: boolean = true): boolean {
        // 多个节点更新值
        if (Array.isArray(componentPath)) {
            try {
                for (let i = 0; i < componentPath.length; i++) {
                    this.setPropertyImp(componentPath[i], path, properties);
                }
                return true;
            } catch (e) {
                console.error(e);
                throw e;
            }
        }
        const node = compMgr.query(componentPath);
        if (!node) {
            throw new Error(`Set property failed: ${componentPath} does not exist`);
        }

        // 恢复数据
        dumpUtil.restoreProperty(node, path, properties);

        return true;
    }
}
