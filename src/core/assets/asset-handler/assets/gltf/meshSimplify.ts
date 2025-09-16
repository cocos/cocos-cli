/*
MIT License

Copyright(c) 2017-2020 Mattias Edlund

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
/////////////////////////////////////////////
//
// Mesh Simplification Tutorial
//
// (C) by Sven Forstmann in 2014
//
// License : MIT
// http://opensource.org/licenses/MIT
//
//https://github.com/sp4cerat/Fast-Quadric-Mesh-Simplification
// @ts-nocheck 此方法有很多定义不明，暂时无法完善定义

import { Vec3, Vec2, Vec4, Color, math, assert, view } from 'cc';
import { gfx, Mesh, utils } from 'cc';
import { SimplifyOptions } from '../../meta-schemas/glTF.meta';

const _tempVec2 = new Vec2();
const _tempVec3 = new Vec3();
const _tempVec3_2 = new Vec3();
const _tempVec3_3 = new Vec3();
const _tempVec4 = new Vec4();
const _tempColor = new Color();

const DenomEpilson = 0.00000001;

// 颜色相加
function colorScaleAndAdd(out: Color, colora: Color, colorb: Color, scale: number) {
    out.r = Math.max(colora.r + colorb.r * scale, 255);
    out.g = Math.max(colora.g + colorb.g * scale, 255);
    out.b = Math.max(colora.b + colorb.b * scale, 255);
    out.a = Math.max(colora.a + colorb.a * scale, 255);
}
class SymetricMatrix {
    public m;
    constructor() {
        this.m = new Array(10).fill(0);
    }
    public set(
        m11: number,
        m12: number,
        m13: number,
        m14: number,
        m22: number,
        m23: number,
        m24: number,
        m33: number,
        m34: number,
        m44: number,
    ) {
        this.m[0] = m11;
        this.m[1] = m12;
        this.m[2] = m13;
        this.m[3] = m14;

        this.m[4] = m22;
        this.m[5] = m23;
        this.m[6] = m24;

        this.m[7] = m33;
        this.m[8] = m34;

        this.m[9] = m44;
        return this;
    }

    public makePlane(a: number, b: number, c: number, d: number) {
        return this.set(a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d);
    }

    public det(a11: number, a12: number, a13: number, a21: number, a22: number, a23: number, a31: number, a32: number, a33: number) {
        const det =
            this.m[a11] * this.m[a22] * this.m[a33] +
            this.m[a13] * this.m[a21] * this.m[a32] +
            this.m[a12] * this.m[a23] * this.m[a31] -
            this.m[a13] * this.m[a22] * this.m[a31] -
            this.m[a11] * this.m[a23] * this.m[a32] -
            this.m[a12] * this.m[a21] * this.m[a33];
        return det;
    }

    // produces new Matrix
    public add(n: SymetricMatrix) {
        return new SymetricMatrix().set(
            this.m[0] + n.m[0],
            this.m[1] + n.m[1],
            this.m[2] + n.m[2],
            this.m[3] + n.m[3],

            this.m[4] + n.m[4],
            this.m[5] + n.m[5],
            this.m[6] + n.m[6],

            this.m[7] + n.m[7],
            this.m[8] + n.m[8],

            this.m[9] + n.m[9],
        );
    }

    public addSelf(n: SymetricMatrix) {
        this.m[0] += n.m[0];
        this.m[1] += n.m[1];
        this.m[2] += n.m[2];
        this.m[3] += n.m[3];
        this.m[4] += n.m[4];
        this.m[5] += n.m[5];
        this.m[6] += n.m[6];
        this.m[7] += n.m[7];
        this.m[8] += n.m[8];
        this.m[9] += n.m[9];
    }
}

class Triangle {
    public v: number[];
    public va: number[];
    public err: any[];
    public deleted: boolean;
    public dirty: boolean;
    public n: Vec3;
    constructor() {
        this.v = new Array(3); // indices for array
        this.va = new Array(3); // indices for arra
        this.err = new Array(4); // errors
        this.deleted = false;
        this.dirty = false;
        this.n = new Vec3(); // Normal
    }
}

class Vertex {
    public index: number;
    public p: Vec3;
    // public n: Vec3;
    // public uv: Vec2;
    // public tangents: Vec4;
    public tstart: number;
    public tcount: number;
    public q: SymetricMatrix;
    public border: boolean;
    public uvSteam!: boolean;
    public uvFoldover!: boolean;
    constructor() {
        this.p = new Vec3();
        this.tstart = -1;
        this.tcount = -1;
        this.q = new SymetricMatrix();
        this.border = false;
    }
}

class Ref {
    public tvertex!: number;
    public tid!: number;
}

class BorderVertex {
    public index: number;
    public hash: number;

    public constructor(index: number, hash: number) {
        this.index = index;
        this.hash = hash;
    }
}

/**
 * 设置参数
 */
class SimplificationOptions {
    public preserveSurfaceCurvature = false;
    public preserveBorderEdges = false;
    public preserveUVSeamEdges = false;
    public preserveUVFoldoverEdges = false;
    public enableSmartLink = true;
    public vertexLinkDistance = Number.MIN_VALUE;
    public maxIterationCount = 100;
    public agressiveness = 7.0;
}

/**
 * 网格简化
 */
export class MeshSimplify {
    public simplificationOptions: SimplificationOptions = new SimplificationOptions();
    private _triangles: Triangle[] = []; // Triangle
    private _vertices: Vertex[] = []; // Vertex

    private _vertNormals: Vec3[] | null = null;
    private _vertTangents: Vec4[] | null = null;
    private _vertUV2D: Vec2[] | null = null;
    private _vertUV3D: Vec3[] | null = null;
    private _vertUV4D: Vec4[] | null = null;
    private _vertColors: Color[] | null = null;

    private _vertJoints: Vec4[] | null = null;
    private _vertWeights: Vec4[] | null = null;

    private _refs: Ref[] = []; // Ref
    private _geometricInfo = '';

    private _triangleHashSet1 = new Map<Triangle, boolean>();
    private _triangleHashSet2 = new Map<Triangle, boolean>();

