import { Node } from 'cc';
import { NodeEventType, type IUndoCommandMeta, type IUndoRedoResult } from '../../../../common';
import nodeMgr from '../../node/index';
import { editorPrefabUtils } from '../../prefab/prefab-editor-utils';
import {
    createUndoId,
    success,
    failure,
    isNodeInCurrentScene,
    getEditorNodeManager,
    getEditorExtends,
    getNodePath,
} from './command-utils-shared';

export { success, failure } from './command-utils-shared';

export interface INodeUuidSnapshot {
    uuid: string;
    componentUuids: string[];
    children: INodeUuidSnapshot[];
}

export interface INodeStructureSnapshot {
    uuid: string;
    path: string;
    parentUuid: string | null;
    parentPath: string;
    siblingIndex: number;
    serializedJson: string;
    /** 子树 uuid 树（前序遍历的树根），用于 deserialize 后修复整棵树的 uuid */
    uuidTree: INodeUuidSnapshot;
}

export interface INodeStructureCaptureTarget {
    node: Node;
    path?: string;
}

export function createNodeCommandMeta(type: string, label: string): IUndoCommandMeta {
    return {
        id: createUndoId(type),
        label,
        type,
        scope: { editorType: 'scene' },
        timestamp: Date.now(),
    };
}

export function captureNodeStructureSnapshot(node: Node, fallbackPath = ''): INodeStructureSnapshot | null {
    if (!node?.isValid) {
        return null;
    }

    const parent = node.parent as Node | null;
    let serializedJson = '';
    try {
        serializedJson = editorPrefabUtils.serialize(node);
        if (!serializedJson) {
            return null;
        }
    } catch (_error) {
        return null;
    }

    return {
        uuid: node.uuid,
        path: getNodePath(node) || fallbackPath,
        parentUuid: parent?.uuid ?? null,
        parentPath: parent ? getNodePath(parent) : '/',
        siblingIndex: node.getSiblingIndex(),
        serializedJson,
        uuidTree: captureUuidTree(node),
    };
}

function captureUuidTree(node: Node): INodeUuidSnapshot {
    return {
        uuid: node.uuid,
        componentUuids: (node.components ?? []).map(c => c.uuid).filter(Boolean),
        children: (node.children ?? []).map(child => captureUuidTree(child)),
    };
}

export async function restoreNodeStructureSnapshot(snapshot: INodeStructureSnapshot, meta: IUndoCommandMeta): Promise<IUndoRedoResult> {
    if (findNode(snapshot)) {
        return success(meta);
    }

    const parent = findParent(snapshot);
    if (!parent) {
        return failure(meta, `Parent node not found: ${snapshot.parentPath || snapshot.parentUuid || '/'}`);
    }

    const restoredNode = await deserializeNode(snapshot);
    if (!restoredNode) {
        return failure(meta, `Failed to deserialize node: ${snapshot.path || snapshot.uuid}`);
    }

    try {
        nodeMgr.emit('node:before-add', restoredNode);
        nodeMgr.emit('node:before-change', parent);

        parent.addChild(restoredNode);
        if (snapshot.siblingIndex >= 0) {
            restoredNode.setSiblingIndex(snapshot.siblingIndex);
        }
        restoreSubtreeUuids(restoredNode, snapshot.uuidTree);

        nodeMgr.emit('node:add', restoredNode);
        nodeMgr.emit('node:change', parent, { source: 'undo', type: NodeEventType.CHILD_CHANGED });
        return success(meta);
    } catch (error) {
        return failure(meta, error instanceof Error ? error.message : String(error));
    }
}

export function removeNodeStructureSnapshot(
    snapshot: INodeStructureSnapshot,
    meta: IUndoCommandMeta,
    keepWorldTransform?: boolean,
): IUndoRedoResult {
    const node = findNode(snapshot);
    if (!node) {
        // 幂等：目标节点已不在场景中，视为已达到"已删除"的期望状态
        return success(meta);
    }

    nodeMgr.baseRemoveNode(node, keepWorldTransform);
    unregisterNodeTree(node);
    return success(meta);
}

