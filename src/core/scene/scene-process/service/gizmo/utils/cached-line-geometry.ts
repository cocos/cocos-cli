import { gfx, Vec3, type primitives } from 'cc';
import { DynamicMeshPrimitive } from './defines';

/** Mutable line buffers owned by one gizmo node, never shared between meshes. */
export class CachedLineGeometry extends DynamicMeshPrimitive {
    private readonly geometry: primitives.IDynamicGeometry;

    constructor() {
        super({ positions: [], indices: [], minPos: new Vec3(), maxPos: new Vec3(), primitiveType: gfx.PrimitiveMode.LINE_LIST });
        this.geometry = { primitiveMode: this.primitiveType, positions: new Float32Array(0), indices32: new Uint32Array(0),
            minPos: this.minPos, maxPos: this.maxPos };
    }

    update(vertices: Vec3[], indices: number[]): void {
        this.positions = vertices;
        this.indices = indices;
        if (this.geometry.positions.length !== vertices.length * 3) {
            this.geometry.positions = new Float32Array(vertices.length * 3);
            this.geometry.normals = new Float32Array(vertices.length * 3);
            for (let i = 0; i < vertices.length; i++) this.geometry.normals[i * 3 + 1] = 1;
        }
        if (this.geometry.indices32!.length !== indices.length) {
            this.geometry.indices32 = new Uint32Array(indices.length);
        }
        // Copy even when the input array is reused: callers may edit indices in place.
        this.geometry.indices32!.set(indices);
        this.minPos!.set(0, 0, 0);
        this.maxPos!.set(0, 0, 0);
        for (let i = 0; i < vertices.length; i++) {
            const point = vertices[i];
            const offset = i * 3;
            this.geometry.positions[offset] = point.x;
            this.geometry.positions[offset + 1] = point.y;
            this.geometry.positions[offset + 2] = point.z;
            if (i === 0) { this.minPos!.set(point); this.maxPos!.set(point); }
            else { Vec3.min(this.minPos!, this.minPos!, point); Vec3.max(this.maxPos!, this.maxPos!, point); }
        }
    }

    override transformToDynamicGeometry(): primitives.IDynamicGeometry { return this.geometry; }
}
