interface Tetrahedron {
    vertex0: number;
    vertex1: number;
    vertex2: number;
    vertex3: number;
    isInnerTetrahedron?(): boolean;
}

const edgePairs = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];
const topologyCache = new WeakMap<ReadonlyArray<Tetrahedron>, number[]>();

/** The engine replaces the tetrahedron array on rebuild/restore; positions alone do not change topology. */
export function lightProbeWireframeIndices(tetrahedrons: ReadonlyArray<Tetrahedron>): number[] {
    const cached = topologyCache.get(tetrahedrons);
    if (cached) return cached;
    const indices: number[] = [];
    const seen = new Map<number, Set<number>>();
    for (const tetrahedron of tetrahedrons) {
        if (tetrahedron.vertex3 < 0 || tetrahedron.isInnerTetrahedron?.() === false) continue;
        const vertices = [tetrahedron.vertex0, tetrahedron.vertex1, tetrahedron.vertex2, tetrahedron.vertex3];
        for (let i = 0; i < edgePairs.length; i += 2) {
            const a = vertices[edgePairs[i]], b = vertices[edgePairs[i + 1]];
            const low = Math.min(a, b), high = Math.max(a, b);
            let ends = seen.get(low);
            if (!ends) { ends = new Set(); seen.set(low, ends); }
            if (ends.has(high)) continue;
            ends.add(high);
            indices.push(a, b);
        }
    }
    topologyCache.set(tetrahedrons, indices);
    return indices;
}
