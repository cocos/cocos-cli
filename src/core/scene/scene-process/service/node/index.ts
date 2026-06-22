'use strict';

import { IProperty } from '../../../@types/public';

/**
 * 节点管理器
 * 负责管理当前打开场景的 uuid 与节点对应关系
 */

const NodeMgr = EditorExtends.Node;

import get from 'lodash/get';
import set from 'lodash/set';
import findLast from 'lodash/findLast';
import { isEditorNode, getNodeName, setLayer } from './node-utils';
import { prefabUtils } from '../prefab/utils';
import { ServiceEvents } from '../core/global-events';

// const { promisify } = require('util');
// const { basename, extname } = require('path');
// import nodeUtil from '../../../utils/node';
import dumpUtil from '../dump';
import { Service } from '../core/decorator';

// import getComponentFunctionOfNode from '../component/get-component-function-of-node';
import {
    Node,
    director,
    Component,
    UITransform,
    CCObject,
    MissingScript,
    LODGroup,
    Prefab,
} from 'cc';

import { EventSourceType, NodeEventType, NodeOperationType } from '../public/event-enum';
import {
    type INodeEvents,
    type INode,
    IChangeNodeOptions,
} from '../../../common';
import { type IScene } from '../../../common/editor/scene';


import { loadAny } from './node-create';
import compMgr from '../component/index';
import { Rpc } from '../../rpc';

const creatableAssetTypes = [
    'cc.AnimationClip',
    'cc.AudioClip',
    'cc.BitmapFont',
    'cc.LabelAtlas',
    'cc.Mesh',
    'cc.ParticleAsset',
    'cc.Prefab',
    'cc.Script',
    'cc.SpriteFrame',
    'cc.TTFFont',
    'cc.TerrainAsset',
    'cc.TiledMapAsset',
    'cc.VideoClip',
    'dragonBones.DragonBonesAsset',
    'dragonBones.DragonBonesAtlasAsset',
    'sp.SkeletonData',
];

// 用于复制粘贴操作，暂存被复制节点的 clone 对象
let stashInstants: any = null;

/**
 * 节点管理器
 *
 * Events:
 *   node.on('before-change', (node) => {});
 *   node.on('before-add', (node) => {});
 *   node.on('before-remove', (node) => {});
 *   node.on('change', (node) => {});
 *   node.on('add', (node) => {});
 *   node.on('remove', (node) => {});
 */
export class NodeManager {
    emit<K extends keyof INodeEvents>(event: K, ...args: INodeEvents[K]): void;
    emit(event: string, ...args: any[]): void;
    emit(event: string, ...args: any[]) {
        ServiceEvents.emit(event, ...args);
    }

    private _previewPropertysCache: Map<string, Map<string, any>> = new Map();
    get creatableAssetTypes() {
        return creatableAssetTypes;
    }

    init() { }

    /**
     * 传入一个场景，将内部的节点全部缓存
     * @param {*} scene
     */
    initWithScene(scene: any) {
        if (!scene) {
            return;
        }

        // 场景载入后要将现有节点监听所需事件
        this.registerEventListenersForCurrentSceneNodes();

        this.registerNodeMgrEvents();
        // 组件事件转发由 ComponentService 统一负责。NodeManager 只使用 compMgr
        // 做组件查询和缓存清理；这里注册会导致编辑器打开/重载后重复触发
        // component:added/component:removed。

        // 缓存预览设置的属性，用于还原预览前的设置
        this._previewPropertysCache = new Map();

        this.emit('node:inited', this.queryUuids(), scene);
    }

    private registerEventListenersForCurrentSceneNodes() {
        const nodeMap = NodeMgr.getNodesInScene();
        Object.keys(nodeMap).forEach((key) => {
            this.registerEventListeners(nodeMap[key]);
        });
    }

    public onEditorOpened() {
        this.initWithScene(Service.Editor.getRootNode() ?? director.getScene());
    }

    public onEditorClosed() {
        this.unregisterNodeMgrEvents();
        this.clear();
        stashInstants = null;
    }


    private readonly NodeMgrEventHandlers = {
        ['add']: 'add',
        ['change']: 'change',
        ['remove']: 'remove',
    } as const;
    private nodeMgrEventHandlers = new Map<string, (...args: []) => void>();
    /**
     * 注册引擎 Node 管理相关事件的监听
     */
    registerNodeMgrEvents() {
        this.unregisterNodeMgrEvents();
        Object.entries(this.NodeMgrEventHandlers).forEach(([eventType, handlerName]) => {
            const handler = (this as any)[handlerName].bind(this);
            NodeMgr.on(eventType, handler);
            this.nodeMgrEventHandlers.set(eventType, handler);
            // console.log(`NodeMgr on ${eventType}`);
        });
    }

    unregisterNodeMgrEvents() {
        for (const eventType of this.nodeMgrEventHandlers.keys()) {
            const handler = this.nodeMgrEventHandlers.get(eventType);
            if (handler) {
                NodeMgr.off(eventType, handler);
                this.nodeMgrEventHandlers.delete(eventType);
                // console.log(`NodeMgr off ${eventType}`);
            }
        }
    }

    private readonly NodeHandlers = {
        [Node.EventType.TRANSFORM_CHANGED]: 'onNodeTransformChanged',
        [Node.EventType.SIZE_CHANGED]: 'onNodeSizeChanged',
        [Node.EventType.ANCHOR_CHANGED]: 'onNodeAnchorChanged',
        [Node.EventType.CHILD_ADDED]: 'onNodeParentChanged',
        [Node.EventType.CHILD_REMOVED]: 'onNodeParentChanged',
        [Node.EventType.LIGHT_PROBE_CHANGED]: 'onLightProbeChanged',
    } as const;
    private nodeHandlers = new Map<string, Function>();

