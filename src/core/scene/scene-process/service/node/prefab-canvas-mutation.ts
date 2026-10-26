import { type Component, type Node } from 'cc';
import { getEditorExtends, getEditorNodeManager } from '../undo/commands/command-utils-shared';
import nodeMgr from './index';

export interface IPrefabCanvasUndoRecord {
    rootNode: Node;
    rootParent: Node | null;
    rootParentUuid: string | null;
    rootParentPath: string;
    rootSiblingIndex: number;
    addedUITransform: Component | null;
    previewCanvasNode: Node | null;
    previewCanvasCreated: boolean;
    workMode: string;
}

/** Owns temporary Prefab Canvas changes until the created node reaches its final parent. */
export interface IPendingPrefabCanvasMutation {
    commit(): void;
    rollback(): void;
}

export interface IPrefabCanvasMutationEffects {
    commitRecord(record: IPrefabCanvasUndoRecord): void;
    removeAddedUITransform(component: Component): boolean;
}

type MutationState = 'pending' | 'committed' | 'rolled-back';

export function createPendingPrefabCanvasMutation(
    record: IPrefabCanvasUndoRecord,
    effects: IPrefabCanvasMutationEffects,
): IPendingPrefabCanvasMutation {
    let state: MutationState = 'pending';

    return {
        commit(): void {
            if (state !== 'pending') {
                return;
            }
            effects.commitRecord(record);
            state = 'committed';
        },
        rollback(): void {
            if (state === 'rolled-back') {
                return;
            }
            if (state === 'committed') {
                throw new Error('Cannot roll back a committed Prefab Canvas mutation.');
            }

            const rollbackErrors: unknown[] = [];
            tryRollback(
                () => restorePrefabRoot(record.rootNode, record.rootParent, record.rootSiblingIndex),
                rollbackErrors,
            );

            if (record.previewCanvasCreated && record.previewCanvasNode?.isValid) {
                tryRollback(() => {
                    if (record.rootNode.parent === record.previewCanvasNode) {
                        throw new Error('Cannot remove a preview Canvas while it still owns the Prefab root.');
                    }
                    removePrefabPreviewCanvasNode(record.previewCanvasNode!);
                }, rollbackErrors);
            }

            if (record.addedUITransform?.isValid) {
                tryRollback(() => {
                    if (!effects.removeAddedUITransform(record.addedUITransform!)) {
                        throw new Error('Failed to remove the UITransform added for Prefab Canvas handling.');
                    }
                }, rollbackErrors);
            }

            if (rollbackErrors.length > 0) {
                throw new AggregateError(rollbackErrors, 'Failed to roll back the Prefab Canvas mutation.');
            }
            state = 'rolled-back';
        },
    };
}

export function restorePrefabRoot(rootNode: Node, parent: Node | null, siblingIndex: number): void {
    if (rootNode.parent !== parent) {
        if (parent) {
            parent.addChild(rootNode);
        } else {
            rootNode.setParent(null);
        }
    }
    if (parent && siblingIndex >= 0) {
        rootNode.setSiblingIndex(siblingIndex);
    }
}

export function removePrefabPreviewCanvasNode(previewCanvasNode: Node): void {
    nodeMgr.baseRemoveNode(previewCanvasNode);
    unregisterNodeTree(previewCanvasNode);
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

function tryRollback(action: () => void, errors: unknown[]): void {
    try {
        action();
    } catch (error) {
        errors.push(error);
    }
}
