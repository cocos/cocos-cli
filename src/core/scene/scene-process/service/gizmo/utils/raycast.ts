'use strict';

import { geometry, gfx, Layers, Mat4, Node, renderer, Vec2, Vec3 } from 'cc';
import intersect from './geom-utils/intersect';

function getEditorCamera(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Camera?.getCamera?.()?.camera;
    } catch (e) {
        return null;
    }
}

type IBArray = Uint8Array | Uint16Array | Uint32Array;

type ray = geometry.Ray;
const ray = geometry.Ray;
const triangle = geometry.Triangle;

const testHitPoint = new Vec3();
const hitPoint = new Vec3();
const worldM4 = new Mat4();
const inverseM4 = new Mat4();

export interface IRaycastResult {
    node: Node;
    distance: number;
    hitPoint: Vec3;
}

class RecyclePool<T = any> {
    private _fn: () => T;
    private _count = 0;
    private _data: T[];

    constructor(fn: () => T, size: number) {
        this._fn = fn;
        this._data = new Array(size);
        for (let i = 0; i < size; ++i) {
            this._data[i] = fn();
        }
    }

    get length() {
        return this._count;
    }

    get data() {
        return this._data;
    }

    public reset() {
        this._count = 0;
    }

    public resize(size: number) {
        if (size > this._data.length) {
            for (let i = this._data.length; i < size; ++i) {
                this._data[i] = this._fn();
            }
        }
    }

    public add() {
        if (this._count >= this._data.length) {
            this.resize(this._data.length * 2);
        }
        return this._data[this._count++];
    }

    public removeAt(idx: number) {
        if (idx >= this._count) {
            return;
        }
        const last = this._count - 1;
        const tmp = this._data[idx];
        this._data[idx] = this._data[last];
        this._data[last] = tmp;
        this._count -= 1;
    }
}

const modelRay = ray.create();
const v3 = new Vec3();
const m4 = new Mat4();
let narrowDis = Infinity;
const tri = triangle.create();
const tempVec3_a = new Vec3();
const tempVec3_b = new Vec3();
const defaultNode = new Node();
const pool = new RecyclePool<IRaycastResult>(() => {
    return { node: defaultNode, distance: Infinity, hitPoint: new Vec3() };
}, 8);
const resultModels: IRaycastResult[] = [];
const resultSingleModel: IRaycastResult[] = [];
const aabbUI = new geometry.AABB();
const poolUI = new RecyclePool<IRaycastResult>(() => {
    return { node: defaultNode, distance: Infinity, hitPoint: new Vec3() };
}, 8);
const resultCanvas: IRaycastResult[] = [];
const resultAll: IRaycastResult[] = [];