    /**
     * 监听引擎发出的 node 事件
     * @param {*} node
     */
    registerEventListeners(node: Node) {
        if (!node || !node.isValid || isEditorNode(node)) {
            return;
        }

        // 遍历事件映射表，统一注册事件
        Object.entries(this.NodeHandlers).forEach(([eventType, handlerName]) => {
            const boundHandler = (this as any)[handlerName].bind(this, node);
            const key = `${eventType}_${node.uuid}`;
            if (this.nodeHandlers.has(key)) {
                return;
            }
            node.on(eventType, boundHandler, this);
            this.nodeHandlers.set(key, boundHandler);
        });
    }

    /**
     * 取消监听引擎发出的node事件
     * @param {*} node
     */
    unregisterEventListeners(node: Node) {
        if (!node || !node.isValid || isEditorNode(node)) {
            return;
        }

        // 遍历事件映射表，统一取消事件
        Object.keys(this.NodeHandlers).forEach(eventType => {
            const key = `${eventType}_${node.uuid}`;
            const handler = this.nodeHandlers.get(key);
            if (handler) {
                node.off(eventType, handler);
                this.nodeHandlers.delete(key);
            }
        });
    }

    onNodeTransformChanged(node: Node, transformBit: any) {
        const changeOpts: IChangeNodeOptions = { type: NodeEventType.TRANSFORM_CHANGED, source: EventSourceType.ENGINE };

        switch (transformBit) {
            case Node.TransformBit.POSITION:
                changeOpts.propPath = 'position';
                break;
            case Node.TransformBit.ROTATION:
                changeOpts.propPath = 'rotation';
                break;
            case Node.TransformBit.SCALE:
                changeOpts.propPath = 'scale';
                break;
        }

        this.emit('node:change', node, changeOpts);
    }