    /**
     * 初始化
     * @param origVertices
     * @param origFaces
     * @param info
     */
    public init(origVertices: Vec3[], origFaces: any[], info: { normals?; uvs?; tangents?; colors?; joints?; weights? }) {
        this._vertices = origVertices.map((p, index) => {
            const vert = new Vertex();
            vert.index = index;
            vert.p = new Vec3(p.x, p.y, p.z);
            return vert;
        });

        if (info.uvs && info.uvs.length > 0) {
            this._vertUV2D = [];
            for (let i = 0; i < info.uvs.length; i += 2) {
                this._vertUV2D.push(new Vec2(info.uvs[i], info.uvs[i + 1]));
            }
        }
        if (info.normals && info.normals.length > 0) {
            this._vertNormals = [];
            for (let i = 0; i < info.normals.length; i += 3) {
                this._vertNormals.push(new Vec3(info.normals[i], info.normals[i + 1], info.normals[i + 2]));
            }
        }

        if (info.tangents && info.tangents.length > 0) {
            this._vertTangents = [];
            for (let i = 0; i < info.tangents.length; i += 4) {
                this._vertTangents.push(new Vec4(info.tangents[i], info.tangents[i + 1], info.tangents[i + 2], info.tangents[i + 3]));
            }
        }

        if (info.colors && info.colors.length > 0) {
            this._vertColors = [];
            for (let i = 0; i < info.colors.length; i += 4) {
                this._vertColors.push(new Color(info.colors[i], info.colors[i + 1], info.colors[i + 2], info.colors[i + 3]));
            }
        }

        if (info.joints && info.joints.length > 0) {
            this._vertJoints = [];
            for (let i = 0; i < info.joints.length; i += 4) {
                this._vertJoints.push(new Vec4(info.joints[i], info.joints[i + 1], info.joints[i + 2], info.joints[i + 3]));
            }
        }

        if (info.weights && info.weights.length > 0) {
            this._vertWeights = [];
            for (let i = 0; i < info.weights.length; i += 4) {
                this._vertWeights.push(new Vec4(info.weights[i], info.weights[i + 1], info.weights[i + 2], info.weights[i + 3]));
            }
        }

        this._triangles = origFaces.map((f) => {
            const tri = new Triangle();
            tri.v[0] = f.a;
            tri.v[1] = f.b;
            tri.v[2] = f.c;

            tri.va[0] = f.a;
            tri.va[1] = f.b;
            tri.va[2] = f.c;
            return tri;
        });
    }

    /**
     * 修改队列长度
     * @param array
     * @param count
     * @returns
     */
    private _resize(array: any[], count: number) {
        if (count < array.length) {
            return array.splice(count);
        }

        if (count > array.length) {
            // in JS, arrays need not be expanded
            // console.log('more');
        }
    }

    /**
     * 移动数据
     * @param refs
     * @param dest
     * @param source
     * @param count
     */
    private _move(refs: Ref[], dest: number, source: number, count: number) {
        for (let i = 0; i < count; i++) {
            // 	refs[dest + i] = refs[source + i];
            refs[dest + i].tvertex = refs[source + i].tvertex;
            refs[dest + i].tid = refs[source + i].tid;
        }
    }

    /**
     * 合并网格
     */
    public compactMesh() {
        //	console.log('compact_mesh');
        let /*int */ dst = 0;
        for (let i = 0; i < this._vertices.length; i++) {
            this._vertices[i].tcount = 0;
        }
        for (let i = 0; i < this._triangles.length; i++) {
            if (!this._triangles[i].deleted) {
                const /*Triangle &*/ t = this._triangles[i];

                for (let j = 0; j < 3; j++) {
                    if (t.va[j] != t.v[j]) {
                        const iDest = t.va[j];
                        const iSrc = t.v[j];
                        Vec3.copy(this._vertices[iDest].p, this._vertices[iSrc].p);
                        if (this._vertWeights != null) {
                            Vec4.copy(this._vertWeights[iDest], this._vertWeights[iSrc]);
                        }
                        if (this._vertJoints != null) {
                            Vec4.copy(this._vertJoints[iDest], this._vertJoints[iSrc]);
                        }
                        t.v[j] = t.va[j];
                    }
                }

                this._triangles[dst++] = t;
                for (let j = 0; j < 3; j++) this._vertices[t.v[j]].tcount = 1;
            }
        }
        this._resize(this._triangles, dst);
        dst = 0;
        for (let i = 0; i < this._vertices.length; i++) {
            if (this._vertices[i].tcount) {
                this._vertices[i].tstart = dst;
                this._vertices[dst].index = dst;
                this._vertices[dst].p = this._vertices[i].p;

                if (this._vertUV2D) {
                    this._vertUV2D[dst] = this._vertUV2D[i];
                }
                if (this._vertNormals) {
                    this._vertNormals[dst] = this._vertNormals[i];
                }
                if (this._vertTangents) {
                    this._vertTangents[dst] = this._vertTangents[i];
                }
                if (this._vertColors) {
                    this._vertColors[dst] = this._vertColors[i];
                }
                if (this._vertJoints) {
                    this._vertJoints[dst] = this._vertJoints[i];
                }
                if (this._vertWeights) {
                    this._vertWeights[dst] = this._vertWeights[i];
                }
                dst++;
            }
        }

        for (let i = 0; i < this._triangles.length; i++) {
            const /*Triangle &*/ t = this._triangles[i];
            for (let j = 0; j < 3; j++) t.v[j] = this._vertices[t.v[j]].tstart;
        }
        //	console.log('%cCompact Mesh', 'background:#f00', this._vertices.length, dst);
        this._resize(this._vertices, dst);
        //	console.log('%cCompact Mesh ok', 'background:#f00', this._vertices.length, dst);
    }

