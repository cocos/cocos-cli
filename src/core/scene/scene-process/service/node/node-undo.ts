import { Component, Node } from 'cc';
import { NodeEventType, type IUndoRedoResult } from '../../../common';
import { Service } from '../core';
import dumpUtil from '../dump';
import nodeMgr from './index';
import { CreateNodeCommand } from '../undo/commands/create-node-command';
import { SnapshotCommand, type ISnapshotAdapter } from '../undo/commands/snapshot-command';
import type { INodeStructureCaptureTarget } from '../undo/commands/node-structure-command-utils';
import { createUndoId, restoreNodeSnapshotDump, snapshotMapsEqual } from '../undo/commands/command-utils-shared';

const NodeMgr = EditorExtends.Node;

export interface INodeSnapshot {
    uuid: string;
    path: string;
    dump: any;
}

export interface INodeChildOrderSnapshot {
    parentUuid: string;
    parentPath: string;
    childUuids: string[];
}

export interface IComponentOrderSnapshot {
    nodeUuid: string;
    nodePath: string;
    componentUuids: string[];
}

export interface INodeReparentSnapshot extends INodeSnapshot {
    parentUuid: string | null;
    parentPath: string;
    siblingIndex: number;
}

type EmitNodeEvent = (event: string, ...args: any[]) => void;

export class NodeUndoHelper {
    constructor(private readonly _emit: EmitNodeEvent) { }

    shouldRecordStructureCommand(): boolean {
        return !Service.Undo?.isApplying?.();
    }

    collectSceneNodeUuids(): Set<string> {
        return new Set(Object.keys(NodeMgr.getNodes() ?? {}));
    }

    getCreateRootPath(path: string | undefined): string | null {
        if (!path) {
            return null;
        }
        try {
            return NodeMgr.getNodeByPath(path) ? null : path;
        } catch (_error) {
            return null;
        }
    }

    recordCreateNodeCommand(beforeNodeUuids: Set<string> | null, preferredRootPaths: string[] = []): void {
        if (!beforeNodeUuids) {
            return;
        }

        const targets = this._getPreferredNewRootNodes(beforeNodeUuids, preferredRootPaths);
        for (const target of this._getNewRootNodes(beforeNodeUuids)) {
            if (!targets.some(existing => existing.node === target.node)) {
                targets.push(target);
            }
        }

        const rootTargets = this._getRootStructureTargets(targets);
        const command = CreateNodeCommand.capture(rootTargets);
        if (command) {
            Service.Undo?.push(command);
        }
    }

    async recordNodeSnapshot(
        node: Node,
        options: { label: string; type: string; record?: boolean },
        mutate: () => Promise<boolean>,
    ): Promise<boolean> {
        if (
            options.record === false ||
            Service.Undo?.isApplying?.() ||
            Service.Undo?.hasActiveRecording?.(node.uuid)
        ) {
            return mutate();
        }

        const before = this.captureNodeSnapshots([node]);
        const result = await mutate();
        if (!result) {
            return result;
        }

        const latestNode = NodeMgr.getNode(node.uuid) as Node | null;
        if (!latestNode?.isValid) {
            return result;
        }

        const after = this.captureNodeSnapshots([latestNode]);
        this.pushNodeSnapshotCommand(options.type, options.label, before, after);
        return result;
    }

    captureNodeSnapshots(nodes: Node[]): Map<string, INodeSnapshot> {
        const snapshots = new Map<string, INodeSnapshot>();
        for (const node of nodes) {
            if (!node?.isValid) {
                continue;
            }
            snapshots.set(node.uuid, {
                uuid: node.uuid,
                path: NodeMgr.getNodePath(node) ?? '',
                dump: this._cloneSnapshotDump(dumpUtil.dumpNode(node)),
            });
        }
        return snapshots;
    }

    collectNodeTree(node: Node): Node[] {
        const nodes: Node[] = [];
        const visit = (current: Node) => {
            if (!current?.isValid) {
                return;
            }
            nodes.push(current);
            for (const child of current.children ?? []) {
                visit(child as Node);
            }
        };
        visit(node);
        return nodes;
    }

    hasActiveRecordingForNodes(nodes: Node[]): boolean {
        return nodes.some(node => Service.Undo?.hasActiveRecording?.(node.uuid));
    }

