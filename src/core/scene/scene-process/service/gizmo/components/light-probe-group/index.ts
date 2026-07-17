'use strict';

import { Color, js, LightProbeGroup, Node, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import BoxController from '../../controller/box';
import ControllerUtils from '../../utils/controller-utils';
import { addMeshToNode, create3DNode, getModel, setMeshColor } from '../../utils/engine-utils';
import { registerGizmo } from '../../gizmo-defines';

// 探针数量超过该阈值时只画包围盒/线框、不逐个建球，避免海量节点
const MAX_PROBE_DOTS = 4096;
// 对齐 Cocos Creator LightProbeController 常量
const PROBE_COLOR = new Color(241, 163, 72); // #F1A348
const WIREFRAME_COLOR = new Color(252, 231, 196); // #FCE7C4
const PROBE_SPHERE_BASE_RADIUS = 5;
// 内部四面体 6 条边
const TETRAHEDRON_LINES = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];

const tempQuat_a = new Quat();
const tempDelta = new Vec3();

/**
 * 光照探针组（LightProbeGroup）选中 Gizmo — 对齐 Cocos Creator：
 * - 全部探针小球（#F1A348，世界固定尺寸）；
 * - 整组内部四面体线框（#FCE7C4，取自 scene.globals.lightProbeInfo.data）；
 * - 绿色生成包围盒，支持逐面非对称拖拽（改 minPos/maxPos），松手重生成探针。
 */
class LightProbeGroupComponentGizmo extends GizmoBase<LightProbeGroup> {
    private _controller!: BoxController;
    private _dotsRoot: Node | null = null;      // 探针球容器（跟随节点世界变换）
    private _wireframeNode: Node | null = null;  // 四面体线框（世界坐标、单位阵）
    private _probesRef: Vec3[] | null = null;
    private _dotsVolume = -1;                     // 上次建点用的球体积，用于失效缓存
    private _reuseMesh: any = null;
    private _lastInfoSig = '';                    // lightProbeInfo 显示设置/数据签名，用于按需刷新

    // mouseDown 时捕获
    private _minPos = new Vec3();
    private _maxPos = new Vec3();
    private _scale = new Vec3();
    private _minPropPath: string | null = null;
    private _maxPropPath: string | null = null;

    init() {
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
        if (this._dotsRoot) this._dotsRoot.active = false;
        if (this._wireframeNode) this._wireframeNode.active = false;
        this._lastInfoSig = '';
    }

    createController() {
        const gizmoRoot = this.getGizmoRoot();
        this._controller = new BoxController(gizmoRoot);
        this._controller.setColor(Color.GREEN); // 对齐 Creator 包围盒绿色
        this._controller.editable = true;
        this._controller.hoverColor = Color.YELLOW;
        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);

        this._dotsRoot = create3DNode('LightProbeDots');
        this._dotsRoot.parent = gizmoRoot;
        this._dotsRoot.active = false;