    /**
     * 简化网格
     * @param target_count
     * @param agressiveness
     */
    private _simplifyMesh(target_count: number, agressiveness: number | undefined) {
        if (agressiveness === undefined) agressiveness = this.simplificationOptions.agressiveness;

        // TODO normalize_mesh to max length 1?

        console.time('simplify_mesh');

        let i, il;

        // set all triangles to non deleted
        for (i = 0, il = this._triangles.length; i < il; i++) {
            this._triangles[i].deleted = false;
        }

        // main iteration loop

        let deleted_triangles = 0;
        const deleted0: never[] = [],
            deleted1: any[] = []; // std::vector<int>
        const triangle_count = this._triangles.length;

        for (let iteration = 0; iteration < this.simplificationOptions.maxIterationCount; iteration++) {
            // 	console.log("iteration %d - triangles %d, tris\n", iteration, triangle_count - deleted_triangles, this._triangles.length);

            if (triangle_count - deleted_triangles <= target_count) break;

            // update mesh once in a while
            if (iteration % 5 === 0) {
                this._updateMesh(iteration);
            }

            // clear dirty flag
            for (let j = 0; j < this._triangles.length; j++) {
                this._triangles[j].dirty = false;
            }

            //
            // All triangles with edges below the threshold will be removed
            //
            // The following numbers works well for most models.
            // If it does not, try to adjust the 3 parameters
            //
            //let threshold = 0.000000001 * Math.pow(iteration + 3, agressiveness);
            const threshold = 1e-13 * Math.pow(iteration + 3, agressiveness);
            // remove vertices & mark deleted triangles
            for (i = 0, il = this._triangles.length; i < il; i++) {
                const t = this._triangles[i];
                if (t.err[3] > threshold || t.deleted || t.dirty) continue;

                for (let j = 0; j < 3; j++) {
                    if (t.err[j] < threshold) {
                        const i0 = t.v[j];
                        const v0 = this._vertices[i0];

                        const i1 = t.v[(j + 1) % 3];
                        const v1 = this._vertices[i1];

                        // Border check
                        if (v0.border != v1.border) continue;
                        else if (v0.uvSteam != v1.uvSteam) continue;
                        else if (v0.uvFoldover != v1.uvFoldover) continue;
                        else if (this.simplificationOptions.preserveBorderEdges && v0.border) continue;
                        // If seams should be preserved
                        else if (this.simplificationOptions.preserveUVSeamEdges && v0.uvSteam) continue;
                        // If foldovers should be preserved
                        else if (this.simplificationOptions.preserveUVFoldoverEdges && v0.uvFoldover) continue;

                        // Compute vertex to collapse to
                        const p = new Vec3();
                        this._calculateError(i0, i1, p);
                        // console.log('Compute vertex to collapse to', p);

                        this._resize(deleted0, v0.tcount); // normals temporarily
                        this._resize(deleted1, v1.tcount); // normals temporarily

                        // dont remove if _flipped
                        if (this._flipped(p, i0, i1, v0, v1, deleted0)) continue;
                        if (this._flipped(p, i1, i0, v1, v0, deleted1)) continue;

                        // Calculate the barycentric coordinates within the triangle
                        const i2 = t.v[(j + 2) % 3];
                        const barycentricCoord = new Vec3();
                        this.calculateBarycentricCoords(p, v0.p, v1.p, this._vertices[i2].p, barycentricCoord);

                        // not _flipped, so remove edge
                        v0.p = p;
                        // v0.q = v1.q + v0.q;
                        v0.q.addSelf(v1.q);

                        // Interpolate the vertex attributes
                        let ia0 = t.va[j];
                        const ia1 = t.va[(j + 1) % 3];
                        const ia2 = t.va[(j + 2) % 3];
                        this._interpolateVertexAttributes(ia0, ia0, ia1, ia2, barycentricCoord);

                        if (this._vertices[i0].uvSteam) {
                            ia0 = -1;
                        }

                        const tstart = this._refs.length;

                        // CONTINUE
                        deleted_triangles = this._updateTriangles(i0, ia0, v0, deleted0, deleted_triangles);
                        // console.log('deleted triangle v0', deleted_triangles);
                        deleted_triangles = this._updateTriangles(i0, ia0, v1, deleted1, deleted_triangles);
                        // console.log('deleted triangle v1', deleted_triangles);

                        const tcount = this._refs.length - tstart;

                        if (tcount <= v0.tcount) {
                            // console.log('save ram?');
                            if (tcount) this._move(this._refs, v0.tstart, tstart, tcount);
                        }
                        // append
                        else v0.tstart = tstart;

                        v0.tcount = tcount;
                        break;
                    }
                } // end for j

                // done?
                if (triangle_count - deleted_triangles <= target_count) break;
            }
        } // end iteration

        // clean up mesh
        this.compactMesh();

        // ready
        console.timeEnd('simplify_mesh');

        // int timeEnd=timeGetTime();
        // printf("%s - %d/%d %d%% removed in %d ms\n",__FUNCTION__,
        // 	triangle_count-deleted_triangles,
        // 	triangle_count,deleted_triangles*100/triangle_count,
        // 	timeEnd-timeStart);
    }
    private /*bool*/ _flipped(
        /* vec3f */ p: math.IVec3Like,
        /*int*/ i0: number,
        /*int*/ i1: number,
        /*Vertex*/ v0: Vertex,
        /*Vertex*/ v1: Vertex, // not needed
        /*std::vector<int>*/ deleted: any[],
    ) {
        // let bordercount = 0;
        for (let k = 0; k < v0.tcount; k++) {
            // Triangle &
            const t = this._triangles[this._refs[v0.tstart + k].tid];
            if (t.deleted) continue;

            const s = this._refs[v0.tstart + k].tvertex;
            const id1 = t.v[(s + 1) % 3];
            const id2 = t.v[(s + 2) % 3];

            if (id1 == i1 || id2 == i1) {
                // delete ?
                // bordercount++;
                deleted[k] = true;
                continue;
            }

            /* vec3f */
            Vec3.subtract(_tempVec3, this._vertices[id1].p, p);
            _tempVec3.normalize();
            Vec3.subtract(_tempVec3_2, this._vertices[id2].p, p);
            _tempVec3_2.normalize();
            if (Math.abs(Vec3.dot(_tempVec3, _tempVec3_2)) > 0.999) return true;
            /*vec3f  n;*/
            Vec3.cross(_tempVec3_3, _tempVec3, _tempVec3_2);
            _tempVec3_3.normalize();
            deleted[k] = false;
            if (Vec3.dot(_tempVec3_3, t.n) < 0.2) return true;
        }
        return false;
    }

