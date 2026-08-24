import { register, BaseService, Service } from './core';
import {
    type ICreateByAssetParams,
    type ICreateByNodeTypeParams,
    type ICreateNodePreflightResult,
    type IDeleteNodeParams,
    type IDeleteNodeResult,
    type INode,
    type INodeService,
    type IQueryNodeParams,
    type IQueryNodeTreeParams,
    type INodeTreeItem,
    type INodeEvents,
    type ISetParentParams,
    type IReorderParams,
    type ICopyParams,
    type IPasteParams,
    type IDuplicateParams,
    type ICutParams,
    type IClipboardState,
    type IMoveArrayElementParams,
    type IRemoveArrayElementParams,
    type IChangeNodeLockParams,
    type PrefabCanvasHandling,
    NodeType,
    NodeEventType,
    ISetPropertyOptions,
} from '../../common';
import { type IScene } from '../../common/editor/scene';
import { Rpc } from '../rpc';
import { Canvas, CCClass, CCObject, Component, director, Node, Prefab, Quat, UITransform, Vec3 } from 'cc';
import { createNodeByAsset, createShouldHideInHierarchyCanvasNode, loadAny, queryCanvasRequiredByAsset } from './node/node-create';
import { getUICanvasNode, getUITransformParentNode, hasOneKindOfComponent, setLayer } from './node/node-utils';
import { NodeUndoHelper } from './node/node-undo';
import { isUndoApplying } from './undo/applying-state';
import { prefabUtils } from './prefab/utils';
import { sceneUtils } from './scene/utils';
import nodeMgr from './node/index';
import NodeConfig from './node/node-type-config';
import { RemoveNodeCommand } from './undo/commands/remove-node-command';
import { RemoveComponentCommand } from './undo/commands/remove-component-command';
import { PrefabPreviewCanvasCommand } from './undo/commands/prefab-preview-canvas-command';
import { broadcastAnimationPropertyCommitted } from './animation/property-commit-event';
import { isRootNodePath, stripLeadingSlashes, validateNodeName } from '../../../engine/editor-extends/manager/path-utils';

const NodeMgr = EditorExtends.Node;

interface IPrefabCanvasUndoRecord {
    rootNode: Node;
    rootParentUuid: string | null;
    rootParentPath: string;
    rootSiblingIndex: number;
    addedUITransform: Component | null;
    previewCanvasNode: Node | null;
    previewCanvasCreated: boolean;
    workMode: string;
}

interface ICreatePreflightToken {
    requestKey: string;
    action: ICreateNodePreflightResult['action'];
    canvasRequired: boolean;
}

/**
 * 子进程节点处理器
 * 在子进程中处理所有节点相关操作
 */
@register('Node')
export class NodeService extends BaseService<INodeEvents> implements INodeService {
    private readonly _undo = new NodeUndoHelper((event, ...args) => this.emit(event as any, ...args));
    private _prefabCanvasUndoRecords: IPrefabCanvasUndoRecord[] | null = null;
    private _prefabCanvasUndoBeforeNodeUuids: Set<string> | null = null;
    private readonly _preflightTokens = new Map<string, ICreatePreflightToken>();
    private _preflightTokenSequence = 0;

