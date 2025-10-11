'use strict';

import { EventEmitter } from 'events';

interface MenuItem {
    component: Function,
    menuPath: string,
    priority: number,
}

export default class ComponentManager extends EventEmitter {

    allow = false;

    // ---- 组件菜单相关 ----

    // 引擎内注册的 menu 列表
    _menus: MenuItem[] = [];

    /**
     * 添加一个组件的菜单项
     * @param component 
     * @param path 
     * @param priority 
     */
    addMenu(component: Function, path: string, priority?: number) {
        if (priority === undefined) {
            priority = -1;
        }
        this._menus.push({
            menuPath: path,
            component,
            priority,
        });
        this.emit('add-menu', path);
    }

    /**
     * 删除一个组件的菜单项
     * @param component 
     */
    removeMenu(component: Function) {
        for (let i = 0; i < this._menus.length; i++) {
            if (this._menus[i].component !== component) {
                continue;
            }
            const item = this._menus[i];
            this._menus.splice(i--, 1);
            this.emit('delete-menu', item.menuPath);
        }
    }

    /**
     * 查询已经注册的组件菜单项
     */
    getMenus() {
        return this._menus;
    }

    // ---- 组件实例管理 ----

    // component
    _map: {[index: string]: any} = {};

    // 被删除的 component
    // _recycle: {[index: string]: any} = {};

    /**
     * 新增一个组件
     * 1. 调用Node的addComponent时会调用此方法
     * 2. Node添加到场景树时，会遍历身上的组件调用此方法
     * @param uuid 
     * @param component 
     */
    add(uuid: string, component: any) {
        if (!this.allow) {
            return;
        }
        this._map[uuid] = component;
        try {
            this.emit('add', uuid, component);
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * 删除一个组件
     * 1. 调用Node的_removeComponent时会调用此方法,removeComponent会在下一帧调用_removeComponent,
     * removeComponent会调用一些Component的生命周期函数，而_removeComponent不会。
     * 2. Node添加到场景树时，会遍历身上的组件调用此方法
     * @param uuid 
     */
    remove(uuid: string) {
        if (!this.allow) {
            return;
        }
        if (!this._map[uuid]) {
            return;
        }
        const comp = this._map[uuid];
        // this._recycle[uuid] = this._map[uuid];
        delete this._map[uuid];
        try {
            this.emit('remove', uuid, comp);
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * 清空全部数据
     */
    clear() {
        if (!this.allow) {
            return;
        }
        this._map = {};
        // this._recycle = {};
        
    }

    /**
     * 获取一个指定的组件
     * @param uuid 
     */
    getComponent(uuid: string) {
        return this._map[uuid] || null;
    }

    /**
     * 获取所有的组件数据
     */
    getComponents() {
        return this._map;
    }

    changeUUID(oldUUID: string, newUUID: string) {
        if (oldUUID === newUUID) {
            return;
        }

        const comp = this._map[oldUUID];
        if (!comp) {
            return;
        }

        comp._id = newUUID;

        this._map[newUUID] = comp;
        delete this._map[oldUUID];
    }
}