    // Update triangle connections and edge error after a edge is collapsed

    /**
     * 更新三角形信息
     * @param i0
     * @param ia0
     * @param v
     * @param deleted
     * @param deleted_triangles
     * @returns
     */
    private _updateTriangles(
        /*int*/ i0: number,
        ia0: number,
        /*Vertex &*/ v: Vertex,
        /*std::vector<int> & */ deleted: any[],
        /*int &*/ deleted_triangles: number,
    ) {
        // console.log('_updateTriangles');
        // vec3f p;
        const p = new Vec3();
        for (let k = 0; k < v.tcount; k++) {
            const /*Ref &*/ r = this._refs[v.tstart + k];
            const /*Triangle &*/ t = this._triangles[r.tid];

            if (t.deleted) continue;
            if (deleted[k]) {
                t.deleted = true;
                deleted_triangles++;
                continue;
            }
            t.v[r.tvertex] = i0;

            if (ia0 != -1) {
                t.va[r.tvertex] = ia0;
            }

            t.dirty = true;

            t.err[0] = this._calculateError(t.v[0], t.v[1], p);
            t.err[1] = this._calculateError(t.v[1], t.v[2], p);
            t.err[2] = this._calculateError(t.v[2], t.v[0], p);
            t.err[3] = Math.min(t.err[0], t.err[1], t.err[2]);
            this._refs.push(r);
        }
        return deleted_triangles;
    }

    // compact triangles, compute edge error and build reference list
    private _updateMesh(iteration: number) /*int*/ {
        // console.log('_updateMesh', iteration, this._triangles.length);
        if (iteration > 0) {
            // compact triangles
            let dst = 0;
            for (let i = 0; i < this._triangles.length; i++) {
                const target = this._triangles[i];
                if (!target.deleted) {
                    this._triangles[dst++] = target;
                }
            }

            // console.log('not deleted dst', this._triangles.length, dst);
            this._triangles.splice(dst);
        }

        this._updateReferences();

        // Init Quadrics by Plane & Edge Errors
        //
        // required at the beginning ( iteration == 0 )
        // recomputing during the simplification is not required,
        // but mostly improves the result for closed meshes
        //

        // Identify boundary : vertices[].border=0,1
        if (iteration == 0) {
            // std::vector<int> vcount,vids;
            let vcount, vids;
            let borderVertexCount = 0;
            let borderMinX = 1.7976931348623157e308;
            let borderMaxX = -1.7976931348623157e308;
            for (let i = 0; i < this._vertices.length; i++) {
                this._vertices[i].border = false;
                this._vertices[i].uvSteam = false;
                this._vertices[i].uvFoldover = false;
            }

            for (let i = 0; i < this._vertices.length; i++) {
                const /*Vertex &*/ v = this._vertices[i];
                // vcount.clear();
                // vids.clear();
                vcount = [];
                vids = [];

                for (let j = 0; j < v.tcount; j++) {
                    const k = this._refs[v.tstart + j].tid;
                    const /*Triangle &*/ t = this._triangles[k];

                    for (let k = 0; k < 3; k++) {
                        let ofs = 0,
                            id = t.v[k];
                        while (ofs < vcount.length) {
                            if (vids[ofs] == id) break;
                            ofs++;
                        }

                        if (ofs == vcount.length) {
                            vcount.push(1);
                            vids.push(id);
                        } else {
                            vcount[ofs]++;
                        }
                    }
                }
                for (let j = 0; j < vcount.length; j++) {
                    if (vcount[j] == 1) {
                        this._vertices[vids[j]].border = true;
                        borderVertexCount++;
                        if (this.simplificationOptions.enableSmartLink) {
                            const id = vids[j];
                            if (this._vertices[id].p.x < borderMinX) {
                                borderMinX = this._vertices[id].p.x;
                            }
                            if (this._vertices[id].p.x > borderMaxX) {
                                borderMaxX = this._vertices[id].p.x;
                            }
                        }
                    }
                }
            }

            if (this.simplificationOptions.enableSmartLink) {
                // First find all border vertices
                const borderVertices: BorderVertex[] = new Array(borderVertexCount);
                let borderIndexCount = 0;
                const borderAreaWidth = borderMaxX - borderMinX;
                for (let i = 0; i < this._vertices.length; i++) {
                    if (this._vertices[i].border) {
                        const vertexHash = (((this._vertices[i].p.x - borderMinX) / borderAreaWidth) * 2.0 - 1.0) * 2147483647;
                        borderVertices[borderIndexCount] = new BorderVertex(i, vertexHash);
                        ++borderIndexCount;
                    }
                }

                // Sort the border vertices by hash
                borderVertices.sort((x: BorderVertex, y: BorderVertex) => {
                    // if (x.hash > y.hash) {
                    // 	return 1
                    // } else if (x.hash < y.hash) {
                    // 	return -1
                    // }
                    return x.hash - y.hash;
                });

                // Calculate the maximum hash distance based on the maximum vertex link distance
                const vertexLinkDistanceSqr = this.simplificationOptions.vertexLinkDistance * this.simplificationOptions.vertexLinkDistance;
                const vertexLinkDistance = Math.sqrt(vertexLinkDistanceSqr);
                const hashMaxDistance = Math.max((vertexLinkDistance / borderAreaWidth) * 2147483647, 1);

                // Then find identical border vertices and bind them together as one
                for (let i = 0; i < borderIndexCount; i++) {
                    const myIndex = borderVertices[i].index;
                    if (myIndex == -1) continue;

                    const myPoint = this._vertices[myIndex].p;
                    for (let j = i + 1; j < borderIndexCount; j++) {
                        const otherIndex = borderVertices[j].index;
                        if (otherIndex == -1) continue;
                        else if (borderVertices[j].hash - borderVertices[i].hash > hashMaxDistance)
                            // There is no point to continue beyond this point
                            break;

                        const otherPoint = this._vertices[otherIndex].p;
                        const sqrX = (myPoint.x - otherPoint.x) * (myPoint.x - otherPoint.x);
                        const sqrY = (myPoint.y - otherPoint.y) * (myPoint.y - otherPoint.y);
                        const sqrZ = (myPoint.z - otherPoint.z) * (myPoint.z - otherPoint.z);
                        const sqrMagnitude = sqrX + sqrY + sqrZ;

                        if (sqrMagnitude <= vertexLinkDistanceSqr) {
                            borderVertices[j].index = -1; // NOTE: This makes sure that the "other" vertex is not processed again
                            this._vertices[myIndex].border = false;
                            this._vertices[otherIndex].border = false;
                            // AreUVsTheSame
                            if (this._vertUV2D![myIndex].equals(this._vertUV2D![otherIndex])) {
                                this._vertices[myIndex].uvFoldover = true;
                                this._vertices[otherIndex].uvFoldover = true;
                            } else {
                                this._vertices[myIndex].uvSteam = true;
                                this._vertices[otherIndex].uvSteam = true;
                            }

                            const otherTriangleCount = this._vertices[otherIndex].tcount;
                            const otherTriangleStart = this._vertices[otherIndex].tstart;
                            for (let k = 0; k < otherTriangleCount; k++) {
                                const r = this._refs[otherTriangleStart + k];
                                this._triangles[r.tid].v[r.tvertex] = myIndex;
                            }
                        }
                    }
                }

                // Update the references again
                this._updateReferences();
            }

            for (let i = 0; i < this._vertices.length; i++) {
                // may not need to do this.
                this._vertices[i].q = new SymetricMatrix();
            }

            const p1p0 = new Vec3();
            const p2p0 = new Vec3();

            const p: Vec3[] = new Array(3);
            const tmp = new SymetricMatrix();
            for (let i = 0; i < this._triangles.length; i++) {
                const /*Triangle &*/ t = this._triangles[i];
                const n = new Vec3();
                for (let j = 0; j < 3; j++) {
                    p[j] = this._vertices[t.v[j]].p;
                }

                Vec3.subtract(p1p0, p[1], p[0]);
                Vec3.subtract(p2p0, p[2], p[0]);
                Vec3.cross(n, p1p0, p2p0);
                Vec3.normalize(n, n);
                t.n = n;
                tmp.makePlane(n.x, n.y, n.z, -n.dot(p[0]));

                for (let j = 0; j < 3; j++) {
                    this._vertices[t.v[j]].q.addSelf(tmp);
                }

                // vertices[t.v[j]].q =
                // vertices[t.v[j]].q.add(SymetricMatrix(n.x,n.y,n.z,-n.dot(p[0])));
            }

            for (let i = 0; i < this._triangles.length; i++) {
                // Calc Edge Error
                const /*Triangle &*/ t = this._triangles[i];
                // vec3f p;
                const p = new Vec3();

                for (let j = 0; j < 3; j++) {
                    t.err[j] = this._calculateError(t.v[j], t.v[(j + 1) % 3], p);
                }

                t.err[3] = Math.min(t.err[0], t.err[1], t.err[2]);
            }
        }
    }

