import { Component, Constructor, animation, Animation, Node, RigidBody, Collider, ERigidBodyType, EColliderType, MeshCollider, UITransform, director, Canvas } from 'cc';
import { Rpc } from '../rpc';
import { register, Service, BaseService } from './core';
import {
    IComponentEvents,
    IAddComponentOptions,
    IComponent,
    IComponentService,
    IQueryComponentOptions,
    IRemoveComponentOptions,
    ISetPropertyOptions, NodeEventType,
    IExecuteComponentMethodOptions,
    IComponentForPinK
} from '../../common';
import dumpUtil from './dump';
import compMgr from './component/index';
import componentUtils from './component/utils';
import { hasOneKindOfComponent } from './node/node-utils';
import { isEditorNode } from './node/node-utils';
import { createShouldHideInHierarchyCanvasNode } from './node/node-create';
import PrefabService from './prefab';
import { IProperty } from '../../@types/public';

const NodeMgr = EditorExtends.Node;
enum SceneModeType {
    General = 'general',
    Prefab = 'prefab',
    Animation = 'animation',
    Preview = 'preview',
    Unset = '',
}

export interface IOptionBase {
    modeName?: string; // 当前所处的模式
}

interface ISceneEvents {

    // Component events
    onAddComponent?(comp: Component): void;
    onRemoveComponent?(comp: Component): void;
    onComponentAdded?(comp: Component, opts?: IOptionBase): void;
    onComponentRemoved?(comp: Component, opts?: IOptionBase): void;
}

export { ISceneEvents };

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Component')
export class ComponentService extends BaseService<IComponentEvents> implements IComponentService {
    public modeName: SceneModeType = SceneModeType.General;
    // private _stagingCameraInfo: any;
    protected _sceneEventListener: ISceneEvents[] = [];
    protected _recycleComponent: Record<string, Component> = {};

    constructor() {
        super();
        compMgr.on('add', this.onAddComponent.bind(this));
        compMgr.on('remove', this.onRemoveComponent.bind(this));
        compMgr.on('added', this.onComponentAdded.bind(this));
        compMgr.on('removed', this.onComponentRemoved.bind(this));
    }

    /**
     * 查询当前正在编辑的模式名字
     */
    public queryMode() {
        return this.modeName;
    }

    public onAddComponent(comp: Component, opts: IOptionBase = {}) {
        opts.modeName = this.modeName;
        // TODO(qgh): 发送消息
        //this.dispatchEvents('onAddComponent', comp, opts);
    }

    public onRemoveComponent(comp: Component, opts: IOptionBase = {}) {
        opts.modeName = this.modeName;
        // TODO(qgh): 发送消息
        //this.dispatchEvents('onRemoveComponent', comp, opts);
        // 编辑器中的this._sceneProxy.getRootNode()实现返回的是null
        PrefabService.onRemoveComponentInGeneralMode(comp, null);
        //this._prefabMgr.onRemoveComponentInGeneralMode(comp, this._sceneProxy.getRootNode());
    }

    public onComponentAdded(comp: Component, opts: IOptionBase = {}) {
        opts.modeName = this.modeName;
        // TODO(qgh): 发送消息
        //this.dispatchEvents('onComponentAdded', comp, opts);
        if (this._recycleComponent[comp.uuid]) {
            delete this._recycleComponent[comp.uuid];
        }
    }

    public onComponentRemoved(comp: Component, opts: IOptionBase = {}) {
        opts.modeName = this.modeName;
        // TODO(qgh): 发送消息
        // this.dispatchEvents('onComponentRemoved', comp);
        // 编辑器中的this._sceneProxy.getRootNode()实现返回的是null
        PrefabService.onComponentRemovedInGeneralMode(comp, null);
        this._recycleComponent[comp.uuid] = comp;
    }

    public dispatchEvents(eventName: keyof ISceneEvents, ...args: any[any]) {
        this._sceneEventListener.forEach((listener) => {
            if (listener && listener[eventName]) {
                // @ts-ignore
                listener[eventName]!.apply(listener, args);
            }
        });
    }