const narrowphase = (vb: Float32Array, ib: IBArray | undefined, pm: gfx.PrimitiveMode, sides: boolean, distance = Infinity, hitPos: Vec3) => {
    narrowDis = distance;
    if (!ib) {
        const len = vb.length / 3;
        ib = new Uint32Array([...Array(len).keys()]);
    }

    if (pm === gfx.PrimitiveMode.TRIANGLE_LIST) {
        const cnt = ib.length;
        for (let j = 0; j < cnt; j += 3) {
            const i0 = ib[j] * 3;
            const i1 = ib[j + 1] * 3;
            const i2 = ib[j + 2] * 3;
            Vec3.set(tri.a, vb[i0], vb[i0 + 1], vb[i0 + 2]);
            Vec3.set(tri.b, vb[i1], vb[i1 + 1], vb[i1 + 2]);
            Vec3.set(tri.c, vb[i2], vb[i2 + 1], vb[i2 + 2]);
            const dist = intersect.ray_triangle(modelRay, tri, sides, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    } else if (pm === gfx.PrimitiveMode.TRIANGLE_STRIP) {
        const cnt = ib.length - 2;
        let rev = 0;
        for (let j = 0; j < cnt; j += 1) {
            const i0 = ib[j - rev] * 3;
            const i1 = ib[j + rev + 1] * 3;
            const i2 = ib[j + 2] * 3;
            Vec3.set(tri.a, vb[i0], vb[i0 + 1], vb[i0 + 2]);
            Vec3.set(tri.b, vb[i1], vb[i1 + 1], vb[i1 + 2]);
            Vec3.set(tri.c, vb[i2], vb[i2 + 1], vb[i2 + 2]);
            rev = ~rev;
            const dist = intersect.ray_triangle(modelRay, tri, sides, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    } else if (pm === gfx.PrimitiveMode.TRIANGLE_FAN) {
        const cnt = ib.length - 1;
        const i0 = ib[0] * 3;
        Vec3.set(tri.a, vb[i0], vb[i0 + 1], vb[i0 + 2]);
        for (let j = 1; j < cnt; j += 1) {
            const i1 = ib[j] * 3;
            const i2 = ib[j + 1] * 3;
            Vec3.set(tri.b, vb[i1], vb[i1 + 1], vb[i1 + 2]);
            Vec3.set(tri.c, vb[i2], vb[i2 + 1], vb[i2 + 2]);
            const dist = intersect.ray_triangle(modelRay, tri, sides, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    } else if (pm === gfx.PrimitiveMode.LINE_LIST) {
        const count = ib.length;
        for (let j = 0; j < count; j += 2) {
            const i0 = ib[j] * 3;
            const i1 = ib[j + 1] * 3;
            Vec3.set(tempVec3_a, vb[i0], vb[i0 + 1], vb[i0 + 2]);
            Vec3.set(tempVec3_b, vb[i1], vb[i1 + 1], vb[i1 + 2]);
            const dist = intersect.ray_segment(modelRay, tempVec3_a, tempVec3_b, 2, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    }
};

const narrowphaseForSnap = (vb: Float32Array, ib: IBArray | undefined, pm: gfx.PrimitiveMode, sides: boolean, distance = Infinity, hitPos: Vec3) => {
    narrowDis = distance;
    if (!ib) {
        const len = vb.length / 3;
        ib = new Uint32Array([...Array(len).keys()]);
    }

    let i0, i1, i2;
    const a = tri.a, b = tri.b, c = tri.c;
    let dist;
    const fromArray = Vec3.fromArray;
    if (pm === gfx.PrimitiveMode.TRIANGLE_LIST) {
        const cnt = ib.length;
        const step = ib.length > 3000000 ? Math.floor(ib.length / 3000000) * 3 : 3;
        for (let j = 0; j < cnt; j += step) {
            i0 = ib[j] * 3;
            i1 = ib[j + 1] * 3;
            i2 = ib[j + 2] * 3;
            fromArray(a, vb, i0);
            fromArray(b, vb, i1);
            fromArray(c, vb, i2);
            dist = intersect.ray_triangle(modelRay, tri, sides, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    } else if (pm === gfx.PrimitiveMode.TRIANGLE_STRIP) {
        const cnt = ib.length - 2;
        let rev = 0;
        for (let j = 0; j < cnt; j += 1) {
            i0 = ib[j - rev] * 3;
            i1 = ib[j + rev + 1] * 3;
            i2 = ib[j + 2] * 3;
            fromArray(tri.a, vb, i0);
            fromArray(tri.b, vb, i1);
            fromArray(tri.c, vb, i2);
            rev = ~rev;
            dist = intersect.ray_triangle(modelRay, tri, sides, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    } else if (pm === gfx.PrimitiveMode.TRIANGLE_FAN) {
        const cnt = ib.length - 1;
        i0 = ib[0] * 3;
        Vec3.set(tri.a, vb[i0], vb[i0 + 1], vb[i0 + 2]);
        for (let j = 1; j < cnt; j += 1) {
            i1 = ib[j] * 3;
            i2 = ib[j + 1] * 3;
            fromArray(b, vb, i1);
            fromArray(c, vb, i2);
            dist = intersect.ray_triangle(modelRay, tri, sides, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    } else if (pm === gfx.PrimitiveMode.LINE_LIST) {
        const count = ib.length;
        for (let j = 0; j < count; j += 2) {
            i0 = ib[j] * 3;
            i1 = ib[j + 1] * 3;
            fromArray(tempVec3_a, vb, i0);
            fromArray(tempVec3_b, vb, i1);
            dist = intersect.ray_segment(modelRay, tempVec3_a, tempVec3_b, 2, hitPos);
            if (dist <= 0 || dist >= narrowDis) {
                continue;
            }
            narrowDis = dist;
        }
    }
};

export class Raycast {
    get rayResultModels() {
        return resultModels;
    }

    get rayResultSingleModel() {
        return resultSingleModel;
    }

    get rayResultCanvas() {
        return resultCanvas;
    }

    get rayResultAll() {
        return resultAll;
    }

    private narrowPhaseStep(m: renderer.scene.Model, worldRay: ray, distance: number, d: number, forSnap = false): number {
        const { transform } = m;
        const narrowphaseFunc = forSnap ? narrowphaseForSnap : narrowphase;

        if (m.type === renderer.scene.ModelType.DEFAULT) {
            transform.getWorldMatrix(worldM4);
            Mat4.invert(m4, transform.getWorldMatrix(m4));
            Vec3.transformMat4(modelRay.o, worldRay.o, m4);
            Vec3.normalize(modelRay.d, Vec3.transformMat4Normal(modelRay.d, worldRay.d, m4));
            d = Infinity;
            for (let i = 0; i < m.subModels.length; ++i) {
                const subModel = m.subModels[i].subMesh;
                if (subModel && subModel.geometricInfo) {
                    const { positions: vb, indices: ib, doubleSided: sides } = subModel.geometricInfo;
                    narrowphaseFunc(vb, ib, subModel.primitiveMode, !!sides, distance, testHitPoint);
                    if (narrowDis < d) {
                        Vec3.transformMat4(testHitPoint, testHitPoint, worldM4);
                        const newDist = Vec3.distance(worldRay.o, testHitPoint);
                        if (newDist < d) {
                            d = newDist;
                            hitPoint.set(testHitPoint);
                        }
                    }
                }
            }
        }
        return d;
    }

    public raycastSingleModel(worldRay: ray, model: renderer.scene.Model, mask = Layers.Enum.DEFAULT, distance = Infinity, forSnap: boolean, excludeMask?: number): boolean {
        pool.reset();
        const m = model;
        const transform = m.transform;
        if (!transform || !m.enabled || !(m.node.layer & mask) || !m.worldBounds || excludeMask && excludeMask & m.node.layer) {
            return false;
        }
        let d = intersect.ray_aabb(worldRay, m.worldBounds);
        if (d <= 0 || d >= distance) {
            return false;
        }
        d = this.narrowPhaseStep(m, worldRay, distance, d, forSnap);
        if (d < distance) {
            const r = pool.add();
            r.node = m.node;
            r.distance = d;
            r.hitPoint = new Vec3(hitPoint);
            resultSingleModel[pool.length - 1] = r;
        }
        resultSingleModel.length = pool.length;
        return resultSingleModel.length > 0;
    }

    public raycastAllModels(renderScene: renderer.RenderScene, worldRay: ray, mask = Layers.Enum.DEFAULT, distance = Infinity, forSnap: boolean, excludeMask?: number): boolean {
        pool.reset();
        const models: any[][] = [];
        const editorCamera = getEditorCamera();
        for (const m of renderScene.models) {
            const transform = m.transform;
            if (editorCamera && (renderScene as any).isCulledByLod?.(editorCamera, m)) {
                continue;
            }
            if (excludeMask && m.node.layer & excludeMask) {
                continue;
            }
            if (!transform || !m.enabled || !(m.node.layer & mask) || !m.worldBounds) {
                continue;
            }
            const d = intersect.ray_aabb(worldRay, m.worldBounds);
            if (d <= 0 || d >= distance) {
                continue;
            }
            models.push([m, d]);
        }

        models.sort((a: any[], b: any[]) => {
            return a[1] - b[1];
        });

        let lastDistance = Number.MAX_VALUE;
        let hit = 0;

        models.every((data: any[]) => {
            const m = data[0];
            let d = data[1];
            if (forSnap) {
                if (lastDistance <= d && hit > 1) {
                    return false;
                }
            }
            d = this.narrowPhaseStep(m, worldRay, distance, d, true);
            if (d < distance) {
                const r = pool.add();
                r.node = m.node;
                r.distance = d;
                r.hitPoint = new Vec3(hitPoint);
                resultModels[pool.length - 1] = r;
                lastDistance = d;
                hit += 1;
            }
            return true;
        });

        resultModels.length = pool.length;
        return resultModels.length > 0;
    }

    public raycastAll(
        renderScene: renderer.RenderScene,
        worldRay: ray,
        mask = Layers.Enum.DEFAULT | Layers.Enum.UI_2D | Layers.Enum.IGNORE_RAYCAST,
        distance = Infinity,
        forSnap = false,
        excludeMask?: number,
        screenPos?: Vec2,
    ): boolean {
        const r_3d = this.raycastAllModels(renderScene, worldRay, mask, distance, forSnap, excludeMask);
        const r_ui2d = this.raycastAllCanvas(worldRay, mask, distance, excludeMask, screenPos);
        const isHit = r_3d || r_ui2d;
        resultAll.length = 0;
        if (isHit) {
            Array.prototype.push.apply(resultAll, resultModels);
            Array.prototype.push.apply(resultAll, resultCanvas);
        }
        return isHit;
    }

    public raycastAllCanvas(worldRay: ray, mask = Layers.Enum.UI_2D, distance = Infinity, excludeMask?: number, screenPos?: Vec2): boolean {
        poolUI.reset();
        const scene = (cc as any).director?.getScene?.();
        const canvasComs = scene?.getComponentsInChildren?.((cc as any).Canvas);
        if (canvasComs && canvasComs.length > 0) {
            for (let i = canvasComs.length - 1; i >= 0; i--) {
                const canvasNode = canvasComs[i].node;
                if (canvasNode && canvasNode.active) {
                    this._raycastUI2DNodeRecursiveChildren(worldRay, canvasNode, mask, distance, excludeMask, screenPos);
                }
            }
        }
        resultCanvas.length = poolUI.length;
        return resultCanvas.length > 0;
    }

    private _raycastUI2DNode(worldRay: ray, ui2dNode: Node, mask: number, distance: number, excludeMask?: number, screenPos?: Vec2): IRaycastResult | null {
        const uiTransform = (ui2dNode as any)._uiProps?.uiTransformComp;
        if (!uiTransform || !(ui2dNode.layer & mask) || (excludeMask && ui2dNode.layer & excludeMask)) {
            return null;
        }

        const uiSkewComp = (ui2dNode as any)._uiProps?._uiSkewComp;
        if (uiSkewComp && screenPos && uiTransform.hitTest && !uiTransform.hitTest(screenPos)) {
            return null;
        }

        if (!uiTransform.getComputeAABB) {
            return null;
        }
        uiTransform.getComputeAABB(aabbUI);
        const d = intersect.ray_aabb(worldRay, aabbUI);

        if (d <= 0) {
            return null;
        } else if (d < distance) {
            const r = poolUI.add();
            r.node = ui2dNode;
            r.distance = d;
            return r;
        }

        return null;
    }

    private _raycastUI2DNodeRecursiveChildren(worldRay: ray, parent: Node, mask: number, distance: number, excludeMask?: number, screenPos?: Vec2) {
        for (let i = parent.children.length - 1; i >= 0; i--) {
            const node = parent.children[i];
            if (node && node.active) {
                this._raycastUI2DNodeRecursiveChildren(worldRay, node, mask, distance, excludeMask, screenPos);
            }
        }

        const result = this._raycastUI2DNode(worldRay, parent, mask, distance, excludeMask, screenPos);
        if (result) {
            resultCanvas[poolUI.length - 1] = result;
        }
    }
}

export default new Raycast();
