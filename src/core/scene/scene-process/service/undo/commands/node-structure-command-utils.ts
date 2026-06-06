import { Node } from 'cc';
import { NodeEventType, type IUndoCommandMeta, type IUndoRedoResult } from '../../../../common';
import nodeMgr from '../../node/index';
import { editorPrefabUtils } from '../../prefab/prefab-editor-utils';

export interface INodeStructureSnapshot {
    uuid: string;
    path: string;
    parentUuid: string | null;
    parentPath: string;
    siblingIndex: number;
    serializedJson: string;
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
        restoreRootUuid(restoredNode, snapshot.uuid);

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
        return failure(meta, `Node not found: ${snapshot.path || snapshot.uuid}`);
    }

    nodeMgr.baseRemoveNode(node, keepWorldTransform);
    unregisterNodeTree(node);
    return success(meta);
}

export function success(meta: IUndoCommandMeta): IUndoRedoResult {
    return { success: true, commandId: meta.id, label: meta.label };
}

export function failure(meta: IUndoCommandMeta, reason: string): IUndoRedoResult {
    return { success: false, commandId: meta.id, label: meta.label, reason };
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

function getNodePath(node: Node): string {
    const scene = (cc as any).director?.getScene?.();
    if (node === scene) {
        return '/';
    }
    return getEditorNodeManager()?.getNodePath?.(node) ?? '';
}

function restoreRootUuid(node: Node, uuid: string): void {
    if (!uuid || node.uuid === uuid) {
        return;
    }

    const editorNode = getEditorNodeManager();
    if (!editorNode || isNodeInCurrentScene(editorNode.getNode?.(uuid) as Node | null)) {
        return;
    }
    editorNode.changeNodeUUID?.(node.uuid, uuid);
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

function isNodeInCurrentScene(node: Node | null | undefined): node is Node {
    if (!node?.isValid) {
        return false;
    }

    const scene = (cc as any).director?.getScene?.();
    return !!scene && (node === scene || node.isChildOf(scene));
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

function getEditorNodeManager(): any {
    return getEditorExtends()?.Node;
}

function getEditorExtends(): any {
    return (cc as any).EditorExtends || (globalThis as any).EditorExtends;
}

function createUndoId(prefix: string): string {
    try {
        const randomUUID = require('crypto')?.randomUUID;
        if (typeof randomUUID === 'function') {
            return `${prefix}-${randomUUID()}`;
        }
    } catch (_error) {
        // Fall through to a timestamp id.
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}
