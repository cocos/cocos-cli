import { Asset, Component, Node, Prefab } from 'cc';

type Target = Node | Component;

/** Keys are scoped by instance IDs so two instances of the same asset stay distinct. */
function collectTargets(root: Node): Map<string, Target> {
    const targets = new Map<string, Target>();
    const visit = (node: Node, scope: string[]) => {
        const info = node['_prefab'];
        const current = info?.instance ? [...scope, info.instance.fileId] : scope;
        const nodeKey = info?.fileId ? ['node', ...current, info.fileId] : ['node-uuid', node.uuid];
        targets.set(JSON.stringify(nodeKey), node);
        for (const component of node.components) {
            const fileId = component.__prefab?.fileId;
            const key = fileId ? ['component', ...current, fileId] : ['component-uuid', component.uuid];
            targets.set(JSON.stringify(key), component);
        }
        for (const child of node.children) visit(child, current);
    };
    visit(root, []);
    return targets;
}

/** Restore current asset contents without baking instance overrides into the asset. */
export function refreshPrefabInstances(root: Node): void {
    const instances: Node[] = [];
    const collectInstances = (node: Node) => {
        if (node['_prefab']?.instance && node['_prefab']?.asset?.data) {
            instances.push(node);
            return;
        }
        for (const child of node.children ?? []) collectInstances(child);
    };
    collectInstances(root);
    if (!instances.length) return;

    const before = collectTargets(root);
    const uuids = new Map([...before].map(([key, target]) => [key, target.uuid]));
    for (const node of instances) {
        // The deserialized tree is detached; rebuild before it can activate or
        // enter the editor's node and component registries.
        node['_prefab']!.instance!.expanded = false;
        Prefab._utils.expandPrefabInstanceNode(node, true);
    }

    const after = collectTargets(root);
    const replacements = new Map<Target, Target | null>();
    for (const [key, target] of before) replacements.set(target, after.get(key) ?? null);
    for (const [key, target] of after) {
        const uuid = uuids.get(key);
        if (!uuid || target.uuid === uuid) continue;
        if (target instanceof Node && EditorExtends.Node.getNode(target.uuid) === target) {
            EditorExtends.Node.changeNodeUUID(target.uuid, uuid);
        } else if (target instanceof Component && EditorExtends.Component.getComponent(target.uuid) === target) {
            EditorExtends.Component.changeUUID(target.uuid, uuid);
        } else {
            (target as unknown as { _id: string })._id = uuid;
        }
    }

    // Mounted components and override values can still reference objects from
    // the old tree. Redirect surviving targets and clear references to removals.
    const visited = new Set<object>();
    const repair = (owner: object) => {
        if (visited.has(owner) || owner instanceof Asset || ArrayBuffer.isView(owner)) return;
        visited.add(owner);
        const keys: string[] = (owner.constructor as { __values__?: string[] }).__values__ ?? Object.keys(owner);
        for (const key of keys) {
            const record = owner as Record<string, any>;
            const value = record[key];
            if (value instanceof Node || value instanceof Component) {
                if (replacements.has(value)) record[key] = replacements.get(value);
            } else if (value && typeof value === 'object') {
                repair(value);
            }
        }
    };
    for (const target of after.values()) repair(target);
    for (const node of instances) Prefab._utils.applyTargetOverrides(node);
    root._onBatchCreated(true);
}