function findNode(snapshot: INodeStructureSnapshot): Node | null {
    const editorNode = getEditorNodeManager();
    const byUuid = editorNode?.getNode?.(snapshot.uuid) as Node | null;
    if (isNodeInCurrentScene(byUuid)) {
        return byUuid;
    }

    if (!snapshot.path) {
        return null;
    }

    try {
        const byPath = editorNode?.getNodeByPath?.(snapshot.path) as Node | null;
        return isNodeInCurrentScene(byPath) ? byPath : null;
    } catch (_error) {
        return null;
    }
}

function findParent(snapshot: INodeStructureSnapshot): Node | null {
    const editorNode = getEditorNodeManager();
    if (snapshot.parentUuid) {
        const byUuid = editorNode?.getNode?.(snapshot.parentUuid) as Node | null;
        if (byUuid) {
            return byUuid;
        }
    }

    if (snapshot.parentPath && snapshot.parentPath !== '/') {
        try {
            const byPath = editorNode?.getNodeByPath?.(snapshot.parentPath) as Node | null;
            if (byPath) {
                return byPath;
            }
        } catch (_error) {
            return null;
        }
    }

    return (cc as any).director?.getScene?.() as Node | null;
}

function restoreSubtreeUuids(node: Node, snapshot: INodeUuidSnapshot): void {
    const editorNode = getEditorNodeManager();
    const editorComponent = getEditorExtends()?.Component;
    if (!editorNode) {
        return;
    }

    // 修复当前节点 uuid
    if (snapshot.uuid && node.uuid !== snapshot.uuid &&
        !isNodeInCurrentScene(editorNode.getNode?.(snapshot.uuid) as Node | null)) {
        editorNode.changeNodeUUID?.(node.uuid, snapshot.uuid);
    }

    // 修复组件 uuid（按顺序对应）
    const components = node.components ?? [];
    for (let i = 0; i < components.length && i < snapshot.componentUuids.length; i++) {
        const targetUuid = snapshot.componentUuids[i];
        const comp = components[i];
        if (targetUuid && comp?.uuid && comp.uuid !== targetUuid &&
            !editorComponent?.getComponent?.(targetUuid)) {
            editorComponent?.changeUUID?.(comp.uuid, targetUuid);
        }
    }

    // 递归子节点（按顺序对应）
    const children = node.children ?? [];
    for (let i = 0; i < children.length && i < snapshot.children.length; i++) {
        restoreSubtreeUuids(children[i], snapshot.children[i]);
    }
}

function unregisterNodeTree(node: Node): void {
    const editorNode = getEditorNodeManager();
    const editorComponent = getEditorExtends()?.Component;

    for (const component of node.components ?? []) {
        if (component?.uuid) {
            editorComponent?.remove?.(component.uuid);
        }
    }

    for (const child of node.children ?? []) {
        unregisterNodeTree(child);
    }

    if (node.uuid) {
        editorNode?.remove?.(node.uuid);
    }
}

function deserializeNode(snapshot: INodeStructureSnapshot): Promise<Node | null> {
    return new Promise((resolve) => {
        try {
            const loadWithJson = (cc as any).assetManager?.loadWithJson;
            if (typeof loadWithJson !== 'function') {
                resolve(null);
                return;
            }

            const json = JSON.parse(snapshot.serializedJson);
            loadWithJson.call((cc as any).assetManager, json, null, (error: Error | null, asset: any) => {
                if (error) {
                    resolve(null);
                    return;
                }

                if (asset instanceof Node) {
                    resolve(asset);
                    return;
                }

                if (asset?.scene?.children?.length) {
                    resolve(asset.scene.children[0] as Node);
                    return;
                }

                if (asset?.data) {
                    resolve((cc as any).instantiate?.(asset) as Node | null);
                    return;
                }

                resolve(null);
            });
        } catch (_error) {
            resolve(null);
        }
    });
}
