import { Component, Node } from 'cc';
import type { IUndoCommandMeta, IUndoRedoResult } from '../../../../common';

export function createUndoId(prefix: string): string {
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

export function success(meta: IUndoCommandMeta): IUndoRedoResult {
    return { success: true, commandId: meta.id, label: meta.label };
}

export function failure(meta: IUndoCommandMeta, reason: string): IUndoRedoResult {
    return { success: false, commandId: meta.id, label: meta.label, reason };
}

export function isNodeInCurrentScene(node: Node | null | undefined): node is Node {
    if (!node?.isValid) {
        return false;
    }

    const scene = (cc as any).director?.getScene?.();
    return !!scene && (node === scene || node.isChildOf(scene));
}

export function getEditorExtends(): any {
    return (cc as any).EditorExtends || (globalThis as any).EditorExtends;
}

export function getEditorNodeManager(): any {
    return getEditorExtends()?.Node;
}

export function getNodePath(node: Node): string {
    const scene = (cc as any).director?.getScene?.();
    if (node === scene) {
        return '/';
    }
    return getEditorNodeManager()?.getNodePath?.(node) ?? '';
}

/**
 * restoreNodeSnapshotDump options.
 * - updateNodeName: override name restoration (different callers need different editor notification)
 * - restoreNodeLocked: override locked flag restoration
 */
export interface IRestoreNodeSnapshotDumpOptions {
    updateNodeName?: (uuid: string, name: string) => void;
    restoreNodeLocked?: (node: Node, locked: boolean) => void;
}

/**
 * Restore node properties from a snapshot dump.
 * - name: restored via updateNodeName callback (or default EditorNodeManager), undo-specific
 * - editable properties (active/layer/mobility/position/rotation/scale): delegated to dump layer
 * - locked: restored via objFlags bit manipulation, undo-specific
 * - structural fields (uuid/parent/children/__comps__): skipped, managed by node-structure commands
 */
export async function restoreNodeSnapshotDump(
    node: Node,
    dump: any,
    options: IRestoreNodeSnapshotDumpOptions = {},
): Promise<void> {
    if (!dump) {
        return;
    }

    if (dump.name && dump.name.value !== node.name) {
        const name = dump.name.value as string;
        if (options.updateNodeName) {
            options.updateNodeName(node.uuid, name);
        } else {
            updateNodeName(node, name);
        }
    }

    const { default: dumpUtil } = await import('../../dump');
    await dumpUtil.restoreNodeSnapshotProperties(node, dump);

    if (dump.locked) {
        (options.restoreNodeLocked ?? restoreNodeLockedFlag)(node, !!dump.locked.value);
    }
}

function updateNodeName(node: Node, name: string): void {
    const editorNode = getEditorNodeManager();
    if (typeof editorNode?.updateNodeName === 'function') {
        editorNode.updateNodeName(node.uuid, name);
        return;
    }
    node.name = name;
}

export function restoreNodeLockedFlag(node: Node, locked: boolean): void {
    if (locked) {
        node.objFlags |= cc.Object.Flags.LockedInEditor;
    } else {
        node.objFlags &= ~cc.Object.Flags.LockedInEditor;
    }
}

/**
 * Restore component properties from a snapshot dump.
 * - user properties: delegated to dump layer (skip-list maintained by dump module)
 * - onRestore lifecycle: called after property restoration
 */
export async function restoreComponentSnapshotDump(
    component: Component,
    dump: any,
): Promise<void> {
    if (!dump?.value) {
        return;
    }
    const { default: dumpUtil } = await import('../../dump');
    await dumpUtil.restoreComponentSnapshotProperties(component, dump);
    (component as any).onRestore?.();
}
