import type { Component, Node } from 'cc';

export interface DumpComponentAccess {
    query(uuid: string): Component | null;
    queryRecycle(uuid: string): Component | null;
    removeComponent(component: Component): boolean;
    getPathFromUuid(uuid: string): string | undefined;
}

export interface DumpNodeAccess {
    query(uuid: string | undefined): Node | null;
    addComponentAt(node: Node, comp: Component, index: number): boolean;
}

let componentAccess: DumpComponentAccess | undefined;
let nodeAccess: DumpNodeAccess | undefined;

export function registerDumpComponentAccess(access: DumpComponentAccess) {
    componentAccess = access;
}

export function registerDumpNodeAccess(access: DumpNodeAccess) {
    nodeAccess = access;
}

export function getDumpComponentAccess(): DumpComponentAccess {
    if (!componentAccess) {
        throw new Error('Dump component access has not been registered.');
    }
    return componentAccess;
}

export function getDumpNodeAccess(): DumpNodeAccess {
    if (!nodeAccess) {
        throw new Error('Dump node access has not been registered.');
    }
    return nodeAccess;
}
