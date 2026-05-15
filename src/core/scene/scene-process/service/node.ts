import { register, BaseService, Service } from './core';
import {
    type ICreateByAssetParams,
    type ICreateByNodeTypeParams,
    type IDeleteNodeParams,
    type IDeleteNodeResult,
    type INode,
    type INodeService,
    type IQueryNodeParams,
    type IQueryNodeTreeParams,
    type INodeTreeItem,
    type INodeEvents,
    NodeType,
    NodeEventType,
    ISetPropertyOptions
} from '../../common';
import { type IScene } from '../../common/editor/scene';
import { Rpc } from '../rpc';
import { CCClass, CCObject, Node, Prefab, Quat, Vec3 } from 'cc';
import { createNodeByAsset, loadAny } from './node/node-create';
import { getUICanvasNode, setLayer } from './node/node-utils';
import { prefabUtils } from './prefab/utils';
import { sceneUtils } from './scene/utils';
import nodeMgr from './node/index';
import NodeConfig from './node/node-type-config';

const NodeMgr = EditorExtends.Node;

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Node')
export class NodeService extends BaseService<INodeEvents> implements INodeService {
    async createByType(params: ICreateByNodeTypeParams): Promise<INode | null> {
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
            if (projectType && workMode && projectType !== workMode.toLowerCase() && paramsArray.length > 1) {
                assetUuid = paramsArray[1]['assetUuid'] || null;
                canvasNeeded = paramsArray[1].canvasRequired ? true : false;
            }
            return await this._createNode(assetUuid, canvasNeeded, params.nodeType == NodeType.EMPTY, params);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async createByAsset(params: ICreateByAssetParams): Promise<INode | null> {
        try {
            await Service.Editor.lock();
            const assetUuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [params.dbURL]);
            if (!assetUuid) {
                throw new Error(`Asset not found for dbURL: ${params.dbURL}`);
            }
            const canvasNeeded = params.canvasRequired || false;
            return await this._createNode(assetUuid, canvasNeeded, false, params);
        } catch (error) {
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
            parent = await this.checkCanvasRequired(workMode.toLowerCase(), Boolean(canvasRequired), parent, params.position as Vec3) as Node;
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
            nodeMgr.ensureUITransformComponent(resultNode);
        }

        // 发送添加节点事件，添加节点中的根节点
        this.emit('node:add', resultNode);

        // 发送节点修改消息
        if (parent) {
            this.emit('node:change', parent, { type: NodeEventType.CHILD_CHANGED });
        }

        return sceneUtils.generateNodeDump(resultNode) as Promise<INode>;
    }

    /**
     * 获取或创建路径节点
     */
    private async _getOrCreateNodeByPath(path: string | undefined, currentScene: Node): Promise<Node | null> {
        if (!path) {
            return null;
        }

        // 先尝试获取现有节点
        try {
            const parent = NodeMgr.getNodeByPath(path);
            if (parent) {
                return parent;
            }
        } catch (error) {
            console.error(error);
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
                    nodeMgr.ensureUITransformComponent(nextNode);

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

    async delete(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to delete node: the scene is not opened.');
            }

            const path = params.path;
            const node = NodeMgr.getNodeByPath(path);
            if (!node) {
                return null;
            }

            nodeMgr.baseRemoveNode(node, params.keepWorldTransform);

            return {
                path: path,
            };
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async query(params?: IQueryNodeParams): Promise<INode | IScene | null> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to query node: the scene is not opened.');
            }
            const path = params?.path;
            const node = (path && path !== '/') ? NodeMgr.getNodeByPath(path) : root;
            if (!node) return null;
            return await sceneUtils.generateNodeDump(node);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async queryNodeTree(params: IQueryNodeTreeParams): Promise<INodeTreeItem | null> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to query node tree: the scene is not opened.');
            }

            const step = (node: Node): INodeTreeItem | null => {
                if (node.objFlags & CCObject.Flags.HideInHierarchy) {
                    return null;
                }

                const children = node.children.map(step).filter(Boolean) as INodeTreeItem[];
                const prefabStateInfo = prefabUtils.getPrefabStateInfo(node);
                const isScene = node.constructor.name === 'Scene';

                return {
                    name: !node.name && isScene ? 'Scene' : node.name,
                    active: node.active,
                    locked: Boolean(node.objFlags & CCObject.Flags.LockedInEditor),
                    type: 'cc.' + node.constructor.name,
                    uuid: node.uuid,
                    children,
                    prefab: prefabStateInfo,
                    parent: (node.parent && node.parent.uuid) || '',
                    path: isScene ? '/' : NodeMgr.getNodePath(node),
                    isScene,
                    readonly: false,
                    components: node.components.map((comp) => {
                        const className = cc.js.getClassName(comp.constructor);
                        return {
                            isCustom: Service.Script.isCustomComponent(comp.constructor),
                            type: className,
                            value: comp.uuid,
                            extends: CCClass.getInheritanceChain(comp.constructor)
                                .map((itemCtor: any) => cc.js.getClassName(itemCtor))
                                .filter(Boolean),
                        };
                    }),
                };
            };

            let node: Node | null = root;
            if (params.path) {
                node = NodeMgr.getNodeByPath(params.path);
            }
            if (!node) {
                return null;
            }
            return step(node);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
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
            nodeMgr.registerEventListeners(nodeMap[key]);
        });
        nodeMgr.registerNodeMgrEvents();
        Service.Component.init();
    }

    public onEditorClosed() {
        Service.Component.unregisterCompMgrEvents();
        nodeMgr.unregisterNodeMgrEvents();
        const nodeMap = NodeMgr.getNodes();
        Object.keys(nodeMap).forEach((key) => {
            nodeMgr.unregisterEventListeners(nodeMap[key]);
        });
        NodeMgr.clear();
        EditorExtends.Component.clear();
    }

    public async previewSetProperty(options: ISetPropertyOptions): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return false;
        }
        return await nodeMgr.previewSetNodeProperty(node.uuid, options.path, options.dump);
    }

    public async cancelPreviewSetProperty(options: ISetPropertyOptions): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return false;
        }
        return await nodeMgr.cancelPreviewSetNodeProperty(node.uuid, options.path);
    }

    public async setProperty(options: ISetPropertyOptions): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return false;
        }
        if (options.path === 'name' && options.dump.value !== node.name) {
            // 这里相当于是做个hack的补充功能，因为setProperty并没有改变path。
            // 而在cli上是期望改变path的，后期感觉可以通过node:change消息来实现这个功能
            this.emit('node:before-change', node);
            NodeMgr.updateNodeName(node.uuid, options.dump.value as string);
            this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: 'name' });
            return true;
        }
        return await nodeMgr.setProperty(node.uuid, options.path, options.dump);
    }

    public async reset(path: string): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(path);
        if (!node) {
            return false;
        }
        return await nodeMgr.resetNode(node.uuid);
    }

    public async resetProperty(options: ISetPropertyOptions): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return false;
        }
        return await nodeMgr.resetProperty(node.uuid, options.path);
    }

    public async updatePropertyFromNull(options: ISetPropertyOptions): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return false;
        }
        return await nodeMgr.updatePropertyFromNull(node.uuid, options.path);
    }

    public async setNodeAndChildrenLayer(options: ISetPropertyOptions): Promise<void> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return;
        }
        return await nodeMgr.setNodeAndChildrenLayer(node.uuid, options.dump);
    }
}

