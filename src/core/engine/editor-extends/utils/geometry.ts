'use strict';

import { gfx } from 'cc';
declare const ccm: any;

interface IWritableArrayLike<T> {
    length: number;
    [index: number]: T;
}

export const calculateNormals = (() => {
    const { Vec3 } = cc;
    const p0 = new Vec3();
    const p1 = new Vec3();
    const p2 = new Vec3();
    const e1 = new Vec3();
    const e2 = new Vec3();
    const n = new Vec3();
    return (positions: ArrayLike<number>, indices: ArrayLike<number>, out: IWritableArrayLike<number> = []) => {
        const nFaces = indices.length / 3;
        const nVertices = positions.length / 3;
        const normals = Array(3 * nVertices).fill(0).map(() => new Vec3());
        for (let iFace = 0; iFace < nFaces; ++iFace) {
            const i0 = indices[3 * iFace + 0];
            const i1 = indices[3 * iFace + 1];
            const i2 = indices[3 * iFace + 2];
            Vec3.fromArray(p0, positions, i0 * 3);
            Vec3.fromArray(p1, positions, i1 * 3);
            Vec3.fromArray(p2, positions, i2 * 3);

            Vec3.subtract(e1, p1, p0);
            Vec3.subtract(e2, p2, p0);
            Vec3.cross(n, e1, e2);

            Vec3.add(normals[i0], normals[i0], n);
            Vec3.add(normals[i1], normals[i1], n);
            Vec3.add(normals[i2], normals[i2], n);
        }
        for (let iVertex = 0; iVertex < nVertices; ++iVertex) {
            Vec3.toArray(out, Vec3.normalize(n, normals[iVertex]), iVertex * 3);
        }
        return out;
    };
})();

export const calculateTangents = (() => {
    const { Vec2, Vec3 } = cc;
    const p0 = new Vec3();
    const p1 = new Vec3();
    const p2 = new Vec3();
    const e1 = new Vec3();
    const e2 = new Vec3();
    const w0 = new Vec2();
    const w1 = new Vec2();
    const w2 = new Vec2();
    const t = new Vec3();
    const b = new Vec3();
    const v3_1 = new Vec3();
    const v3_2 = new Vec3();
    return (positions: ArrayLike<number>, indices: ArrayLike<number>, normals: ArrayLike<number>,
        uvs: ArrayLike<number>, out: IWritableArrayLike<number> = []) => {
        const nFaces = indices.length / 3;
        const nVertices = positions.length / 3;
        /// FGED2, Chp. 7.5
        const tangents = Array(nVertices).fill(0).map(() => new Vec3());
        const bitangents = Array(nVertices).fill(0).map(() => new Vec3());
        // Calculate tangent and bitangent for each triangle and add to all three vertices.
        for (let iFace = 0; iFace < nFaces; ++iFace) {
            const i0 = indices[iFace * 3 + 0];
            const i1 = indices[iFace * 3 + 1];
            const i2 = indices[iFace * 3 + 2];
            Vec3.fromArray(p0, positions, i0 * 3);
            Vec3.fromArray(p1, positions, i1 * 3);
            Vec3.fromArray(p2, positions, i2 * 3);
            Vec2.fromArray(w0, uvs, i0 * 2);
            Vec2.fromArray(w1, uvs, i1 * 2);
            Vec2.fromArray(w2, uvs, i2 * 2);

            Vec3.subtract(e1, p1, p0); Vec3.subtract(e2, p2, p0);
            const x1 = w1.x - w0.x; const x2 = w2.x - w0.x;
            const y1 = w1.y - w0.y; const y2 = w2.y - w0.y;

            let r = x1 * y2 - x2 * y1; if (r !== 0) { r = 1 / r; }
            Vec3.multiplyScalar(t, Vec3.subtract(v3_1, Vec3.multiplyScalar(v3_1, e1, y2), Vec3.multiplyScalar(v3_2, e2, y1)), r);
            Vec3.multiplyScalar(b, Vec3.subtract(v3_1, Vec3.multiplyScalar(v3_1, e2, x1), Vec3.multiplyScalar(v3_2, e1, x2)), r);

            Vec3.add(tangents[i0], tangents[i0], t);
            Vec3.add(tangents[i1], tangents[i1], t);
            Vec3.add(tangents[i2], tangents[i2], t);
            Vec3.add(bitangents[i0], bitangents[i0], b);
            Vec3.add(bitangents[i1], bitangents[i1], b);
            Vec3.add(bitangents[i2], bitangents[i2], b);
        }
        // Orthonormalize each tangent and calculate the handedness.
        for (let iVertex = 0; iVertex < nVertices; ++iVertex) {
            const t = tangents[iVertex];
            const b = bitangents[iVertex];
            const n = Vec3.fromArray(v3_1, normals, iVertex * 3);
            Vec3.subtract(v3_2, t, Vec3.multiplyScalar(v3_2, n, (Vec3.dot(t, n) / Vec3.dot(n, n)))); // Reject
            if (Vec3.dot(v3_2, v3_2) == 0) { // The 'perfect symmetry' case
                if (n.x || n.z) { Vec3.set(v3_2, n.z, 0, -n.x); }
                else { Vec3.set(v3_2, 0, n.x, -n.y); }
            }
            Vec3.toArray(out, Vec3.normalize(v3_2, v3_2), iVertex * 4);
            out[iVertex * 4 + 3] = Vec3.dot(Vec3.cross(v3_2, b, t), n) > 0 ? 1 : -1;
        }
        return out;
    };
})();

