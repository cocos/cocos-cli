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
    ISetPropertyOptions,
    IUndoRedoResult
} from '../../common';
import dumpUtil from './dump';
import compMgr from './component/index';
import componentUtils from './component/utils';
import getComponentFunctionOfNode from './component/get-component-function-of-node';
import { hasOneKindOfComponent } from './node/node-utils';
import { isEditorNode } from './node/node-utils';
import { createShouldHideInHierarchyCanvasNode } from './node/node-create';
import PrefabService from './prefab';
import { SnapshotCommand, type ISnapshotAdapter } from './undo/commands/snapshot-command';
import { AddComponentCommand } from './undo/commands/add-component-command';
import { RemoveComponentCommand } from './undo/commands/remove-component-command';
import { createUndoId, restoreComponentSnapshotDump, snapshotMapsEqual } from './undo/commands/command-utils-shared';

const NodeMgr = EditorExtends.Node;

interface IComponentPropertySnapshot {
    nodeUuid: string;
    nodePath: string;
    componentUuid: string;
    componentPath: string;
    componentIndex: number;
    componentType: string;
    path: string;
    dump: any;
}

interface IComponentPropertyTarget {
    component: Component;
    index: number;
}

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

            const componentUuidsBeforeAdd = new Set(node.components.map(component => component.uuid));
            const comp = node.addComponent(ctor);
            this.requireComponentList = [];
            const addedComponents = node.components.filter(component => !componentUuidsBeforeAdd.has(component.uuid));

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

            compMgr.onComponentAddedFromEditor(comp);
            this.emit('node:change', node, { type: NodeEventType.CREATE_COMPONENT });

            const dump = dumpUtil.dumpComponent(comp as Component) as IComponent;
            if (this._shouldRecordComponentCommand()) {
                const command = AddComponentCommand.captureMany(addedComponents);
                if (command) {
                    Service.Undo?.push(command);
                }
            }
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

            const command = this._shouldRecordComponentCommand()
                ? RemoveComponentCommand.capture(comp)
                : null;

            const result = compMgr.removeComponent(comp);
            if (result && command) {
                Service.Undo?.push(command);
            }

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
        return dumpUtil.dumpComponent(comp as Component) as IComponent;
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
            // 仅当需要记录 undo 且当前没有更外层 group 时，用 group 包裹，
            // 使多节点的修改成为一次可整体撤销的复合命令
            const useGroup =
                options.record !== false &&
                !Service.Undo?.isApplying?.() &&
                !Service.Undo?.isGroupActive?.();
            const groupId = useGroup ? Service.Undo?.beginGroup?.({ label: `Set ${options.path}` }) : undefined;
            try {
                for (let i = 0; i < options.nodePath.length; i++) {
                    await this.setProperty({ nodePath: options.nodePath[i], path: options.path, dump: options.dump, record: options?.record });
                }
                if (groupId) {
                    Service.Undo?.endGroup?.(groupId);
                }
                return true;
            } catch (e) {
                console.error(e);
                if (groupId) {
                    Service.Undo?.cancelGroup?.(groupId);
                }
                return false;
            }
        }
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            console.warn(`Set property failed: ${options.nodePath} does not exist`);
            return false;
        }

        return this._recordComponentPropertySnapshot(node, {
            label: `Set ${options.path}`,
            type: 'component:set-property',
            path: options.path,
            record: options.record,
        }, async () => {
            // 触发修改前的事件
            this.emit('node:before-change', node);
            if (options.path === 'parent' && node.parent) {
                // 发送节点修改消息
                this.emit('node:before-change', node.parent);
            }

            // 恢复数据
            try {
                await dumpUtil.restoreProperty(node, options.path, options.dump);
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
        });
    }

    private _shouldRecordComponentCommand(): boolean {
        return !Service.Undo?.isApplying?.();
    }

    private async _recordComponentSnapshot(
        component: Component,
        options: { label: string; type: string },
        mutate: () => Promise<boolean>,
    ): Promise<boolean> {
        if (
            Service.Undo?.isApplying?.() ||
            Service.Undo?.hasActiveRecording?.(component.node.uuid) ||
            Service.Undo?.hasActiveRecording?.(component.uuid)
        ) {
            return mutate();
        }

        const before = this._captureComponentSnapshot(component, options.type);
        const result = await mutate();
        if (!result) {
            return result;
        }

        const beforeSnapshot = [...before.values()][0];
        if (!beforeSnapshot) {
            return result;
        }

        const latestComponent = this._findSnapshotComponent(beforeSnapshot);
        if (!latestComponent) {
            return result;
        }

        const after = this._captureComponentSnapshot(latestComponent, options.type);
        if (this._snapshotMapsEqual(before, after)) {
            return result;
        }

        Service.Undo?.push(new SnapshotCommand({
            id: this._createUndoSnapshotId(options.type),
            label: options.label,
            type: options.type,
            scope: { editorType: 'scene' },
            timestamp: Date.now(),
        }, before, after, this._createComponentPropertySnapshotAdapter()));
        return result;
    }

    private async _recordComponentPropertySnapshot(
        node: Node,
        options: { label: string; type: string; path: string; record?: boolean },
        mutate: () => Promise<boolean>,
    ): Promise<boolean> {
        if (options.record === false || Service.Undo?.isApplying?.()) {
            return mutate();
        }

        const target = this._resolveComponentPropertyTarget(node, options.path);
        if (
            Service.Undo?.hasActiveRecording?.(node.uuid) ||
            (target && Service.Undo?.hasActiveRecording?.(target.component.uuid))
        ) {
            return mutate();
        }

        const before = this._captureComponentPropertySnapshot(node, options.path);
        const result = await mutate();
        if (!result) {
            return result;
        }

        const latestNode = NodeMgr.getNode(node.uuid) as Node | null;
        if (!latestNode) {
            return result;
        }

        const after = this._captureComponentPropertySnapshot(latestNode, options.path);
        if (this._snapshotMapsEqual(before, after)) {
            return result;
        }

        Service.Undo?.push(new SnapshotCommand({
            id: this._createUndoSnapshotId(options.type),
            label: options.label,
            type: options.type,
            scope: { editorType: 'scene' },
            timestamp: Date.now(),
        }, before, after, this._createComponentPropertySnapshotAdapter()));
        return result;
    }

    private _captureComponentSnapshot(component: Component, path: string): Map<string, IComponentPropertySnapshot> {
        const snapshots = new Map<string, IComponentPropertySnapshot>();
        if (!component?.isValid || !component.node?.isValid) {
            return snapshots;
        }

        snapshots.set(component.uuid, {
            nodeUuid: component.node.uuid,
            nodePath: NodeMgr.getNodePath(component.node) ?? '',
            componentUuid: component.uuid,
            componentPath: compMgr.getPathFromUuid(component.uuid) ?? '',
            componentIndex: component.node.components.indexOf(component),
            componentType: this._getComponentType(component),
            path,
            dump: this._cloneSnapshotDump(dumpUtil.dumpComponent(component)),
        });
        return snapshots;
    }

    private _captureComponentPropertySnapshot(node: Node, path: string): Map<string, IComponentPropertySnapshot> {
        const snapshots = new Map<string, IComponentPropertySnapshot>();
        if (!node?.isValid) {
            return snapshots;
        }

        try {
            const target = this._resolveComponentPropertyTarget(node, path);
            if (!target) {
                return snapshots;
            }

            snapshots.set(`${target.component.uuid}:${path}`, {
                nodeUuid: node.uuid,
                nodePath: NodeMgr.getNodePath(node) ?? '',
                componentUuid: target.component.uuid,
                componentPath: compMgr.getPathFromUuid(target.component.uuid) ?? '',
                componentIndex: target.index,
                componentType: this._getComponentType(target.component),
                path,
                dump: this._cloneSnapshotDump(dumpUtil.dumpComponent(target.component)),
            });
        } catch (error) {
            // 捕获失败则该次修改不会进 undo 栈：记录 warn 以便排查（fail loud）
            console.warn(`[Undo] capture component property snapshot failed for "${path}":`, error);
        }
        return snapshots;
    }

    private _createComponentPropertySnapshotAdapter(): ISnapshotAdapter {
        return {
            capture: async () => new Map(),
            apply: async (data: Map<string, IComponentPropertySnapshot>) => this._applyComponentPropertySnapshots(data),
            equals: (before: Map<string, IComponentPropertySnapshot>, after: Map<string, IComponentPropertySnapshot>) => this._snapshotMapsEqual(before, after),
        };
    }

    private async _applyComponentPropertySnapshots(data: Map<string, IComponentPropertySnapshot>): Promise<IUndoRedoResult> {
        try {
            for (const snapshot of data.values()) {
                const component = this._findSnapshotComponent(snapshot);
                if (!component) {
                    return { success: false, reason: `Component not found: ${snapshot.componentPath || snapshot.componentUuid}` };
                }

                await this._restoreComponentSnapshotDump(component, snapshot.dump);
                this.emit('node:change', component.node, {
                    type: NodeEventType.SET_PROPERTY,
                    propPath: snapshot.path,
                    source: 'undo',
                });
            }
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private _resolveComponentPropertyTarget(node: Node, path: string): IComponentPropertyTarget | null {
        const match = /^__comps__\.(\d+)(?:\.|$)/.exec(path);
        if (!match) {
            return null;
        }

        const index = Number(match[1]);
        const component = node.components[index] as Component | undefined;
        if (!component?.isValid) {
            return null;
        }

        return { component, index };
    }

    private _findSnapshotComponent(snapshot: IComponentPropertySnapshot): Component | null {
        const byUuid = compMgr.query(snapshot.componentUuid) as Component | null;
        if (byUuid?.isValid && byUuid.node?.isValid) {
            return byUuid;
        }

        if (snapshot.componentPath) {
            try {
                const byPath = compMgr.queryFromPath(snapshot.componentPath) as Component | null;
                if (byPath?.isValid && byPath.node?.isValid) {
                    return byPath;
                }
            } catch (_error) {
                // Fall back to the captured node/index below.
            }
        }

        const node = this._findSnapshotNode(snapshot);
        const byIndex = node?.components[snapshot.componentIndex] as Component | undefined;
        if (byIndex?.isValid && this._getComponentType(byIndex) === snapshot.componentType) {
            return byIndex;
        }

        return null;
    }

    private _findSnapshotNode(snapshot: IComponentPropertySnapshot): Node | null {
        const byUuid = NodeMgr.getNode(snapshot.nodeUuid) as Node | null;
        if (byUuid?.isValid) {
            return byUuid;
        }

        if (!snapshot.nodePath) {
            return null;
        }

        try {
            const byPath = NodeMgr.getNodeByPath(snapshot.nodePath) as Node | null;
            return byPath?.isValid ? byPath : null;
        } catch (_error) {
            return null;
        }
    }

    private _snapshotMapsEqual(before: Map<string, any>, after: Map<string, any>): boolean {
        return snapshotMapsEqual(before, after);
    }

    private _cloneSnapshotDump<T>(dump: T): T {
        return JSON.parse(JSON.stringify(dump)) as T;
    }

    private async _restoreComponentSnapshotDump(component: Component, dump: any): Promise<void> {
        await restoreComponentSnapshotDump(component, dump);
    }

    private _getComponentType(component: Component): string {
        return (cc as any).js?.getClassName?.(component.constructor) || component.constructor?.name || '';
    }

    private _createUndoSnapshotId(type: string): string {
        return createUndoId(type);
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

    async queryComponents(): Promise<Array<{ name: string; cid: string; path: string }>> {
        // TODO: 需要根据 cocos.config.json 的 include modules 是否包含 3d 做过滤
        // 参考 app/builtin/scene/source/script/3d/manager/scene/scene-manager.ts
        const menus = EditorExtends.Component.getMenus();
        if (menus.length > 0) {
            return menus.map((item: any) => ({
                name: cc.js.getClassName(item.component),
                cid: cc.js.getClassId(item.component),
                path: item.menuPath,
            }));
        }
        // TODO: 这个是兜底的，等 EditorExtends.Component.getMenus() 完全实现了之后就可以删除了
        const classes = await this.queryClasses({ extends: 'cc.Component', excludeSelf: true });
        return classes.map(cls => ({
            name: cls.name,
            cid: '',
            path: cls.name,
        }));
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
            return this._recordComponentSnapshot(comp, {
                label: 'Reset Component',
                type: 'component:reset',
            }, async () => {
                this.emit('node:before-change', comp.node);
                const result = await compMgr.resetComponent(comp);
                this.emit('node:change', comp.node, { type: NodeEventType.RESET_COMPONENT });
                return result;
            });
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

    public getPathByUuid(uuid: string): string {
        return compMgr.getPathFromUuid(uuid);
    }
}
