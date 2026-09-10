import { Vec3, type Node, type Scene } from 'cc';

/** Finds the scene whose registered probe positions can be affected by this subtree. */
export function getLightProbeTransformScene(node: Node): Scene | undefined {
    const scene = node.scene;
    if (!node.isValid || !scene?.globals?.lightProbeInfo) return;
    const groups = node.getComponentsInChildren('cc.LightProbeGroup');
    return groups.some(group => group.isValid && group.enabledInHierarchy) ? scene : undefined;
}

/** Keeps the engine's world-position probe convention current after a node transform. */
export function synchronizeLightProbeTransform(node: Node): void {
    const scene = getLightProbeTransformScene(node);
    if (!scene) return;
    const info = scene.globals.lightProbeInfo;
    const before = (info.data?.probes ?? []).map(probe => Vec3.clone(probe.position));
    // The engine knows the registration order and active groups. Do not regenerate
    // local sample points, reorder groups or introduce a second transform convention.
    info.update(false);
    const after = info.data?.probes ?? [];
    if (before.length === after.length && before.every((point, index) => Vec3.strictEquals(point, after[index].position))) return;
    info.update(true);
    // A changed sample position cannot retain SH baked at the previous location.
    info.onProbeBakeCleared();
}

/** Adds affected scene snapshots last so Undo restores node poses before probe data. */
export function withLightProbeTransformScenes(nodes: Node[]): Node[] {
    const result = new Set(nodes);
    const scenes = new Set(nodes.map(getLightProbeTransformScene).filter((scene): scene is Scene => !!scene));
    for (const scene of scenes) {
        result.delete(scene);
        result.add(scene);
    }
    return [...result];
}
