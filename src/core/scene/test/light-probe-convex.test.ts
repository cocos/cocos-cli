jest.mock('cc', () => ({
    Vec3: class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        static clone(v: { x: number; y: number; z: number }) { return new this(v.x, v.y, v.z); }
        static min(out: Vec3, a: Vec3, b: Vec3) { out.x = Math.min(a.x, b.x); out.y = Math.min(a.y, b.y); out.z = Math.min(a.z, b.z); }
        static max(out: Vec3, a: Vec3, b: Vec3) { out.x = Math.max(a.x, b.x); out.y = Math.max(a.y, b.y); out.z = Math.max(a.z, b.z); }
    },
}));

import { Vec3 } from 'cc';
import { buildLightProbeConvex } from '../scene-process/service/gizmo/utils/light-probe-convex';

const vertex = (x: number, y: number, z: number) => ({ position: new Vec3(x, y, z), normal: new Vec3(1, 0, 0) });
const tet = (a: number, b: number, c: number, d: number) => ({ vertex0: a, vertex1: b, vertex2: c, vertex3: d });

describe('Light probe convex display geometry', () => {
    const vertices = [vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0), vertex(0, 0, 1), vertex(0.1, 0.1, 0.1)];

    it('draws only outer faces, deduplicates edges and emits one normal per boundary vertex', () => {
        const result = buildLightProbeConvex(vertices, [tet(0, 1, 2, 4), tet(0, 1, 2, -1), tet(0, 2, 3, -2), tet(2, 1, 0, -1)]);
        expect(result.positions).toEqual(vertices.slice(0, 4).map(v => v.position));
        expect(result.indices).toHaveLength(10);
        expect(result.normalIndices).toHaveLength(8);
        for (let i = 0; i < 4; i++) {
            expect(result.normalPositions[i * 2]).toEqual(vertices[i].position);
            expect(result.normalPositions[i * 2 + 1].x).toBeCloseTo(vertices[i].position.x + Math.sqrt(3) * 0.08);
        }
    });

    it('does not treat inner tetrahedron edges as a convex hull', () => {
        expect(buildLightProbeConvex(vertices, [tet(0, 1, 2, 3)]).indices).toEqual([]);
    });

    it('skips invalid indices, repeated vertices, non-finite points and collinear faces', () => {
        const points = [...vertices, vertex(NaN, 0, 0), vertex(2, 0, 0)];
        const result = buildLightProbeConvex(points, [tet(0, 0, 2, -1), tet(-1, 1, 2, -1), tet(0, 1, 99, -1), tet(0, 1, 1.5, -1), tet(0, 1, 5, -1), tet(0, 1, 6, -1)]);
        expect(result).toEqual({ positions: [], indices: [], normalPositions: [], normalIndices: [] });
    });

    it('does not draw zero or invalid normals, and does not mutate engine data', () => {
        const points = vertices.slice(0, 3).map(v => ({ position: Vec3.clone(v.position), normal: new Vec3() }));
        points[1].normal.x = Infinity;
        points[2].normal.x = 4;
        const before = points.map(v => [v.position.x, v.position.y, v.position.z, v.normal.x]);
        const result = buildLightProbeConvex(points, [tet(0, 1, 2, -1)]);
        expect(result.indices).toHaveLength(6);
        expect(result.normalIndices).toHaveLength(2);
        expect(points.map(v => [v.position.x, v.position.y, v.position.z, v.normal.x])).toEqual(before);
        expect(result.positions[0]).not.toBe(points[0].position);
    });

    it('keeps world-space coordinates and is independent of input ordering', () => {
        const points = vertices.slice(0, 3).map(v => ({ position: new Vec3(v.position.x + 100, v.position.y + 200, v.position.z + 300), normal: v.normal }));
        const result = buildLightProbeConvex(points, [tet(2, 0, 1, -2)]);
        expect(result.positions).toEqual([points[2].position, points[0].position, points[1].position]);
        expect(result.indices).toEqual([0, 1, 1, 2, 2, 0]);
    });
});