    private async addComponentImpl(nodePathOrUuid: string, component: string): Promise<IComponent> {
        const node = NodeMgr.getNodeByPath(nodePathOrUuid) ?? NodeMgr.getNode(nodePathOrUuid);
        if (!node) {
            throw new Error(`add component failed: ${nodePathOrUuid} does not exist`);
        }
        if (!component || component.length <= 0) {
            throw new Error(`add component failed: ${component} does not exist`);
        }
        // 需要单独处理 missing script
        if (component === 'MissingScript' || component === 'cc.MissingScript') {
            throw new Error('Reset Component failed: MissingScript does not exist');
        }

        // 处理 URL 与 Uuid
        const isURL = component.startsWith('db://');
        const isUuid = componentUtils.isUUID(component);
        let uuid;
        if (isUuid) {
            uuid = component;
        } else if (isURL) {
            uuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [component]);
        }

        let ctor = null;
        let comp = null;
        if (uuid) {
            const cid = await Service.Script.queryScriptCid(uuid);
            if (cid && cid !== 'MissingScript' && cid !== 'cc.MissingScript') {
                component = cid;
                ctor = cc.js.getClassById(cid);
                if (!ctor) {
                    ctor = cc.js.getClassByName(cid);
                }
                if (!ctor) {
                    // 理论上不会出现这个错误，出现了需要定位下
                    throw `Component script(${cid}) name exists but constructor does not exist.`;
                }
            } else {
                // uuid存在，脚本也存在，但是组件ID不存在，则表示异常
                const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
                if (assetInfo?.file && assetInfo?.file.length > 0) {
                    throw `Check if the script(${uuid}) contains any errors.`;
                }
            }
        } else {
            ctor = cc.js.getClassById(component);
            if (!ctor) {
                ctor = cc.js.getClassByName(component);
            }
        }

        if (!ctor) {
            // 首字母是否大写
            const isStartWithUppercase = (component.charAt(0) == component.charAt(0).toUpperCase());
            if (!isStartWithUppercase) {
                // 首字母大写查询
                const fullName = component.charAt(0).toUpperCase() + component.slice(1);
                ctor = cc.js.getClassByName(fullName);
            }
            if (!ctor && !isUuid && !isURL) {
                if (!component.startsWith('cc.')) {
                    // 添加 'cc.' 查询
                    const fullName = 'cc.' + component;
                    ctor = cc.js.getClassByName(fullName);
                    if (!ctor && !isStartWithUppercase) {
                        // 添加 cc. 并且后面首字母大写
                        const fullName = 'cc.' + component.charAt(0).toUpperCase() + component.slice(1);
                        ctor = cc.js.getClassByName(fullName);
                    }
                } else if (component.length > 3 && component.charAt(3) != component.charAt(0).toUpperCase()) {
                    // 如果是 cc.lalel 直接更换为 cc.Label 查询
                    const fullName = component.slice(0, 3) + component.at(3)?.toUpperCase() + component.slice(4);
                    ctor = cc.js.getClassByName(fullName);
                }
            }
        }
        if (!ctor) {
            console.error(`ctor with name ${component} is not found `);
            if (isUuid) {
                throw new Error(`Target Component('${component}') Not Found. Hint: Please use the correct component uuid`);
            } else if (isURL) {
                throw new Error(`Target Component('${component}') Not Found. Hint: Please use the correct component url`);
            } else {
                throw new Error(`Target Component('${component}') Not Found. Hint: Please use the correct component name`);
            }
        }
        if (cc.js.isChildClassOf(ctor, Component)) {
            comp = node.addComponent(ctor as Constructor<Component>); // 触发引擎上节点添加组件
        } else {
            console.error(`ctor with name ${component} is not child class of Component `);
            throw new Error(`Constructor has been found, but it is not component-based.`);
        }
        this.emit('component:add', comp);

