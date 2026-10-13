import { instantiate, Node, Scene, game } from 'cc';

/** Keep UUID-derived fileIds stable without registering the detached clone in the scene. */
export function withPrefabCandidate<T>(source: Node, prepare: (candidate: Node) => T): T {
    // Scene._instantiate deliberately returns null. Use the same detached clone
    // primitive as Node._instantiate so scene-level target references stay inside the draft.
    const previousCloning = game['_isCloning'];
    let candidate: Node;
    try {
        game['_isCloning'] = true;
        candidate =
            source instanceof Scene
                ? (instantiate as typeof instantiate & { _clone(original: Node, parent: Node): Node })._clone(
                      source,
                      source,
                  )
                : instantiate(source);
    } finally {
        game['_isCloning'] = previousCloning;
    }
    if (!candidate)
        throw new Error(`Could not clone Prefab candidate: ${source.name} (${source.uuid}, valid=${source.isValid}).`);
    const restoreIds: Array<() => void> = [];
    const copyIds = (original: Node, clone: Node) => {
        const id = clone.uuid;
        clone['_id'] = original.uuid;
        restoreIds.push(() => {
            clone['_id'] = id;
        });
        original.components.forEach((component, index) => {
            const cloned = clone.components[index];
            const componentId = cloned.uuid;
            cloned['_id'] = component.uuid;
            restoreIds.push(() => {
                cloned['_id'] = componentId;
            });
        });
        original.children.forEach((child, index) => copyIds(child, clone.children[index]));
    };
    try {
        copyIds(source, candidate);
        return prepare(candidate);
    } finally {
        restoreIds.forEach(restore => restore());
        candidate.destroy();
    }
}
