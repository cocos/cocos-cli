import { LightProbeGroup, Node, type Component, type Scene, type Vec3 } from 'cc';

export interface LightProbeDataSnapshot {
    data: Scene['globals']['lightProbeInfo']['data'];
    nodeOrder: string[];
}

export interface LightProbeGroupSnapshot {
    /** Serialized backing name, not Component.name's node-dependent fallback. */
    name: string;
    enabled: boolean;
    prefab: LightProbeGroup['__prefab'];
    probes: Vec3[];
    method: number;
    minPos: Vec3;
    maxPos: Vec3;
    nProbesX: number;
    nProbesY: number;
    nProbesZ: number;
}

const restoringScenes = new WeakMap<Scene, number>();

/** Suppress derived-data regeneration until a scene's complete snapshot is back. */
export function beginLightProbeRestore(scene: Scene): () => void {
    restoringScenes.set(scene, (restoringScenes.get(scene) ?? 0) + 1);
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        const count = (restoringScenes.get(scene) ?? 1) - 1;
        if (count) restoringScenes.set(scene, count);
        else restoringScenes.delete(scene);
    };
}

export function isLightProbeRestoreInProgress(scene: Scene): boolean {
    return restoringScenes.has(scene);
}

/** Snapshot targets include groups that an edit can enable or generate for the first time. */
export function getLightProbeSnapshotScenes(nodes: Node[]): Scene[] {
    const scenes = new Set<Scene>();
    for (const node of nodes) {
        const scene = node?.scene;
        if (!node?.isValid || !scene?.isValid || scenes.has(scene)) continue;
        if (node.getComponentsInChildren('cc.LightProbeGroup').some(group => group.isValid)) scenes.add(scene);
    }
    return [...scenes];
}

/** Only used for the acyclic value data owned by LightProbesData and probe groups. */
function cloneProbeValue<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(cloneProbeValue) as T;
    // Vertex/Tetrahedron constructors require arguments. Preserve their methods,
    // and Vec3/Mat3 methods, without constructing or traversing scene objects.
    const result = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
    for (const [key, child] of Object.entries(value)) result[key] = cloneProbeValue(child);
    return result as T;
}

function registeredProbeNodes(scene: Scene): { node: Node }[] {
    // Registration order, not hierarchy order, determines the global SH indices.
    // The engine exposes add/remove/sync but no public registration-order query.
    return (scene.globals.lightProbeInfo as unknown as { _nodes?: { node: Node }[] })._nodes ?? [];
}

export function captureLightProbeData(scene: Scene): LightProbeDataSnapshot {
    return {
        data: cloneProbeValue(scene.globals.lightProbeInfo.data),
        nodeOrder: registeredProbeNodes(scene).map(entry => entry.node.uuid),
    };
}

/** Called after all node poses, group properties and registrations are restored. */
export function restoreLightProbeData(scene: Scene, snapshot: LightProbeDataSnapshot): void {
    const finish = beginLightProbeRestore(scene);
    try {
        const info = scene.globals.lightProbeInfo;
        const order = new Map(snapshot.nodeOrder.map((uuid, index) => [uuid, index]));
        registeredProbeNodes(scene).sort((a, b) =>
            (order.get(a.node.uuid) ?? order.size) - (order.get(b.node.uuid) ?? order.size));
        // The setter also updates the rendering resource. Clone on every restore so
        // subsequent edits cannot mutate an Undo/Redo entry or another restored state.
        info.data = cloneProbeValue(snapshot.data);
        for (const model of scene.renderScene?.models ?? []) {
            model.tetrahedronIndex = -1;
            model.clearSHUBOs();
        }
        info.onProbeBakeFinished();
        for (const group of scene.getComponentsInChildren('cc.LightProbeGroup')) {
            if (group.isValid) group.node.emit(Node.EventType.LIGHT_PROBE_CHANGED);
        }
    } finally {
        finish();
    }
}

export function captureLightProbeGroup(component: Component): LightProbeGroupSnapshot | undefined {
    // Script subclasses can carry additional properties: leave them on the
    // existing generic snapshot path rather than silently dropping their data.
    if (component.constructor !== LightProbeGroup) return;
    const group = component as LightProbeGroup;
    return cloneProbeValue({
        name: (group as unknown as { _name: string })._name,
        enabled: group.enabled,
        prefab: group.__prefab,
        probes: group.probes,
        method: group.method,
        minPos: group.minPos,
        maxPos: group.maxPos,
        nProbesX: group.nProbesX,
        nProbesY: group.nProbesY,
        nProbesZ: group.nProbesZ,
    });
}

export function restoreLightProbeGroup(component: Component, snapshot: LightProbeGroupSnapshot): void {
    const group = component as LightProbeGroup;
    const saved = cloneProbeValue(snapshot);
    (group as unknown as { _name: string })._name = saved.name;
    group.__prefab = saved.prefab;
    group.probes = saved.probes;
    (group as unknown as { _method: number })._method = saved.method;
    group.minPos = saved.minPos;
    group.maxPos = saved.maxPos;
    group.nProbesX = saved.nProbesX;
    group.nProbesY = saved.nProbesY;
    group.nProbesZ = saved.nProbesZ;
    // Lifecycle registration must see the restored points, not the old array.
    group.enabled = saved.enabled;
    if (group.enabledInHierarchy) {
        group.node.scene.globals.lightProbeInfo.syncData(group.node, group.probes);
    }
}
