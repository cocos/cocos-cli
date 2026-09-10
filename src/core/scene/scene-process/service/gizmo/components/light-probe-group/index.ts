'use strict';

import { Color, js, LightProbeGroup, Node, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import IconGizmoBase from '../../base/gizmo-icon';
import BoxController from '../../controller/box';
import ControllerUtils from '../../utils/controller-utils';
import { addMeshToNode, create3DNode, getModel, setMeshColor } from '../../utils/engine-utils';
import { registerGizmo } from '../../gizmo-defines';
import { buildLightProbeConvex } from '../../utils/light-probe-convex';
import PositionController from '../../node/position-controller';
import { Service } from '../../../core/decorator';
import { ServiceEvents } from '../../../core/global-events';
import { ProbeSelection, probeSelectionEvents } from './selection';
import type { GizmoMouseEvent } from '../../utils/defines';
import type { CameraService } from '../../../camera';
import type { TransformToolDataViewMode } from '../../transform-tool';

// 探针数量超过该阈值时只画包围盒/线框、不逐个建球，避免海量节点
const MAX_PROBE_DOTS = 4096;
// 对齐 Cocos Creator LightProbeController 常量
const PROBE_COLOR = new Color(241, 163, 72); // #F1A348
const SELECTED_COLOR = new Color(64, 170, 202);
const WIREFRAME_COLOR = new Color(252, 231, 196); // #FCE7C4
const PROBE_SPHERE_BASE_RADIUS = 5;
// 内部四面体 6 条边
const TETRAHEDRON_LINES = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];

const tempQuat_a = new Quat();
const tempDelta = new Vec3();

type EditMode = 'none' | 'vertex' | 'box';
let editMode: EditMode = 'none';
let previousTool: { name: string; viewMode: TransformToolDataViewMode } | undefined;
const instances = new Set<LightProbeGroupComponentGizmo>();

function activeGroups(): LightProbeGroupComponentGizmo[] {
    return [...instances].filter(gizmo => gizmo.editableTarget);
}

function changeEditMode(mode: EditMode): void {
    if (!['none', 'vertex', 'box'].includes(mode)) { throw new Error('Invalid light probe edit mode'); }
    if (mode === editMode) { return; }
    editMode = mode;
    const gizmo = Service.Gizmo;
    if (mode === 'vertex') {
        previousTool = { name: gizmo.transformToolName, viewMode: gizmo.transformToolData.viewMode };
        gizmo.transformToolName = 'view';
        // Changing the tool toggles its view mode, so apply the intended mode last.
        gizmo.transformToolData.viewMode = 'select';
    } else if (previousTool !== undefined) {
        const restore = previousTool;
        previousTool = undefined;
        gizmo.transformToolName = restore.name;
        gizmo.transformToolData.viewMode = restore.viewMode;
    }
    for (const instance of instances) { instance.modeChanged(); }
    ServiceEvents.broadcast('scene:light-probe-edit-mode-changed', mode === 'vertex');
    ServiceEvents.broadcast('scene:light-probe-bounding-box-edit-mode-changed', mode === 'box');
    Service.Engine.repaintInEditMode();
}

async function editSelected(duplicate: boolean): Promise<number> {
    const groups = activeGroups().filter(group => editMode === 'vertex' && group.selection.indices.size > 0);
    if (!groups.length) { return 0; }
    const recording = Service.Undo.beginRecording(groups.map(group => group.target!.node.uuid));
    try {
        return groups.reduce((count, group) => count + group.editSelected(duplicate), 0);
    } finally {
        await Service.Undo.endRecording(recording);
    }
}

export const methods = {
    getEditMode: (): EditMode => editMode,
    changeEditMode,
    selectAllProbes: () => {
        for (const group of activeGroups()) {
            if (editMode === 'vertex') { group.selection.all(); group.refreshSelection(); }
        }
    },
    unselectAllProbes: () => {
        for (const group of instances) { group.selection.indices.clear(); group.refreshSelection(); }
    },
    getSelectedProbeCount: () => editMode === 'vertex'
        ? activeGroups().reduce((count, group) => count + group.selection.indices.size, 0) : 0,
    deleteSelectedProbes: () => editSelected(false),
    duplicateSelectedProbes: () => editSelected(true),
    generateLightProbes: () => {
        const groups = activeGroups();
        for (const group of groups) { group.target!.generateLightProbes(); group.probesChanged(); }
        return groups.length;
    },
    beginRegion: () => { for (const group of activeGroups()) { group.selection.beginRegion(); } },
    endRegion: () => { for (const group of instances) { group.selection.endRegion(); } },
    regionSelectProbes: (left: number, right: number, top: number, bottom: number, additive: boolean) => {
        if (![left, right, top, bottom].every(Number.isFinite) || editMode !== 'vertex') { return 0; }
        for (const group of activeGroups()) { group.regionSelect(left, right, top, bottom, additive); }
        return methods.getSelectedProbeCount();
    },
};

