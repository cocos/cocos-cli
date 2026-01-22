import { register, BaseService, Service } from './core';
import {
    type ICreateByAssetParams,
    type ICreateByNodeTypeParams,
    type IDeleteNodeParams,
    type IDeleteNodeResult,
    type INode,
    type INodeService,
    type IQueryNodeParams,
    type INodeEvents,
    type IUpdateNodeParams,
    type IUpdateNodeResult,
    NodeType,
    NodeEventType,
    EventSourceType,
    IChangeNodeOptions
} from '../../common';
import { Rpc } from '../rpc';
import { CCObject, Node, Prefab, Quat, Vec3, TransformBit, UITransform, LODGroup } from 'cc';
import { createNodeByAsset, loadAny } from './node/node-create';
import { getUICanvasNode, isEditorNode, setLayer } from './node/node-utils';
import { sceneUtils } from './scene/utils';
import NodeConfig from './node/node-type-config';

const NodeMgr = EditorExtends.Node;

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Node')
export class NodeService extends BaseService<INodeEvents> implements INodeService {
    async createNodeByType(params: ICreateByNodeTypeParams): Promise<INode | null> {
        try {
            await Service.Editor.lock();
            let canvasNeeded = params.canvasRequired || false;
            const nodeType = params.nodeType as string;
            const paramsArray = NodeConfig[nodeType];
            if (!paramsArray || paramsArray.length < 0) {
                throw new Error(`Node type '${nodeType}' is not implemented`);
            }
            let assetUuid = paramsArray[0].assetUuid || null;
            canvasNeeded = paramsArray[0].canvasRequired ? true : false;
            const projectType = paramsArray[0]['project-type'];
            const workMode = params.workMode;
            if (projectType && workMode && projectType !== workMode && paramsArray.length > 1) {
                assetUuid = paramsArray[1]['assetUuid'] || null;
                canvasNeeded = paramsArray[1].canvasRequired ? true : false;
            }
            return await this._createNode(assetUuid, canvasNeeded, params.nodeType == NodeType.EMPTY, params);
        } catch(error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async createNodeByAsset(params: ICreateByAssetParams): Promise<INode | null> {
        try {
            await Service.Editor.lock();
             const assetUuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [params.dbURL]);
            if (!assetUuid) {
                throw new Error(`Asset not found for dbURL: ${params.dbURL}`);
            }
            const canvasNeeded = params.canvasRequired || false;
            return await this._createNode(assetUuid, canvasNeeded, false, params);
        } catch(error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async _createNode(assetUuid: string | null, canvasNeeded: boolean, checkUITransform: boolean, params: ICreateByNodeTypeParams | ICreateByAssetParams): Promise<INode | null> {
        const currentScene = Service.Editor.getRootNode();
        if (!currentScene) {
            throw new Error('Failed to create node: the scene is not opened.');
        }

        const workMode = params.workMode || '2d';
        // 使用增强的路径处理方法
        let parent = await this._getOrCreateNodeByPath(params.path, currentScene);
        if (!parent) {
            parent = currentScene;
        }

        let resultNode;
        if (assetUuid) {
            const { node, canvasRequired } = await createNodeByAsset({
                uuid: assetUuid,
                canvasRequired: canvasNeeded
            });
            resultNode = node;
            parent = await this.checkCanvasRequired(workMode, Boolean(canvasRequired), parent, params.position as Vec3) as Node;
        }
        if (!resultNode) {
            resultNode = new cc.Node();
        }

        if (!resultNode) {
            return null;
        }

        /**
         * 默认创建节点是从 prefab 模板，所以初始是 prefab 节点
         * 是否要 unlink 为普通节点
         * 有 nodeType 说明是内置资源创建的，需要移除 prefab info
         */
        if ('nodeType' in params) {
            Service.Prefab.removePrefabInfoFromNode(resultNode, true);
        }

        if (params.name) {
            resultNode.name = params.name;
        }

        this.emit('node:before-add', resultNode);
        if (parent) {
            this.emit('node:before-change', parent);
        }

        /**
         * 新节点的 layer 跟随父级节点，但父级节点为场景根节点除外
         * parent.layer 可能为 0 （界面下拉框为 None），此情况下新节点不跟随
         */
        if (parent && parent.layer && parent !== currentScene) {
            setLayer(resultNode, parent.layer, true);
        }

        // Compared to the editor, the position is set via API, so local coordinates are used here.
        if (params.position) {
            resultNode.setPosition(params.position);
        }

        resultNode.setParent(parent, params.keepWorldTransform);
        // setParent 后，node的path可能会变，node的name需要同步path中对应的name
        const path = NodeMgr.getNodePath(resultNode);
        const name = path.split('/').pop();
        if (name && resultNode.name !== name) {
            resultNode.name = name;
        }
        if (checkUITransform) {
            this.ensureUITransformComponent(resultNode);
        }

        // 发送添加节点事件，添加节点中的根节点
        this.emit('node:add', resultNode);

        // 发送节点修改消息
        if (parent) {
            this.emit('node:change', parent, { type: NodeEventType.CHILD_CHANGED });
        }

        return sceneUtils.generateNodeInfo(resultNode, true);
    }

    /**
     * 获取或创建路径节点
     */
    private async _getOrCreateNodeByPath(path: string | undefined, currentScene: Node): Promise<Node | null> {
        if (!path) {
            return null;
        }

        // 先尝试获取现有节点
        const parent = NodeMgr.getNodeByPath(path);
        if (parent) {
            return parent;
        }

        // 如果不存在，则创建路径
        return await this._ensurePathExists(path, currentScene);
    }

    /**
     * 确保路径存在，如果不存在则创建空节点
     */
    private async _ensurePathExists(path: string | undefined, currentScene: Node): Promise<Node | null> {
        if (!path) {
            return null;
        }

        if (!currentScene) {
            return null;
        }

        // 分割路径
        const pathParts = path.split('/').filter(part => part.trim() !== '');
        if (pathParts.length === 0) {
            return null;
        }

        let currentParent: Node = currentScene;

        // 逐级检查并创建路径
        for (let i = 0; i < pathParts.length; i++) {
            const pathPart = pathParts[i];
            let nextNode = currentParent.getChildByName(pathPart);

            if (!nextNode) {
                if (pathPart === 'Canvas') {
                    nextNode = await this.checkCanvasRequired('2d', true, currentParent, undefined);
                } else {
                    // 创建空节点
                    nextNode = new Node(pathPart);
                    // 设置父级
                    nextNode.setParent(currentParent);
                    // 确保新创建的节点有必要的组件
                    this.ensureUITransformComponent(nextNode);

                    // 发送节点创建事件
                    this.emit('node:add', nextNode);
                }
            }
            if (!nextNode) {
                throw new Error(`Failed to create node: the path ${path} is not valid.`);
            }
            currentParent = nextNode;
        }

        return currentParent;
    }

    async deleteNode(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        try {
            await Service.Editor.lock();

            const path = params.path;
            const node = NodeMgr.getNodeByPath(path);
            if (!node) {
                return null;
            }

            // 发送节点修改消息
            const parent = node.parent;
            this.emit('node:before-remove', node);
            if (parent) {
                this.emit('node:before-change', parent);
            }

            node.setParent(null, params.keepWorldTransform);
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

            this.emit('node:remove', node);

            return {
                path: path,
            };
        } catch(error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    private _walkNode(node: Node, func: Function) {
        node && node.children && node.children.forEach((child) => {
            func(child);
            this._walkNode(child, func);
        });
    }

    async updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult> {
        const updateOperate = () => {
            const node = NodeMgr.getNodeByPath(params.path);
            if (!node) {
                throw new Error(`更新节点失败，无法通过 ${params.path} 查询到节点`);
            }

            this.emit('node:before-change', node);
            // TODO 少了 parent 属性的设置
            // if (path === 'parent' && node.parent) {
            //   // 发送节点修改消息
            //   // this.emit('before-change', node.parent);
            // }

            if (params.name && params.name !== node.name) {
                NodeMgr.updateNodeName(node.uuid, params.name);
            }
            // TODO 这里需要按照 3x 用 setProperty 的方式去赋值，因为 prefab 那边需要 path
            const paths: string[] = [];
            if (params.properties) {
                const options = params.properties;
                if (options.active !== undefined) {
                    node.active = options.active;
                    paths.push('active');
                }
                if (options.position) {
                    node.setPosition(options.position as Vec3);
                    paths.push('position');
                }
                // if (options.worldPosition) {
                //     node.setWorldPosition(options.worldPosition as Vec3);
                // }
                if (options.rotation) {
                    node.rotation = options.rotation as Quat;
                    paths.push('rotation');
                }
                // if (options.worldRotation) {
                //     node.worldRotation = options.worldRotation as Quat;
                // }
                if (options.eulerAngles) {
                    node.eulerAngles = options.eulerAngles as Vec3;
                    paths.push('eulerAngles');
                }
                // if (options.angle) {
                //     node.angle = options.angle;
                // }
                if (options.scale) {
                    node.scale = options.scale as Vec3;
                    paths.push('scale');
                }
                // if (options.worldScale) {
                //     node.worldScale = options.worldScale as Vec3;
                // }
                // if (options.forward) {
                //     node.forward = options.forward as Vec3;
                // }
                if (options.mobility) {
                    node.mobility = options.mobility;
                    paths.push('mobility');
                }
                if (options.layer) {
                    node.layer = options.layer;
                    paths.push('layer');
                }
                // if (options.hasChangedFlags) {
                //     node.hasChangedFlags = options.hasChangedFlags;
                // }
            }

            const info = {
                path: NodeMgr.getNodePath(node),
            };

            for (const path of paths) {
                this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: path });
            }

            // TODO 少了 parent 属性的设置
            // 改变父子关系
            // if (path === 'parent' && node.parent) {
            //     // 发送节点修改消息
            //     this.emit('change', node.parent, { type: NodeOperationType.SET_PROPERTY, propPath: 'children', record: record });
            // }
            return info;
        };

        try {
            await Service.Editor.lock();
            return updateOperate();
        } catch(error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async queryNode(params: IQueryNodeParams): Promise<INode | null> {
        try {
            await Service.Editor.lock();
            let node = NodeMgr.getNodeByPath(params.path);
            if (!params.path || params.path === '/') {
                node = Service.Editor.getRootNode();
            }
            if (!node) {
                return null;
            }
            return sceneUtils.generateNodeInfo(node, !!params.queryChildren, !!params.queryComponent);
        }   catch(error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
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

    /**
     * 检查并根据需要创建 canvas节点或为父级添加UITransform组件，返回父级节点，如果需要canvas节点，则父级节点会是canvas节点
     * @param workMode
     * @param canvasRequiredParam
     * @param parent
     * @param position
     * @returns
     */
    async checkCanvasRequired(workMode: string, canvasRequiredParam: boolean | undefined, parent: Node | null, position: Vec3 | undefined): Promise<Node | null> {

        if (canvasRequiredParam && parent?.isValid) {
            let canvasNode: Node | null;

            canvasNode = getUICanvasNode(parent);
            if (canvasNode) {
                parent = canvasNode;
            }

            // 自动创建一个 canvas 节点
            if (!canvasNode) {
                // TODO 这里会导致如果在 3D 场景下创建 2d canvas 摄像机的优先级跟主摄像机一样，
                //  导致显示不出 UI 来，先都用 ui canvas
                const canvasAssetUuid = 'f773db21-62b8-4540-956a-29bacf5ddbf5';

                // // 2d 项目创建的 ui 节点，canvas 下的 camera 的 visibility 默认勾上 default
                // if (workMode === '2d') {
                //     canvasAssetUuid = '4c33600e-9ca9-483b-b734-946008261697';
                // }

                const canvasAsset = await loadAny<Prefab>(canvasAssetUuid);
                canvasNode = cc.instantiate(canvasAsset) as Node;
                Service.Prefab.removePrefabInfoFromNode(canvasNode);

                if (parent) {
                    parent.addChild(canvasNode);
                }
                parent = canvasNode;
            }

            // 目前 canvas 默认 z 为 1，而拖放到 Canvas 的控件因为检测的是 z 为 0 的平面，所以这边先强制把 z 设置为和 canvas 的一样
            if (position) {
                position.z = canvasNode.position.z;
            }
        }
        return parent;
    }

    public onEditorOpened() {
        const nodeMap = NodeMgr.getNodesInScene();
        // 场景载入后要将现有节点监听所需事件
        Object.keys(nodeMap).forEach((key) => {
            this.registerEventListeners(nodeMap[key]);
        });
        this.registerNodeMgrEvents();
        Service.Component.init();
    }

    public onEditorClosed() {
        Service.Component.unregisterCompMgrEvents();
        this.unregisterNodeMgrEvents();
        const nodeMap = NodeMgr.getNodes();
        Object.keys(nodeMap).forEach((key) => {
            this.unregisterEventListeners(nodeMap[key]);
        });
        NodeMgr.clear();
        EditorExtends.Component.clear();
    }

    // ----------

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
            node.on(eventType, boundHandler, this);
            this.nodeHandlers.set(`${eventType}_${node.uuid}`, boundHandler);
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

    onNodeTransformChanged (node: Node, transformBit: TransformBit) {
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

    onNodeSizeChanged (node: Node) {
        const changeOpts: IChangeNodeOptions = { type: NodeEventType.SIZE_CHANGED, source: EventSourceType.ENGINE };
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            const index = node.components.indexOf(uiTransform);
            changeOpts.propPath = `_components.${index}.contentSize`;
        }
        this.emit('node:change', node, changeOpts);
    }

    onNodeAnchorChanged (node: Node) {
        const changeOpts: IChangeNodeOptions = { type: NodeEventType.ANCHOR_CHANGED, source: EventSourceType.ENGINE };
        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            const index = node.components.indexOf(uiTransform);
            changeOpts.propPath = `_components.${index}.anchorPoint`;
        }
        this.emit('node:change', node, changeOpts);
    }

    onNodeParentChanged (parent: Node, child: Node) {
        if (isEditorNode(child)) {
            return;
        }

        this.emit('node:change', parent, { type: NodeEventType.CHILD_CHANGED });

        // 自身 parent = null 为删除，最后会有 deleted 消息，所以不需要再发 changed 消息
        if (child.parent) {
            this.emit('node:change', child, { type: NodeEventType.PARENT_CHANGED });
        }
    }

    onLightProbeChanged(node: Node) {
        const changeOpts: IChangeNodeOptions = { type: NodeEventType.LIGHT_PROBE_CHANGED, source: EventSourceType.ENGINE };
        this.emit('node:change', node, changeOpts);
    }

    /**
     * 添加一个节点到管理器内
     * @param uuid
     * @param {*} node
     */
    add(uuid: string, node: Node) {
        this.registerEventListeners(node);

        if (!isEditorNode(node)) {
            this.emit('node:added', node);
        }
    }

    /**
     * 一个节点被修改,由 EditorExtends.Node.emit('change') 触发
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
            this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: path });
        }
    }

    /**
     * 从管理器内移除一个指定的节点
     * @param uuid
     * @param {*} node
     */
    remove(uuid: string, node: Node) {
        this.unregisterEventListeners(node);
        if (!isEditorNode(node)) {
            this.emit('node:removed', node, { source: EventSourceType.ENGINE });
        }
    }
}

