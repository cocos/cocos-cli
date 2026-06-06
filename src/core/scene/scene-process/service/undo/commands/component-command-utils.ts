import { Component, Node } from 'cc';
import { EventSourceType, NodeEventType, type IUndoCommandMeta, type IUndoRedoResult } from '../../../../common';
import compMgr from '../../component/index';
import dumpUtil from '../../dump';

export interface IComponentStructureSnapshot {
    uuid: string;
    path: string;
    nodeUuid: string;
    nodePath: string;
    index: number;
    type: string;
    dump: any;
}

export function createComponentCommandMeta(type: string, label: string): IUndoCommandMeta {
    return {
        id: createUndoId(type),
        label,
        type,
        scope: { editorType: 'scene' },
        timestamp: Date.now(),
    };
}

export function captureComponentStructureSnapshot(component: Component): IComponentStructureSnapshot | null {
    if (!component?.isValid || !component.node?.isValid) {
        return null;
    }

    const dump = dumpUtil.dumpComponent(component);
    if (!dump) {
        return null;
    }

    return {
        uuid: component.uuid,
        path: getComponentPath(component),
        nodeUuid: component.node.uuid,
        nodePath: getNodePath(component.node),
        index: component.node.components.indexOf(component),
        type: getComponentType(component),
        dump: cloneDump(dump),
    };
}

export function removeComponentStructureSnapshot(snapshot: IComponentStructureSnapshot, meta: IUndoCommandMeta): IUndoRedoResult {
    const component = findComponent(snapshot);
    if (!component) {
        return failure(meta, `Component not found: ${snapshot.path || snapshot.uuid}`);
    }

    const node = component.node;
    const removed = compMgr.removeComponent(component);
    if (!removed) {
        return failure(meta, `Failed to remove component: ${snapshot.path || snapshot.uuid}`);
    }

    emitNodeComponentChanged(node);
    return success(meta);
}

export async function restoreComponentStructureSnapshot(snapshot: IComponentStructureSnapshot, meta: IUndoCommandMeta): Promise<IUndoRedoResult> {
    if (findComponent(snapshot)) {
        return success(meta);
    }

    const node = findNode(snapshot);
    if (!node) {
        return failure(meta, `Node not found: ${snapshot.nodePath || snapshot.nodeUuid}`);
    }

    const ctor = resolveComponentCtor(snapshot.type);
    if (!ctor) {
        return failure(meta, `Component constructor not found: ${snapshot.type}`);
    }

    try {
        const component = node.addComponent(ctor as any);
        moveComponentToIndex(node, component, snapshot.index);
        restoreComponentUuid(component, snapshot.uuid);
        await restoreComponentDump(component, snapshot.dump);
        compMgr.onComponentAddedFromEditor(component);
        emitNodeComponentChanged(node);
        return success(meta);
    } catch (error) {
        return failure(meta, error instanceof Error ? error.message : String(error));
    }
}

export function success(meta: IUndoCommandMeta): IUndoRedoResult {
    return { success: true, commandId: meta.id, label: meta.label };
}

export function failure(meta: IUndoCommandMeta, reason: string): IUndoRedoResult {
    return { success: false, commandId: meta.id, label: meta.label, reason };
}

function findComponent(snapshot: IComponentStructureSnapshot): Component | null {
    const editorComponent = getEditorComponentManager();
    const byUuid = editorComponent?.getComponent?.(snapshot.uuid) as Component | null;
    if (isComponentInCurrentScene(byUuid)) {
        return byUuid;
    }

    if (snapshot.path) {
        try {
            const byPath = editorComponent?.getComponentFromPath?.(snapshot.path) as Component | null;
            if (isComponentInCurrentScene(byPath)) {
                return byPath;
            }
        } catch (_error) {
            // Fall back to index/type below.
        }
    }

    const node = findNode(snapshot);
    if (!node) {
        return null;
    }

    const byIndex = node.components[snapshot.index] as Component | undefined;
    if (byIndex && getComponentType(byIndex) === snapshot.type) {
        return byIndex;
    }

    return null;
}