    // Finally compact mesh before exiting

    // Error between vertex and Quadric

    private _vertexError(/*SymetricMatrix*/ q: SymetricMatrix, /*double*/ x: number, y: number, z: number) {
        return (
            q.m[0] * x * x +
            2 * q.m[1] * x * y +
            2 * q.m[2] * x * z +
            2 * q.m[3] * x +
            q.m[4] * y * y +
            2 * q.m[5] * y * z +
            2 * q.m[6] * y +
            q.m[7] * z * z +
            2 * q.m[8] * z +
            q.m[9]
        );
    }

    // Error for one edge
    // if DECIMATE is defined vertex positions are NOT interpolated
    // Luebke Survey of Polygonal Simplification Algorithms:  "vertices of a model simplified by the decimation algorithm are a subset of the original model’s vertices."
    // http://www.cs.virginia.edu/~luebke/publications/pdf/cg+a.2001.pdf

    private _calculateError(id_v1: number, id_v2: number, p_result: Vec3) {
        // compute interpolated vertex
        const vertex1 = this._vertices[id_v1];
        const vertex2 = this._vertices[id_v2];

        const q = vertex1.q.add(vertex2.q);
        const border = vertex1.border && vertex2.border;
        let error = 0;
        const det = q.det(0, 1, 2, 1, 4, 5, 2, 5, 7);

        if (det !== 0 && !border) {
            // q_delta is invertible
            p_result.x = (-1 / det) * q.det(1, 2, 3, 4, 5, 6, 5, 7, 8); // vx = A41/det(q_delta)
            p_result.y = (1 / det) * q.det(0, 2, 3, 1, 5, 6, 2, 7, 8); // vy = A42/det(q_delta)
            p_result.z = (-1 / det) * q.det(0, 1, 3, 1, 4, 6, 2, 5, 8); // vz = A43/det(q_delta)

            let curvatureError = 0;
            if (this.simplificationOptions.preserveSurfaceCurvature) {
                curvatureError = this._curvatureError(vertex1, vertex2);
            }

            error = this._vertexError(q, p_result.x, p_result.y, p_result.z) + curvatureError;
        } else {
            // det = 0 -> try to find best result
            const /*vec3f*/ p1 = vertex1.p;
            const /*vec3f*/ p2 = vertex2.p;
            const /*vec3f*/ p3 = new Vec3();
            Vec3.add(p3, p1, p2);
            p3.multiplyScalar(0.5);
            const error1 = this._vertexError(q, p1.x, p1.y, p1.z);
            const error2 = this._vertexError(q, p2.x, p2.y, p2.z);
            const error3 = this._vertexError(q, p3.x, p3.y, p3.z);
            error = Math.min(error1, error2, error3);
            if (error1 === error) Vec3.copy(p_result, p1);
            if (error2 === error) Vec3.copy(p_result, p2);
            if (error3 === error) Vec3.copy(p_result, p3);
        }

        return error;
    }

