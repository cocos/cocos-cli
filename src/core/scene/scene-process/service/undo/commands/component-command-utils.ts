import { Component, Node } from 'cc';
import { EventSourceType, NodeEventType, type IUndoCommandMeta, type IUndoRedoResult } from '../../../../common';
import compMgr from '../../component/index';
import dumpUtil from '../../dump';
import {
    createUndoId,
    success,
    failure,
    isNodeInCurrentScene,
    getEditorNodeManager,
    getEditorExtends,
    getNodePath,
    restoreComponentSnapshotDump,
} from './command-utils-shared';

export { success, failure } from './command-utils-shared';

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
        // 组件已经不在场景里，说明“删除组件”的目标状态已经达成。
        return success(meta);
    }

    const node = component.node;
    // @ts-ignore - 引擎内部 API：获取依赖当前组件的其他组件。
    const dependents = (node as any)?._getDependComponent?.(component) ?? [];
    if (dependents.length > 0) {
        return failure(
            meta,
            `Cannot remove component "${snapshot.type}" on "${snapshot.nodePath || snapshot.nodeUuid}": it is required by ${dependents.length} other component(s)`,
        );
    }

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
            // 继续用下面的 index/type 兜底查找。
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
    await restoreComponentSnapshotDump(component, dump);
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

function getEditorComponentManager(): any {
    return getEditorExtends()?.Component;
}

function cloneDump<T>(dump: T): T {
    return JSON.parse(JSON.stringify(dump)) as T;
}