        return dumpUtil.dumpComponent(comp as Component);
    }

    async addComponent(params: IAddComponentOptions): Promise<IComponent> {
        try {
            await Service.Editor.lock();
            return await this.addComponentImpl(params.nodePathOrUuid, params.component);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }


    /**
     * 创建组件
     * @param params
     */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    private requireComponentList: Function[] = [];

    async createComponent(params: IAddComponentOptions): Promise<boolean> {
        if (Array.isArray(params.component)) {
            params.component.forEach((id) => {
                this.createComponent({ nodePathOrUuid: params.nodePathOrUuid, component: id });
            });
            console.warn('don\'t add component to more than one node at one time');
            return false;
        }
        const node = NodeMgr.getNodeByPath(params.nodePathOrUuid) ?? NodeMgr.getNode(params.nodePathOrUuid);
        if (!node) {
            console.warn(`create component failed: ${params.nodePathOrUuid} does not exist`);
            return false;
        }

        if (params.component) {
            // 发送节点修改消息
            this.emit('node:before-change', node);
            this.emit('component:before-add-component', params.component, node);

            let comp = null;
            try {
                // 需要单独处理 missing script
                if (params.component === 'MissingScript' || params.component === 'cc.MissingScript') {
                    throw new Error('Reset Component failed: MissingScript does not exist');
                }

                /**
                 * 增加编辑器对外 create-component 接口的兼容性
                 * getClassById(string) 查不到的时候，再查一次 getClassByName(string)
                 */
                let ctor = cc.js.getClassById(params.component);
                if (!ctor) {
                    ctor = cc.js.getClassByName(params.component);
                }
                if (cc.js.isChildClassOf(ctor, Component)) {
                    let iterateObj = ctor as any;
                    if (iterateObj._requireComponent) {
                        while (iterateObj._requireComponent) {
                            this.requireComponentList.push(iterateObj._requireComponent);
                            iterateObj = iterateObj._requireComponent;
                        }
                    }
                    comp = node.addComponent(ctor as Constructor<Component>); // 触发引擎上节点添加组件
                    this.requireComponentList = [];
                } else {
                    console.error(`ctor with name ${params.component} is not child class of Component `);
                }
                const mode = this.queryMode();
                if (mode === 'prefab') {
                    // 理论上应该使用
                    const rootNode = Service.Editor.getRootNode();
                    if (rootNode && hasOneKindOfComponent(node, UITransform) && !hasOneKindOfComponent(rootNode, Canvas)) {
                        // 为了显示，节点结构为：scene node > canvas node > prefab root node
                        createShouldHideInHierarchyCanvasNode(director.getScene()!).then((target) => {
                            rootNode.parent = target;
                        });
                    }
                }
                this.checkComponentsCollision(node);
                this.checkDynamicBodyShape(node);
            } catch (error) {
                console.error(error);
            }
            if (comp) {
                compMgr.onComponentAddedFromEditor(comp);
            }

            // 发送节点修改消息
            this.emit('node:change', node, { type: NodeEventType.CREATE_COMPONENT });
        } else {
            console.warn(`create component failed: ${params.component} does not exist`);
            return false;
        }

        return true;
    }


    async checkComponentsCollision(node: Node) {
        if (hasOneKindOfComponent(node, animation.AnimationController) && hasOneKindOfComponent(node, Animation)) {
            console.warn('scene.contributions.messages.description.animationComponentCollision');
        }
    }

    checkDynamicBodyShape(ndoe: Node) {
        if (hasOneKindOfComponent(ndoe, RigidBody) && hasOneKindOfComponent(ndoe, Collider)) {
            // get the rigid body component
            const body = ndoe.getComponent(RigidBody);

            if (!body) {
                return;
            }

            // get the collider
            const collider = ndoe.getComponent(Collider);

            if (body.type === ERigidBodyType.DYNAMIC) {
                switch (collider?.type) {
                    case EColliderType.PLANE:
                    case EColliderType.TERRAIN:
                        console.warn('scene.contributions.messages.description.physicsDynamicBodyShape'); break;

                    case EColliderType.MESH:
                        if (!(collider as MeshCollider).convex) {
                            console.warn('scene.contributions.messages.description.physicsDynamicBodyShape');
                        }
                        break;

                    default:
                        break;
                }
            }
        }
    }

    /**
     * 通过 path、uuid 或 url 查找组件实例
     */
    private async findComponent(pathOrUuidOrUrl: string): Promise<Component | null> {
        const isUuid = componentUtils.isUUID(pathOrUuidOrUrl);
        const isURL = pathOrUuidOrUrl.startsWith('db://');

        if (isUuid) {
            return compMgr.query(pathOrUuidOrUrl);
        } else if (isURL) {
            const uuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [pathOrUuidOrUrl]);
            if (uuid) {
                return compMgr.query(uuid);
            }
            return null;
        } else {
            return compMgr.queryFromPath(pathOrUuidOrUrl);
        }
    }

    async removeComponent(params: IRemoveComponentOptions): Promise<boolean> {
        try {
            await Service.Editor.lock();

            const comp = await this.findComponent(params.pathOrUuidOrUrl);
            if (!comp) {
                throw new Error(`Remove component failed: ${params.pathOrUuidOrUrl} does not exist`);
            }

            this.emit('component:before-remove', comp);
            const result = compMgr.removeComponent(comp);
            // 需要立刻执行removeComponent操作，否则会延迟到下一帧
            cc.Object._deferredDestroy();
            this.emit('component:remove', comp);

            return result;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async queryComponent(params: IQueryComponentOptions): Promise<IComponent | IComponentForPinK | null> {
        const comp = await this.findComponent(params.pathOrUuidOrUrl);
        if (!comp) {
            console.warn(`Query component failed: ${params.pathOrUuidOrUrl} does not exist`);
            return null;
        }
        if (params?.isFull) {
            return (dumpUtil.dumpComponentForPinK(comp as Component));
        } else {
            return (dumpUtil.dumpComponent(comp as Component));
        }

    }

    async setProperty(options: ISetPropertyOptions): Promise<boolean> {
        try {
            await Service.Editor.lock();
            return this.setPropertyImp(options);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    /**
     * 查询一个节点的实例
     * @param {*} uuid
     * @return {cc.Node}
     */
    query(uuid: string | undefined): Node | null {
        if (typeof uuid === 'undefined') {
            return null;
        }
        // TODO(qgh): nodeMgr应该添加queryRecycleNode
        // return NodeMgr.getNode(uuid) ?? NodeMgr.queryRecycleNode(uuid);
        return NodeMgr.getNode(uuid);
    }

    async setPropertyForPink(uuid: string, path: string, dump: IProperty, record: boolean = true): Promise<boolean> {
        // 多个节点更新值
        if (Array.isArray(uuid)) {
            try {
                for (let i = 0; i < uuid.length; i++) {
                    await this.setPropertyForPink(uuid[i], path, dump);
                }
                return true;
            } catch (e) {
                console.error(e);
                return false;
            }
        }
        const node = this.query(uuid);
        if (!node) {
            console.warn(`Set property failed: ${uuid} does not exist`);
            return false;
        }

        // 触发修改前的事件
        this.emit('node:before-change', node);
        if (path === 'parent' && node.parent) {
            // 发送节点修改消息
            this.emit('node:before-change', node.parent);
        }

        // 恢复数据
        try {
            await dumpUtil.restoreProperty(node, path, dump, true);
        } catch (e) {
            console.error(e);
            return false;
        }

        // 触发修改后的事件
        this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: path, record: record });
        // 如果是数组的话，需要依次 emit change，路径定位到数组的下标位置
        if (dump.isArray && Array.isArray(dump.value)) {
            dump.value.forEach((item, i) => {
                this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: `${path}.${i}`, record: record });
            });
        }
        // 改变父子关系
        if (path === 'parent' && node.parent) {
            // 发送节点修改消息
            this.emit('node:change', node.parent, { type: NodeEventType.SET_PROPERTY, propPath: 'children', record: record });
        }
        return true;
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

    /**
     * 重置组件
     * @param uuid component 的 uuid
     */
    public async resetComponent(params: IQueryComponentOptions): Promise<boolean> {
        try {
            const comp = await this.findComponent(params.pathOrUuidOrUrl);
            if (!comp) {
                console.warn(`Reset Component failed: ${params.pathOrUuidOrUrl} does not exist`);
                return false;
            }
            // 发送节点修改消息
            this.emit('node:before-change', comp.node);

            const result = await compMgr.resetComponent(comp);

            // 发送节点修改消息
            this.emit('node:change', comp.node, { type: NodeEventType.RESET_COMPONENT });
            return result;
        } catch (e) {
            console.warn(e);
            return false;
        }
    }

    public async executeComponentMethod(options: IExecuteComponentMethodOptions): Promise<boolean> {
        return await compMgr.executeComponentMethod(options.uuid, options.name, options.args);
    }
}
