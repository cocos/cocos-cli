import { EventEmitter } from 'events';
import dumpUtil from '../dump';
const { get } = require('lodash');

const CompMgr = EditorExtends.Component;
import utils from './utils';
import { Component, MissingScript } from 'cc';
import { IProperty } from '../../../@types/public';

export class CompManager extends EventEmitter {
    init() {
        this.registerCompMgrEvents();
    }
    _onCompAdded?: (uuid: string, component: Component) => void;
    _onCompRemoved?: (uuid: string, component: Component) => void;
    /**
     * 注册引擎Component管理相关事件的监听
     */
    registerCompMgrEvents() {
        this._onCompAdded = this.add.bind(this);
        CompMgr.on('add', this._onCompAdded);
        this._onCompRemoved = this.remove.bind(this);
        CompMgr.on('remove', this._onCompRemoved);
    }

    /**
     * 反注册引擎Component管理相关事件的监听
     */
    unregisterCompMgrEvents() {
        if (this._onCompAdded) {
            CompMgr.off('add', this._onCompAdded);
        }
        if (this._onCompRemoved) {
            CompMgr.off('remove', this._onCompRemoved);
        }
    }

    /**
     * 清空当前管理的节点
     */
    clear() {
        CompMgr.clear();
    }

    /**
     * 添加到组件缓存
     * @param {String} uuid
     * @param {cc.Component} component
     */
    add(uuid: string, component: Component) {

    }

    /**
     * 移除组件缓存
     * @param {String} uuid
     * @param {cc.Component} component
     */
    remove(uuid: string, component: Component) {
        this.emit('removed', component);
    }

    /**
     * 查询一个组件的实例
     * @param {*} uuid
     * @returns {cc.Component}
     */
    query(uuid: string): Component | null
    query<T extends Component>(uuid: string): T | null
    query<T extends Component>(uuid: string): T | null {
        return CompMgr.getComponent(uuid) || null;
    }

    /**
     * 获取所有在用的组件
     */
    queryAll() {
        return CompMgr.getComponents();
    }

    /**
     * 在回收站中查询一个组件的实例
     * @param {*} uuid
     * @returns {cc.Component}
     */
    queryRecycle(uuid: string) {

    }

    /**
     * 在编辑器中删除一个component
     * @param {*} component 组件
     */
    removeComponent(component: Component) {
        // 删除前查询依赖关系，被依赖的组件不能被删除
        // @ts-ignore
        if (component.node._getDependComponent(component).length > 0) {
            console.warn('Dependent components cannot be removed.');
            return false;
        }

        this.emit('before-remove-component', component);
        component.node.removeComponent(component);
        // 需要立刻执行removeComponent操作，否则会延迟到下一帧
        cc.Object._deferredDestroy();

        this.emit('remove', component);

        return true;
    }

    /**
     * 在编辑器中重置 component
     * @param {*} component 组件
     */
    async resetComponent(component: any) {
        if (component instanceof MissingScript) {
            // @ts-ignore
            const __type__ = component && component._$erialized && component._$erialized.__type__ ? component._$erialized.__type__ : 'unknown';
            console.warn(`Reset Component failed: ${__type__} does not exist`);
            return false;
        }

        const skipCompProps = [
            'name',
            'node',
            'uuid',
            'enabled',
            '_name',
            '_enabled',
            '_objFlags', // 不要重置 _objFlags，否则因为没有 onEnable 的标记会导致 onDisable 不被调用，后续 remove 不掉
            '_isOnLoadCalled',
            '__scriptAsset',
            '__eventTargets',
        ];

        try {
            const node = new cc.Node();
            const newComp = node.addComponent(component.constructor);
            const dump = dumpUtil.dumpComponent(newComp);

            for (const key in dump.value) {
                if (skipCompProps.includes(key)) {
                    continue;
                }

                await dumpUtil.restoreProperty(component, key, dump.value[key]);
            }

            component && component.resetInEditor && component.resetInEditor();
            component && component.onRestore && component.onRestore();
        } catch (error) {
            console.error(error);
            return false;
        }

        return true;
    }

    /**
     * 查询一个组件，并返回该节点的 dump 数据
     *   如果组件不存在，则返回 null
     * @param {String} uuid
     */
    queryDump(uuid: string) {
        const comp = this.query(uuid);
        if (!comp) {
            return null;
        }
        return dumpUtil.dumpComponent(comp);
    }

    /**
     * 调用Component身上的方法
     * @param {*} uuid
     * @param {*} name
     * @param {*} args
     */
    async executeComponentMethod(uuid: string, name: string, args: any) {
        const comp = this.query(uuid);
        if (!comp) {
            return null;
        }

        const pathKeys = (name || '').split('.');
        const methodName = pathKeys.pop() || '';
        if (pathKeys.length > 0) {
            const methodObjPath = pathKeys.join('.');
            const methodObj = get(comp, methodObjPath);
            if (methodObj && methodName && methodObj[methodName]) {
                return await methodObj[methodName](...(args || []));
            }
        }

        if (!comp[methodName as keyof Component]) {
            return null;
        }
        // @ts-ignore
        return await comp[methodName](...(args || []));
    }

    /**
     * 设置一个组件的属性，暂时不用
     * @param {*} uuid
     * @param {*} path
     * @param {*} key
     * @param {*} dump
     */
    async setProperty(uuid: string, path: string, dump: IProperty): Promise<boolean> {
        const comp = this.query(uuid);
        if (!comp) {
            return false;
        }

        // 恢复数据
        await dumpUtil.restoreProperty(comp, path, dump);

        return true;
    }

    // 通过编辑器操作添加的Component才需要增加额外的处理，区别于引擎里发出的component添加事件
    // 否则当拖一个prefab到场景时，也会进行后处理，造成错误
    public onComponentAddedFromEditor(component: Component) {
        if (!component) {
            return;
        }

        this.emit('add', component);

        // 一些组件在添加的时候，需要执行部分特殊的逻辑
        if (component.constructor && (utils.addComponentMap as any)[component.constructor.name]) {
            (utils.addComponentMap as any)[component.constructor.name](component, component.node);
        }
    }

    changeUUID(oldUUID: string, newUUID: string) {
        CompMgr.changeUUID(oldUUID, newUUID);
    }
}
export default new CompManager();
