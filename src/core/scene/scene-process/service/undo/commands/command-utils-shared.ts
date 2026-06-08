import { Node } from 'cc';
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
