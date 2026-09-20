import { Vec3, type Node, type Scene } from 'cc';
import { isLightProbeRestoreInProgress } from './light-probe-snapshot';

interface TransformEdit {
    depth: number;
    changed: boolean;
    preserveCoefficients: boolean;
}

const transformEdits = new WeakMap<Scene, TransformEdit>();

export function isLightProbeTransformInProgress(scene: Scene): boolean {
    return transformEdits.has(scene);
}

/** Saving/reloading during a gesture must never serialize stale tetrahedra. */
export function flushLightProbeTransformEdit(scene: Scene): void {
    const edit = transformEdits.get(scene);
    if (!edit?.changed || !scene.isValid || isLightProbeRestoreInProgress(scene)) return;
    const preserveCoefficients = edit.preserveCoefficients;
    // Notifications can synchronously serialize again or produce a new edit.
    // Consume only this batch of changes before publishing, not a newer one.
    edit.changed = false;
    edit.preserveCoefficients = true;
    try {
        finishTransform(scene, preserveCoefficients);
    } catch (error) {
        edit.changed = true;
        edit.preserveCoefficients &&= preserveCoefficients;
        throw error;
    }
}

/** Scope a viewport TRS gesture; finish synchronously before capturing its Undo end state. */
export function beginLightProbeTransformEdit(nodes: Node[]): (() => void) | undefined {
    const scenes = new Set(nodes.map(getLightProbeTransformScene).filter((scene): scene is Scene => !!scene));
    if (!scenes.size) return;
    for (const scene of scenes) {
        const edit = transformEdits.get(scene);
        if (edit) edit.depth++;
        else transformEdits.set(scene, { depth: 1, changed: false, preserveCoefficients: true });
    }
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        // Release all scenes before notifying consumers, including on failure.
        const pending: [Scene, TransformEdit][] = [];
        for (const scene of scenes) {
            const edit = transformEdits.get(scene)!;
            if (--edit.depth) continue;
            transformEdits.delete(scene);
            if (scene.isValid && edit.changed && !isLightProbeRestoreInProgress(scene)) pending.push([scene, edit]);
        }
        const errors: unknown[] = [];
        for (const [scene, edit] of pending) {
            try { finishTransform(scene, edit.preserveCoefficients); }
            catch (error) { errors.push(error); }
        }
        if (errors.length) throw errors[0];
    };
}

function finishTransform(scene: Scene, preserveCoefficients: boolean): void {
    const info = scene.globals.lightProbeInfo;
    info.update(true);
    // Creator retains every group's baked coefficients when a group/ancestor is translated.
    // Other edit paths keep their existing invalidation policy until separately verified.
    if (preserveCoefficients) info.onProbeBakeFinished();
    else info.onProbeBakeCleared();
}

/** Finds the scene whose registered probe positions can be affected by this subtree. */
export function getLightProbeTransformScene(node: Node): Scene | undefined {
    const scene = node.scene;
    // Ordinary scenes do not need a subtree scan on every transform/Undo capture.
    if (!node.isValid || !scene?.globals?.lightProbeInfo?.data?.probes?.length) return;
    const groups = node.getComponentsInChildren('cc.LightProbeGroup');
    return groups.some(group => group.isValid && group.enabledInHierarchy) ? scene : undefined;
}

/** Keeps the engine's world-position probe convention current after a node transform. */
export function synchronizeLightProbeTransform(node: Node, preserveCoefficients = false): void {
    // Node setters emit transform/parent events while Undo restores a batch.
    // Its exact shared probe table is restored last; rebuilding it here is wasted
    // work and can temporarily invalidate SH belonging to other groups.
    if (node.scene && isLightProbeRestoreInProgress(node.scene)) return;
    const scene = getLightProbeTransformScene(node);
    if (!scene) return;
    const info = scene.globals.lightProbeInfo;
    const before = (info.data?.probes ?? []).map(probe => Vec3.clone(probe.position));
    // The engine knows the registration order and active groups. Do not regenerate
    // local sample points, reorder groups or introduce a second transform convention.
    info.update(false);
    const after = info.data?.probes ?? [];
    if (before.length === after.length && before.every((point, index) => Vec3.strictEquals(point, after[index].position))) return;
    const edit = transformEdits.get(scene);
    if (edit) {
        // Keep dots/line endpoints current, but do not rerun Delaunay or broadcast
        // scene-wide baking events for every pointer move (often twice per move).
        edit.changed = true;
        edit.preserveCoefficients &&= preserveCoefficients;
        return;
    }
    finishTransform(scene, preserveCoefficients);
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
