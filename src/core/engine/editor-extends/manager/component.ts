'use strict';

import { EventEmitter } from 'events';
import pathManager from './node-path-manager';
import { rsort } from 'semver';

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
    _pathToUuid: Map<string, string> = new Map();
    // 小写路径映射多个原始路径，例如小写路径：a/b/c, 原始路径可能是：a/B/c, A/B/c等
    _caseInsensitivePathMap: Map<string, string[]> = new Map();
    _uuidToPath: Map<string, string> = new Map();

    _addOriginPathToCaseInsensitivePathMap(lowercasePath: string, originalPaths: string) {
        if (!this._caseInsensitivePathMap.has(lowercasePath)) {
            this._caseInsensitivePathMap.set(lowercasePath, []);
        }
        this._caseInsensitivePathMap.get(lowercasePath)!.push(originalPaths);
    }

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
    _map: { [index: string]: any } = {};

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

        this._mapComponentToPath(component);

        try {
            this.emit('add', uuid, component);
        } catch (error) {
            console.error(error);
        }
    }

    _mapComponentToPath(component: any) {
        const path = this._generateUniquePath(component);
        this._pathToUuid.set(path, component.uuid);
        this._addOriginPathToCaseInsensitivePathMap(path.toLocaleLowerCase(), path);
        this._uuidToPath.set(component.uuid, path);
    }

    _removeComponentPath(uuid: any) {
        if (!this._uuidToPath.has(uuid)) {
            return;
        }
        const path = this._uuidToPath.get(uuid);
        this._uuidToPath.delete(uuid);
        if (path === undefined || !this._pathToUuid.has(path)) {
            return;
        }
        this._pathToUuid.delete(path);

        const originPaths = this._caseInsensitivePathMap.get(path.toLocaleLowerCase());
        if (originPaths === undefined) {
            return;
        }
        if (originPaths.length === 1) {
            this._caseInsensitivePathMap.delete(path.toLocaleLowerCase());
        } else {
            const index = originPaths.indexOf(path);
            if (index > -1) {
                originPaths.splice(index, 1);
            }
        }
    }

    _generateUniquePath(component: any) {
        const className = cc.js.getClassName(component);
        const nodeComponents = component.node.getComponents(className);
        const nodePath = pathManager.getNodePath(component.node.uuid);
        return `${nodePath}/${className}_${nodeComponents.length}`;
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
        this._removeComponentPath(uuid);
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

    _getUuidFromLowercasePath(path: string): { code: number, errMsg: string, uuid: string } {
        let uuid: string | undefined = '';
        const lowercasePath = path.toLocaleLowerCase();
        if (!this._caseInsensitivePathMap.has(lowercasePath)) {
            return { code: -1, errMsg: `No component found for this path(${path}).`, uuid: '' };
        }
        const originalPaths = this._caseInsensitivePathMap.get(lowercasePath)!;
        if (originalPaths.length > 1) {
            let paths = '';
            originalPaths.forEach((originalPath, index) => {
                paths += originalPath;
                if (index !== originalPaths.length - 1) {
                    paths += ',';
                }
            });
            return { code: -2, errMsg: `This path contains multiple component paths(${paths}). Please specify which one to use.`, uuid: '' };
        } else {
            uuid = this._pathToUuid.get(originalPaths.at(0)!);
            if (!uuid) {
                throw `Logic error: No corresponding component found.`;
            }
        }
        return { code: 0, errMsg: '', uuid: uuid };
    }

    _tryAddUnderscore(componentName: string, componentPath: string): { code: number, errMsg: string, uuid: string } {
        // 尝试添加 _1, 只支持这个
        const newFullPath = componentPath + '/' + componentName + '_1';
        return this._getUuidFromLowercasePath(newFullPath);
    }

    getComponentFromPath(path: string) {
        const uuid = this._pathToUuid.get(path);
        if (uuid) {
            return this.getComponent(uuid);
        }
        const index = path.lastIndexOf('/');
        let result = this._getUuidFromLowercasePath(path);
        if (result.code === 0) {
            return this.getComponent(result.uuid);
        } else if (result.code === -2) {
            // 这是已经找到路径，但是有多条
            throw result.errMsg;
        } else if (result.code === -1) {
            // 异常，表示未找到合适的组件
            const componentName = path.substring(index + 1).toLowerCase();
            const componentPath = path.substring(0, index).toLowerCase();
            if (componentName.startsWith('cc.')) {
                // 尝试添加_1  a/b/c/cc.xxx_1 => a/b/c/cc.xxx_1
                if (componentName.lastIndexOf('_') !== -1) {
                    throw `No component found for this path(${path}).`;
                }
                result = this._tryAddUnderscore(componentName, componentPath);
                if (result.code !== 0) {
                    if (result.code === -1) {
                        console.warn(result.errMsg);  // 这是修改后路径打印的日志
                        throw `No component found for this path(${path}).`; // 这是输出返回提示的日志
                    } else {
                        throw result.errMsg;
                    }
                    
                }
                return this.getComponent(result.uuid);
            }
            // 添加'cc.',  a/b/c/xxx_1 => a/b/c/cc.xxx_1
            const newFullPath = componentPath + '/cc.' + componentName;
            result = this._getUuidFromLowercasePath(newFullPath);
            if (result.code === 0) {
                return this.getComponent(result.uuid);
            } else if (result.code === -2) {
                // 这是已经找到路径，但是有多条
                throw result.errMsg;
            } else if (result.code === -1) {
                // 添加'cc.',  a/b/c/xxx => a/b/c/cc.xxx_1
                if (componentName.lastIndexOf('_') !== -1) {
                    throw `No component found for this path(${path}).`;
                }
                result = this._tryAddUnderscore('cc.' + componentName, componentPath);
                if (result.code !== 0) {
                    if (result.code === -1) {
                        console.warn(result.errMsg);  // 这是修改后路径打印的日志
                        throw `No component found for this path(${path}).`; // 这是输出返回提示的日志
                    } else {
                        throw result.errMsg;
                    }
                }
                return this.getComponent(result.uuid);
            }
        }
    }

    getPathFromUuid(uuid: string) {
        return this._uuidToPath.get(uuid) || '';
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