    findSnapshotNodes(snapshots: Map<string, INodeSnapshot>): Node[] {
        const nodes: Node[] = [];
        for (const snapshot of snapshots.values()) {
            const node = this._findSnapshotNode(snapshot);
            if (node) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    captureReparentSnapshots(nodes: Node[]): Map<string, INodeReparentSnapshot> {
        const snapshots = new Map<string, INodeReparentSnapshot>();
        for (const node of nodes) {
            if (!node?.isValid) {
                continue;
            }
            const parent = node.parent as Node | null;
            snapshots.set(node.uuid, {
                uuid: node.uuid,
                path: NodeMgr.getNodePath(node) ?? '',
                dump: this._cloneSnapshotDump(dumpUtil.dumpNode(node)),
                parentUuid: parent?.uuid ?? null,
                parentPath: parent ? (NodeMgr.getNodePath(parent) ?? '/') : '/',
                siblingIndex: node.getSiblingIndex(),
            });
        }
        return snapshots;
    }

    recordReparentSnapshots(
        type: string,
        label: string,
        before: Map<string, INodeReparentSnapshot> | null,
        changedUuids: string[],
    ): void {
        if (!before || changedUuids.length === 0) {
            return;
        }
        const afterNodes = changedUuids
            .map(uuid => NodeMgr.getNode(uuid) as Node | null)
            .filter((node): node is Node => !!node?.isValid);
        const after = this.captureReparentSnapshots(afterNodes);
        if (this.snapshotMapsEqual(before, after)) {
            return;
        }
        Service.Undo?.push(new SnapshotCommand({
            id: this._createUndoSnapshotId(type),
            label,
            type,
            scope: { editorType: 'scene' },
            timestamp: Date.now(),
        }, before, after, this._createReparentSnapshotAdapter()));
    }

    pushNodeSnapshotCommand(
        type: string,
        label: string,
        before: Map<string, INodeSnapshot>,
        after: Map<string, INodeSnapshot>,
    ): void {
        if (this.snapshotMapsEqual(before, after)) {
            return;
        }

        Service.Undo?.push(new SnapshotCommand({
            id: this._createUndoSnapshotId(type),
            label,
            type,
            scope: { editorType: 'scene' },
            timestamp: Date.now(),
        }, before, after, this._createNodeSnapshotAdapter()));
    }

    async moveArrayElementByUuid(uuid: string, path: string, target: number, offset: number): Promise<boolean> {
        const normalizedPath = path.replace('__comps__', '_components');
        if (normalizedPath === 'children') {
            return this.moveChildArrayElementByUuid(uuid, path, target, offset);
        }
        if (normalizedPath === '_components') {
            return this._moveComponentArrayElementByUuid(uuid, path, target, offset);
        }

        return nodeMgr.moveArrayElement(uuid, path, target, offset);
    }

    async moveChildArrayElementByUuid(uuid: string, path: string, target: number, offset: number): Promise<boolean> {
        const node = NodeMgr.getNode(uuid) as Node | null;
        if (!node?.isValid) {
            return false;
        }
        if (path !== 'children') {
            throw new Error('Node.moveArrayElement currently supports undo recording only for path="children"');
        }

        if (
            Service.Undo?.isApplying?.() ||
            Service.Undo?.hasActiveRecording?.(node.uuid)
        ) {
            return nodeMgr.moveArrayElement(node.uuid, path, target, offset);
        }

        const before = this._captureChildOrderSnapshot(node);
        const result = nodeMgr.moveArrayElement(node.uuid, path, target, offset);
        if (!result) {
            return result;
        }
        const latestNode = NodeMgr.getNode(uuid) as Node | null;
        if (!latestNode) {
            return result;
        }
        const after = this._captureChildOrderSnapshot(latestNode);
        if (!this.snapshotMapsEqual(before, after)) {
            Service.Undo?.push(new SnapshotCommand({
                id: this._createUndoSnapshotId('node:move-array-element'),
                label: 'Move Array Element',
                type: 'node:move-array-element',
                scope: { editorType: 'scene' },
                timestamp: Date.now(),
            }, before, after, this._createChildOrderSnapshotAdapter()));
        }
        return result;
    }

    private async _moveComponentArrayElementByUuid(uuid: string, path: string, target: number, offset: number): Promise<boolean> {
        const node = NodeMgr.getNode(uuid) as Node | null;
        if (!node?.isValid) {
            return false;
        }

        if (
            Service.Undo?.isApplying?.() ||
            Service.Undo?.hasActiveRecording?.(node.uuid)
        ) {
            return nodeMgr.moveArrayElement(node.uuid, path, target, offset);
        }

        const before = this._captureComponentOrderSnapshot(node);
        const result = nodeMgr.moveArrayElement(node.uuid, path, target, offset);
        if (!result) {
            return result;
        }
        const latestNode = NodeMgr.getNode(uuid) as Node | null;
        if (!latestNode) {
            return result;
        }
        const after = this._captureComponentOrderSnapshot(latestNode);
        if (!this.snapshotMapsEqual(before, after)) {
            Service.Undo?.push(new SnapshotCommand({
                id: this._createUndoSnapshotId('node:move-array-element'),
                label: 'Move Array Element',
                type: 'node:move-array-element',
                scope: { editorType: 'scene' },
                timestamp: Date.now(),
            }, before, after, this._createComponentOrderSnapshotAdapter()));
        }
        return result;
    }

    dedupeNodes(nodes: Node[]): Node[] {
        const seen = new Set<string>();
        const result: Node[] = [];
        for (const node of nodes) {
            if (!node?.isValid || seen.has(node.uuid)) {
                continue;
            }
            seen.add(node.uuid);
            result.push(node);
        }
        return result;
    }

    snapshotMapsEqual(before: Map<string, any>, after: Map<string, any>): boolean {
        return snapshotMapsEqual(before, after);
    }

    private _getPreferredNewRootNodes(beforeNodeUuids: Set<string>, paths: string[]): INodeStructureCaptureTarget[] {
        const targets: INodeStructureCaptureTarget[] = [];
        for (const path of paths) {
            const node = NodeMgr.getNodeByPath(path) as Node | null;
            if (node?.isValid && !beforeNodeUuids.has(node.uuid) && !targets.some(target => target.node === node)) {
                targets.push({ node, path });
            }
        }
        return targets;
    }

    private _getNewRootNodes(beforeNodeUuids: Set<string>): INodeStructureCaptureTarget[] {
        const nodeMap = NodeMgr.getNodes() ?? {};
        const newUuids = new Set(Object.keys(nodeMap).filter(uuid => !beforeNodeUuids.has(uuid)));
        return Array.from(newUuids)
            .map(uuid => nodeMap[uuid] as Node | null)
            .filter((node): node is Node => !!node?.isValid)
            .map(node => ({ node, path: NodeMgr.getNodePath(node) }))
            .filter(target => !!target.path)
            .filter(target => !target.node.parent || !newUuids.has(target.node.parent.uuid))
            .sort((a, b) => a.node.getSiblingIndex() - b.node.getSiblingIndex());
    }

    private _getRootStructureTargets(targets: INodeStructureCaptureTarget[]): INodeStructureCaptureTarget[] {
        return targets.filter((target, index) => {
            if (targets.findIndex(item => item.node === target.node) !== index) {
                return false;
            }
            return !targets.some(other => other.node !== target.node && target.node.isChildOf(other.node));
        });
    }

    private _captureChildOrderSnapshot(parent: Node): Map<string, INodeChildOrderSnapshot> {
        const snapshots = new Map<string, INodeChildOrderSnapshot>();
        if (!parent?.isValid) {
            return snapshots;
        }
        snapshots.set(parent.uuid, {
            parentUuid: parent.uuid,
            parentPath: NodeMgr.getNodePath(parent) ?? '/',
            childUuids: parent.children.map(child => child.uuid),
        });
        return snapshots;
    }

    private _createChildOrderSnapshotAdapter(): ISnapshotAdapter {
        return {
            capture: async () => new Map(),
            apply: async (data: Map<string, INodeChildOrderSnapshot>) => this._applyChildOrderSnapshots(data),
            equals: (before: Map<string, INodeChildOrderSnapshot>, after: Map<string, INodeChildOrderSnapshot>) => this.snapshotMapsEqual(before, after),
        };
    }

    private async _applyChildOrderSnapshots(data: Map<string, INodeChildOrderSnapshot>): Promise<IUndoRedoResult> {
        for (const snapshot of data.values()) {
            const result = this._applyChildOrderSnapshot(snapshot);
            if (!result.success) {
                return result;
            }
        }
        return { success: true };
    }

    private _applyChildOrderSnapshot(snapshot: INodeChildOrderSnapshot): IUndoRedoResult {
        const parent = this._findChildOrderParent(snapshot);
        if (!parent) {
            return { success: false, reason: `Parent node not found: ${snapshot.parentPath || snapshot.parentUuid}` };
        }

        try {
            this._emit('node:before-change', parent);
            for (let index = 0; index < snapshot.childUuids.length; index++) {
                const child = NodeMgr.getNode(snapshot.childUuids[index]) as Node | null;
                if (!child?.isValid || child.parent !== parent) {
                    return { success: false, reason: `Child node not found: ${snapshot.childUuids[index]}` };
                }
                child.setSiblingIndex(index);
            }
            this._emit('node:change', parent, {
                source: 'undo',
                type: NodeEventType.MOVE_ARRAY_ELEMENT,
                propPath: 'children',
            });
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private _findChildOrderParent(snapshot: INodeChildOrderSnapshot): Node | null {
        const byUuid = NodeMgr.getNode(snapshot.parentUuid) as Node | null;
        if (byUuid?.isValid) {
            return byUuid;
        }
        if (snapshot.parentPath) {
            try {
                const byPath = snapshot.parentPath === '/'
                    ? Service.Editor.getRootNode()
                    : NodeMgr.getNodeByPath(snapshot.parentPath) as Node | null;
                return byPath?.isValid ? byPath : null;
            } catch (_error) {
                return null;
            }
        }
        return null;
    }

    private _captureComponentOrderSnapshot(node: Node): Map<string, IComponentOrderSnapshot> {
        const snapshots = new Map<string, IComponentOrderSnapshot>();
        if (!node?.isValid) {
            return snapshots;
        }
        snapshots.set(node.uuid, {
            nodeUuid: node.uuid,
            nodePath: NodeMgr.getNodePath(node) ?? '',
            componentUuids: node.components.map(component => component.uuid),
        });
        return snapshots;
    }

    private _createComponentOrderSnapshotAdapter(): ISnapshotAdapter {
        return {
            capture: async () => new Map(),
            apply: async (data: Map<string, IComponentOrderSnapshot>) => this._applyComponentOrderSnapshots(data),
            equals: (before: Map<string, IComponentOrderSnapshot>, after: Map<string, IComponentOrderSnapshot>) => this.snapshotMapsEqual(before, after),
        };
    }

    private async _applyComponentOrderSnapshots(data: Map<string, IComponentOrderSnapshot>): Promise<IUndoRedoResult> {
        for (const snapshot of data.values()) {
            const result = this._applyComponentOrderSnapshot(snapshot);
            if (!result.success) {
                return result;
            }
        }
        return { success: true };
    }

    private _applyComponentOrderSnapshot(snapshot: IComponentOrderSnapshot): IUndoRedoResult {
        const node = this._findComponentOrderNode(snapshot);
        if (!node) {
            return { success: false, reason: `Node not found: ${snapshot.nodePath || snapshot.nodeUuid}` };
        }

        const components = (node as any)._components as Component[] | undefined;
        if (!components) {
            return { success: false, reason: `Node components not found: ${snapshot.nodePath || snapshot.nodeUuid}` };
        }

        const componentByUuid = new Map(components.map(component => [component.uuid, component]));
        const orderedComponents: Component[] = [];
        for (const uuid of snapshot.componentUuids) {
            const component = componentByUuid.get(uuid);
            if (!component?.isValid || component.node !== node) {
                return { success: false, reason: `Component not found: ${uuid}` };
            }
            orderedComponents.push(component);
        }

        const componentUuidSet = new Set(snapshot.componentUuids);
        const extraComponents = components.filter(component => !componentUuidSet.has(component.uuid));

        try {
            this._emit('node:before-change', node);
            components.splice(0, components.length, ...orderedComponents, ...extraComponents);
            this._emit('node:change', node, {
                source: 'undo',
                type: NodeEventType.MOVE_ARRAY_ELEMENT,
                propPath: '__comps__',
            });
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private _findComponentOrderNode(snapshot: IComponentOrderSnapshot): Node | null {
        const byUuid = NodeMgr.getNode(snapshot.nodeUuid) as Node | null;
        if (byUuid?.isValid) {
            return byUuid;
        }
        if (snapshot.nodePath) {
            try {
                const byPath = NodeMgr.getNodeByPath(snapshot.nodePath) as Node | null;
                return byPath?.isValid ? byPath : null;
            } catch (_error) {
                return null;
            }
        }
        return null;
    }

    private _createReparentSnapshotAdapter(): ISnapshotAdapter {
        return {
            capture: async (uuids: string[]) => {
                const nodes = uuids
                    .map(uuid => NodeMgr.getNode(uuid) as Node | null)
                    .filter((node): node is Node => !!node);
                return this.captureReparentSnapshots(nodes);
            },
            apply: async (data: Map<string, INodeReparentSnapshot>) => this._applyReparentSnapshots(data),
            equals: (before: Map<string, INodeReparentSnapshot>, after: Map<string, INodeReparentSnapshot>) => this.snapshotMapsEqual(before, after),
        };
    }

    private async _applyReparentSnapshots(data: Map<string, INodeReparentSnapshot>): Promise<IUndoRedoResult> {
        const snapshots = [...data.values()].sort((a, b) => a.siblingIndex - b.siblingIndex);
        for (const snapshot of snapshots) {
            const result = await this._applyReparentSnapshot(snapshot);
            if (!result.success) {
                return result;
            }
        }
        return { success: true };
    }

    private async _applyReparentSnapshot(snapshot: INodeReparentSnapshot): Promise<IUndoRedoResult> {
        const node = this._findSnapshotNode(snapshot);
        if (!node) {
            return { success: false, reason: `Node not found: ${snapshot.path || snapshot.uuid}` };
        }
        const parent = this._findReparentParent(snapshot);
        if (!parent) {
            return { success: false, reason: `Parent node not found: ${snapshot.parentPath || snapshot.parentUuid || '/'}` };
        }

        try {
            const oldParent = node.parent as Node | null;
            if (oldParent) {
                this._emit('node:before-change', oldParent);
            }
            if (parent !== oldParent) {
                this._emit('node:before-change', parent);
            }
            this._emit('node:before-change', node);

            node.setParent(parent, false);
            if (snapshot.siblingIndex >= 0) {
                node.setSiblingIndex(snapshot.siblingIndex);
            }
            await this._restoreNodeSnapshotDump(node, snapshot.dump);

            if (oldParent) {
                this._emit('node:change', oldParent, { source: 'undo', type: NodeEventType.CHILD_CHANGED });
            }
            if (parent !== oldParent) {
                this._emit('node:change', parent, { source: 'undo', type: NodeEventType.CHILD_CHANGED });
            }
            this._emit('node:change', node, { source: 'undo', type: NodeEventType.PARENT_CHANGED });
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private _findReparentParent(snapshot: INodeReparentSnapshot): Node | null {
        if (snapshot.parentUuid) {
            const byUuid = NodeMgr.getNode(snapshot.parentUuid) as Node | null;
            if (byUuid?.isValid) {
                return byUuid;
            }
        }
        if (snapshot.parentPath && snapshot.parentPath !== '/') {
            try {
                const byPath = NodeMgr.getNodeByPath(snapshot.parentPath) as Node | null;
                if (byPath?.isValid) {
                    return byPath;
                }
            } catch (_error) {
                return null;
            }
        }
        return Service.Editor.getRootNode() as Node | null;
    }

    private _createNodeSnapshotAdapter(): ISnapshotAdapter {
        return {
            capture: async (uuids: string[]) => {
                const nodes = uuids
                    .map(uuid => NodeMgr.getNode(uuid) as Node | null)
                    .filter((node): node is Node => !!node);
                return this.captureNodeSnapshots(nodes);
            },
            apply: async (data: Map<string, INodeSnapshot>) => this._applyNodeSnapshots(data),
            equals: (before: Map<string, INodeSnapshot>, after: Map<string, INodeSnapshot>) => this.snapshotMapsEqual(before, after),
        };
    }

    private async _applyNodeSnapshots(data: Map<string, INodeSnapshot>): Promise<IUndoRedoResult> {
        for (const snapshot of data.values()) {
            const result = await this._applyNodeSnapshot(snapshot);
            if (!result.success) {
                return result;
            }
        }
        return { success: true };
    }

    private async _applyNodeSnapshot(snapshot: INodeSnapshot): Promise<IUndoRedoResult> {
        const node = this._findSnapshotNode(snapshot);
        if (!node) {
            return { success: false, reason: `Node not found: ${snapshot.path || snapshot.uuid}` };
        }

        try {
            this._emit('node:before-change', node);
            await this._restoreNodeSnapshotDump(node, snapshot.dump);
            this._emit('node:change', node, { source: 'undo', type: NodeEventType.SET_PROPERTY });
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private async _restoreNodeSnapshotDump(node: Node, dump: any): Promise<void> {
        await restoreNodeSnapshotDump(node, dump, {
            updateNodeName: (uuid, name) => NodeMgr.updateNodeName(uuid, name),
        });
    }

    private _findSnapshotNode(snapshot: INodeSnapshot): Node | null {
        const nodeByUuid = NodeMgr.getNode(snapshot.uuid) as Node | null;
        if (nodeByUuid?.isValid) {
            return nodeByUuid;
        }
        if (snapshot.path) {
            const nodeByPath = NodeMgr.getNodeByPath(snapshot.path) as Node | null;
            return nodeByPath?.isValid ? nodeByPath : null;
        }
        return null;
    }

    private _cloneSnapshotDump<T>(dump: T): T {
        return JSON.parse(JSON.stringify(dump));
    }

    private _createUndoSnapshotId(prefix: string): string {
        return createUndoId(prefix);
    }
}