/**
 * 光照探针组（LightProbeGroup）选中 Gizmo — 对齐 Cocos Creator：
 * - 全部探针小球（#F1A348，世界固定尺寸）；
 * - 整组内部四面体线框（#FCE7C4，取自 scene.globals.lightProbeInfo.data）；
 * - 绿色生成包围盒，支持逐面非对称拖拽（改 minPos/maxPos），松手重生成探针。
 */
class LightProbeGroupComponentGizmo extends GizmoBase<LightProbeGroup> {
    readonly selection = new ProbeSelection();
    private shown = false;
    private boundTarget: LightProbeGroup | null = null;
    private positionController: PositionController | null = null;
    private dragStart: Map<number, Vec3> | undefined;

    override get target(): LightProbeGroup | null { return super.target; }
    override set target(value: LightProbeGroup | null) {
        if (super.target !== value) { this.finishDrag(); this.selection.bind(null, 0); }
        super.target = value;
    }

    get editableTarget(): boolean {
        return this.shown && !!this.target?.isValid && this.target.enabledInHierarchy;
    }
    private _controller!: BoxController;
    private _dotsRoot: Node | null = null;      // 探针球容器（跟随节点世界变换）
    private _wireframeNode: Node | null = null;  // 四面体线框（世界坐标、单位阵）
    private _convexNode: Node | null = null;
    private _normalNode: Node | null = null;
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
        instances.add(this);
        this.createController();
        this._isInitialized = true;
    }

    onShow() {
        this.shown = true;
        this.updateControllerData();
    }

    onHide() {
        this.finishDrag();
        this.shown = false;
        this.selection.bind(null, 0);
        this.positionController?.hide();
        this._controller.hide();
        if (this._dotsRoot) this._dotsRoot.active = false;
        if (this._wireframeNode) this._wireframeNode.active = false;
        if (this._convexNode) this._convexNode.active = false;
        if (this._normalNode) this._normalNode.active = false;
        this._lastInfoSig = '';
        if (!activeGroups().length) { changeEditMode('none'); }
    }

    modeChanged(): void {
        this.finishDrag();
        this.selection.indices.clear();
        this.positionController?.hide();
        this.updateControllerData();
    }

    refreshSelection(): void {
        for (const [index, dot] of (this._dotsRoot?.children ?? []).entries()) {
            setMeshColor(dot, this.selection.indices.has(index) ? SELECTED_COLOR : PROBE_COLOR);
        }
        if (!this.editableTarget || editMode !== 'vertex' || !this.selection.indices.size || !this._dotsRoot?.active) {
            this.positionController?.hide();
            return;
        }
        if (!this.positionController) {
            this.positionController = new PositionController(this.getGizmoRoot());
            this.positionController.onControllerMouseDown = () => {
                if (!this.target) { return; }
                this.dragStart = new Map([...this.selection.indices].map(index => [index, Vec3.clone(this.target!.probes[index])]));
                this.onControlBegin(this.getCompPropPath('probes'));
            };
            this.positionController.onControllerMouseMove = () => {
                if (!this.target || !this.dragStart) { return; }
                const delta = this.positionController!.getDeltaPosition();
                const probes = this.target.probes.slice();
                for (const [index, start] of this.dragStart) { probes[index] = Vec3.add(new Vec3(), start, delta); }
                this.target.probes = probes;
                for (const [index, dot] of this._dotsRoot!.children.entries()) { dot.setPosition(probes[index]); }
                Service.Engine.repaintInEditMode();
            };
            this.positionController.onControllerMouseUp = () => this.finishDrag();
        }
        if (this.dragStart) { return; }
        const center = new Vec3();
        for (const index of this.selection.indices) { center.add(this.target!.probes[index]); }
        center.multiplyScalar(1 / this.selection.indices.size).add(this.target!.node.worldPosition);
        this.positionController.setPosition(center);
        this.positionController.setRotation(Quat.IDENTITY);
        this.positionController.show();
        Service.Engine.repaintInEditMode();
    }

    private finishDrag(): void {
        if (!this.dragStart) { return; }
        const moved = !!this.target && [...this.dragStart].some(([index, start]) => !Vec3.strictEquals(start, this.target!.probes[index]));
        this.dragStart = undefined;
        if (moved) { this.probesChanged(); }
        void this.onControlEnd(this.getCompPropPath('probes'));
    }

    probesChanged(): void {
        if (!this.target) { return; }
        this.target.onProbeChanged();
        this.target.node.scene.globals.lightProbeInfo.onProbeBakeCleared();
        this.selection.bind(this.target, this.target.probes.length);
        this._probesRef = null;
        this.updateControllerData();
        this.onComponentChanged(this.target.node);
    }

    editSelected(duplicate: boolean): number {
        if (!this.editableTarget || !this.target || editMode !== 'vertex') { return 0; }
        const indices = [...this.selection.indices];
        const probes = this.target.probes;
        this.target.probes = duplicate ? [...probes, ...indices.map(index => Vec3.clone(probes[index]))]
            : probes.filter((_, index) => !this.selection.indices.has(index));
        this.probesChanged();
        if (duplicate) {
            indices.forEach((_, index) => this.selection.indices.add(probes.length + index));
            this.refreshSelection();
        }
        return indices.length;
    }

    regionSelect(left: number, right: number, top: number, bottom: number, additive: boolean): void {
        const camera = (Service.Camera as CameraService).getCamera()?.camera;
        if (!camera || !this.target || !this._dotsRoot?.active) { return; }
        const screen = new Vec3();
        const world = new Vec3();
        const hits: number[] = [];
        this.target.probes.forEach((probe, index) => {
            Vec3.add(world, probe, this.target!.node.worldPosition);
            camera.worldToScreen(screen, world);
            if (screen.z >= 0 && screen.z <= 1 && screen.x >= left && screen.x <= right && screen.y >= bottom && screen.y <= top) {
                hits.push(index);
            }
        });
        this.selection.region(hits, additive);
        this.refreshSelection();
    }

    onKeyDown(event: { key?: string; ctrlKey?: boolean; metaKey?: boolean }): boolean | void {
        if (!this.editableTarget || editMode !== 'vertex') { return; }
        const key = event.key?.toLowerCase();
        if (key === 'escape') { changeEditMode('none'); return false; }
        if ((event.ctrlKey || event.metaKey) && key === 'a') { methods.selectAllProbes(); return false; }
        if (key === 'delete' || key === 'backspace' || ((event.ctrlKey || event.metaKey) && key === 'd')) {
            void editSelected(key === 'd').catch(error => console.error('[LightProbe] Edit failed', error));
            return false;
        }
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
        this._convexNode = create3DNode('LightProbeConvex');
        this._convexNode.parent = gizmoRoot;
        this._convexNode.active = false;
        this._normalNode = create3DNode('LightProbeConvexNormals');
        this._normalNode.parent = gizmoRoot;
        this._normalNode.active = false;
    }

    onControllerMouseDown() {
        if (!this._isInitialized || this.target === null) return;
        this._minPos.set(this.target.minPos);
        this._maxPos.set(this.target.maxPos);
        this._scale.set(1, 1, 1);
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
            this.probesChanged();
            this._rebuildDots(true);
            this._rebuildWireframe();
            this._rebuildConvex();
            this.onComponentChanged(this.target.node);
            // 引擎重剖分四面体是延迟的，稍后补刷一次线框，避免与球错位（对齐 Creator debounce）
            const target = this.target;
            setTimeout(() => {
                if (this.target === target) {
                    this._rebuildDots(true);
                    this._rebuildWireframe();
                    this._rebuildConvex();
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
        if (!this._isInitialized || !this.shown || this.target == null) return;
        if (this.boundTarget !== this.target) {
            this.boundTarget = this.target;
            this.selection.bind(this.target, this.target.probes.length);
            this._probesRef = null;
        }
        this.selection.bind(this.target, this.target.probes.length);
        if (!(this.target instanceof LightProbeGroup)) {
            this._controller.hide();
            if (this._dotsRoot) this._dotsRoot.active = false;
            if (this._wireframeNode) this._wireframeNode.active = false;
            if (this._convexNode) this._convexNode.active = false;
            if (this._normalNode) this._normalNode.active = false;
            return;
        }

        const node = this.target.node;
        // Match LightProbeInfo.update: samples are offsets from worldPosition, not full TRS.
        const worldScale = Vec3.ONE;
        const worldPos = node.getWorldPosition();
        const worldRot = tempQuat_a;
        worldRot.set(Quat.IDENTITY);

        // 生成包围盒
        if (editMode === 'box') { this._controller.show(); } else { this._controller.hide(); }
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
        this._rebuildConvex();
        this.refreshSelection();
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

        for (const dot of [...this._dotsRoot.children]) { dot.removeFromParent(); dot.destroy(); }
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
            dot.on('mouseDown', (event: GizmoMouseEvent) => {
                if (!this.editableTarget || editMode !== 'vertex' || !event.leftButton) { return; }
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey) { methods.unselectAllProbes(); }
                if (this.selection.indices.has(i)) { this.selection.indices.delete(i); } else { this.selection.indices.add(i); }
                this.refreshSelection();
                probeSelectionEvents.add(event);
                event.propagationStopped = true;
            });
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

    private _rebuildConvex() {
        if (!this._convexNode || !this._normalNode) return;
        const info = this._getLightProbeInfo();
        const data = info?.data;
        this._convexNode.active = false;
        this._normalNode.active = false;
        if (!this.target || !info?.showConvex || !data || data.empty?.()) return;
        const geometry = buildLightProbeConvex(data.probes ?? [], data.tetrahedrons ?? []);
        for (const node of [this._convexNode, this._normalNode]) {
            node.setWorldPosition(0, 0, 0);
            node.setRotationFromEuler(0, 0, 0);
            node.setWorldScale(1, 1, 1);
        }
        if (geometry.indices.length) {
            ControllerUtils.drawLines(this._convexNode, geometry.positions, geometry.indices, WIREFRAME_COLOR);
            this._convexNode.active = true;
        }
        if (geometry.normalIndices.length) {
            ControllerUtils.drawLines(this._normalNode, geometry.normalPositions, geometry.normalIndices, PROBE_COLOR);
            this._normalNode.active = true;
        }
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
        if (!this.shown || this.dragStart) { return; }
        const sig = this._computeInfoSig();
        if (sig === this._lastInfoSig) return;
        this._lastInfoSig = sig;
        this._probesRef = null;
        this.updateControllerData();
    }

    private _computeInfoSig(): string {
        const info = this._getLightProbeInfo();
        const data = info?.data;
        const probes = this.target?.probes;
        return [
            probes?.map(probe => `${probe.x},${probe.y},${probe.z}`).join(';'),
            this.target?.node.worldPosition.toString(),
            probes ? probes.length : 0,
            info ? (info.lightProbeSphereVolume ?? 1) : 1,
            info ? (info.showProbe ?? true) : true,
            info ? (info.showWireframe ?? true) : true,
            info ? (info.showConvex ?? false) : false,
            data?.tetrahedrons?.length ?? 0,
            data?.probes?.length ?? 0,
        ].join('|');
    }

    onDestroy() {
        this.finishDrag();
        instances.delete(this);
        this.selection.bind(null, 0);
        this.positionController?.hide();
        this.positionController?.shape.destroy();
        this.positionController = null;
        this._controller?.shape.destroy();
        this._convexNode?.destroy();
        this._convexNode = null;
        this._normalNode?.destroy();
        this._normalNode = null;
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

class LightProbeGroupIconGizmo extends IconGizmoBase<LightProbeGroup> {
    public disableOnSelected = true;

    createController() {
        super.createController();
        this._controller.setTextureByUUID('9e0cc8d3-a76b-4bee-b53e-f3abab91c4b8@6c48a');
    }
}

export const name = js.getClassName(LightProbeGroup);
// 仅选中 LightProbeGroup 节点时显示；选中“使用探针的物体”时的四面体见 utils/light-probe-tetra。
export const SelectGizmo = LightProbeGroupComponentGizmo;
export const IconGizmo = LightProbeGroupIconGizmo;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo, IconGizmo, methods });
