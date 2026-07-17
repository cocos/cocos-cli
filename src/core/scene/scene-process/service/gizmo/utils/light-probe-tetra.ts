'use strict';

import { Color, Node, Vec3, pipeline, SH } from 'cc';
import ControllerUtils from './controller-utils';
import { addMeshToNode, create3DNode, getModel, setMeshColor, setMeshSHCoefficients } from './engine-utils';

// 对齐 Cocos Creator controller-light-probe-tetrahedron.ts 的颜色
const TETRA_PROBE_COLOR = new Color(172, 237, 207); // #ACEDCF
const TETRA_LINE_COLOR = new Color(206, 246, 226); // #CEF6E2

// 内部四面体 6 条边（顶点 0..3）
const TETRAHEDRON_LINES = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];
// 外部胞元：3 条三角形边 + 3 条顶点法线（顶点 0..2，法线端点 3..5）
const OUTER_CELL_LINES = [0, 1, 0, 2, 1, 2, 0, 3, 1, 4, 2, 5];

const tempScale = new Vec3();

/**
 * 影响当前所选物体的光照探针四面体高亮（忠实移植自 Cocos Creator
 * `controller-light-probe-tetrahedron.ts`）：
 * 选中开启“使用光照探针”的 MeshRenderer/SkinnedMeshRenderer 时，用引擎已算好的
 * `model.tetrahedronIndex` 取其所在四面体，画出该四面体的探针小球（SH 受光，effect
 * `internal/editor/light-probe-visualization`）+ 连线。
 */
export class LightProbeTetraHelper {
    private _root: Node | null;
    private _container: Node | null = null;
    private _spheres: Node[] = [];
    private _lineNode: Node | null = null;
    private _shData = new Float32Array(pipeline.UBOSH.COUNT);
    private _lastSig = ''; // 上次渲染的签名，未变化时跳过 SH/连线重建

    constructor(root: Node | null) {
        this._root = root;
    }

    hide(): void {
        if (this._container) this._container.active = false;
        this._lastSig = '';
    }

    /** 使缓存失效：下次 update 强制重建（用于探针数据/烘焙/设置变化，覆盖所有 SH 系数与法线等输入）。 */
    invalidate(): void {
        this._lastSig = '';
    }

    destroy(): void {
        if (this._container) {
            this._container.destroy();
            this._container = null;
            this._spheres.length = 0;
            this._lineNode = null;
        }
    }

