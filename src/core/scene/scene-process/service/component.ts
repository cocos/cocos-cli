import type { IAddComponentOptions, ISetPropertyOptions, IComponentInfo, IComponent, IComponentService, IDeleteComponentOptions, IQueryComponentOptions } from '../../common';
import dumpUtil from './dump'
import { IComponentMenu, IProperty } from '../../@types/public';
import { register, expose } from './decorator';
import compMgr from './component/index';

const NodeMgr = EditorExtends.Node;

import {
    js,
    Component,
    Constructor,
} from 'cc';


/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Component')
export class ComponentService implements IComponentService {
    private addComponentImpl(uuid: string, componentName: string): Component {
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.addComponentImpl(id, componentName);
            });
            throw new Error('don\'t add component to more than one node at one time');
        }
        const node = NodeMgr.getNode(uuid);
        if (!node) {
            throw new Error(`create component failed: ${uuid} does not exist`);
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
            let ctor = js.getClassById(componentName);
            if (!ctor) {
                ctor = js.getClassByName(componentName);
            }
            if (js.isChildClassOf(ctor, Component)) {
                comp = node.addComponent(ctor as Constructor<Component>); // 触发引擎上节点添加组件
            } else {
                throw new Error(`ctor with name ${componentName} is not child class of Component `);
            }
            return comp;
        } catch (error) {
            throw error;
        }
    }

    @expose()
    async addComponent(params: IAddComponentOptions): Promise<IComponent> {
        const component = await this.addComponentImpl(params.uuid, params.component);
        return { uuid: component.uuid };
    }

    @expose()
    async removeComponent(params: IDeleteComponentOptions): Promise<boolean> {
        const uuid = params.uuid;
        const comp = compMgr.query(uuid);
        if (!comp) {
            throw new Error(`Remove Component failed: ${uuid} does not exist`);
        }
        return compMgr.removeComponent(comp);
    }

    @expose()
    async queryComponent(params: IQueryComponentOptions): Promise<IComponentInfo> {
        const uuid = params.uuid;
        const comp = compMgr.query(uuid);
        if (!comp) {
            throw new Error(`Remove Component failed: ${uuid} does not exist`);
        }
        return (dumpUtil.dumpComponent(comp as Component));
    }

    @expose()
    async queryComponents(): Promise<IComponentMenu[]> {
        let menus = EditorExtends.Component.getMenus();
        const res = menus.map((item: any) => {
            const name = cc.js.getClassName(item.component);
            const cid = cc.js.getClassId(item.component);

            const isCustom = item.menuPath.indexOf('i18n:menu.custom_script') !== -1;

            let assetUuid;
            if (isCustom) {
                assetUuid = item.component.prototype.__scriptUuid;
            }

            return {
                name,
                cid,
                path: item.menuPath,
                assetUuid,
            };
        });
        return res;
    }

    @expose()
    async setProperty(options: ISetPropertyOptions): Promise<boolean> {
        return await this.setPropertyImp(options.uuid, options.path, options.properties);
    }

    private setPropertyImp(uuid: string, path: string, properties: IProperty, record: boolean = true): boolean {
        // 多个节点更新值
        if (Array.isArray(uuid)) {
            try {
                for (let i = 0; i < uuid.length; i++) {
                    this.setPropertyImp(uuid[i], path, properties);
                }
                return true;
            } catch (e) {
                console.error(e);
                throw e;
            }
        }
        const node = compMgr.query(uuid);
        if (!node) {
            throw new Error(`Set property failed: ${uuid} does not exist`);
        }

        // 恢复数据
        dumpUtil.restoreProperty(node, path, properties);

        return true;
    }
}