    onNodeSizeChanged(node: Node) {
        const changeOpts: IChangeNodeOptions = { type: NodeEventType.SIZE_CHANGED, source: EventSourceType.ENGINE };
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            const index = node.components.indexOf(uiTransform);
            changeOpts.propPath = `_components.${index}.contentSize`;
        }
        this.emit('node:change', node, changeOpts);
    }

    onNodeAnchorChanged(node: Node) {
        const changeOpts: IChangeNodeOptions = { type: NodeEventType.ANCHOR_CHANGED, source: EventSourceType.ENGINE };
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            const index = node.components.indexOf(uiTransform);
            changeOpts.propPath = `_components.${index}.anchorPoint`;
        }
        this.emit('node:change', node, changeOpts);
    }

    /**
     * 监听引擎中节点 node.setParent(parent) 所发出来的事件
     * @param {*} parent
     * @param {*} child
     */
    onNodeParentChanged(parent: Node, child: Node) {
        if (isEditorNode(child)) {
            return;
        }

        const childAdded = child.parent === parent;
        if (childAdded) {
            NodeMgr.updateNodeParent(child.uuid, parent.uuid);
        }

        this.emit('node:change', parent, { type: NodeEventType.CHILD_CHANGED });

        // 只有挂入新父节点后，子节点路径索引才稳定；移出旧父节点时只通知旧父节点 children 变化。
        if (childAdded) {
            this.emit('node:change', child, { type: NodeEventType.PARENT_CHANGED });
        }
    }

    /**
     * 监听light-probe changed事件
     */
    onLightProbeChanged(node: Node) {
        const changeOpts: IChangeNodeOptions = { type: NodeEventType.LIGHT_PROBE_CHANGED, source: EventSourceType.ENGINE };
        this.emit('node:change', node, changeOpts);
    }

    /**
     * 清空当前管理的节点
     */
    clear() {
        const nodeMap = NodeMgr.getNodes();
        Object.keys(nodeMap).forEach((key) => {
            this.unregisterEventListeners(nodeMap[key]);
        });

        NodeMgr.clear();
        compMgr.clear();
    }

    /**
     * 添加一个节点到管理器内
     * @param {*} node
     */
    add(uuid: string, node: Node) {
        this.registerEventListeners(node);

        if (!isEditorNode(node)) {
            this.emit('node:added', node);
        }
    }

    /**
     * 一个节点被修改,由EditorExtends.Node.emit('change')触发
     * @param uuid
     * @param node
     */
    change(uuid: string, node: Node) {
        if (!isEditorNode(node)) {
            // 这里是因为 LOD 组件在挂到场景的时候，修改了自己的数据，但编辑器暂时无法知道修改了哪些数据
            // 所以针对 LOD 部分，增加了 propPath, prefab 才能正常修改
            let path = '';
            const lodGroup = node.getComponent(LODGroup);
            if (lodGroup) {
                const index = node.components.indexOf(lodGroup);
                path = `__comps__.${index}`;
            }
            this.emit('node:change', node, { type: NodeOperationType.SET_PROPERTY, propPath: path });
        }
    }

    /**
     * 从管理器内移除一个指定的节点
     * @param {*} node
     */
    remove(uuid: string, node: Node) {
        this.unregisterEventListeners(node);
        if (!isEditorNode(node)) {
            this.emit('node:removed', node, { source: EventSourceType.ENGINE });
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
        return NodeMgr.getNode(uuid);
    }

    getPathByUuid(uuid: string): string {
        const node = NodeMgr.getNode(uuid);
        if (!node) return '';
        return NodeMgr.getNodePath(node) ?? '';
    }

    /**
     * 查询受管理的所有节点的 uuid 数组
     */
    queryUuids() {
        const nodeMap = NodeMgr.getNodes();
        return Object.keys(nodeMap);
    }

    /**
     * 查询一个节点，并返回该节点的 dump 数据
     * 如果节点已被删除 parent = null，则返回 null
     * @param {String} uuid
     */
    async queryDump(uuid: string): Promise<INode | IScene | null> {
        // 只查现有场景里的节点，不需要再查回收站里的节点
        const node = NodeMgr.getNodesInScene()[uuid];
        if (!node) {
            return null;
        }
        return dumpUtil.dumpNode(node);
    }

    /**
     * 查询一个节点，并返回该节点的 dump 数据
     * 不论节点是否被删除
     * @param {String} uuid
     */
    async queryDumpAtAll(uuid: string): Promise<INode | IScene | null> {
        const node = this.query(uuid);
        if (!node) {
            return null;
        }
        return dumpUtil.dumpNode(node);
    }

    /**
     * 查询当前场景的节点树信息
     * @param uuid asset uuid
     */
    queryNodesByAssetUuid(uuid: string) {
        if (!uuid) {
            return [];
        }

        return NodeMgr.getNodesByAsset(uuid);
    }

    /**
     * 获取丢失资源的节点
     * @returns uuids[] 节点数组
     */
    async queryNodesMissAsset() {
        const scene = director.getScene();
        if (!scene?.children?.length) return [];

        const nodesUuid = new Set<string>();
        const missScripts: { nodeUuid: string, scriptUuid: string }[] = [];

        EditorExtends.walkProperties(
            scene.children,
            (obj: any, key: any, value: any, parsedObjects: any) => {
                // 处理资源丢失
                if (value?._uuid) {
                    const compressed = EditorExtends.UuidUtils.compressUUID(value._uuid, true);
                    const assetExists = cc.assetManager.assets.get(value._uuid) ||
                        cc.assetManager.assets.get(compressed);
                    if (!assetExists) {
                        const node = findLast(parsedObjects, (item: any) => item instanceof cc.Node);
                        if (node) nodesUuid.add(node.uuid);
                    }
                }

                // 处理 MissingScript
                if (value instanceof MissingScript) {
                    // @ts-ignore __type__: 存储编译不通过或丢失的脚本 id
                    const scriptId = value._$erialized?.__type__;
                    if (scriptId) {
                        missScripts.push({
                            nodeUuid: value.node.uuid,
                            scriptUuid: EditorExtends.UuidUtils.decompressUUID(scriptId),
                        });
                    }
                }
            },
            { dontSkipNull: false, ignoreSubPrefabHelper: true }
        );

        // 批量查询并添加真正丢失的脚本节点
        if (missScripts.length) {
            const existingScripts = new Set(
                (await Promise.all(missScripts.map(({ scriptUuid }) =>
                    Rpc.getInstance().request('assetManager', 'queryAssetInfo', [scriptUuid])
                )))
                    .map((info: any | null) => info?.uuid)
                    .filter(Boolean)
            );

            for (const { nodeUuid, scriptUuid } of missScripts) {
                if (!existingScripts.has(scriptUuid)) {
                    nodesUuid.add(nodeUuid);
                }
            }
        }

        return Array.from(nodesUuid);
    }

    /**
     * 预览设置属性后的效果，不进入undo堆栈
     * @param uuid
     * @param path
     * @param dump
     * @returns
     */
    async previewSetNodeProperty(uuid: string, path: string, dump: IProperty): Promise<boolean> {
        const node = NodeMgr.getNode(uuid);
        const info = dumpUtil.parsingPath(path, node);
        if (!node) {
            console.warn('previewSetNodeProperty failed：node not found', uuid);
            return false;
        }
        if (!info.search) {
            console.warn('previewSetNodeProperty failed：property path error', path);
            return false;
        }
        // 需要自己记录设置前的属性，在取消时还原效果;
        let target = get(node, info.search) ? get(node, info.search)[info.key] : undefined;
        if (!target) {
            // 属性为空时使用默认值
            target = dumpUtil.getDefaultValue(dump.type);
        }
        const data = dumpUtil.encodeObject(target, {
            type: dump.type,
            ctor: target.constructor,
        }, target);

        // @ts-ignore
        const cache: Map<string, any> = this._previewPropertysCache.has(uuid) ? this._previewPropertysCache.get(uuid) : new Map();
        // 只有第一次预览时的数据，是节点原本的数据
        if (!cache?.has(path)) {
            cache?.set(path, data);
        }
        this._previewPropertysCache.set(uuid, cache);
        // 修改属性，false会避免记录undo操作;
        return await this.setProperty(uuid, path, dump, false);
    }

    async cancelPreviewSetNodeProperty(uuid: string, path: string): Promise<boolean> {
        // 拿到记录的数据，还原回数据
        const node = this.query(uuid);
        const info = dumpUtil.parsingPath(path, node);
        if (!node) {
            console.warn('cancelPreviewSetNodeProperty failed:node not found', uuid);
            return false;
        }
        if (!info.search) {
            console.warn('cancelPreviewSetNodeProperty failed:property path error', path);
            return false;
        }
        const cache = this._previewPropertysCache.get(uuid);
        if (!cache) {
            return false;
        }
        const dump = cache?.get(path);
        if (!dump) {
            return false;
        }
        // 清理掉原来的数据
        cache?.delete(path);
        return await this.setProperty(uuid, path, dump, false);
    }

    /**
     * 设置一个节点的属性
     * @param {*} uuid
     * @param {*} path
     * @param {*} key
     * @param {*} record 是否记录到undo堆栈上
     * @param {*} dump
     */
    async setProperty(uuid: string, path: string, dump: IProperty, record = true): Promise<boolean> {
        // 多个节点更新值
        if (Array.isArray(uuid)) {
            try {
                for (let i = 0; i < uuid.length; i++) {
                    await this.setProperty(uuid[i], path, dump);
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
        await dumpUtil.restoreProperty(node, path, dump);

        // 触发修改后的事件
        this.emit('node:change', node, { type: NodeOperationType.SET_PROPERTY, propPath: path, record: record });
        // 如果是数组的话，需要依次 emit change，路径定位到数组的下标位置
        if (dump.isArray && Array.isArray(dump.value)) {
            dump.value.forEach((item, i) => {
                this.emit('node:change', node, { type: NodeOperationType.SET_PROPERTY, propPath: `${path}.${i}`, record: record });
            });
        }
        // 改变父子关系
        if (path === 'parent' && node.parent) {
            // 发送节点修改消息
            this.emit('node:change', node.parent, { type: NodeOperationType.SET_PROPERTY, propPath: 'children', record: record });
        }
        return true;
    }

    /**
     * 设置属性的默认值
     * @param {*} uuid
     * @param {*} path
     * @param {*} type
     */
    async resetProperty(uuid: string, path: string): Promise<boolean> {
        // 多个节点更新值
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.resetProperty(id, path);
            });
            return true;
        }
        const node = this.query(uuid);
        if (!node) {
            console.warn(`Set default value failed: ${uuid} does not exist`);
            return false;
        }

        // 触发修改前的事件
        this.emit('node:before-change', node);

        // 恢复数据
        await dumpUtil.resetProperty(node, path);

        // 触发修改后的事件
        this.emit('node:change', node, { type: NodeOperationType.SET_PROPERTY, propPath: path });
        return true;
    }

    /**
     * 将一个属性其现存值与定义类型值不匹配，或者为 null 默认值，改为一个可编辑的值
     * @param {*} uuid
     * @param {*} path
     */
    async updatePropertyFromNull(uuid: string, path: string): Promise<boolean> {
        // 多个节点更新值
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.updatePropertyFromNull(id, path);
            });
            return true;
        }
        const node = this.query(uuid);
        if (!node) {
            console.warn(`Set default value failed: ${uuid} does not exist`);
            return false;
        }

        // 触发修改前的事件
        this.emit('node:before-change', node);

        // 恢复数据
        await dumpUtil.updatePropertyFromNull(node, path);

        // 触发修改后的事件
        this.emit('node:change', node, { type: NodeOperationType.SET_PROPERTY, propPath: path });
        return true;
    }

    /**
     * 重置节点属性 position rotation scale
     * @param {*} uuid
     */
    async resetNode(uuid: string): Promise<boolean> {
        // 多个节点更新值
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.resetNode(id);
            });
            return true;
        }
        const node = this.query(uuid);
        if (!node) {
            console.warn(`Set default value failed: ${uuid} does not exist`);
            return false;
        }

        // 触发修改前的事件
        this.emit('node:before-change', node);

        // 恢复数据
        const properties = ['position', 'rotation', 'scale', 'mobility'];
        for (const path of properties) {
            await dumpUtil.resetProperty(node, path);

            // 触发修改后的事件
            this.emit('node:change', node, { type: NodeOperationType.SET_PROPERTY, propPath: path });
        }
        return true;
    }

    /**
     * 设置某个节点连同它的子集的 layer 属性值
     * @param {*} uuid
     * @param {*} dump
     */
    async setNodeAndChildrenLayer(uuid: string, dump: any) {
        await this.setProperty(uuid, 'layer', dump);

        const node = this.query(uuid);

        if (node && node.children && node.children.length > 0) {
            node.children.forEach((child: any) => {
                this.setNodeAndChildrenLayer(child.uuid, dump);
            });
        }
    }

    /**
     * 调整一个数组类型的数据内某个 item 的位置
     * @param uuid 要被移动的节点或组件
     * @param path 数组的搜索路径
     * @param target 现在的索引位置
     * @param offset 偏移量
     */
    moveArrayElement(uuid: string, path: string, target: number, offset: number): boolean {
        // TODO: deprecated 这一段 isArray 应该没有用到了，建议一段时间后可以删掉
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.moveArrayElement(id, path, target, offset);
            });
            return false;
        }

        const node = this.query(uuid);
        if (!node) {
            console.warn(`Move property failed: ${uuid} does not exist`);
            return false;
        }

        // 因为 path 内的 __comps__ 实际指向的是 _components
        path = path.replace('__comps__', '_components');

        // 找到指定的 data 数据
        const data = path ? get(node, path) : node;
        if (!data) {
            console.warn(`Move property failed: ${uuid} does not exist`);
            return false;
        }

        if (!Array.isArray(data)) {
            console.warn(`Move property failed: ${uuid} - ${path} isn't an array`);
            return false;
        }

        // 发送节点修改消息
        this.emit('node:before-change', node);

        // 移动顺序
        if (path === 'children') {
            // 过滤掉类似 Foreground Background 的节点
            const children = data.filter((child) => !(child.objFlags & cc.Object.Flags.HideInHierarchy));
            const child = children[target];

            // 容错处理：新增的节点在引擎中还未创建，就指令其移动，setSiblingIndex 会报错
            if (!child) {
                return false;
            }

            // 找出要移动的节点在没有过滤掉隐藏节点的场景中的位置
            const index = data.indexOf(children[target + offset]);

            child.setSiblingIndex(index);
        } else {
            const temp = data.splice(target, 1);
            data.splice(target + offset, 0, temp[0]);

            set(node, path, data); // 自身 = 自身（副本），为了兼顾材质需要整体赋值副本的情况
        }

        // 发送节点修改消息
        this.emit('node:change', node, { type: NodeOperationType.MOVE_ARRAY_ELEMENT, propPath: path });

        return true;
    }

    /**
     * 删除一个数组元素
     * @param uuid 节点的 uuid
     * @param path 元素所在数组的搜索路径
     * @param index 目标 item 原来的索引
     */
    removeArrayElement(uuid: string, path: string, index: number): boolean {
        if (Array.isArray(uuid)) {
            uuid.forEach((id) => {
                this.removeArrayElement(id, path, index);
            });
            return true;
        }
        const node = this.query(uuid);
        const key = (path || '').split('.').pop();

        if (key === 'children') {
            console.warn('Unable to change `children` of the parent, Please change the `parent` of the child');
            return false;
        }

        if (!node) {
            console.warn(`Move property failed: ${uuid} does not exist`);
            return false;
        }

        // 因为 path 内的 __comps__ 实际指向的是 _components
        path = path.replace('__comps__', '_components');

        // 找到指定的 data 数据
        const data = path ? get(node, path) : node;
        if (!data) {
            console.warn(`Move property failed: ${uuid} does not exist`);
            return false;
        }

        if (!Array.isArray(data)) {
            console.warn(`Move property failed: ${uuid} - ${path}.${key} isn't an array`);
            return false;
        }

        // 发送节点修改消息
        this.emit('node:before-change', node);

        // 删除components中的元素要通过调用removeComponent方法
        if (path === '_components') {
            const comp = data[index];
            // https://github.com/cocos-creator/3d-tasks/issues/1116
            compMgr.removeComponent(comp);
        } else {
            // 删除某个 item
            data.splice(index, 1);

            set(node, path, data); // 自身 = 自身（副本），为了兼顾材质需要整体赋值副本的情况
        }

        // 发送节点修改消息
        this.emit('node:change', node, { type: NodeOperationType.REMOVE_ARRAY_ELEMENT, propPath: path, index });

        return true;
    }

    /**
     * 复制节点的动作，给下一步粘贴（创建）节点准备数据
     * @param {*} uuids 单个 string 或 array
     */
    copy(uuids: string | string[]) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        uuids = this.canRemoveOrCopy(uuids);

        stashInstants = {};

        function changeFileId(node: Node) {
            const prefabInfo = node['_prefab'];

            if (prefabInfo) {
                if (prefabInfo.instance) {
                    return;
                } else {
                    // 非prefabInstance节点，就变为普通节点来复制
                    node['_prefab'] = null;
                    for (let i = 0; i < node.components.length; i++) {
                        const comp = node.components[i];
                        comp.__prefab = null;
                    }
                }
            }

            if (node.children.length > 0) {
                let index = node.children.length;

                // .children 是只读属性，需要用 splice
                while (index--) {
                    const child = node.children[index];
                    // 需要剔除不需要保存的私有节点
                    const isPrivateNode = child.objFlags & cc.Object.Flags.HideInHierarchy;
                    const canDelete = child.objFlags & cc.Object.Flags.DontSave;
                    if (isPrivateNode && canDelete) {
                        node.removeChild(child);
                        // node.children.splice(index, 1);
                    } else {
                        changeFileId(child);
                    }
                }
            }
        }

        for (const uuid of uuids) {
            const node = this.query(uuid);

            if (!node) {
                continue;
            }
            const instant = cc.instantiate(node);

            // Hack 目前 cc.instantiate 没有变动 fileId，这里变动一下，使它不重复
            changeFileId(instant);

            stashInstants[uuid] = {
                instant,
            };
        }

        return uuids;
    }

    getCopiedUuids(): string[] {
        return stashInstants ? Object.keys(stashInstants) : [];
    }

    duplicate(uuids: string | string[]) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        const newUuids: string[] = [];
        const oldStashInstants = stashInstants;
        uuids = this.copy(uuids);

        for (const uuid of uuids) {
            const node = this.query(uuid);

            if (!node) {
                continue;
            }

            const newUuid = this.createNodeFromStash(node.parent?.uuid, null, uuid, false, true);
            if (newUuid) {
                newUuids.push(newUuid);
            }
        }

        stashInstants = oldStashInstants;

        return newUuids.filter(Boolean);
    }

    paste(target: string | null | undefined, uuids: string | string[], keepWorldTransform = false) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        const newUuids: string[] = [];

        for (const uuid of uuids) {
            const newUuid = this.createNodeFromStash(target, null, uuid, keepWorldTransform, true);
            if (newUuid) {
                newUuids.push(newUuid);
                if (!target) {
                    const node = this.query(newUuid);
                    if (node) {
                        target = node.parent?.uuid;
                    }
                }
            }
        }

        return newUuids.filter(Boolean);
    }

    /**
     * 挂载节点，如拖入和剪切
     * @param parent
     * @param uuids
     * @param keepWorldTransform
     */
    setParent(parent: string, uuids: string | string[], keepWorldTransform = false) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        let parentNode: Node | null;
        if (parent) {
            parentNode = this.query(parent);
        }
        parentNode ||= director.getScene();

        if (!parentNode) {
            return [];
        }

        const movedUuids: string[] = [];
        for (const uuid of uuids) {
            const node = this.query(uuid);
            if (!node || !node.parent) {
                continue;
            }

            const oldParent = node.parent;
            const parentChanged = oldParent !== parentNode;

            if (parentNode === node || parentNode.isChildOf(node)) {
                throw new Error('Cannot set parent: target parent is the node itself or its descendant.');
            }

            if (oldParent) {
                this.emit('node:before-change', oldParent);
            }
            if (parentChanged) {
                this.emit('node:before-change', parentNode);
            }
            this.emit('node:before-change', node);

            node.setParent(parentNode, keepWorldTransform);

            movedUuids.push(uuid);
        }

        return movedUuids;
    }

    /**
     * 实时获取新节点在一个父节点下的有效名称
     * 规则是 Node 同名时为 Node-001
     * @param name 名称
     * @param parentUuid 父节点 uuid
     */
    generateAvailableName(name: string, parentUuid?: string) {
        if (!name) {
            name = 'Node';
        }

        let parent = director.getScene() as Node;

        if (parentUuid) {
            const node = this.query(parentUuid);
            parent = node ? node : parent;
        }

        return getNodeName(name, parent);
    }

    createNodeFromStash(parentUuid: string | null | undefined, name: any, stashUuid: string | null, keepWorldTransform = false, keepLayer = false): undefined | string {
        if (!cc.director.getScene()) {
            return;
        }

        if (keepWorldTransform === null) {
            keepWorldTransform = true;
        }

        let parent: Node | null = null;
        if (parentUuid) {
            parent = this.query(parentUuid);
        }
        if (!parent) {
            parent = director.getScene();
        }
        if (!parent) {
            return;
        }

        let node: Node | null = null;

        if (stashUuid) {
            if (stashInstants?.[stashUuid]) {
                const { instant } = stashInstants[stashUuid];

                if (instant) {
                    node = cc.instantiate(instant);
                    if (node) {
                        const visitNode = (n: Node, fn: (t: Node) => boolean | void) => {
                            if (fn(n)) return;
                            for (const child of n.children) {
                                visitNode(child, fn);
                            }
                        };
                        visitNode(node, (target) => {
                            // @ts-ignore
                            const prefabInfo = target['_prefab'];
                            if (prefabInfo?.instance) {
                                prefabInfo.instance = prefabUtils.cloneInstanceWithNewFileId(prefabInfo.instance);
                                return true;
                            }
                        });

                        name = getNodeName(node.name, parent);
                    }
                }
            }
        }

        if (!node) {
            node = new cc.Node();
        }

        if (!node) {
            return;
        }

        if (name) {
            node.name = name;
        }

        if (parent.layer && parent !== director.getScene() && !keepLayer) {
            setLayer(node, parent.layer, true);
        }

        this.emit('node:before-add', node);
        this.emit('node:before-change', parent);

        node.setParent(parent, keepWorldTransform);

        if (!stashUuid) {
            this.ensureUITransformComponent(node);
        }

        this.emit('node:add', node);

        return node.uuid;
    }

    /**
     * 确保节点有 UITransform 组件
     * 目前只需保障在创建空节点的时候检查任意上级是否为 canvas
     */
    ensureUITransformComponent(node: Node) {
        if (node instanceof cc.Node && node.children.length === 0) {
            // 空节点
            let inside = false;
            let parent = node.parent;

            while (parent) {
                const components = parent.components.map((comp) => cc.js.getClassName(comp.constructor));
                if (components.includes('cc.Canvas')) {
                    inside = true;
                    break;
                }
                parent = parent.parent;
            }

            if (inside) {
                try {
                    node.addComponent('cc.UITransform');
                } catch (error) {
                    console.error(error);
                }
            }
        }
    }

    async restorePrefab(uuid: string, assetUuid: string) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        if (!director.getScene()) {
            return false;
        }

        // 先取消选中，暂存选中的节点 uuid
        // const selectedUuids = cce.Selection.query();
        // cce.Selection.clear();

        const query = this.query;
        const prefabRoot = query(uuid) as Node;

        // 根据 fileId 缓存旧节点，以用于一些引用节点的还原
        const oldNodes: Record<string, Node> = {};
        /**
         * 缓存 fileId 对应的旧节点
         * @param node 节点
         */
        function collectOldNodes(node: Node) {
            if (!node || !node['_prefab']) {
                return;
            }

            oldNodes[node['_prefab'].fileId] = node;

            if (Array.isArray(node.children)) {
                node.children.forEach((child) => {
                    collectOldNodes(child);
                });
            }
        }

        // 根据 fileId 缓存子集列表 uuids
        const childrenUuid: Record<string, Record<string, string>> = {};
        function collectChildrenUuid(node?: Node) {
            const rt: Record<string, string> = {};

            if (node) {
                if (childrenUuid[node.uuid]) {
                    return childrenUuid[node.uuid];
                }

                if (Array.isArray(node.children)) {
                    node.children.forEach((child: any) => {
                        // @ts-ignore
                        if (child && child['_prefab']) {
                            // @ts-ignore
                            rt[child['_prefab'].fileId] = child.uuid;
                        }
                    });
                    childrenUuid[node.uuid] = rt;
                }
            }
            return rt;
        }

        // 根据 fileId 缓存子集列表的正确索引
        const childrenIndex: Record<string, Record<string, number>> = {};
        function collectChildrenIndex(node: Node | undefined) {
            const rt: Record<string, number> = {};

            if (node) {
                if (childrenIndex[node.uuid]) {
                    return childrenIndex[node.uuid];
                }

                if (Array.isArray(node.children)) {
                    node.children.forEach((child, i) => {
                        // @ts-ignore
                        if (child && child['_prefab']) {
                            // @ts-ignore
                            rt[child['_prefab'].fileId] = i;
                        }
                    });
                    childrenIndex[node.uuid] = rt;
                }
            }
            return rt;
        }

        /**
         * 检查 dump 中的引用节点是否可用
         * 旧节点还存在的时候，新数据是不可用的，新数据里需要替换为旧节点的 uuid
         * 旧节点不存在的时候，新数据便是可用的，因为新节点一定会替换上去。
         * @param dumpComps 组件
         */
        function redirectSceneRefs(dumpComps: any) {
            dumpComps.forEach((comps: any) => {
                if (!comps.value || typeof comps.value !== 'object') {
                    return;
                }

                const keys = Object.keys(comps.value);
                for (const key of keys) {
                    if (['node'].includes(key)) {
                        continue;
                    }

                    const comp = comps.value[key];

                    // 递归到里层
                    if (comp.isArray && Array.isArray(comp.value)) {
                        redirectSceneRefs(comp.value);
                        continue;
                    }

                    if (comp.type === 'cc.Node') {
                        const newNode = query(comp.value.uuid);

                        // 数据错误
                        if (!newNode || !newNode?.['_prefab']?.fileId) {
                            continue;
                        }
                        const oldNode = oldNodes[newNode['_prefab'].fileId];
                        if (oldNode) {
                            comp.value.uuid = oldNode.uuid; // 换为旧节点的 uuid
                        }
                    }
                }
            });
        }

        /**
         * 还原现有节点的 dump ，删除多余节点，添加新节点
         * @param newNode 新节点
         * @param parentNode 新节点的父节点
         * @param prefabParent 新节点通过 fileId 指向现有节点的父节点
         */
        async function restore(newNode: Node, parentNode?: Node, prefabParent?: Node) {
            // 私有节点不还原
            if (newNode.objFlags & cc.Object.Flags.HideInHierarchy) {
                return false;
            }

            const fileId2Index = collectChildrenIndex(parentNode); // 对应新数据上的子集排列
            const fileId2Uuid = collectChildrenUuid(prefabParent); // 对应新数据上的 uuid

            const dump = dumpUtil.dumpNode(newNode) as INode;
            const fileId = dump.__prefab__!.fileId;
            // 现有 prefab 节点
            const prefab = prefabParent ? query(fileId2Uuid[fileId]) : prefabRoot;

            if (prefab) {
                // 如果现有的节点存在，只需还原 dump data
                that.emit('node:before-change', prefab);

                // 删除掉不在新数据上的子节点
                if (Array.isArray(prefab.children)) {
                    const childrenFileId2Index = collectChildrenIndex(newNode);

                    let index = 0;
                    let child = prefab.children[index];
                    while (child && index < prefab.children.length) {
                        // @ts-ignore
                        if (child['_prefab'] && childrenFileId2Index[child['_prefab'].fileId] === undefined) {
                            that.removeNode(child.uuid);
                        } else {
                            index++;
                        }
                        child = prefab.children[index];
                    }
                }

                const prefabDump = dumpUtil.dumpNode(prefab) as INode;

                // 删除不必要的字段
                // Prefab 里的 dump 为什么需要删除 uuid
                // @ts-ignore
                delete dump.uuid;
                // @ts-ignore
                delete dump.children;

                // 不是根节点
                if (prefabParent) {
                    dump.parent.value.uuid = prefabParent.uuid;
                } else {
                    // 如果是 prefab 根节点，有些属性不能还原
                    dump.active.value = prefabDump.active.value;
                    dump.name.value = prefabDump.name.value;
                    dump.position.value = prefabDump.position.value;
                    dump.rotation.value = prefabDump.rotation.value;
                }

                // 使用原来的数据
                dump.__prefab__ = JSON.parse(JSON.stringify(prefabDump.__prefab__));

                // 检查一些属性上的值，其节点引用是否正确
                if (Array.isArray(dump.__comps__)) {
                    redirectSceneRefs(dump.__comps__);
                }

                // prefab 为现有的 prefab 节点，用新数据 dump 还原内部属性和组件的值
                await dumpUtil.restoreNode(prefab, dump);

                // 确保位置准确
                if (fileId2Index[fileId] !== undefined) {
                    prefab.setSiblingIndex(fileId2Index[fileId]);
                }

                // 逐层移动到目标节点上
                let index = 0;
                let childNode = newNode.children[index];
                while (childNode && index < newNode.children.length) {
                    const isMoved = await restore(childNode, newNode, prefab);
                    if (!isMoved) {
                        index++;
                    }
                    childNode = newNode.children[index];
                }

                that.emit('node:change', prefab);

                // 没有移动
                return false;
            }
            // 现有节点不存在，则将临时的 prefab 中 fileId 一致的节点移动过来替换
            const newPrefab = newNode['_prefab'];
            if (newPrefab && prefabParent) {
                that.emit('node:before-add', newNode);
                that.emit('node:before-change', prefabParent);
                const fileID = newPrefab.fileId;
                const index = fileId2Index[fileID];
                prefabParent.insertChild(newNode, index);
                newPrefab.root = prefabParent['_prefab']?.root;
                that.emit('node:add', newNode);
                that.emit('node:change', prefabParent);
            }

            // 有移动
            return true;
        }

        try {
            collectOldNodes(prefabRoot);
            const asset = await loadAny<Prefab>(assetUuid);
            const newNode = cc.instantiate(asset);
            prefabRoot.parent?.addChild(newNode);
            await restore(newNode); // 逐层还原 prefab
            newNode.parent = null; // 删除临时节点

            this.emit('node:change', prefabRoot);
        } catch (error) {
            console.warn('The prefab asset no longer exist.');
            console.error(error);
            return false;
        }

        // 重新选中，恢复 gizmos 状态
        // setTimeout(() => {
        //     selectedUuids.forEach((selectedUuid: string) => {
        //         cce.Selection.select(selectedUuid);
        //     });
        // });

        return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    private _walkNode(node: Node, func: Function) {
        if (node && node.children) {
            node.children.forEach((child) => {
                func(child);
                this._walkNode(child, func);
            });
        }
    }

    public baseRemoveNode(node: Node, keepWorldTransform?: boolean) {
        // 增加容错
        if (!node) {
            return;
        }

        const parent = node.parent;

        // 发送节点修改消息
        this.emit('node:before-remove', node);
        if (parent) {
            this.emit('node:before-change', parent);
        }

        //console.time('NodeMgr::removeNode');
        node.setParent(null, keepWorldTransform);
        node._objFlags |= CCObject.Flags.Destroyed;
        // 3.6.1 特殊 hack，请在后续版本移除
        // 相关修复 pr: https://github.com/cocos/cocos-editor/pull/890
        try {
            this._walkNode(node, (child: any) => {
                child._objFlags |= CCObject.Flags.Destroyed;
            });
        } catch (error) {
            console.warn(error);
        }

        //console.timeEnd('NodeMgr::removeNode');

        // 被删除节点里的根节点
        this.emit('node:remove', node, { source: EventSourceType.EDITOR });
    }

    /**
     * 删除节点
     * @param {*} uuids
     * @param {*} keepWorldTransform
     */
    removeNode(uuids: string | string[], keepWorldTransform?: boolean) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        uuids = this.canRemoveOrCopy(uuids);

        for (const uuid of uuids) {
            const node: Node | null = this.query(uuid);
            if (!node) {
                continue;
            }
            this.baseRemoveNode(node, keepWorldTransform);
        }
    }

    /**
     * 锁定一个节点不让其在场景中被选中
     * @param uuids 节点uuid
     * @param locked true | false
     * @param loop true | false 是否循环子孙级节点设置
     */
    changeNodeLock(uuids: string | string[], locked: boolean, loop: boolean) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        for (const uuid of uuids) {
            const node = this.query(uuid);

            // 增加容错
            if (!node) {
                continue;
            }

            this.emit('node:before-change', node);

            try {
                if (locked) {
                    node.objFlags |= cc.Object.Flags.LockedInEditor;
                } else {
                    node.objFlags &= ~cc.Object.Flags.LockedInEditor;
                }
            } catch (error) {
                console.error(error);
            }

            this.emit('node:change', node, { type: NodeOperationType.SET_PROPERTY, propPath: 'locked' });

            // 处理内循环的情况
            if (loop === true && node.children && node.children.length > 0) {
                node.children.forEach((child: any) => {
                    this.changeNodeLock(child.uuid, locked, loop);
                });
            }
        }
    }

    /**
     * 过滤根节点
     * 过滤子父包含的关系，只留下彼此独立的父节点 uuid
     * @param uuids
     */
    canRemoveOrCopy(uuids: string[]) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const t: any = this;

        const rt: string[] = [];

        // 剔除根节点或其他不可删除的节点
        const nodeUuids: string[] = [];
        for (const uuid of uuids) {
            const node = t.query(uuid);

            if (!node || !node.parent || node.objFlags & cc.Object.Flags.DontDestroy) {
                continue;
            }

            nodeUuids.push(uuid);
        }

        // 剔除已在列表中其他节点的子节点
        for (const uuid of nodeUuids) {
            const node = t.query(uuid);
            if (!isChild(node)) {
                rt.push(uuid);
            }
        }

        /**
         * 是否是已在的列表中其他节点的子节点
         * @param node
         */
        function isChild(node: any): boolean {
            if (!node.parent) {
                return false;
            }

            if (nodeUuids.includes(node.parent.uuid)) {
                return true;
            } else {
                return isChild(node.parent);
            }
        }

        return rt;
    }

    // /**
    //  * 获取创建节点时所在的父节点
    //  * @param uuid 父节点
    //  */
    // getNewNodeParent(uuid: string | null | undefined): Node {
    //     let parent;

    //     if (uuid) {
    //         parent = this.query(uuid);
    //     } else {
    //         /**
    //          * 如果有选中的节点，默认挂在第一个选中节点里
    //          * 如果没有，挂在场景根节点里
    //          */
    //         const selects = cce.Selection.query();
    //         if (Array.isArray(selects) && selects[0]) {
    //             parent = this.query(selects[0]);
    //         } else {
    //             parent = director.getScene();
    //         }
    //     }

    //     if (!parent) {
    //         parent = director.getScene();
    //     }

    //     // 不应该是Node里的逻辑
    //     const mode = cce.SceneFacadeManager.queryMode();
    //     if (mode === 'prefab') {
    //         const prefabProxy = cce.SceneFacadeManager['_facadeFSM'].prefabSceneFacade['_sceneProxy'];
    //         const prefabRoot = prefabProxy.getRootNode();

    //         // prefab 的场景节点是临时的根节点，需转为 prefab root node
    //         if (parent === cc.director.getScene()) {
    //             parent = prefabRoot;
    //         }
    //     }
    //     return parent as Node;
    // }

    // changeNodeUUID(oldUUID: string | undefined, newUUID: string | undefined) {
    //     if (!oldUUID || !newUUID) {
    //         return;
    //     }

    //     NodeMgr.changeNodeUUID(oldUUID, newUUID);
    // }

    addComponentAt(node: Node, comp: Component, index: number): boolean {
        if (!node || !comp || index < 0) {
            return false;
        }

        if (comp instanceof MissingScript && !comp._$erialized) {
            return false;
        }

        // @ts-ignore
        node._addComponentAt(comp, index);
        compMgr.emit('component:add', comp);

        return true;
    }
}

export default new NodeManager();