function findNode(snapshot: IComponentStructureSnapshot): Node | null {
    const editorNode = getEditorNodeManager();
    const byUuid = editorNode?.getNode?.(snapshot.nodeUuid) as Node | null;
    if (isNodeInCurrentScene(byUuid)) {
        return byUuid;
    }

    if (!snapshot.nodePath) {
        return null;
    }

    try {
        const byPath = editorNode?.getNodeByPath?.(snapshot.nodePath) as Node | null;
        return isNodeInCurrentScene(byPath) ? byPath : null;
    } catch (_error) {
        return null;
    }
}

async function restoreComponentDump(component: Component, dump: any): Promise<void> {
    if (!dump?.value) {
        return;
    }

    const skipKeys = new Set(['uuid', 'node', '__scriptAsset', '__eventTargets']);
    for (const key in dump.value) {
        if (skipKeys.has(key)) {
            continue;
        }
        await dumpUtil.restoreProperty(component, key, dump.value[key]);
    }
}

function moveComponentToIndex(node: Node, component: Component, index: number): void {
    if (index < 0 || index >= node.components.length) {
        return;
    }

    const components = (node as any)._components as Component[] | undefined;
    if (!components) {
        return;
    }

    const currentIndex = components.indexOf(component);
    if (currentIndex < 0 || currentIndex === index) {
        return;
    }

    components.splice(currentIndex, 1);
    components.splice(index, 0, component);
}

function restoreComponentUuid(component: Component, uuid: string): void {
    if (!uuid || component.uuid === uuid) {
        return;
    }

    const editorComponent = getEditorComponentManager();
    if (!editorComponent || isComponentInCurrentScene(editorComponent.getComponent?.(uuid) as Component | null)) {
        return;
    }

    const oldUuid = component.uuid;
    const path = editorComponent.getPathFromUuid?.(oldUuid);
    editorComponent.changeUUID?.(oldUuid, uuid);

    if (path) {
        editorComponent._uuidToPath?.delete?.(oldUuid);
        editorComponent._uuidToPath?.set?.(uuid, path);
        editorComponent._pathToUuid?.set?.(path, uuid);
    }
}

function emitNodeComponentChanged(node: Node | null | undefined): void {
    if (!node?.isValid) {
        return;
    }
    compMgr.emit('node:change', node, {
        source: EventSourceType.UNDO,
        type: NodeEventType.COMPONENT_CHANGED,
    });
}

function getComponentPath(component: Component): string {
    return getEditorComponentManager()?.getPathFromUuid?.(component.uuid) ?? '';
}

function getNodePath(node: Node): string {
    const scene = (cc as any).director?.getScene?.();
    if (node === scene) {
        return '/';
    }
    return getEditorNodeManager()?.getNodePath?.(node) ?? '';
}

function getComponentType(component: Component): string {
    return (cc as any).js?.getClassName?.(component.constructor) || component.constructor?.name || '';
}

function resolveComponentCtor(type: string): Function | null {
    if (!type) {
        return null;
    }
    return (cc as any).js?.getClassByName?.(type) || (cc as any).js?.getClassById?.(type) || null;
}

function isComponentInCurrentScene(component: Component | null | undefined): component is Component {
    return !!component?.isValid && isNodeInCurrentScene(component.node);
}

function isNodeInCurrentScene(node: Node | null | undefined): node is Node {
    if (!node?.isValid) {
        return false;
    }

    const scene = (cc as any).director?.getScene?.();
    return !!scene && (node === scene || node.isChildOf(scene));
}

function getEditorNodeManager(): any {
    return getEditorExtends()?.Node;
}

function getEditorComponentManager(): any {
    return getEditorExtends()?.Component;
}

function getEditorExtends(): any {
    return (cc as any).EditorExtends || (globalThis as any).EditorExtends;
}

function cloneDump<T>(dump: T): T {
    return JSON.parse(JSON.stringify(dump)) as T;
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
