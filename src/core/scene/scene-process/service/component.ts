import type { ICreateComponentOptions, ISetPropertyOptions, IComponentInfo, IComponent, IComponentService, IDeleteComponentOptions, IQueryComponentOptions } from '../../common';
import dumpUtil from './export/dump'
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
export class componentService implements IComponentService {
    private createComponentImpl(uuid: string, componentName: string): IComponent | null {
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.createComponentImpl(id, componentName);
            });
            console.warn('don\'t add component to more than one node at one time');
            return null;
        }
        const node = NodeMgr.getNode(uuid);
        if (!node) {
            console.warn(`create component failed: ${uuid} does not exist`);
            return null;
        }
        if(!componentName || componentName.length <= 0) {
            console.warn(`create component failed: ${componentName} does not exist`);
            return null;
        }
        let comp = null;
        try {
            // 需要单独处理 missing script
            if (componentName === 'MissingScript' || componentName === 'cc.MissingScript') {
                throw new Error('Reset Component failed: MissingScript does not exist');
            }
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
                console.error(`ctor with name ${componentName} is not child class of Component `);
            }  
            
            return comp;
        } catch (error) {
            console.error(`${error}`);
        }
        return null;
    }
    
    @expose()
    createComponent(params: ICreateComponentOptions): Promise<IComponent | null> {
        return new Promise<IComponent | null>(async (resolve, reject) => {
            const component = await this.createComponentImpl(params.uuid, params.component);
            if(component != null) {
                resolve({uuid: component.uuid});
            } else {
                reject()
            }
        });
    }

    @expose()
    removeComponent(params: IDeleteComponentOptions): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            const uuid = params.uuid;
            const comp = compMgr.query(uuid);
            if (!comp) {
                reject(`Remove Component failed: ${uuid} does not exist`);
                return;
            }
            resolve(compMgr.removeComponent(comp));
        });
    }

    @expose()
    queryComponent(params: IQueryComponentOptions): Promise<IComponentInfo> {
        return new Promise<IComponentInfo>(async (resolve, reject) => {
            const uuid = params.uuid;
            const comp = compMgr.query(uuid);
            if (!comp) {
                reject(`Remove Component failed: ${uuid} does not exist`);
            }
            resolve(dumpUtil.dumpComponent(comp as Component));
        });
    }

    @expose()
    queryComponents(): Promise<IComponentMenu[]> {
        return new Promise<IComponentMenu[]>(async (resolve, reject) => {
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
            resolve(res);
        });
    }

    @expose()
    setProperty(options: ISetPropertyOptions): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            const ret = await this.setPropertyImp(options.uuid, options.path, options.dump);
            if(ret) {
                resolve(true);
            } else {
                reject()
            }
        });
    }

    private setPropertyImp(uuid: string, path: string, dump: IProperty, record:boolean = true): boolean {
        // 多个节点更新值
        if (Array.isArray(uuid)) {
            try {
                for (let i = 0; i < uuid.length; i++) {
                    this.setPropertyImp(uuid[i], path, dump);
                }
                return true;
            } catch (e) {
                console.error(e);
                return false;
            }
        }
        const node = compMgr.query(uuid);
        if (!node) {
            console.warn(`Set property failed: ${uuid} does not exist`);
            return false;
        }

        // 恢复数据
        dumpUtil.restoreProperty(node, path, dump);

        return true;
    }
}
