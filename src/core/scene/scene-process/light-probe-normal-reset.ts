type ProbeNormal = {
    set(x: number, y: number, z: number): unknown;
};

type Probe = {
    normal?: ProbeNormal;
};

type LightProbesData = {
    probes?: Probe[];
};

type UpdateTetrahedrons = (this: LightProbesData, ...args: unknown[]) => unknown;

const NORMAL_RESET_PATCH = Symbol('cocos-cli-light-probe-normal-reset');

type PatchedUpdateTetrahedrons = UpdateTetrahedrons & {
    [NORMAL_RESET_PATCH]?: boolean;
};

/**
 * Cocos 4.0 accumulates convex-hull normals into the serialized Vertex.normal
 * values on every tetrahedron rebuild. Clear the derived values at the CLI
 * adapter boundary so edits and scene reloads always recompute from geometry.
 */
export function installLightProbeNormalReset(engine: unknown): boolean {
    const prototype = (engine as {
        internal?: { LightProbesData?: { prototype?: { updateTetrahedrons?: PatchedUpdateTetrahedrons } } };
    })?.internal?.LightProbesData?.prototype;
    const original = prototype?.updateTetrahedrons;
    if (!prototype || typeof original !== 'function' || original[NORMAL_RESET_PATCH]) {
        return false;
    }

    const patched: PatchedUpdateTetrahedrons = function (...args: unknown[]): unknown {
        for (const probe of this.probes ?? []) {
            probe.normal?.set(0, 0, 0);
        }
        return original.apply(this, args);
    };
    Object.defineProperty(patched, NORMAL_RESET_PATCH, { value: true });
    prototype.updateTetrahedrons = patched;
    return true;
}