    /**
     * @param comp MeshRenderer 或 SkinnedMeshRenderer（含 bakeSettings / node / model）
     */
    update(comp: any): void {
        if (!this._root || !comp) {
            this.hide();
            return;
        }
        const model = comp.model;
        // 引擎判断该模型是否使用探针（等价 bakeSettings.useLightProbe 且已参与探针）
        if (!model || !(model.showTetrahedron?.() ?? false)) {
            this.hide();
            return;
        }
        const tetIndex: number = model.tetrahedronIndex;
        if (tetIndex < 0) {
            this.hide();
            return;
        }

        const globals = (comp.node as Node | undefined)?.scene?.globals;
        const lightProbeInfo = (globals as any)?.lightProbeInfo;
        const data = lightProbeInfo?.data;
        if (!data || data.empty()) {
            this.hide();
            return;
        }
        const vertices = data.probes;
        const tetrahedrons = data.tetrahedrons;
        if (!vertices || vertices.length === 0 || tetIndex >= tetrahedrons.length) {
            this.hide();
            return;
        }

        const tet = tetrahedrons[tetIndex];
        const reduceRinging: number = lightProbeInfo.reduceRinging ?? 0;
        const volume: number = lightProbeInfo.lightProbeSphereVolume ?? 1.0;
        const isInner: boolean = tet.isInnerTetrahedron();

        const indices = [tet.vertex0, tet.vertex1, tet.vertex2];
        if (isInner) indices.push(tet.vertex3);

        // 签名：四面体索引 + 体积 + reduceRinging + 各顶点位置/SH 首系数。未变化时跳过重建。
        // 其余 SH 系数、法线等在探针数据/烘焙/设置变化时通过 invalidate() 失效缓存来覆盖。
        let sig = `${tetIndex}|${volume}|${reduceRinging}|${isInner ? 1 : 0}`;
        for (const idx of indices) {
            const p = vertices[idx].position;
            sig += `|${p.x},${p.y},${p.z}`;
            const c = vertices[idx].coefficients;
            if (c && c.length > 0) {
                const c0 = c[0];
                sig += `:${c0.x},${c0.y},${c0.z}`;
            }
        }

        this._ensureNodes();
        if (!this._container) return;
        if (sig === this._lastSig && this._container.active) return;
        this._lastSig = sig;
        this._container.active = true;

        // 探针小球（世界固定尺寸 = volume * 0.06 * 半径5）
        const scale = volume * 0.06;
        tempScale.set(scale, scale, scale);
        // 第 4 个球只在内部四面体时显示
        this._spheres[3].active = isInner;
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const sphere = this._spheres[i];
            sphere.active = true;
            sphere.setWorldPosition(vertices[idx].position);
            sphere.setWorldScale(tempScale);

            const coeff = vertices[idx].coefficients;
            if (coeff && coeff.length > 0) {
                const c = coeff.slice();
                SH.reduceRinging(c, reduceRinging);
                SH.updateUBOData(this._shData, pipeline.UBOSH.SH_LINEAR_CONST_R_OFFSET, c);
            } else {
                this._shData.fill(0);
            }
            setMeshSHCoefficients(sphere, this._shData);
        }

        // 连线（世界坐标 → 线节点单位阵）
        if (this._lineNode) {
            if (isInner) {
                ControllerUtils.drawLines(
                    this._lineNode,
                    indices.map((i) => vertices[i].position),
                    TETRAHEDRON_LINES,
                    TETRA_LINE_COLOR,
                );
            } else {
                const positions: Vec3[] = indices.map((i) => vertices[i].position.clone());
                for (const i of indices) {
                    positions.push(vertices[i].position.clone().add(vertices[i].normal));
                }
                ControllerUtils.drawLines(this._lineNode, positions, OUTER_CELL_LINES, TETRA_LINE_COLOR);
            }
            this._lineNode.active = true;
            this._lineNode.setWorldPosition(0, 0, 0);
            this._lineNode.setRotationFromEuler(0, 0, 0);
            this._lineNode.setWorldScale(1, 1, 1);
        }
    }

    private _ensureNodes(): void {
        if (this._container || !this._root) return;
        this._container = create3DNode('LightProbeTetra');
        this._container.parent = this._root;

        const opts = {
            instancing: false,
            depthTestForTriangles: true,
            effectName: 'internal/editor/light-probe-visualization',
            technique: 0,
            useLightProbe: true,
        } as any;

        let reuseMesh: any = null;
        for (let i = 0; i < 4; i++) {
            let node: Node;
            if (i === 0) {
                node = ControllerUtils.sphere(Vec3.ZERO, 5, TETRA_PROBE_COLOR, opts);
                reuseMesh = getModel(node)?.mesh;
            } else {
                node = create3DNode();
                if (reuseMesh) {
                    // 复用 mesh，但每球独立材质（各自 SH 系数）
                    addMeshToNode(node, reuseMesh, opts);
                    setMeshColor(node, TETRA_PROBE_COLOR);
                } else {
                    node = ControllerUtils.sphere(Vec3.ZERO, 5, TETRA_PROBE_COLOR, opts);
                }
            }
            node.parent = this._container;
            node.active = false;
            this._spheres.push(node);
        }

        this._lineNode = create3DNode('LightProbeTetraLines');
        this._lineNode.parent = this._container;
        this._lineNode.active = false;
    }
}