        this._wireframeNode = create3DNode('LightProbeWireframe');
        this._wireframeNode.parent = gizmoRoot;
        this._wireframeNode.active = false;
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) return;
        this._minPos.set(this.target.minPos);
        this._maxPos.set(this.target.maxPos);
        this._scale = this.target.node.getWorldScale();
        this._minPropPath = this.getCompPropPath('minPos');
        this._maxPropPath = this.getCompPropPath('maxPos');
    }

    onControllerMouseMove(event: any) {
        this.updateDataFromController(event);
    }

    onControllerMouseUp() {
        if (this.target && this._controller.updated) {
            // 依据新范围重生成探针，并刷新探针球/线框
            this.target.generateLightProbes();
            this._rebuildDots(true);
            this._rebuildWireframe();
            this.onComponentChanged(this.target.node);
            // 引擎重剖分四面体是延迟的，稍后补刷一次线框，避免与球错位（对齐 Creator debounce）
            const target = this.target;
            setTimeout(() => {
                if (this.target === target) {
                    this._rebuildDots(true);
                    this._rebuildWireframe();
                }
            }, 250);
        }
        this.onControlEnd(this._minPropPath);
        this.onControlEnd(this._maxPropPath);
    }

    // 逐面非对称编辑：neg 面改 minPos，正面改 maxPos（对齐 Creator updateDataFromBBController）
    updateDataFromController(event: any) {
        if (!this._controller.updated || !this.target) return;
        this.onControlUpdate(this._minPropPath);
        this.onControlUpdate(this._maxPropPath);

        const delta = tempDelta.set(this._controller.getDeltaSize());
        Vec3.divide(delta, delta, this._scale);
        Vec3.multiplyScalar(delta, delta, 0.5);

        const handleName: string = event?.handleName ?? '';
        const newMin = new Vec3(this._minPos);
        const newMax = new Vec3(this._maxPos);
        if (handleName.includes('neg')) {
            Vec3.subtract(newMin, this._minPos, delta);
        } else {
            Vec3.add(newMax, this._maxPos, delta);
        }
        this.target.minPos = newMin;
        this.target.maxPos = newMax;

        const center = Vec3.multiplyScalar(new Vec3(), Vec3.add(new Vec3(), newMin, newMax), 0.5);
        const size = Vec3.subtract(new Vec3(), newMax, newMin);
        this._controller.updateSize(center, size);
        this.onComponentChanged(this.target.node);
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target == null) return;
        if (!(this.target instanceof LightProbeGroup)) {
            this._controller.hide();
            if (this._dotsRoot) this._dotsRoot.active = false;
            if (this._wireframeNode) this._wireframeNode.active = false;
            return;
        }

        const node = this.target.node;
        const worldScale = node.getWorldScale();
        const worldPos = node.getWorldPosition();
        const worldRot = tempQuat_a;
        node.getWorldRotation(worldRot);

        // 生成包围盒
        this._controller.show();
        this._controller.checkEdit();
        this._controller.setScale(worldScale);
        this._controller.setPosition(worldPos);
        this._controller.setRotation(worldRot);
        const min = this.target.minPos;
        const max = this.target.maxPos;
        const center = Vec3.multiplyScalar(new Vec3(), Vec3.add(new Vec3(), min, max), 0.5);
        const fullSize = Vec3.subtract(new Vec3(), max, min);
        this._controller.updateSize(center, fullSize);

        // 探针球容器跟随节点世界变换
        if (this._dotsRoot) {
            this._dotsRoot.setWorldPosition(worldPos);
            this._dotsRoot.setWorldRotation(worldRot);
            this._dotsRoot.setWorldScale(worldScale);
        }
        this._rebuildDots(false);
        this._rebuildWireframe();
    }

    private _getLightProbeInfo(): any {
        return (this.target?.node as any)?.scene?.globals?.lightProbeInfo ?? null;
    }

    /** 探针球：按 target.probes（节点本地坐标）画，仅引用变化时重建 */
    private _rebuildDots(force: boolean) {
        if (!this._dotsRoot || !this.target) return;
        const info = this._getLightProbeInfo();
        const showProbe = info ? (info.showProbe ?? true) : true;
        this._dotsRoot.active = showProbe;
        if (!showProbe) return;

        const probes = this.target.probes;
        const volume = info?.lightProbeSphereVolume ?? 1.0;
        // 缓存失效：probes 数组或球体积变化时才重建（体积影响球大小）
        if (!force && probes === this._probesRef && volume === this._dotsVolume) return;
        this._probesRef = probes;
        this._dotsVolume = volume;

        this._dotsRoot.removeAllChildren();
        if (!probes || probes.length === 0 || probes.length > MAX_PROBE_DOTS) return;

        const scale = volume * 0.06;
        for (let i = 0; i < probes.length; i++) {
            let dot: Node;
            if (!this._reuseMesh) {
                dot = ControllerUtils.sphere(Vec3.ZERO, PROBE_SPHERE_BASE_RADIUS, PROBE_COLOR, { depthTestForTriangles: true });
                this._reuseMesh = getModel(dot)?.mesh;
            } else {
                // 复用首个球的 mesh，避免每个探针都新建网格
                dot = create3DNode();
                addMeshToNode(dot, this._reuseMesh, { depthTestForTriangles: true });
                setMeshColor(dot, PROBE_COLOR);
            }
            dot.parent = this._dotsRoot;
            dot.setPosition(probes[i]);
            dot.setScale(scale, scale, scale);
        }
    }

    /** 整组内部四面体线框：取自 lightProbeInfo.data（世界坐标） */
    private _rebuildWireframe() {
        if (!this._wireframeNode || !this.target) return;
        const info = this._getLightProbeInfo();
        const showWireframe = info ? (info.showWireframe ?? true) : true;
        const data = info?.data;
        if (!showWireframe || !data || data.empty?.()) {
            this._wireframeNode.active = false;
            return;
        }
        const vertices = data.probes ?? [];
        const tetrahedrons = data.tetrahedrons ?? [];
        if (vertices.length === 0 || tetrahedrons.length === 0) {
            this._wireframeNode.active = false;
            return;
        }
        const positions: Vec3[] = vertices.map((v: any) => v.position);
        const indices: number[] = [];
        const seen = new Set<string>();
        for (const tet of tetrahedrons) {
            if (!(tet.isInnerTetrahedron?.() ?? tet.vertex3 >= 0) || tet.vertex3 < 0) continue;
            const vi = [tet.vertex0, tet.vertex1, tet.vertex2, tet.vertex3];
            for (let e = 0; e < TETRAHEDRON_LINES.length; e += 2) {
                const a = vi[TETRAHEDRON_LINES[e]];
                const b = vi[TETRAHEDRON_LINES[e + 1]];
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                if (seen.has(key)) continue;
                seen.add(key);
                indices.push(a, b);
            }
        }
        if (indices.length === 0) {
            this._wireframeNode.active = false;
            return;
        }
        this._wireframeNode.active = true;
        this._wireframeNode.setWorldPosition(0, 0, 0);
        this._wireframeNode.setRotationFromEuler(0, 0, 0);
        this._wireframeNode.setWorldScale(1, 1, 1);
        ControllerUtils.drawLines(this._wireframeNode, positions, indices, WIREFRAME_COLOR);
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }

    // 探针数据变化（重新生成/烘焙，可能顶点数不变但位置/系数变了）：失效缓存并强制刷新，
    // 避免 onUpdate 的计数签名相同而漏刷。
    onLightProbeChanged() {
        this._probesRef = null;
        this._dotsVolume = -1;
        this._lastInfoSig = '';
        this.updateControllerData();
    }

    // lightProbeInfo 的显示设置/探针数据可能在没有节点变化时改变（如烘焙、面板开关、球体积）。
    // 每帧只做一次廉价签名比较，变化时才刷新，避免每帧重建。
    onUpdate() {
        const sig = this._computeInfoSig();
        if (sig === this._lastInfoSig) return;
        this._lastInfoSig = sig;
        this.updateControllerData();
    }

    private _computeInfoSig(): string {
        const info = this._getLightProbeInfo();
        const data = info?.data;
        const probes = this.target?.probes;
        return [
            probes ? probes.length : 0,
            info ? (info.lightProbeSphereVolume ?? 1) : 1,
            info ? (info.showProbe ?? true) : true,
            info ? (info.showWireframe ?? true) : true,
            data?.tetrahedrons?.length ?? 0,
            data?.probes?.length ?? 0,
        ].join('|');
    }

    onDestroy() {
        if (this._dotsRoot) {
            this._dotsRoot.destroy();
            this._dotsRoot = null;
        }
        if (this._wireframeNode) {
            this._wireframeNode.destroy();
            this._wireframeNode = null;
        }
    }
}

export const name = js.getClassName(LightProbeGroup);
// 仅选中 LightProbeGroup 节点时显示；选中“使用探针的物体”时的四面体见 utils/light-probe-tetra。
export const SelectGizmo = LightProbeGroupComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });
