import { Component, Node } from 'cc';
import type { IUndoCommandMeta, IUndoRedoResult } from '../../../../common';

export function createUndoId(prefix: string): string {
    try {
        const randomUUID = require('crypto')?.randomUUID;
        if (typeof randomUUID === 'function') {
            return `${prefix}-${randomUUID()}`;
        }
    } catch (_error) {
        // crypto.randomUUID 不可用时，退回到时间戳 id。
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

export function success(meta: IUndoCommandMeta): IUndoRedoResult {
    return { success: true, commandId: meta.id, label: meta.label };
}

export function failure(meta: IUndoCommandMeta, reason: string): IUndoRedoResult {
    return { success: false, commandId: meta.id, label: meta.label, reason };
}

export function snapshotMapsEqual<T>(before: Map<string, T>, after: Map<string, T>): boolean {
    if (before.size !== after.size) {
        return false;
    }

    const keys = [...before.keys()].sort();
    for (const key of keys) {
        if (!after.has(key)) {
            return false;
        }
        if (JSON.stringify(before.get(key)) !== JSON.stringify(after.get(key))) {
            return false;
        }
    }
    return true;
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
 * restoreNodeSnapshotDump 选项。
 * - updateNodeName：自定义节点 name 的恢复方式，不同调用方需要不同的编辑器通知。
 * - restoreNodeLocked：自定义节点 locked 状态的恢复方式。
 */
export interface IRestoreNodeSnapshotDumpOptions {
    updateNodeName?: (uuid: string, name: string) => void;
    restoreNodeLocked?: (node: Node, locked: boolean) => void;
}

/**
 * 从快照 dump 恢复节点属性。
 * - name：通过 updateNodeName 回调恢复；未传入时使用默认 EditorNodeManager，这是 undo 专用逻辑。
 * - 可编辑属性（active/layer/mobility/position/rotation/scale）：交给 dump 层恢复。
 * - locked：通过 objFlags bit 恢复，这是 undo 专用逻辑。
 * - 结构字段（uuid/parent/children/__comps__）：跳过，由 node-structure command 管理。
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
 * 从快照 dump 恢复组件属性。
 * - 用户属性：交给 dump 层恢复，跳过列表由 dump 模块维护。
 * - onRestore 生命周期：属性恢复后调用。
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