    private _updateReferences() {
        // Init Reference ID list
        for (let i = 0; i < this._vertices.length; i++) {
            this._vertices[i].tstart = 0;
            this._vertices[i].tcount = 0;
        }
        for (let i = 0; i < this._triangles.length; i++) {
            /*Triangle &*/
            const t = this._triangles[i];
            for (let j = 0; j < 3; j++) this._vertices[t.v[j]].tcount++;
        }
        let tstart = 0;
        for (let i = 0; i < this._vertices.length; i++) {
            const /*Vertex &*/ v = this._vertices[i];
            v.tstart = tstart;
            tstart += v.tcount;
            v.tcount = 0;
        }

        // Write References
        // _resize(refs, triangles.length * 3)
        // console.log('pre ref', this._refs.length, this._triangles.length * 3);
        for (let i = this._refs.length; i < this._triangles.length * 3; i++) {
            this._refs[i] = new Ref();
        }

        for (let i = 0; i < this._triangles.length; i++) {
            /*Triangle &*/
            const t = this._triangles[i];
            for (let j = 0; j < 3; j++) {
                /*Vertex &*/
                const v = this._vertices[t.v[j]];
                this._refs[v.tstart + v.tcount].tid = i;
                this._refs[v.tstart + v.tcount].tvertex = j;
                v.tcount++;
            }
        }
    }

    private _curvatureError(vert0: Vertex, vert1: Vertex) {
        Vec3.subtract(_tempVec3, vert0.p, vert1.p);
        const diffVector = _tempVec3.length();

        const trianglesWithViOrVjOrBoth = this._triangleHashSet1;
        trianglesWithViOrVjOrBoth.clear();
        this._getTrianglesContainingVertex(vert0, trianglesWithViOrVjOrBoth);
        this._getTrianglesContainingVertex(vert1, trianglesWithViOrVjOrBoth);

        const trianglesWithViAndVjBoth = this._triangleHashSet2;
        trianglesWithViAndVjBoth.clear();
        this._getTrianglesContainingBothVertices(vert0, vert1, trianglesWithViAndVjBoth);

        let maxDotOuter = 0;
        trianglesWithViOrVjOrBoth.forEach((index, triangleWithViOrVjOrBoth) => {
            let maxDotInner = 0;
            const normVecTriangleWithViOrVjOrBoth: Vec3 = triangleWithViOrVjOrBoth.n.clone();
            trianglesWithViAndVjBoth.forEach((index, triangleWithViAndVjBoth) => {
                const normVecTriangleWithViAndVjBoth: Vec3 = triangleWithViAndVjBoth.n.clone();
                const dot = Vec3.dot(normVecTriangleWithViOrVjOrBoth, normVecTriangleWithViAndVjBoth);

                if (dot > maxDotInner) maxDotInner = dot;
            });
            if (maxDotInner > maxDotOuter) maxDotOuter = maxDotInner;
        });

        return diffVector * maxDotOuter;
    }

    private _getTrianglesContainingVertex(vert: Vertex, tris: Map<Triangle, boolean>) {
        const trianglesCount = vert.tcount;
        const startIndex = vert.tstart;

        for (let a = startIndex; a < startIndex + trianglesCount; a++) {
            tris.set(this._triangles[this._refs[a].tid], true);
        }
    }
    private _getTrianglesContainingBothVertices(vert0: Vertex, vert1: Vertex, tris: Map<Triangle, boolean>) {
        const triangleCount = vert0.tcount;
        const startIndex = vert0.tstart;

        for (let refIndex = startIndex; refIndex < startIndex + triangleCount; refIndex++) {
            const tid = this._refs[refIndex].tid;
            const tri: Triangle = this._triangles[tid];

            if (
                this._vertices[tri.v[0]].index == vert1.index ||
                this._vertices[tri.v[1]].index == vert1.index ||
                this._vertices[tri.v[2]].index == vert1.index
            ) {
                tris.set(tri, true);
            }
        }
    }

