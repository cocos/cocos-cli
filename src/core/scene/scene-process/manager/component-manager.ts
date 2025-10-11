import type { ICreateComponentOptions, SetPropertyOptions, IDeleteNodeOptions, IComponentInfo, IComponentManager, IUpdateNodeOptions } from '../../interfaces';
import dumpUtil from './export/dump'
import { IComponent, IComponentMenu, IProperty } from '../../@types/public';

const NodeMgr = EditorExtends.Node;
const ComponentMgr = EditorExtends.Component;
import {
    js,
    Component,
    Constructor,
} from 'cc';

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
export class componentManager implements IComponentManager {
    private createComponentImpl(uuid: string, componentName: string): boolean {
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.createComponentImpl(id, componentName);
            });
            console.warn('don\'t add component to more than one node at one time');
            return false;
        }
        const node = NodeMgr.getNode(uuid);
        if (!node) {
            console.warn(`create component failed: ${uuid} does not exist`);
            return false;
        }
        if(!componentName || componentName.length <= 0) {
            console.warn(`create component failed: ${componentName} does not exist`);
            return false;
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
            return true;
        } catch (error) {
            return false;
        }
        return true;
    }

    createComponent(params: ICreateComponentOptions): Promise<IComponentInfo | null> {
        return new Promise<IComponentInfo | null>(async (resolve, reject) => {
            const ret = await this.createComponentImpl(params.uuid, params.component);
            if(ret) {
                resolve(true);
            } else {
                reject()
            }
        });
    }

    deleteComponent(params: ICreateComponentOptions): Promise<IComponentInfo | null> {
        return new Promise<IComponentInfo | null>(async (resolve, reject) => {
            const uuid = params.uuid;
            const comp = ComponentMgr.getComponent(uuid);
            if (!comp) {
                reject(`Remove Component failed: ${uuid} does not exist`);
            }

            ComponentMgr.remove(params.uuid);
            resolve(null);
        });
    }

    queryComponent(params: ICreateComponentOptions): Promise<IComponent> {
        return new Promise<IComponent>(async (resolve, reject) => {
            const uuid = params.uuid;
            const comp = ComponentMgr.getComponent(uuid);
            if (!comp) {
                reject(`Remove Component failed: ${uuid} does not exist`);
            }
            resolve(dumpUtil.dumpComponent(comp));
        });
    }

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

    setProperty(options: SetPropertyOptions): Promise<boolean> {
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
        const node = ComponentMgr.getComponent(uuid);
        if (!node) {
            console.warn(`Set property failed: ${uuid} does not exist`);
            return false;
        }

        // 恢复数据
        dumpUtil.restoreProperty(node, path, dump);

        return true;
    }
}

export const nodeManager = new componentManager();
