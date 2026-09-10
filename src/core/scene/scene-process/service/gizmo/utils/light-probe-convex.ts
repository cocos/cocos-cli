import { Vec3 } from 'cc';

interface ProbeVertex {
    position: Readonly<Vec3>;
    normal: Readonly<Vec3>;
}

interface ProbeTetrahedron {
    vertex0: number;
    vertex1: number;
    vertex2: number;
    vertex3: number;
}

const finite = (v: Readonly<Vec3>) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Outer cells (-1 and -2) carry convex boundary triangles; inner tetrahedra do not. */
export function buildLightProbeConvex(vertices: readonly ProbeVertex[], tetrahedrons: readonly ProbeTetrahedron[]) {
    const positions: Vec3[] = [];
    const indices: number[] = [];
    const normalPositions: Vec3[] = [];
    const normalIndices: number[] = [];
    const vertexMap = new Map<number, number>();
    const seenEdges = new Set<string>();
    for (const tet of tetrahedrons) {
        if (tet.vertex3 !== -1 && tet.vertex3 !== -2) continue;
        const ids = [tet.vertex0, tet.vertex1, tet.vertex2];
        if (new Set(ids).size !== 3 || ids.some(id => !Number.isInteger(id) || id < 0 || id >= vertices.length || !finite(vertices[id].position))) continue;
        const [a, b, c] = ids.map(id => vertices[id].position);
        const ab = new Vec3(b.x - a.x, b.y - a.y, b.z - a.z);
        const ac = new Vec3(c.x - a.x, c.y - a.y, c.z - a.z);
        const area = Math.hypot(ab.y * ac.z - ab.z * ac.y, ab.z * ac.x - ab.x * ac.z, ab.x * ac.y - ab.y * ac.x);
        if (!Number.isFinite(area) || area === 0) continue;
        for (const id of ids) {
            if (!vertexMap.has(id)) {
                vertexMap.set(id, positions.length);
                positions.push(Vec3.clone(vertices[id].position));
            }
        }
        for (let i = 0; i < 3; i++) {
            const from = ids[i];
            const to = ids[(i + 1) % 3];
            const edge = from < to ? `${from}:${to}` : `${to}:${from}`;
            if (seenEdges.has(edge)) continue;
            seenEdges.add(edge);
            indices.push(vertexMap.get(from)!, vertexMap.get(to)!);
        }
    }

    if (positions.length) {
        const min = Vec3.clone(positions[0]);
        const max = Vec3.clone(positions[0]);
        for (const position of positions) {
            Vec3.min(min, min, position);
            Vec3.max(max, max, position);
        }
        // A scene-relative display length, independent of node scale and probe sphere size.
        const length = Math.max(Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) * 0.08, 0.01);
        for (const id of vertexMap.keys()) {
            const { position, normal } = vertices[id];
            const magnitude = Math.hypot(normal.x, normal.y, normal.z);
            if (!finite(normal) || !Number.isFinite(length) || !Number.isFinite(magnitude) || magnitude === 0) continue;
            const scale = length / magnitude;
            const end = new Vec3(position.x + normal.x * scale, position.y + normal.y * scale, position.z + normal.z * scale);
            if (!finite(end)) continue;
            normalIndices.push(normalPositions.length, normalPositions.length + 1);
            normalPositions.push(Vec3.clone(position), end);
        }
    }
    return { positions, indices, normalPositions, normalIndices };
}