    public simplifyMesh(target_count: number, agressiveness = 7) {
        try {
            target_count = Math.round(target_count);
            const geometry = JSON.parse(this._geometricInfo);
            this.init(geometry.vertices, geometry.faces, geometry);

            console.time('simplify');
            this._simplifyMesh(target_count, agressiveness);
            console.timeEnd('simplify');

            //	console.log('old vertices ' + geometry.vertices.length, 'old faces ' + geometry.faces.length);
            console.log('new vertices ' + this._vertices.length, 'old faces ' + this._triangles.length);

            // TODO convert to buffer geometry.
            const newGeo: { positions; indices; normals?: number[]; uvs?; tangents?; colors?; attrs } = {
                positions: [],
                indices: [],
                attrs: {},
            };

            const newLength = this._vertices.length;
            for (let i = 0; i < this._vertices.length; i++) {
                const v = this._vertices[i];
                newGeo.positions.push(v.p.x);
                newGeo.positions.push(v.p.y);
                newGeo.positions.push(v.p.z);
            }

            if (this._vertUV2D) {
                this._resize(this._vertUV2D, newLength);
                newGeo.uvs = [];
                for (let i = 0; i < this._vertUV2D.length; i++) {
                    const v = this._vertUV2D[i];
                    newGeo.uvs.push(v.x);
                    newGeo.uvs.push(v.y);
                }
            }

            if (this._vertNormals) {
                this._resize(this._vertNormals, newLength);
                newGeo.normals = [];
                for (let i = 0; i < this._vertNormals.length; i++) {
                    const v = this._vertNormals[i];
                    newGeo.normals.push(v.x);
                    newGeo.normals.push(v.y);
                    newGeo.normals.push(v.z);
                }
            }

            if (this._vertTangents) {
                this._resize(this._vertTangents, newLength);
                newGeo.tangents = [];
                for (let i = 0; i < this._vertTangents.length; i++) {
                    const v = this._vertTangents[i];
                    newGeo.tangents.push(v.x);
                    newGeo.tangents.push(v.y);
                    newGeo.tangents.push(v.z);
                    newGeo.tangents.push(v.w);
                }
            }

            if (this._vertColors) {
                this._resize(this._vertColors, newLength);
                newGeo.colors = [];
                for (let i = 0; i < this._vertColors.length; i++) {
                    const v = this._vertColors[i];
                    newGeo.colors.push(v.r);
                    newGeo.colors.push(v.g);
                    newGeo.colors.push(v.b);
                    newGeo.colors.push(v.a);
                }
            }

            if (this._vertJoints) {
                this._resize(this._vertJoints, newLength);
                const list: number[] = (newGeo.attrs['joints'] = []);
                for (let i = 0; i < this._vertJoints.length; i++) {
                    const v = this._vertJoints[i];
                    list.push(v.x);
                    list.push(v.y);
                    list.push(v.z);
                    list.push(v.w);
                }
            }

            if (this._vertWeights) {
                this._resize(this._vertWeights, newLength);
                const list: number[] = (newGeo.attrs['weights'] = []);
                for (let i = 0; i < this._vertWeights.length; i++) {
                    const v = this._vertWeights[i];
                    list.push(v.x);
                    list.push(v.y);
                    list.push(v.z);
                    list.push(v.w);
                }
            }

            for (let i = 0; i < this._triangles.length; i++) {
                const tri = this._triangles[i];
                newGeo.indices.push(tri.v[0]);
                newGeo.indices.push(tri.v[1]);
                newGeo.indices.push(tri.v[2]);
            }
            return newGeo;
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * 构建geometry信息
     * @param geometry
     */
    public buildGeometric(geometry: {
        vertices?: Vec3[];
        faces?: any[];
        positions: string | any[];
        normals;
        uvs;
        tangents;
        indices?: ArrayLike<number>;
        weights?;
        joints?;
        colors?;
    }) {
        //@ts-ignore
        //	mergeVertices(geometry);

        const faces: { a: number; b: number; c: number }[] = [];
        if (geometry.indices) {
            for (let i = 0; i < geometry.indices.length; i += 3) {
                faces.push({
                    a: geometry.indices[i],
                    b: geometry.indices[i + 1],
                    c: geometry.indices[i + 2],
                });
            }
        } else {
            const nVertices = geometry.positions.length / 3;
            for (let i = 0; i < nVertices; i += 3) {
                faces.push({
                    a: 3 * i + 0,
                    b: 3 * i + 1,
                    c: 3 * i + 2,
                });
            }
        }
        geometry.faces = faces;

        const vertices = [];
        for (let i = 0; i < geometry.positions.length; i += 3) {
            vertices.push(new Vec3(geometry.positions[i], geometry.positions[i + 1], geometry.positions[i + 2]));
        }
        geometry.vertices = vertices;

        for (const key in geometry) {
            if (geometry[key]) {
                if (!(geometry[key] instanceof Array)) {
                    geometry[key] = Array.from(geometry[key]);
                }
            } else {
                delete geometry[key];
            }
        }

        this._geometricInfo = JSON.stringify(geometry);
        // this.init(geometry.vertices, geometry.faces, geometry);
        // console.log('old vertices ' + geometry.vertices.length, 'old faces ' + geometry.faces.length);

        // simplify!
        // simplify_mesh(geometry.faces.length * 0.5 | 0, 7);
        // simplify_mesh(geometry.faces.length - 2, 4);
    }

    /**
     * 计算合并的uv信息
     * @param point
     * @param a
     * @param b
     * @param c
     * @param result
     */
    public calculateBarycentricCoords(point: Vec3, a: Vec3, b: Vec3, c: Vec3, result: Vec3) {
        const v0 = new Vec3();
        const v1 = new Vec3();
        const v2 = new Vec3();
        Vec3.subtract(v0, b, a);
        Vec3.subtract(v1, c, a);
        Vec3.subtract(v2, point, a);
        const d00 = Vec3.dot(v0, v0);
        const d01 = Vec3.dot(v0, v1);
        const d11 = Vec3.dot(v1, v1);
        const d20 = Vec3.dot(v2, v0);
        const d21 = Vec3.dot(v2, v1);
        let denom = d00 * d11 - d01 * d01;

        // Make sure the denominator is not too small to cause math problems
        if (Math.abs(denom) < DenomEpilson) {
            denom = DenomEpilson;
        }

        const v = (d11 * d20 - d01 * d21) / denom;
        const w = (d00 * d21 - d01 * d20) / denom;
        const u = 1.0 - v - w;
        result.set(u, v, w);
    }

    private _interpolateVertexAttributes(dst: number, i0: number, i1: number, i2: number, barycentricCoord: Vec3) {
        if (this._vertNormals) {
            _tempVec3.set(0, 0, 0);
            Vec3.scaleAndAdd(_tempVec3, _tempVec3, this._vertNormals[i0], barycentricCoord.x);
            Vec3.scaleAndAdd(_tempVec3, _tempVec3, this._vertNormals[i1], barycentricCoord.y);
            Vec3.scaleAndAdd(_tempVec3, _tempVec3, this._vertNormals[i2], barycentricCoord.z);
            Vec3.normalize(_tempVec3, _tempVec3);
            Vec3.copy(this._vertNormals[dst], _tempVec3);
        }

        if (this._vertUV2D) {
            _tempVec2.set(0, 0);
            Vec2.scaleAndAdd(_tempVec2, _tempVec2, this._vertUV2D[i0], barycentricCoord.x);
            Vec2.scaleAndAdd(_tempVec2, _tempVec2, this._vertUV2D[i1], barycentricCoord.y);
            Vec2.scaleAndAdd(_tempVec2, _tempVec2, this._vertUV2D[i2], barycentricCoord.z);
            Vec2.copy(this._vertUV2D[dst], _tempVec2);
        }

        if (this._vertTangents) {
            _tempVec4.set(0, 0, 0, 0);
            Vec4.scaleAndAdd(_tempVec4, _tempVec4, this._vertTangents[i0], barycentricCoord.x);
            Vec4.scaleAndAdd(_tempVec4, _tempVec4, this._vertTangents[i1], barycentricCoord.y);
            Vec4.scaleAndAdd(_tempVec4, _tempVec4, this._vertTangents[i2], barycentricCoord.z);
            this._normalizeTangent(this._vertTangents[dst], _tempVec4);
        }

        if (this._vertColors) {
            _tempColor.set(0, 0, 0, 0);
            colorScaleAndAdd(_tempColor, _tempColor, this._vertColors[i0], barycentricCoord.x);
            colorScaleAndAdd(_tempColor, _tempColor, this._vertColors[i1], barycentricCoord.y);
            colorScaleAndAdd(_tempColor, _tempColor, this._vertColors[i2], barycentricCoord.z);
            this._vertColors[dst].set(_tempColor.r, _tempColor.g, _tempColor.b, _tempColor.a);
        }
    }

    private _normalizeTangent(out: Vec4, tangent: Vec4) {
        const tangentVec = new Vec3(tangent.x, tangent.y, tangent.z);
        tangentVec.normalize();
        out.set(tangentVec.x, tangentVec.y, tangentVec.z, tangent.w);
    }
}

function appendUint8Array(a: Uint8Array, b: Uint8Array) {
    const c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

export function getDefaultSimplifyOptions() {
    return {
        targetRatio: 1,
        enableSmartLink: true,
        agressiveness: 7,
        maxIterationCount: 100,
    };
}

//simplify the mesh return a new mesh， only support indexed triangle mesh
export function simplifyMesh(mesh: Mesh, options?: SimplifyOptions) {
    for (let i = 0; i < mesh.struct.primitives.length; i++) {
        const primitive = mesh.struct.primitives[i];
        if (primitive.primitiveMode !== gfx.PrimitiveMode.TRIANGLE_LIST || primitive.indexView === undefined) {
            //TODO: support other primitive mode
            console.warn('SimplifyMesh current only support indexed triangle mesh, opreation is skipped');
            return mesh;
        }
    }
    const defaultOptions = getDefaultSimplifyOptions();
    options = Object.assign(defaultOptions, options || {});
    let byteOffset = 0,
        j = 0;
    const vertexBundles = new Array<Mesh.IVertexBundle>();
    const primitives = new Array<Mesh.ISubMesh>();
    let data = new Uint8Array(0); //initlize out mesh data with empty data
    //simplify each submesh of the mesh
    for (let i = 0; i < mesh.struct.vertexBundles.length; i++) {
        const indices = mesh.readIndices(i);
        const vertexCount = mesh.struct.vertexBundles[i].view.count;
        const triangleCount = indices ? indices.length / 3 : vertexCount / 3;
        if (triangleCount > 0) {
            const uvs = mesh.readAttribute(i, gfx.AttributeName.ATTR_TEX_COORD);
            const tangents = mesh.readAttribute(i, gfx.AttributeName.ATTR_TANGENT);
            const normals = mesh.readAttribute(i, gfx.AttributeName.ATTR_NORMAL);
            const weights = mesh.readAttribute(i, gfx.AttributeName.ATTR_WEIGHTS);
            const joints = mesh.readAttribute(i, gfx.AttributeName.ATTR_JOINTS);
            const colors = mesh.readAttribute(i, gfx.AttributeName.ATTR_COLOR);
            const positions = mesh.readAttribute(i, gfx.AttributeName.ATTR_POSITION);

            const simplify = new MeshSimplify();
            simplify.buildGeometric({ positions, normals, uvs, indices: indices ?? undefined, tangents, weights, joints, colors });
            simplify.simplificationOptions.agressiveness = options.agressiveness;
            simplify.simplificationOptions.enableSmartLink = options.enableSmartLink;
            const result = simplify.simplifyMesh(options.targetRatio * triangleCount);
            const gInfo = { ...result, customAttributes: [], primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST };
            if (gInfo.attrs) {
                const attrs = gInfo.attrs;
                delete gInfo.attrs;
                for (const key in attrs) {
                    if (key == 'joints') {
                        const info = {
                            attr: new gfx.Attribute(gfx.AttributeName.ATTR_JOINTS, gfx.Format.RGBA16UI),
                            values: attrs[key],
                        };
                        gInfo.customAttributes.push(info);
                    } else if (key == 'weights') {
                        const info = {
                            attr: new gfx.Attribute(gfx.AttributeName.ATTR_WEIGHTS, gfx.Format.RGBA32F),
                            values: attrs[key],
                        };
                        gInfo.customAttributes.push(info);
                    }
                }
            }
            const subMesh = new Mesh();
            utils.createMesh(gInfo, subMesh, { calculateBounds: true });
            // append submesh data to out mesh data
            assert(subMesh.struct.vertexBundles.length == 1);
            const vertexBundle = subMesh.struct.vertexBundles[0];
            data = appendUint8Array(
                data,
                subMesh.data.slice(vertexBundle.view.offset, vertexBundle.view.offset + vertexBundle.view.length),
            );
            vertexBundle.view.offset = byteOffset;
            vertexBundles.push(vertexBundle);
            byteOffset += vertexBundle.view.length;
            let primitive: Mesh.ISubMesh;
            if (subMesh.struct.primitives !== undefined) {
                assert(subMesh.struct.primitives.length == 1);
                primitive = subMesh.struct.primitives[0];
                assert(primitive.indexView);
                data = appendUint8Array(
                    data,
                    subMesh.data.slice(primitive.indexView.offset, primitive.indexView.offset + primitive.indexView.length),
                );
                primitive.indexView.offset = byteOffset;
                primitive.jointMapIndex = subMesh.struct.primitives[0].jointMapIndex;
                primitives.push(primitive);
                byteOffset += primitive.indexView.length;
                primitives[j].vertexBundelIndices = [j];
                j += 1;
            }
        }
    }
    const meshCreateInfo: Mesh.ICreateInfo = {
        struct: {
            vertexBundles: vertexBundles,
            primitives: primitives,
            minPosition: mesh.struct.minPosition,
            maxPosition: mesh.struct.maxPosition,
        },
        data: data,
    };
    const out = new Mesh();
    out.reset(meshCreateInfo);
    out.hash;
    return out;
}