    async createByType(params: ICreateByNodeTypeParams): Promise<INode | null> {
        this._validateCreateParams(params);
        try {
            await Service.Editor.lock();
            const beforeNodeUuids = this._collectSceneNodeUuidsForUndo();
            const createRootPath = this._getCreateRootPathForUndo(beforeNodeUuids, params.path);
            const { assetUuid, canvasRequired: canvasNeeded } = this._resolveTypeCreateOptions(params);
            this._validatePreflightToken(params);
            const prefabCanvasUndoRecords = this._beginPrefabCanvasUndoCapture(beforeNodeUuids);
            let result: INode | null;
            try {
                result = await this._createNode(assetUuid, canvasNeeded, params.nodeType == NodeType.EMPTY, params);
            } finally {
                this._endPrefabCanvasUndoCapture();
            }
            this._recordCreateNodeCommand(beforeNodeUuids, [createRootPath, result?.path].filter(Boolean) as string[], prefabCanvasUndoRecords);
            return result;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async createByAsset(params: ICreateByAssetParams): Promise<INode | null> {
        this._validateCreateParams(params);
        try {
            await Service.Editor.lock();
            const beforeNodeUuids = this._collectSceneNodeUuidsForUndo();
            const createRootPath = this._getCreateRootPathForUndo(beforeNodeUuids, params.path);
            const assetUuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [params.dbURL]);
            if (!assetUuid) {
                throw new Error(`Asset not found for dbURL: ${params.dbURL}`);
            }
            // 阻止添加自己到当前的Prefab中，防止Prefab的循环引用
            if (Service.Editor.getCurrentEditorType() === 'prefab') {
                const rootNode = Service.Editor.getRootNode();
                const rootNodePrefabInfo = rootNode?.['_prefab'];
                if (rootNodePrefabInfo && rootNodePrefabInfo.asset && rootNodePrefabInfo.asset._uuid === assetUuid) {
                    throw new Error('The prefab you are trying to add is the same with the prefab in editing, this is not allowed.');
                }
            }
            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [assetUuid]);
            const canvasNeeded = params.canvasRequired || false;
            this._validatePreflightToken(params);
            const prefabCanvasUndoRecords = this._beginPrefabCanvasUndoCapture(beforeNodeUuids);
            let result: INode | null;
            try {
                result = await this._createNode(assetUuid, canvasNeeded, false, params, assetInfo?.type);
            } finally {
                this._endPrefabCanvasUndoCapture();
            }
            this._recordCreateNodeCommand(beforeNodeUuids, [createRootPath, result?.path].filter(Boolean) as string[], prefabCanvasUndoRecords);
            return result;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async preflightCreate(params: ICreateByNodeTypeParams | ICreateByAssetParams): Promise<ICreateNodePreflightResult> {
        try {
            await Service.Editor.lock();
            const currentScene = Service.Editor.getRootNode();
            if (!currentScene) {
                throw new Error('Failed to preflight node creation: the scene is not opened.');
            }

            let canvasRequired: boolean;
            if ('nodeType' in params) {
                canvasRequired = this._resolveTypeCreateOptions(params).canvasRequired;
            } else {
                const assetUuid = await Rpc.getInstance().request('assetManager', 'queryUUID', [params.dbURL]);
                if (!assetUuid) {
                    throw new Error(`Asset not found for dbURL: ${params.dbURL}`);
                }
                const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [assetUuid]);
                const assetCanvasRequired = await queryCanvasRequiredByAsset({
                    uuid: assetUuid,
                    type: assetInfo?.type,
                    workMode: params.workMode || '2d',
                });
                canvasRequired = Boolean(params.canvasRequired || assetCanvasRequired);
            }

            const result = this._resolveCreatePreflight(params, canvasRequired, currentScene);
            return {
                ...result,
                preflightToken: this._createPreflightToken(params, result),
            };
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    private _resolveTypeCreateOptions(params: ICreateByNodeTypeParams): { assetUuid: string | null; canvasRequired: boolean } {
        const explicitCanvasRequired = Boolean(params.canvasRequired);
        const nodeType = params.nodeType as string;
        const paramsArray = NodeConfig[nodeType];
        if (!paramsArray || paramsArray.length === 0) {
            throw new Error(`Node type '${nodeType}' is not implemented`);
        }

        let config = paramsArray[0];
        const projectType = config['project-type'];
        if (projectType && params.workMode && projectType !== params.workMode.toLowerCase() && paramsArray.length > 1) {
            config = paramsArray[1];
        }

        return {
            assetUuid: config.assetUuid || null,
            canvasRequired: explicitCanvasRequired || Boolean(config.canvasRequired),
        };
    }

    private _getCreatePathPreflight(path: string | undefined, currentScene: Node): {
        parent: Node;
        materializesUITransform: boolean;
        canvasRequired: boolean;
    } {
        if (path) {
            try {
                const existingParent = NodeMgr.getNodeByPath(path);
                if (existingParent) {
                    return { parent: existingParent, materializesUITransform: false, canvasRequired: false };
                }
            } catch (error) {
                console.error(error);
            }
        }

        const pathParts = path?.split('/').filter(part => part.trim() !== '') ?? [];
        let parent = currentScene;

        for (const pathPart of pathParts) {
            const child = parent.getChildByName(pathPart);
            if (child) {
                parent = child;
                continue;
            }

            if (pathPart === 'Canvas') {
                return { parent, materializesUITransform: false, canvasRequired: true };
            }

            // _ensurePathExists() adds UITransform to the first missing ordinary path segment.
            return { parent, materializesUITransform: true, canvasRequired: false };
        }

        return { parent, materializesUITransform: false, canvasRequired: false };
    }

    private _getCanvasContext(parent: Node): {
        hasCanvasContext: boolean;
        canvasNode: Node | null;
        uiTransformNode: Node | null;
    } {
        const isPrefabMode = Service.Editor.getCurrentEditorType() === 'prefab';
        const canvasContextNode = getUICanvasNode(parent, !isPrefabMode);
        const uiTransformNode = getUITransformParentNode(parent);
        return {
            hasCanvasContext: Boolean(canvasContextNode),
            canvasNode: canvasContextNode,
            uiTransformNode,
        };
    }

    private _resolveCreatePreflight(
        params: ICreateByNodeTypeParams | ICreateByAssetParams,
        canvasRequired: boolean,
        currentScene: Node,
    ): Omit<ICreateNodePreflightResult, 'preflightToken'> {
        const pathPlan = this._getCreatePathPreflight(params.path, currentScene);
        if (pathPlan.materializesUITransform) {
            return {
                action: 'create',
                canvasRequired,
                canvasPath: null,
                uiTransformPath: null,
            };
        }

        const effectiveCanvasRequired = canvasRequired || pathPlan.canvasRequired;
        const context = this._getCanvasContext(pathPlan.parent);
        const requiresPrefabCanvasHandling = effectiveCanvasRequired
            && Service.Editor.getCurrentEditorType() === 'prefab'
            && !context.hasCanvasContext
            && !context.uiTransformNode;

        return {
            action: requiresPrefabCanvasHandling ? 'choose-prefab-canvas-handling' : 'create',
            canvasRequired: effectiveCanvasRequired,
            canvasPath: context.canvasNode ? NodeMgr.getNodePath(context.canvasNode) ?? null : null,
            uiTransformPath: context.uiTransformNode ? NodeMgr.getNodePath(context.uiTransformNode) ?? null : null,
        };
    }

    private _createPreflightToken(
        params: ICreateByNodeTypeParams | ICreateByAssetParams,
        result: Omit<ICreateNodePreflightResult, 'preflightToken'>,
    ): string {
        const token = `node-create-${Date.now().toString(36)}-${(++this._preflightTokenSequence).toString(36)}`;
        if (this._preflightTokens.size >= 128) {
            const oldestToken = this._preflightTokens.keys().next().value;
            if (oldestToken) {
                this._preflightTokens.delete(oldestToken);
            }
        }
        this._preflightTokens.set(token, {
            requestKey: this._getPreflightRequestKey(params),
            action: result.action,
            canvasRequired: result.canvasRequired,
        });
        return token;
    }

    private _validatePreflightToken(params: ICreateByNodeTypeParams | ICreateByAssetParams): void {
        if (!params.preflightToken) {
            return;
        }

        const record = this._preflightTokens.get(params.preflightToken);
        this._preflightTokens.delete(params.preflightToken);
        if (!record || record.requestKey !== this._getPreflightRequestKey(params)) {
            throw new Error('The node creation preflight token is invalid or does not match the request. Run preflightCreate again.');
        }

        if (record.action !== 'create') {
            return;
        }

        const currentScene = Service.Editor.getRootNode();
        if (!currentScene) {
            throw new Error('Failed to create node: the scene is not opened.');
        }
        const currentResult = this._resolveCreatePreflight(params, record.canvasRequired, currentScene);
        if (currentResult.action !== 'create') {
            throw new Error('Canvas context changed after preflight. Run preflightCreate again before creating the node.');
        }
    }

    private _getPreflightRequestKey(params: ICreateByNodeTypeParams | ICreateByAssetParams): string {
        return JSON.stringify('nodeType' in params ? {
            kind: 'type',
            path: params.path,
            nodeType: params.nodeType,
            workMode: params.workMode ?? '2d',
            canvasRequired: Boolean(params.canvasRequired),
        } : {
            kind: 'asset',
            path: params.path,
            dbURL: params.dbURL,
            workMode: params.workMode ?? '2d',
            canvasRequired: Boolean(params.canvasRequired),
        });
    }

    async _createNode(assetUuid: string | null, canvasNeeded: boolean, checkUITransform: boolean, params: ICreateByNodeTypeParams | ICreateByAssetParams, assetType?: string): Promise<INode | null> {
        const currentScene = Service.Editor.getRootNode();
        if (!currentScene) {
            throw new Error('Failed to create node: the scene is not opened.');
        }

        const workMode = params.workMode || '2d';
        // 使用增强的路径处理方法
        let parent = await this._getOrCreateNodeByPath(params.path, currentScene, params.prefabCanvasHandling);
        if (!parent) {
            parent = currentScene;
        }

        let resultNode;
        let canvasRequired = canvasNeeded;
        if (assetUuid) {
            const createResult = await createNodeByAsset({
                uuid: assetUuid,
                canvasRequired: canvasNeeded,
                type: assetType,
                workMode: workMode,
            });
            resultNode = createResult.node;
            canvasRequired = Boolean(canvasNeeded || createResult.canvasRequired);
        }
        if (!resultNode) {
            resultNode = new cc.Node();
        }

        if (!resultNode) {
            return null;
        }

        if (checkUITransform) {
            nodeMgr.ensureUITransformComponent(resultNode);
        }

        parent = await this.checkCanvasRequired(workMode.toLowerCase(), Boolean(canvasRequired), parent, params.position as Vec3, params.prefabCanvasHandling) as Node;

        /**
         * 默认创建节点是从 prefab 模板，所以初始是 prefab 节点
         * 是否要 unlink 为普通节点
         * 有 nodeType 说明是内置资源创建的，需要移除 prefab info
         * createByAsset 时，如果 assetType 不是 cc.Prefab 或者 unlinkPrefab 为 true，也需要移除
         */
        const shouldUnlinkPrefab = 'nodeType' in params || assetType !== 'cc.Prefab' || params.unlinkPrefab;
        if (shouldUnlinkPrefab) {
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
        // 挂到 prefab instance 下时，setParent 相关流程可能重新补回模板 prefab 信息。
        // 但在 prefab asset 编辑器中，新节点需要保留 setParent 补齐的 prefab 元数据。
        if (shouldUnlinkPrefab && Service.Editor.getCurrentEditorType() !== 'prefab') {
            Service.Prefab.removePrefabInfoFromNode(resultNode, true);
        }
        // 发送添加节点事件，添加节点中的根节点
        this.emit('node:add', resultNode);

        return sceneUtils.generateNodeDump(resultNode) as INode;
    }

    /**
     * 获取或创建路径节点
     */
    private async _getOrCreateNodeByPath(path: string | undefined, currentScene: Node, prefabCanvasHandling?: PrefabCanvasHandling): Promise<Node | null> {
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
        return await this._ensurePathExists(path, currentScene, prefabCanvasHandling);
    }

    private _validateCreateParams(params: ICreateByNodeTypeParams | ICreateByAssetParams): void {
        this._validateRequestedNodeName(params.name);
        this._validateRequestedNodePath(params.path);
    }

    private _validateRequestedNodeName(name: string | undefined): void {
        if (name === undefined) {
            return;
        }
        const error = validateNodeName(name);
        if (error) {
            throw new Error(error);
        }
    }

    private _validateRequestedNodePath(path: string): void {
        for (const segment of path.split('/').filter((part) => part.trim() !== '')) {
            this._validateRequestedNodeName(segment);
        }
    }

    /**
     * 确保路径存在，如果不存在则创建空节点
     */
    private async _ensurePathExists(path: string | undefined, currentScene: Node, prefabCanvasHandling?: PrefabCanvasHandling): Promise<Node | null> {
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
            const parentPrefix = stripLeadingSlashes(NodeMgr.getNodePath(currentParent));
            const candidatePath = parentPrefix ? `${parentPrefix}/${pathPart}` : pathPart;
            let nextNode = NodeMgr.getNodeByPath(candidatePath) as Node | null;

            if (!nextNode) {
                if (pathPart === 'Canvas') {
                    nextNode = await this.checkCanvasRequired('2d', true, currentParent, undefined, prefabCanvasHandling);
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

            const uuids = Service.Prefab.filterChildOfPrefabAssetWhenRemoveNode(node.uuid);
            if (!uuids.length) {
                return null;
            }

            let command: RemoveNodeCommand | null = null;
            if (this._undo.shouldRecordStructureCommand()) {
                command = RemoveNodeCommand.capture(node, params.keepWorldTransform);
            }

            nodeMgr.baseRemoveNode(node, params.keepWorldTransform);
            if (command) {
                Service.Undo?.push(command);
            }

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
            let node: Node | null = root;
            // '/' 指当前编辑器的根：场景模式下是场景，prefab 模式下是 prefab 根，而非承载它的虚拟场景
            if (path && !isRootNodePath(path)) {
                node = NodeMgr.getNodeByPath(path);
            }
            if (!node) return null;
            return sceneUtils.generateNodeDump(node, params);
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

                let name = node.name;
                if (!name && isScene) {
                    name = 'Scene';
                }
                let path = NodeMgr.getNodePath(node);
                if (isScene) {
                    path = '/';
                }

                return {
                    name,
                    active: node.active,
                    locked: Boolean(node.objFlags & CCObject.Flags.LockedInEditor),
                    type: 'cc.' + node.constructor.name,
                    uuid: node.uuid,
                    children,
                    prefab: prefabStateInfo,
                    parent: (node.parent && node.parent.uuid) || '',
                    path,
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

    queryNodesByAssetUuid(uuid: string): string[] {
        return nodeMgr.queryNodesByAssetUuid(uuid);
    }

    async queryNodesMissAsset(): Promise<string[]> {
        return await nodeMgr.queryNodesMissAsset();
    }

    /**
     * 检查并根据需要创建 canvas节点或为父级添加UITransform组件，返回父级节点，如果需要canvas节点，则父级节点会是canvas节点
     * @param workMode
     * @param canvasRequiredParam
     * @param parent
     * @param position
     * @returns
     */
    async checkCanvasRequired(
        workMode: string,
        canvasRequiredParam: boolean | undefined,
        parent: Node | null,
        position: Vec3 | undefined,
        prefabCanvasHandling?: PrefabCanvasHandling,
    ): Promise<Node | null> {

        if (canvasRequiredParam && parent?.isValid) {
            let canvasNode: Node | null;
            const isPrefabMode = Service.Editor.getCurrentEditorType() === 'prefab';

            if (isPrefabMode) {
                const rootNode = Service.Editor.getRootNode();
                if (parent === director.getScene() && rootNode) {
                    parent = rootNode;
                }
                canvasNode = getUICanvasNode(parent, false);
                const uiTransformParentNode = getUITransformParentNode(parent);

                if (!canvasNode) {
                    if (uiTransformParentNode) {
                        canvasNode = uiTransformParentNode;
                    } else if (prefabCanvasHandling === 'add-root-ui-transform') {
                        canvasNode = await this.ensurePrefabRootUITransform(workMode);
                    } else if (!prefabCanvasHandling) {
                        canvasNode = new Node();
                    }
                } else if (canvasNode.parent !== director.getScene()) {
                    parent = canvasNode;
                }
            } else {
                canvasNode = getUICanvasNode(parent);
                if (canvasNode) {
                    parent = canvasNode;
                }
            }

            // 自动创建一个 canvas 节点
            if (!canvasNode) {
                let canvasAssetUuid = 'f773db21-62b8-4540-956a-29bacf5ddbf5';

                if (workMode === '2d') {
                    canvasAssetUuid = '4c33600e-9ca9-483b-b734-946008261697';
                }

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

    private async ensurePrefabRootUITransform(workMode: string): Promise<Node | null> {
        const rootNode = Service.Editor.getRootNode();
        if (!rootNode?.isValid) {
            return null;
        }

        const undoRecord = this._createPrefabCanvasUndoRecord(rootNode, workMode);
        if (!hasOneKindOfComponent(rootNode, UITransform)) {
            undoRecord.addedUITransform = rootNode.addComponent('cc.UITransform') as Component;
        }

        if (rootNode.parent && !hasOneKindOfComponent(rootNode.parent, Canvas)) {
            const canvasNode = await createShouldHideInHierarchyCanvasNode(director.getScene()!, workMode);
            undoRecord.previewCanvasNode = canvasNode;
            undoRecord.previewCanvasCreated = !this._prefabCanvasUndoBeforeNodeUuids?.has(canvasNode.uuid);
            rootNode.parent = canvasNode;
            this._pushPrefabCanvasUndoRecord(undoRecord);
            return canvasNode;
        }

        this._pushPrefabCanvasUndoRecord(undoRecord);
        return rootNode;
    }

    private _createPrefabCanvasUndoRecord(rootNode: Node, workMode: string): IPrefabCanvasUndoRecord {
        const rootParent = rootNode.parent as Node | null;
        return {
            rootNode,
            rootParentUuid: rootParent?.uuid ?? null,
            rootParentPath: rootParent ? (NodeMgr.getNodePath(rootParent) ?? '/') : '/',
            rootSiblingIndex: rootNode.getSiblingIndex(),
            addedUITransform: null,
            previewCanvasNode: null,
            previewCanvasCreated: false,
            workMode,
        };
    }

    private _pushPrefabCanvasUndoRecord(record: IPrefabCanvasUndoRecord): void {
        if (!this._prefabCanvasUndoRecords) {
            return;
        }
        if (!record.addedUITransform && !record.previewCanvasNode) {
            return;
        }
        this._prefabCanvasUndoRecords.push(record);
    }

    public onEditorOpened() {
        nodeMgr.onEditorOpened();
        // 节点缓存刷新完成后，再注册组件事件转发。
        Service.Component.init();
    }

    public onEditorClosed() {
        // nodeMgr 清理 EditorExtends.Component 缓存前，先停止组件事件转发。
        Service.Component.unregisterCompMgrEvents();
        nodeMgr.onEditorClosed();
        this._cutUuids = [];
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
        const result = await this._undo.recordNodeSnapshot(node, {
            label: `Set ${options.path}`,
            type: 'node:set-property',
            record: options.record,
            scope: {
                editorType: 'scene',
                nodePath: options.nodePath,
                propPath: options.path,
            },
        }, async () => {
            if (options.path === 'name' && options.dump.value !== node.name) {
                // Reject new illegal input at the API boundary; the lower-level manager accepts it only for legacy undo/redo restoration.
                const nameError = validateNodeName(options.dump.value as string);
                if (nameError) {
                    throw new Error(nameError);
                }
                this.emit('node:before-change', node);
                NodeMgr.updateNodeName(node.uuid, options.dump.value as string);
                this.emit('node:change', node, { type: NodeEventType.SET_PROPERTY, propPath: 'name' });
                return true;
            }
            return await nodeMgr.setProperty(node.uuid, options.path, options.dump, options.record);
        });
        if (result && options.record !== false && !isUndoApplying()) {
            broadcastAnimationPropertyCommitted({
                nodePath: options.nodePath,
                propPath: options.path,
                source: 'editor',
            });
        }
        return result;
    }

    public async reset(path: string): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(path);
        if (!node) {
            return false;
        }
        return this._undo.recordNodeSnapshot(node, {
            label: 'Reset Node',
            type: 'node:reset',
        }, async () => await nodeMgr.resetNode(node.uuid));
    }

    public async resetProperty(options: ISetPropertyOptions): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return false;
        }
        return this._undo.recordNodeSnapshot(node, {
            label: `Reset ${options.path}`,
            type: 'node:reset-property',
            record: options.record,
        }, async () => await nodeMgr.resetProperty(node.uuid, options.path));
    }

    private _collectSceneNodeUuidsForUndo(): Set<string> | null {
        if (!this._undo.shouldRecordStructureCommand()) {
            return null;
        }
        return this._undo.collectSceneNodeUuids();
    }

    private _getCreateRootPathForUndo(beforeNodeUuids: Set<string> | null, path?: string): string | null {
        if (!beforeNodeUuids) {
            return null;
        }
        return this._undo.getCreateRootPath(path);
    }

    private _beginPrefabCanvasUndoCapture(beforeNodeUuids: Set<string> | null): IPrefabCanvasUndoRecord[] | null {
        if (!beforeNodeUuids) {
            return null;
        }
        const records: IPrefabCanvasUndoRecord[] = [];
        this._prefabCanvasUndoRecords = records;
        this._prefabCanvasUndoBeforeNodeUuids = beforeNodeUuids;
        return records;
    }

    private _endPrefabCanvasUndoCapture(): void {
        this._prefabCanvasUndoRecords = null;
        this._prefabCanvasUndoBeforeNodeUuids = null;
    }

    private _recordCreateNodeCommand(
        beforeNodeUuids: Set<string> | null,
        preferredRootPaths: string[],
        prefabCanvasUndoRecords: IPrefabCanvasUndoRecord[] | null,
    ): void {
        if (!prefabCanvasUndoRecords?.length) {
            this._undo.recordCreateNodeCommand(beforeNodeUuids, preferredRootPaths);
            return;
        }

        const ownsGroup = !Service.Undo?.isGroupActive?.();
        const groupId = ownsGroup ? Service.Undo?.beginGroup?.({ label: 'Create Node' }) : null;
        try {
            this._recordPrefabCanvasUndoCommands(prefabCanvasUndoRecords);
            this._undo.recordCreateNodeCommand(beforeNodeUuids, preferredRootPaths);
            if (groupId) {
                Service.Undo?.endGroup?.(groupId);
            }
        } catch (error) {
            if (groupId) {
                Service.Undo?.cancelGroup?.(groupId);
            }
            throw error;
        }
    }

    private _recordPrefabCanvasUndoCommands(records: IPrefabCanvasUndoRecord[]): void {
        for (const record of records) {
            if (record.addedUITransform?.isValid) {
                const command = this._captureAddComponentCommand(record.addedUITransform);
                if (command) {
                    Service.Undo?.push(command);
                }
            }

            if (record.previewCanvasNode?.isValid) {
                Service.Undo?.push(new PrefabPreviewCanvasCommand({
                    rootUuid: record.rootNode.uuid,
                    rootPath: NodeMgr.getNodePath(record.rootNode) ?? '',
                    rootParentUuid: record.rootParentUuid,
                    rootParentPath: record.rootParentPath,
                    rootSiblingIndex: record.rootSiblingIndex,
                    previewCanvasUuid: record.previewCanvasNode.uuid,
                    previewCanvasPath: NodeMgr.getNodePath(record.previewCanvasNode) ?? '',
                    removePreviewCanvasOnUndo: record.previewCanvasCreated,
                    workMode: record.workMode,
                }));
            }
        }
    }

    private _captureAddComponentCommand(component: Component) {
        const { AddComponentCommand } = require('./undo/commands/add-component-command') as typeof import('./undo/commands/add-component-command');
        return AddComponentCommand.capture(component);
    }

    private _captureReparentSnapshotsForUndo(nodes: Node[]) {
        if (Service.Undo?.isApplying?.()) {
            return null;
        }
        if (this._undo.hasActiveRecordingForNodes(nodes)) {
            return null;
        }
        return this._undo.captureReparentSnapshots(nodes);
    }

    private _captureNodeSnapshotsForUndo(nodes: Node[]) {
        if (Service.Undo?.isApplying?.()) {
            return null;
        }
        if (this._undo.hasActiveRecordingForNodes(nodes)) {
            return null;
        }
        return this._undo.captureNodeSnapshots(nodes);
    }

    private _getNodePathByUuid(uuid: string): string {
        const node = nodeMgr.query(uuid);
        if (!node) {
            return '';
        }
        return NodeMgr.getNodePath(node) || '';
    }

    public async updatePropertyFromNull(options: ISetPropertyOptions): Promise<boolean> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return false;
        }
        return this._undo.recordNodeSnapshot(node, {
            label: `Update ${options.path}`,
            type: 'node:update-property-from-null',
            record: options.record,
        }, async () => await nodeMgr.updatePropertyFromNull(node.uuid, options.path));
    }

    public async setNodeAndChildrenLayer(options: ISetPropertyOptions): Promise<void> {
        const node = NodeMgr.getNodeByPath(options.nodePath);
        if (!node) {
            return;
        }
        const nodes = this._undo.collectNodeTree(node);
        if (
            options.record === false ||
            Service.Undo?.isApplying?.() ||
            this._undo.hasActiveRecordingForNodes(nodes)
        ) {
            return await nodeMgr.setNodeAndChildrenLayer(node.uuid, options.dump);
        }

        const before = this._undo.captureNodeSnapshots(nodes);
        await nodeMgr.setNodeAndChildrenLayer(node.uuid, options.dump);
        const afterNodes = this._undo.findSnapshotNodes(before);
        const after = this._undo.captureNodeSnapshots(afterNodes);
        this._undo.pushNodeSnapshotCommand(
            'node:set-node-and-children-layer',
            'Set Node And Children Layer',
            before,
            after,
        );
    }

    public getPathByUuid(uuid: string): string {
        return nodeMgr.getPathByUuid(uuid);
    }

    async setParent(params: ISetParentParams): Promise<string[]> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to set parent: the scene is not opened.');
            }

            const uuids = params.paths.map(p => {
                const node = NodeMgr.getNodeByPath(p);
                if (!node) throw new Error(`Node not found at path: ${p}`);
                return node.uuid;
            });

            const parentNode = NodeMgr.getNodeByPath(params.parentPath);
            if (!parentNode) {
                throw new Error(`Parent node not found at path: ${params.parentPath}`);
            }

            const nodes = uuids
                .map(uuid => NodeMgr.getNode(uuid) as Node | null)
                .filter((node): node is Node => !!node?.isValid);
            const before = this._captureReparentSnapshotsForUndo(nodes);

            const movedUuids = nodeMgr.setParent(parentNode.uuid, uuids, params.keepWorldTransform);
            this._undo.recordReparentSnapshots('node:set-parent', 'Set Parent', before, movedUuids);

            return movedUuids.map(uuid => this._getNodePathByUuid(uuid)).filter(Boolean);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async reorder(params: IReorderParams): Promise<boolean> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to reorder: the scene is not opened.');
            }

            const parentNode = NodeMgr.getNodeByPath(params.path);
            if (!parentNode) {
                throw new Error(`Parent node not found at path: ${params.path}`);
            }

            return await this._undo.moveChildArrayElementByUuid(parentNode.uuid, 'children', params.target, params.offset);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    private _cutUuids: string[] = [];

    async copy(params: ICopyParams): Promise<string[]> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to copy node: the scene is not opened.');
            }

            const uuids = params.paths.map(p => {
                const node = NodeMgr.getNodeByPath(p);
                if (!node) throw new Error(`Node not found at path: ${p}`);
                return node.uuid;
            });

            // copy 覆盖之前的 cut 标记
            this._cutUuids = [];
            const copiedUuids = nodeMgr.copy(uuids);
            return copiedUuids.map(uuid => this._getNodePathByUuid(uuid)).filter(Boolean);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async paste(params: IPasteParams): Promise<string[]> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to paste node: the scene is not opened.');
            }

            let parentUuid: string | null = null;
            if (params.parentPath) {
                const parentNode = NodeMgr.getNodeByPath(params.parentPath);
                if (!parentNode) {
                    throw new Error(`Parent node not found at path: ${params.parentPath}`);
                }
                parentUuid = parentNode.uuid;
            }

            // 剪切粘贴：移动节点而非创建副本
            if (this._cutUuids.length > 0) {
                const cutUuids = this._cutUuids;
                this._cutUuids = [];
                const nodes = cutUuids
                    .map(uuid => NodeMgr.getNode(uuid) as Node | null)
                    .filter((node): node is Node => !!node?.isValid);
                const before = this._captureReparentSnapshotsForUndo(nodes);
                const movedUuids = nodeMgr.setParent(parentUuid || root.uuid, cutUuids, !!params.keepWorldTransform);
                this._undo.recordReparentSnapshots('node:paste-cut', 'Paste Cut Nodes', before, movedUuids);
                return movedUuids.map(uuid => this._getNodePathByUuid(uuid)).filter(Boolean);
            }

            // 普通粘贴：创建副本
            const copiedUuids = nodeMgr.getCopiedUuids();
            if (copiedUuids.length === 0) {
                throw new Error('No nodes have been copied.');
            }

            const beforeNodeUuids = this._collectSceneNodeUuidsForUndo();
            const newUuids = nodeMgr.paste(parentUuid || root.uuid, copiedUuids, params.keepWorldTransform);
            const newPaths = newUuids.map(uuid => this._getNodePathByUuid(uuid)).filter(Boolean);
            this._undo.recordCreateNodeCommand(beforeNodeUuids, newPaths);
            return newPaths;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async duplicate(params: IDuplicateParams): Promise<string[]> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to duplicate node: the scene is not opened.');
            }

            const uuids = params.paths.map(p => {
                const node = NodeMgr.getNodeByPath(p);
                if (!node) throw new Error(`Node not found at path: ${p}`);
                return node.uuid;
            });

            const beforeNodeUuids = this._collectSceneNodeUuidsForUndo();
            const newUuids = nodeMgr.duplicate(uuids);
            const newPaths = newUuids.map(uuid => this._getNodePathByUuid(uuid)).filter(Boolean);
            this._undo.recordCreateNodeCommand(beforeNodeUuids, newPaths);
            return newPaths;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async cut(params: ICutParams): Promise<string[]> {
        try {
            await Service.Editor.lock();
            const root = Service.Editor.getRootNode();
            if (!root) {
                throw new Error('Failed to cut node: the scene is not opened.');
            }

            const uuids = params.paths.map(p => {
                const node = NodeMgr.getNodeByPath(p);
                if (!node) throw new Error(`Node not found at path: ${p}`);
                return node.uuid;
            });

            // 只标记为剪切，不立即删除；paste 时通过 setParent 移动节点
            this._cutUuids = uuids;

            return params.paths;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async queryClipboardState(): Promise<IClipboardState> {
        if (this._cutUuids.length > 0) {
            const paths = this._cutUuids.map(uuid => this._getNodePathByUuid(uuid)).filter(Boolean);
            return { type: 'cut', paths };
        }
        const copiedUuids = nodeMgr.getCopiedUuids();
        if (copiedUuids.length > 0) {
            const paths = copiedUuids.map(uuid => this._getNodePathByUuid(uuid)).filter(Boolean);
            return { type: 'copy', paths };
        }
        return { type: 'none', paths: [] };
    }

    async moveArrayElement(params: IMoveArrayElementParams): Promise<boolean> {
        try {
            await Service.Editor.lock();
            const node = NodeMgr.getNodeByPath(params.nodePath);
            if (!node) {
                throw new Error(`Node not found at path: ${params.nodePath}`);
            }
            return await this._undo.moveArrayElementByUuid(node.uuid, params.path, params.target, params.offset);
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async removeArrayElement(params: IRemoveArrayElementParams): Promise<boolean> {
        try {
            await Service.Editor.lock();
            const node = NodeMgr.getNodeByPath(params.nodePath);
            if (!node) {
                throw new Error(`Node not found at path: ${params.nodePath}`);
            }
            const normalizedPath = params.path.replace('__comps__', '_components');
            let component: Component | undefined;
            if (normalizedPath === '_components') {
                component = node.components[params.index] as Component | undefined;
            }
            const shouldRecord = !Service.Undo?.isApplying?.() && !Service.Undo?.hasActiveRecording?.(node.uuid);
            let command: RemoveComponentCommand | null = null;
            if (shouldRecord && component) {
                command = RemoveComponentCommand.capture(component);
            }
            let before: ReturnType<NodeUndoHelper['captureNodeSnapshots']> | null = null;
            if (shouldRecord && !command) {
                before = this._undo.captureNodeSnapshots([node]);
            }
            const result = nodeMgr.removeArrayElement(node.uuid, params.path, params.index);
            if (!result) {
                return result;
            }
            if (command) {
                Service.Undo?.push(command);
            } else if (before) {
                const latestNode = NodeMgr.getNode(node.uuid) as Node | null;
                if (latestNode?.isValid) {
                    const after = this._undo.captureNodeSnapshots([latestNode]);
                    this._undo.pushNodeSnapshotCommand('node:remove-array-element', 'Remove Array Element', before, after);
                }
            }
            return result;
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }

    async changeNodeLock(params: IChangeNodeLockParams): Promise<void> {
        try {
            await Service.Editor.lock();
            const uuids = params.paths.map(p => {
                const node = NodeMgr.getNodeByPath(p);
                if (!node) throw new Error(`Node not found at path: ${p}`);
                return node.uuid;
            });
            const rootNodes = uuids
                .map(uuid => NodeMgr.getNode(uuid) as Node | null)
                .filter((node): node is Node => !!node?.isValid);
            let nodes = rootNodes;
            if (params.loop) {
                nodes = rootNodes.flatMap(node => this._undo.collectNodeTree(node));
            }
            nodes = this._undo.dedupeNodes(nodes);
            const before = this._captureNodeSnapshotsForUndo(nodes);
            nodeMgr.changeNodeLock(uuids, params.locked, params.loop ?? false);
            if (before) {
                const afterNodes = this._undo.findSnapshotNodes(before);
                const after = this._undo.captureNodeSnapshots(afterNodes);
                this._undo.pushNodeSnapshotCommand('node:change-lock', 'Change Node Lock', before, after);
            }
        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            Service.Editor.unlock();
        }
    }
}