export function forEachFace(indices: ArrayLike<number>, primitiveMode: gfx.PrimitiveMode, callback: (faceIndices: number[]) => any) {
    let faces = 0;
    const faceIndices: number[] = [];
    switch (primitiveMode) {
        case ccm.gfx.PrimitiveMode.TRIANGLE_LIST:
            faces = indices.length / 3;
            for (let i = 0; i < faces; i++) {
                faceIndices[0] = indices[i * 3];
                faceIndices[1] = indices[i * 3 + 1];
                faceIndices[2] = indices[i * 3 + 2];
                callback(faceIndices);
            }
            break;
        case ccm.gfx.PrimitiveMode.TRIANGLE_STRIP:
            faces = indices.length - 2;
            let rev = 0;
            for (let i = 0; i < faces; i++) {
                faceIndices[0] = indices[i - rev];
                faceIndices[1] = indices[i + rev + 1];
                faceIndices[2] = indices[i + 2];
                callback(faceIndices);
                rev = ~rev;
            }
            break;
        case ccm.gfx.PrimitiveMode.TRIANGLE_FAN:
            faces = indices.length - 1;
            const first = indices[0];
            for (let i = 1; i < faces; i++) {
                faceIndices[0] = first;
                faceIndices[1] = indices[i];
                faceIndices[2] = indices[i + 1];
                callback(faceIndices);
            }
            break;
        case ccm.gfx.PrimitiveMode.LINE_LIST:
            faces = indices.length / 2;
            for (let i = 0; i < faces; i++) {
                faceIndices[0] = indices[i * 2];
                faceIndices[1] = indices[i * 2 + 1];
                callback(faceIndices);
            }
            break;
        case ccm.gfx.PrimitiveMode.LINE_STRIP:
            faces = indices.length - 1;
            for (let i = 0; i < faces; i++) {
                faceIndices[0] = indices[i];
                faceIndices[1] = indices[i + 1];
                callback(faceIndices);
            }
            break;
        case ccm.gfx.PrimitiveMode.LINE_LOOP:
            faces = indices.length;
            for (let i = 0; i < faces; i++) {
                faceIndices[0] = indices[i];
                faceIndices[1] = indices[(i + 1) === faces ? 0 : (i + 1)];
                callback(faceIndices);
            }
            break;
        case ccm.gfx.PrimitiveMode.POINT_LIST:
            faces = indices.length;
            for (let i = 0; i < faces; i++) {
                faceIndices[0] = indices[i];
                callback(faceIndices);
            }
            break;
        default:
            break;
    }
}

export class MeshSplitInfo {
    public indices: number[] = []; // new IB, indexed into original vertices
    public jointSet = new Set<number>(); // new effective joints, indexed into original skeleton
    // @ts-ignore
    public primitiveMode: gfx.PrimitiveMode; // new primitive mode
    constructor(primitiveMode = ccm.gfx.PrimitiveMode.TRIANGLE_LIST) {
        this.primitiveMode = primitiveMode;
    }
}

export const splitBasedOnJoints = (() => {

    function addFace(target: MeshSplitInfo, joints: ArrayLike<number>, faceIndices: ArrayLike<number>) {
        for (let i = 0; i < faceIndices.length; i++) {
            const idx = faceIndices[i];
            for (let j = 0; j < 4; j++) {
                target.jointSet.add(joints[idx * 4 + j]);
            }
            target.indices.push(idx);
        }
    }
    function testFace(
        target: MeshSplitInfo, joints: ArrayLike<number>, faceIndices: ArrayLike<number>, capacity: number) {
        let counter = 0; // dry run
        for (let i = 0; i < faceIndices.length; i++) {
            const idx = faceIndices[i];
            for (let j = 0; j < 4; j++) {
                if (!target.jointSet.has(joints[idx * 4 + j])) { counter++; }
            }
        }
        return target.jointSet.size + counter <= capacity;
    }
    return (joints: ArrayLike<number>, indices: ArrayLike<number>, primitiveMode: gfx.PrimitiveMode, capacity: number) => {
        // @ts-ignore
        let prim: ccm.gfx.PrimitiveMode | undefined;
        switch (primitiveMode) {
            case ccm.gfx.PrimitiveMode.TRIANGLE_LIST:
            case ccm.gfx.PrimitiveMode.TRIANGLE_STRIP:
            case ccm.gfx.PrimitiveMode.TRIANGLE_FAN: prim = ccm.gfx.PrimitiveMode.TRIANGLE_LIST; break;
            case ccm.gfx.PrimitiveMode.LINE_LIST:
            case ccm.gfx.PrimitiveMode.LINE_STRIP:
            case ccm.gfx.PrimitiveMode.LINE_LOOP: prim = ccm.gfx.PrimitiveMode.LINE_LIST; break;
            case ccm.gfx.PrimitiveMode.POINT_LIST: prim = ccm.gfx.PrimitiveMode.POINT_LIST; break;
        }
        if (prim === undefined) { return []; }
        const primitives: MeshSplitInfo[] = [new MeshSplitInfo(prim)];
        let primitive = primitives[0];
        // TODO: be more greedy on merging faces
        // but need to handle prefab & scene material migrations
        forEachFace(indices, primitiveMode, (faceIndices) => {
            if (!testFace(primitive, joints, faceIndices, capacity)) {
                primitive = new MeshSplitInfo(prim); primitives.push(primitive);
            }
            addFace(primitive, joints, faceIndices);
        });
        return primitives;
    };
})();

export function getUintArrayCtor(maxElement: number) {
    if (maxElement < (1 << (Uint8Array.BYTES_PER_ELEMENT * 8))) { return Uint8Array; }
    if (maxElement < (1 << (Uint16Array.BYTES_PER_ELEMENT * 8))) { return Uint16Array; }
    return Uint32Array;
}
