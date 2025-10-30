import { register, BaseService } from './core';
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
    NodeType
} from '../../common';
import { Rpc } from '../rpc';
import { CCObject, Node, Prefab, Quat, Vec3 } from 'cc';
import { createNodeByAsset, loadAny } from './node/node-create';
import { getUICanvasNode, setLayer } from './node/node-utils';
import sceneUtil from './scene/utils';
import NodeConfig from './node/node-type-config';

const NodeMgr = EditorExtends.Node;

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Node')
export class NodeService extends BaseService<INodeEvents> implements INodeService {

    async createNodeByType(params: ICreateByNodeTypeParams): Promise<INode | null> {
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

        return this._createNode(assetUuid, canvasNeeded, params.nodeType == NodeType.EMPTY, params);
    }

    async createNodeByAsset(params: ICreateByAssetParams): Promise<INode | null> {
        const assetUuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [params.dbURL]);
        if (!assetUuid) {
            throw new Error(`Asset not found for dbURL: ${params.dbURL}`);
        }
        const canvasNeeded = params.canvasRequired || false;
        return this._createNode(assetUuid, canvasNeeded, false, params);
    }

    async _createNode(assetUuid: string | null, canvasNeeded: boolean, checkUITransform: boolean, params: ICreateByNodeTypeParams | ICreateByAssetParams): Promise<INode | null> {
        const currentScene = cc.director.getScene();
        if (!currentScene) {
            throw new Error('Failed to create node: the scene is not opened.');
        }

        const workMode = params.workMode || '2d';
        // 使用增强的路径处理方法
        let parent = await this._getOrCreateNodeByPath(params.path);
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

        if (params.name) {
            resultNode.name = params.name;
        }

        this.emit('node:before-add', sceneUtil.generateNodeInfo(resultNode, false));
        if (parent) {
            this.emit('node:before-change', sceneUtil.generateNodeInfo(parent, false));
        }

        /**
         * 默认创建节点是从 prefab 模板，所以初始是 prefab 节点
         * 是否要 unlink 为普通节点
         */
        this._removePrefabInfoFromNode(resultNode, true);

        /**
         * 新节点的 layer 跟随父级节点，但父级节点为场景根节点除外
         * parent.layer 可能为 0 （界面下拉框为 None），此情况下新节点不跟随
         */
        if (parent && parent.layer && parent !== cc.director.getScene()) {
            setLayer(resultNode, parent.layer, true);
        }

        if (params.position) {
            resultNode.setWorldPosition(params.position);
        }

        resultNode.setParent(parent, params.keepWorldTransform);
        if (checkUITransform) {
            this.ensureUITransformComponent(resultNode);
        }

        // 发送添加节点事件，添加节点中的根节点
        this.emit('node:add', sceneUtil.generateNodeInfo(resultNode, false));

        // 发送节点修改消息
        if (parent) {
            // this.emit('node:change', sceneUtil.generateNodeInfo(parent, false), { type: cc.NodeEventType.CHILD_CHANGED });
        }

        return sceneUtil.generateNodeInfo(resultNode, true);
    }

    /**
     * 获取或创建路径节点
     */
    private async _getOrCreateNodeByPath(path: string | undefined): Promise<Node | null> {
        if (!path) {
            return null;
        }

        // 先尝试获取现有节点
        const parent = NodeMgr.getNodeByPath(path);
        if (parent) {
            return parent;
        }

        // 如果不存在，则创建路径
        return await this._ensurePathExists(path);
    }

    /**
     * 确保路径存在，如果不存在则创建空节点
     */
    private async _ensurePathExists(path: string | undefined): Promise<Node | null> {
        if (!path) {
            return null;
        }

        const currentScene = cc.director.getScene();
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
                    this.emit('node:add', sceneUtil.generateNodeInfo(nextNode, false));
                }
            }
            if (!nextNode) {
                throw new Error(`Failed to create node: the path ${path} is not valid.`);
            }
            currentParent = nextNode;
        }

        return currentParent;
    }

    private _removePrefabInfoFromNode(node: Node, removeNested?: boolean) {
        node.children.forEach((child: Node) => {
            // @ts-ignore
            const childPrefabInstance = child['_prefab']?.instance;
            if (childPrefabInstance) {
                // 判断嵌套的 PrefabInstance 是否需要移除
                if (removeNested) {
                    this._removePrefabInfoFromNode(child, removeNested);
                }
            } else {
                this._removePrefabInfoFromNode(child, removeNested);
            }
        });

        // @ts-ignore member access
        node['_prefab'] = null;

        // remove component prefabInfo
        node.components.forEach((comp) => {
            comp.__prefab = null;
        });
    }

    async deleteNode(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null> {
        const path = params.path;
        const node = NodeMgr.getNodeByPath(path);
        if (!node) {
            return null;
        }

        // 发送节点修改消息
        const parent = node.parent;
        this.emit('node:before-remove', sceneUtil.generateNodeInfo(node, false));
        if (parent) {
            this.emit('node:before-change', sceneUtil.generateNodeInfo(parent, false));
        }

        node.setParent(null, params.keepWorldTransform);
        NodeMgr.remove(node.uuid);
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

        this.emit('node:remove', sceneUtil.generateNodeInfo(node, false));

        return {
            path: path,
        };
    }

    private _walkNode(node: Node, func: Function) {
        node && node.children && node.children.forEach((child) => {
            func(child);
            this._walkNode(child, func);
        });
    }

    async updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult | null> {
        const node = NodeMgr.getNodeByPath(params.path);
        if (!node) {
            return null;
        }
        if (params.name && params.name !== node.name) {
            NodeMgr.updateNodeName(node.uuid, params.name);
        }
        if (params.properties) {
            const options = params.properties;
            if (options.active !== undefined) {
                node.active = options.active;
            }
            if (options.position) {
                node.setPosition(options.position as Vec3);
            }
            // if (options.worldPosition) {
            //     node.setWorldPosition(options.worldPosition as Vec3);
            // }
            if (options.rotation) {
                node.rotation = options.rotation as Quat;
            }
            // if (options.worldRotation) {
            //     node.worldRotation = options.worldRotation as Quat;
            // }
            if (options.eulerAngles) {
                node.eulerAngles = options.eulerAngles as Vec3;
            }
            // if (options.angle) {
            //     node.angle = options.angle;
            // }
            if (options.scale) {
                node.scale = options.scale as Vec3;
            }
            // if (options.worldScale) {
            //     node.worldScale = options.worldScale as Vec3;
            // }
            // if (options.forward) {
            //     node.forward = options.forward as Vec3;
            // }
            if (options.mobility) {
                node.mobility = options.mobility;
            }
            if (options.layer) {
                node.layer = options.layer;
            }
            // if (options.hasChangedFlags) {
            //     node.hasChangedFlags = options.hasChangedFlags;
            // }
        }

        const info = {
            path: NodeMgr.getNodePath(node),
        };

        this.emit('node:update', sceneUtil.generateNodeInfo(node, false));

        return info;
    }

    async queryNode(params: IQueryNodeParams): Promise<INode | null> {
        const node = NodeMgr.getNodeByPath(params.path);
        if (!node) {
            return null;
        }
        return sceneUtil.generateNodeInfo(node, params.queryChildren || false);
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

        if (canvasRequiredParam) {
            let canvasNode: Node | null;

            canvasNode = getUICanvasNode(parent);
            if (canvasNode) {
                parent = canvasNode;
            }

            // 自动创建一个 canvas 节点
            if (!canvasNode) {
                let canvasAssetUuid = 'f773db21-62b8-4540-956a-29bacf5ddbf5';

                // 2d 项目创建的 ui 节点，canvas 下的 camera 的 visibility 默认勾上 default
                if (workMode === '2d') {
                    canvasAssetUuid = '4c33600e-9ca9-483b-b734-946008261697';
                }

                const canvasAsset = await loadAny<Prefab>(canvasAssetUuid);
                canvasNode = cc.instantiate(canvasAsset) as Node;

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
}
