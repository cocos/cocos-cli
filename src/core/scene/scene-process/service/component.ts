import { Component, Constructor, animation, Animation, Node, RigidBody, Collider, ERigidBodyType, EColliderType, MeshCollider, UITransform, director, Canvas } from 'cc';
import { Rpc } from '../rpc';
import { register, Service, BaseService } from './core';
import {
    IComponentEvents,
    IAddComponentOptions,
    IComponentService,
    IQueryComponentOptions,
    IRemoveComponentOptions,
    NodeEventType,
    IExecuteComponentMethodOptions,
    IComponent,
    IQueryClassesOptions,
    ISetPropertyOptions
} from '../../common';
import dumpUtil, { translateDumpI18n } from './dump';
import compMgr from './component/index';
import componentUtils from './component/utils';
import getComponentFunctionOfNode from './component/get-component-function-of-node';
import { hasOneKindOfComponent } from './node/node-utils';
import { isEditorNode } from './node/node-utils';
import { createShouldHideInHierarchyCanvasNode } from './node/node-create';
import PrefabService from './prefab';

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
        compMgr.addRecycleComponent(comp.uuid);
    }

    public onComponentRemoved(comp: Component, opts: IOptionBase = {}) {
        opts.modeName = this.modeName;
        // TODO(qgh): 发送消息
        // this.dispatchEvents('onComponentRemoved', comp);
        // 编辑器中的this._sceneProxy.getRootNode()实现返回的是null
        PrefabService.onComponentRemovedInGeneralMode(comp, null);
        compMgr.removeRecycleComponent(comp.uuid, comp);
    }

    public dispatchEvents(eventName: keyof ISceneEvents, ...args: any[any]) {
        this._sceneEventListener.forEach((listener) => {
            if (listener && listener[eventName]) {
                // @ts-ignore
                listener[eventName]!.apply(listener, args);
            }
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    private requireComponentList: Function[] = [];

    private async resolveComponentCtor(component: string): Promise<Constructor<Component>> {
        if (component === 'MissingScript' || component === 'cc.MissingScript') {
            throw new Error('MissingScript does not exist');
        }

        const isURL = component.startsWith('db://');
        const isUuid = componentUtils.isUUID(component);
        let resolvedName = component;
        let uuid;
        if (isUuid) {
            uuid = component;
        } else if (isURL) {
            uuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [component]);
        }

        let ctor = null;
        if (uuid) {
            const cid = await Service.Script.queryScriptCid(uuid);
            if (cid && cid !== 'MissingScript' && cid !== 'cc.MissingScript') {
                resolvedName = cid;
                ctor = cc.js.getClassById(cid) || cc.js.getClassByName(cid);
                if (!ctor) {
                    throw new Error(`Component script(${cid}) name exists but constructor does not exist.`);
                }
            } else {
                const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
                if (assetInfo?.file && assetInfo?.file.length > 0) {
                    throw new Error(`Check if the script(${uuid}) contains any errors.`);
                }
            }
        } else {
            ctor = cc.js.getClassById(resolvedName) || cc.js.getClassByName(resolvedName);
        }

        if (!ctor) {
            const isStartWithUppercase = resolvedName.charAt(0) === resolvedName.charAt(0).toUpperCase();
            if (!isStartWithUppercase) {
                ctor = cc.js.getClassByName(resolvedName.charAt(0).toUpperCase() + resolvedName.slice(1));
            }
            if (!ctor && !isUuid && !isURL) {
                if (!resolvedName.startsWith('cc.')) {
                    ctor = cc.js.getClassByName('cc.' + resolvedName);
                    if (!ctor && !isStartWithUppercase) {
                        ctor = cc.js.getClassByName('cc.' + resolvedName.charAt(0).toUpperCase() + resolvedName.slice(1));
                    }
                } else if (resolvedName.length > 3 && resolvedName.charAt(3) !== resolvedName.charAt(3).toUpperCase()) {
                    ctor = cc.js.getClassByName(resolvedName.slice(0, 3) + resolvedName.charAt(3).toUpperCase() + resolvedName.slice(4));
                }
            }
        }

        if (!ctor) {
            if (isUuid) {
                throw new Error(`Target Component('${resolvedName}') Not Found. Hint: Please use the correct component uuid`);
            } else if (isURL) {
                throw new Error(`Target Component('${resolvedName}') Not Found. Hint: Please use the correct component url`);
            } else {
                throw new Error(`Target Component('${resolvedName}') Not Found. Hint: Please use the correct component name`);
            }
        }
        if (!cc.js.isChildClassOf(ctor, Component)) {
            throw new Error(`Constructor has been found, but it is not component-based.`);
        }
        return ctor as Constructor<Component>;
    }

    async add(params: IAddComponentOptions): Promise<IComponent> {
        try {
            await Service.Editor.lock();

            if (Array.isArray(params.component)) {
                let lastDump: IComponent | null = null;
                for (const id of params.component) {
                    lastDump = await this.add({ nodePath: params.nodePath, component: id });
                }
                return lastDump!;
            }

            const node = NodeMgr.getNodeByPath(params.nodePath);
            if (!node) {
                throw new Error(`create component failed: ${params.nodePath} does not exist`);
            }
            if (!params.component || params.component.length <= 0) {
                throw new Error(`create component failed: component name cannot be empty`);
            }

            const ctor = await this.resolveComponentCtor(params.component);

            this.emit('node:before-change', node);
            this.emit('component:before-add-component', params.component, node);

            // 处理 requireComponent 依赖链
            let iterateObj = ctor as any;
            if (iterateObj._requireComponent) {
                while (iterateObj._requireComponent) {
                    this.requireComponentList.push(iterateObj._requireComponent);
                    iterateObj = iterateObj._requireComponent;
                }
            }

            const comp = node.addComponent(ctor);
            this.requireComponentList = [];

            // prefab 模式下的 Canvas 创建
            const mode = this.queryMode();
            if (mode === 'prefab') {
                const rootNode = Service.Editor.getRootNode();
                if (rootNode && hasOneKindOfComponent(node, UITransform) && !hasOneKindOfComponent(rootNode, Canvas)) {
                    createShouldHideInHierarchyCanvasNode(director.getScene()!).then((target) => {
                        rootNode.parent = target;
                    });
                }
            }

            this.checkComponentsCollision(node);
            this.checkDynamicBodyShape(node);

            this.emit('component:add', comp);
            compMgr.onComponentAddedFromEditor(comp);
            this.emit('node:change', node, { type: NodeEventType.CREATE_COMPONENT });

            const dump = await translateDumpI18n(dumpUtil.dumpComponent(comp as Component)) as IComponent;
            // hack: 以下字段不属于编辑器 dump 结构（IComponent），仅用于 proxy 层将复杂的 dump 转换为 CLI 所需的扁平结构
            (dump as any).__component_path__ = compMgr.getPathFromUuid(comp.uuid) ?? '';
            (dump as any).__compPrefab__ = (comp as any).__prefab || null;
            return dump;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
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
     * 通过 path 查找组件实例，支持路径、UUID 或 URL
     */
    private async findComponent(path: string): Promise<Component | null> {
        const isUuid = componentUtils.isUUID(path);
        const isURL = path.startsWith('db://');

        if (isUuid) {
            return compMgr.query(path);
        } else if (isURL) {
            const uuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [path]);
            if (uuid) {
                return compMgr.query(uuid);
            }
            return null;
        } else {
            return compMgr.queryFromPath(path);
        }
    }

    async remove(params: IRemoveComponentOptions): Promise<boolean> {
        try {
            await Service.Editor.lock();

            const comp = await this.findComponent(params.path);
            if (!comp) {
                throw new Error(`Remove component failed: ${params.path} does not exist`);
            }

            this.emit('component:before-remove-component', comp);
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

    async queryImpl(params: IQueryComponentOptions): Promise<IComponent | null> {
        const comp = await this.findComponent(params.path);
        if (!comp) {
            console.warn(`Query component failed: ${params.path} does not exist`);
            return null;
        }
        const dump = await translateDumpI18n(dumpUtil.dumpComponent(comp as Component)) as IComponent;
        // hack: 以下字段不属于编辑器 dump 结构（IComponent），仅用于 proxy 层将复杂的 dump 转换为 CLI 所需的扁平结构
        (dump as any).__component_path__ = compMgr.getPathFromUuid(comp.uuid) ?? '';
        (dump as any).__compPrefab__ = (comp as any).__prefab || null;
        return dump;
    }

    async query(params: IQueryComponentOptions | string): Promise<IComponent | null> {
        if (typeof params === 'string') {
            return this.queryImpl({ path: params });
        } else {
            return this.queryImpl(params);
        }
    }

    async setProperty(options: ISetPropertyOptions): Promise<boolean> {
        // 多个节点更新值
        if (Array.isArray(options.nodePath)) {
            try {
                for (let i = 0; i < options.nodePath.length; i++) {
                    await this.setProperty({ nodePath: options.nodePath[i], path: options.path, dump: options.dump, record: options?.record });
                }
                return true;
            } catch (e) {
                console.error(e);
                return false;
            }
        }
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            console.warn(`Set property failed: ${options.nodePath} does not exist`);
            return false;
        }

        // 触发修改前的事件
        this.emit('node:before-change', node);
        if (options.path === 'parent' && node.parent) {
            // 发送节点修改消息
            this.emit('node:before-change', node.parent);
        }

        // 恢复数据
        try {
            await dumpUtil.restoreProperty(node, options.path, options.dump, true);
        } catch (e) {
            console.error(e);
            return false;
        }

        // 触发修改后的事件
        this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: options.path, record: options.record });
        // 如果是数组的话，需要依次 emit change，路径定位到数组的下标位置
        if (options.dump.isArray && Array.isArray(options.dump.value)) {
            options.dump.value.forEach((item, i) => {
                this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: `${options.path}.${i}`, record: options.record });
            });
        }
        // 改变父子关系
        if (options.path === 'parent' && node.parent) {
            // 发送节点修改消息
            this.emit('node:change', node.parent, { type: NodeEventType.SET_PROPERTY, propPath: 'children', record: options.record });
        }
        return true;
    }

    /**
     * 查询一个节点的实例
     * @param {*} uuid
     * @return {cc.Node}
     */
    queryNode(uuid: string | undefined): Node | null {
        if (typeof uuid === 'undefined') {
            return null;
        }
        // TODO(qgh): nodeMgr应该添加queryRecycleNode
        // return NodeMgr.getNode(uuid) ?? NodeMgr.queryRecycleNode(uuid);
        return NodeMgr.getNode(uuid);
    }

    async queryAll(): Promise<string[]> {
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

    async hasScript(name: string): Promise<boolean> {
        const classes = await this.queryClasses();
        return classes.some((cls) => cls.name === name);
    }

    async queryClasses(options?: IQueryClassesOptions): Promise<{ name: string }[]> {
        const classes = [];
        for (const name in cc.js._registeredClassNames) {
            if (options) {
                if (typeof options.extends === 'string') {
                    options.extends = [options.extends];
                }
                const subClass = cc.js._registeredClassNames[name];
                if (
                    Array.isArray(options.extends) &&
                    options.extends.some((extend: string) => {
                        const superClass = cc.js.getClassByName(extend);
                        const isChildOrSelf = cc.js.isChildClassOf(subClass, superClass);

                        if (options.excludeSelf) {
                            return isChildOrSelf && superClass !== subClass;
                        }

                        return isChildOrSelf;
                    })
                ) {
                    classes.push({ name });
                }
            } else {
                classes.push({ name });
            }
        }

        return classes;
    }

    async queryFunctionOfNode(path: string): Promise<any> {
        const node = NodeMgr.getNodeByPath(path);
        if (!node) {
            return {};
        }
        return getComponentFunctionOfNode(node);
    }

    public init() {
        this.registerCompMgrEvents();
    }

    private readonly CompMgrEventHandlers = {
        ['add']: 'onCompAdd',
        ['remove']: 'onCompRemove',
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
    onCompAdd(uuid: string, component: Component) {
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
    onCompRemove(uuid: string, component: Component) {
        if (isEditorNode(component.node)) {
            return;
        }
        this.emit('component:removed', component);
    }

    /**
     * 重置组件
     * @param uuid component 的 uuid
     */
    public async reset(params: IQueryComponentOptions): Promise<boolean> {
        try {
            const comp = await this.findComponent(params.path);
            if (!comp) {
                console.warn(`Reset Component failed: ${params.path} does not exist`);
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

    public async executeMethod(options: IExecuteComponentMethodOptions): Promise<any> {
        const comp = compMgr.queryFromPath(options.path);
        if (!comp) {
            return null;
        }
        return await compMgr.executeComponentMethod(comp.uuid, options.name, options.args);
    }
}
