jest.mock('cc', () => ({
    gfx: { PrimitiveMode: { LINE_LIST: 1 } },
    Vec3: class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        set(x: number | Vec3, y = 0, z = 0) {
            if (typeof x === 'number') { this.x = x; this.y = y; this.z = z; }
            else { this.x = x.x; this.y = x.y; this.z = x.z; }
            return this;
        }
        static min(out: Vec3, a: Vec3, b: Vec3) { return out.set(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)); }
        static max(out: Vec3, a: Vec3, b: Vec3) { return out.set(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)); }
    },
}));

import { Vec3 } from 'cc';
import { CachedLineGeometry } from '../scene-process/service/gizmo/utils/cached-line-geometry';
import { lightProbeWireframeIndices } from '../scene-process/service/gizmo/utils/light-probe-wireframe';

it('reuses line buffers while updating positions, indices and bounds, without sharing across gizmos', () => {
    const lines = new CachedLineGeometry();
    const points = [new Vec3(2, 3, 4), new Vec3(5, 6, 7)];
    const indices = [0, 1];
    lines.update(points, indices);
    const geometry = lines.transformToDynamicGeometry();
    const positions = geometry.positions, edges = geometry.indices32, normals = geometry.normals;
    points[0].set(-5, -6, -7);
    indices.reverse();
    lines.update(points, indices);
    expect(geometry.positions).toBe(positions);
    expect(geometry.indices32).toBe(edges);
    expect(geometry.normals).toBe(normals);
    expect([...positions]).toEqual([-5, -6, -7, 5, 6, 7]);
    expect([...edges!]).toEqual([1, 0]);
    expect(geometry.minPos).toEqual(new Vec3(-5, -6, -7));
    expect(geometry.maxPos).toEqual(new Vec3(5, 6, 7));
    const other = new CachedLineGeometry();
    other.update([new Vec3(100, 100, 100)], [0, 0]);
    expect(geometry.positions).toBe(positions);
    expect(geometry.minPos).toEqual(new Vec3(-5, -6, -7));
});

it('resizes every vertex stream and resets bounds on growth, shrink and empty geometry', () => {
    const lines = new CachedLineGeometry();
    for (const count of [2, 5, 1, 0]) {
        lines.update(Array.from({ length: count }, (_, i) => new Vec3(i + 2, i + 3, i + 4)), []);
        const geometry = lines.transformToDynamicGeometry();
        expect(geometry.positions.length).toBe(count * 3);
        expect(geometry.normals!.length).toBe(count * 3);
        expect(geometry.minPos).toEqual(count ? new Vec3(2, 3, 4) : new Vec3());
        expect(geometry.maxPos).toEqual(count ? new Vec3(count + 1, count + 2, count + 3) : new Vec3());
    }
});

it('deduplicates shared tetrahedron edges, excludes outer cells and refreshes after topology replacement', () => {
    const inner = { vertex0: 0, vertex1: 1, vertex2: 2, vertex3: 3, isInnerTetrahedron: jest.fn(() => true) };
    const tetrahedrons = [inner, { vertex0: 2, vertex1: 1, vertex2: 0, vertex3: 4 },
        { vertex0: 0, vertex1: 1, vertex2: 2, vertex3: -1 }];
    const indices = lightProbeWireframeIndices(tetrahedrons);
    expect(indices).toHaveLength(18);
    expect(indices.every(index => index >= 0)).toBe(true);
    expect(lightProbeWireframeIndices(tetrahedrons)).toBe(indices);
    expect(inner.isInnerTetrahedron).toHaveBeenCalledTimes(1);
    const rebuilt = lightProbeWireframeIndices([{ vertex0: 0, vertex1: 1, vertex2: 2, vertex3: 5 }]);
    expect(rebuilt).toHaveLength(12);
    expect(rebuilt).toContain(5);
    expect(rebuilt).not.toBe(indices);
});
