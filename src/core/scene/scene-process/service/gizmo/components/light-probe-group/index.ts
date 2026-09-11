'use strict';

import { Color, js, LightProbeGroup, Node, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import IconGizmoBase from '../../base/gizmo-icon';
import BoxController from '../../controller/box';
import PositionController from '../../node/position-controller';
import ControllerUtils from '../../utils/controller-utils';
import { addMeshToNode, create3DNode, getModel, setMeshColor } from '../../utils/engine-utils';
import { buildLightProbeConvex } from '../../utils/light-probe-convex';
import { registerGizmo } from '../../gizmo-defines';

// 探针数量超过该阈值时只画包围盒/线框、不逐个建球，避免海量节点
const MAX_PROBE_DOTS = 4096;
// 对齐 Cocos Creator LightProbeController 常量
const PROBE_COLOR = new Color(241, 163, 72); // #F1A348
const SELECTED_PROBE_COLOR = new Color(64, 170, 202); // #40AACA 选中探针高亮（对齐 Creator SelectedProbeColor）
const WIREFRAME_COLOR = new Color(252, 231, 196); // #FCE7C4
const PROBE_SPHERE_BASE_RADIUS = 5;
// 内部四面体 6 条边
const TETRAHEDRON_LINES = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];

const tempQuat_a = new Quat();
const tempDelta = new Vec3();
// 探针世界中心 / 世界增量换算用的临时量（复用避免每帧分配）
const tempDragA = new Vec3();
const tempDragB = new Vec3();
// 框选投影用临时量（复用避免每帧分配）
const tempRegionWorld = new Vec3();
const tempRegionScreen = new Vec3();
const unitScale = new Vec3(1, 1, 1);

// 进入 vertex 模式时备份的变换工具 pivot，退出时还原（模块级：pivot 是全局共享状态）。
let pivotBackup: string | undefined;

// 进入 vertex 模式时备份的变换工具名（toolName），退出时还原。
// 关键：vertex 模式下把变换工具切成 'view'，隐藏节点的 position/rotation/scale 箭头
// controller，否则它们会和探针球一起参与 gizmo 射线拾取并抢占鼠标事件，
// 导致拖动移动的是整个 LightProbeGroup 节点而非单个探针（对齐 Creator：进入探针
// 编辑模式后不显示节点变换 gizmo）。
let toolNameBackup: string | undefined;
let viewModeBackup: string | undefined;

// ── 编辑模式状态机（内联复刻 Creator manager.ts + types.ts，本仓库约定单文件）──────────

/** 三态编辑模式：互斥。对齐 Creator LightEditMode。 */
export enum LightEditMode {
    NONE = 'none',
    VERTEX = 'vertex', // 逐探针编辑（Enter Probe Edit Mode）
    BOX = 'box',       // 包围盒编辑（Edit Area Box）
}

const MODE_CHANGED = 'light-probe:mode-changed';

/** 当前编辑模式（模块级单例，全场景共享，对齐 Creator manager 单例）。 */
let currentEditMode: LightEditMode = LightEditMode.NONE;

/** 已注册的 LightProbeGroup gizmo 实例列表（对齐 Creator GizmoList）。 */
const GizmoList: LightProbeGroupComponentGizmo[] = [];
let sharedProbeController: PositionController | null = null;
let sharedProbeControllerOwner: LightProbeGroupComponentGizmo | null = null;

function isUsableProbeGizmo(comp: LightProbeGroupComponentGizmo): boolean {
    const target = comp.target as any;
    return comp.visible() && !!target && target.isValid !== false && target.enabledInHierarchy !== false;
}

function isActiveProbeGizmo(comp: LightProbeGroupComponentGizmo): boolean {
    return isUsableProbeGizmo(comp) && (comp as any)._vertexEditMode === true &&
        (comp as any)._selected?.size > 0;
}

function sharedProbeControllerDown(event: any): void {
    for (const comp of GizmoList) {
        if (isActiveProbeGizmo(comp)) (comp as any)._onProbeCtrlDown(event);
    }
}

function sharedProbeControllerMove(event: any): void {
    for (const comp of GizmoList) {
        if (isActiveProbeGizmo(comp)) (comp as any)._onProbeCtrlMove(event);
    }
}

function sharedProbeControllerUp(event: any): void {
    for (const comp of GizmoList) {
        if ((comp as any)._ctrlDragging) (comp as any)._onProbeCtrlUp(event);
    }
    sharedProbeControllerOwner = null;
}

function getSharedSelectedCenter(out: Vec3): boolean {
    out.set(0, 0, 0);
    let count = 0;
    const center = new Vec3();
    for (const comp of GizmoList) {
        if (!isActiveProbeGizmo(comp)) continue;
        if (!(comp as any)._getSelectedCenterWorld(center)) continue;
        const selectedCount = (comp as any)._selected?.size ?? 0;
        if (selectedCount <= 0) continue;
        out.x += center.x * selectedCount;
        out.y += center.y * selectedCount;
        out.z += center.z * selectedCount;
        count += selectedCount;
    }
    if (count === 0) return false;
    out.multiplyScalar(1 / count);
    return true;
}

/** 轻量事件总线：仅承载 MODE_CHANGED，携带 (newMode, oldMode)。 */
type ModeChangedListener = (newMode: LightEditMode, oldMode: LightEditMode) => void;
const eventEmitter = {
    _listeners: [] as ModeChangedListener[],
    on(_event: string, cb: ModeChangedListener) {
        this._listeners.push(cb);
    },
    emit(_event: string, newMode: LightEditMode, oldMode: LightEditMode) {
        for (const cb of this._listeners) {
            try {
                cb(newMode, oldMode);
            } catch (e) {
                console.warn('[LightProbeGroup] MODE_CHANGED listener failed:', e);
            }
        }
    },
};

/** 惰性获取 Service 注册表（避免循环依赖）。 */
function getService(): any {
    try {
        const { Service } = require('../../../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

/** 惰性获取全局事件总线（广播必须走 ServiceEvents，见 gizmo-base 注释）。 */
function getServiceEvents(): any {
    try {
        const { ServiceEvents } = require('../../../core/global-events');
        return ServiceEvents;
    } catch (e) {
        return null;
    }
}

function broadcast(event: string, ...args: any[]): void {
    try {
        getServiceEvents()?.broadcast?.(event, ...args);
    } catch (e) {
        console.warn(`[LightProbeGroup] failed to broadcast ${event}:`, e);
    }
}

/** 返回当前编辑模式。 */
export function getEditMode(): LightEditMode {
    return currentEditMode;
}

/** 切换编辑模式：先发 MODE_CHANGED(new, old)，再落地 currentEditMode。 */
export function changeEditMode(mode: LightEditMode | `${LightEditMode}`): void {
    const next = mode as LightEditMode;
    if (next === currentEditMode) return;
    eventEmitter.emit(MODE_CHANGED, next, currentEditMode);
    currentEditMode = next;
}

/** 探针数据变化：遍历所有 gizmo 刷新（对齐 Creator lightProbeInfoChanged）。 */
export function lightProbeInfoChanged(): void {
    for (const comp of GizmoList) {
        try {
            comp.lightProbeInfoChanged();
        } catch (e) {
            console.warn('[LightProbeGroup] lightProbeInfoChanged failed:', e);
        }
    }
}

/** 全选所有组的所有探针（vertex 模式生效）。 */
export function selectAllProbes(): void {
    for (const comp of GizmoList) {
        if (!isUsableProbeGizmo(comp)) continue;
        try {
            comp.selectAllProbes();
        } catch (e) {
            console.warn('[LightProbeGroup] selectAllProbes failed:', e);
        }
    }
}

/** 取消所有组的探针选择。 */
export function unselectAllProbes(): void {
    for (const comp of GizmoList) {
        try {
            comp.unselectAllProbes();
        } catch (e) {
            console.warn('[LightProbeGroup] unselectAllProbes failed:', e);
        }
    }
}

/** 查询当前选中探针总数（跨所有组求和）。 */
export function getSelectedProbeCount(): number {
    let count = 0;
    for (const comp of GizmoList) {
        if (isUsableProbeGizmo(comp)) count += comp.selectedProbeCount;
    }
    return count;
}

/** 删除所有组中选中的探针，返回删除总数。 */
async function editSelectedProbes(operation: 'delete' | 'duplicate'): Promise<number> {
    const groups = GizmoList.filter(isActiveProbeGizmo);
    if (groups.length === 0) return 0;
    const service = getService();
    let recording: string | null = null;
    try {
        recording = service?.Undo?.beginRecording?.(groups.map(comp => comp.target!.node.uuid)) ?? null;
    } catch {
        recording = null;
    }
    let total = 0;
    try {
        for (const comp of groups) {
            try {
                total += operation === 'delete'
                    ? comp.deleteCurrentSelectedProbes()
                    : comp.duplicateCurrentSelectedProbes();
            } catch (e) {
                console.warn(`[LightProbeGroup] ${operation}SelectedProbes failed:`, e);
            }
        }
    } finally {
        if (recording) await service?.Undo?.endRecording?.(recording);
    }
    return total;
}

export async function deleteSelectedProbes(): Promise<number> {
    return editSelectedProbes('delete');
}

/** 复制所有组中选中的探针（原位副本），返回新增总数。 */
export async function duplicateSelectedProbes(): Promise<number> {
    return editSelectedProbes('duplicate');
}

/**
 * 框选探针（方案 A）：遍历所有组，把屏幕矩形交给各组自行投影判定命中。
 * 返回跨所有组的选中探针总数。additive 语义见 LightProbeGroupComponentGizmo.regionSelectProbes。
 */
export function regionSelectProbes(
    left: number,
    right: number,
    top: number,
    bottom: number,
    additive: boolean,
): number {
    let total = 0;
    for (const comp of GizmoList) {
        if (!isUsableProbeGizmo(comp)) continue;
        try {
            total += comp.regionSelectProbes(left, right, top, bottom, additive);
        } catch (e) {
            console.warn('[LightProbeGroup] regionSelectProbes failed:', e);
        }
    }
    return total;
}

/** 为当前选中的 LightProbeGroup 重新生成探针。 */
export function generateLightProbes(): number {
    let total = 0;
    for (const comp of GizmoList) {
        // 当前项目的 gizmo 实例在选中节点时才会保持可见并绑定 target。
        if (!isUsableProbeGizmo(comp)) continue;
        if (comp.generateLightProbes()) total++;
    }
    return total;
}

// MODE_CHANGED 监听：复刻 Creator manager.ts 语义，用 CLI 的 broadcast + ServiceEvents。
eventEmitter.on(MODE_CHANGED, (newMode: LightEditMode, _oldMode: LightEditMode) => {
    const vertexOn = newMode === LightEditMode.VERTEX;
    const boxOn = newMode === LightEditMode.BOX;

    // 变换工具切换：
    // - VERTEX：切成 'view'，隐藏节点变换箭头，避免其抢占探针球的鼠标拾取（关键修复）；
    //   并备份进入前的工具名，退出时还原。
    // - BOX / NONE：使用 'position'（对齐 Creator：包围盒编辑仍显示 position 工具），
    //   若之前从 vertex 备份过工具名，则还原为备份值。
    try {
        const gizmoSvc = getService()?.Gizmo;
        const ttd = gizmoSvc?.transformToolData;
        if (gizmoSvc && ttd) {
            if (vertexOn) {
                if (toolNameBackup === undefined) {
                    toolNameBackup = ttd.toolName;
                    viewModeBackup = ttd.viewMode;
                }
                // toolName='view' 的 setter 是 toggle 语义（依据当前 viewMode 翻转）。
                // 先强制 viewMode='select'，再设 'view'，确保结果稳定为 view 模式，
                // 从而 changeTool 换成空的 ViewGizmo 并隐藏 position/rotation/scale controller。
                if (ttd.toolName !== 'view') gizmoSvc.transformToolName = 'view';
                ttd.viewMode = 'select';
            } else {
                // 退出 vertex（切到 BOX 或 NONE）：还原为备份工具名，无备份则回到 position。
                const restoreTool = toolNameBackup;
                const restoreViewMode = viewModeBackup;
                toolNameBackup = undefined;
                viewModeBackup = undefined;
                if (restoreTool !== undefined && ttd.toolName !== restoreTool) gizmoSvc.transformToolName = restoreTool;
                if (restoreViewMode !== undefined) ttd.viewMode = restoreViewMode;
            }
        }
    } catch (e) {
        // Service 尚未就绪（如启动早期），忽略。
    }

    // VERTEX：通知各 gizmo + 广播
    GizmoList.forEach((c) => c.lightProbeEditModeChanged(vertexOn));
    broadcast('scene:light-probe-edit-mode-changed', vertexOn);

    // BOX：通知各 gizmo + 广播
    GizmoList.forEach((c) => c.boundingBoxEditModeChanged(boxOn));
    broadcast('scene:light-probe-bounding-box-edit-mode-changed', boxOn);
    // NONE 时 vertexOn/boxOn 均为 false，两者都会被关闭。
});

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
    private _convexNode: Node | null = null;
    private _normalNode: Node | null = null;
    private _boundTarget: LightProbeGroup | null = null;
    private _dotsVolume = -1;                     // 上次建点用的球体积，用于失效缓存
    private _reuseMesh: any = null;
    private _lastInfoSig = '';                    // lightProbeInfo 显示设置/数据签名，用于按需刷新
    // 上次「已同步给引擎（onProbeChanged 重剖分）」时的探针位置指纹。
    // 用于检测 undo/redo 等外部改动：外部只改了 target.probes 但没触发引擎重剖分时，
    // 引擎的四面体顶点（info.data.probes）还是旧的 → 线框与探针球脱节。检测到不一致即补一次 onProbeChanged。
    private _engineSyncedPosSig = '';
    // 重入守卫：_syncEngineIfProbesChanged 调 onProbeChanged 时，引擎可能同步回调
    // lightProbeInfoChanged → updateControllerData → 本方法，形成递归。此标志阻断重入。
    private _syncingEngine = false;
    // 本 gizmo 是否处于「显示」状态（其节点被选中）。onShow=true / onHide=false。
    // onUpdate 每帧都会跑 updateControllerData，若不按此门控，取消选中后探针球/线框会被重新激活而不消失。
    private _shown = false;
    // 是否处于 Edit Area Box 模式：仅此时才显示可拖绿色包围盒。
    // 选中默认 false（只展示探针球/线框），由后续 T2 的 changeEditMode 驱动。
    private _boxEditMode = false;

    // mouseDown 时捕获
    private _minPos = new Vec3();
    private _maxPos = new Vec3();
    private _scale = new Vec3();
    private _minPropPath: string | null = null;
    private _maxPropPath: string | null = null;

    // ── T8a: vertex 逐探针编辑状态 ──────────────────────────────
    // 是否处于 vertex 模式：仅此时探针球可被拖动。
    private _vertexEditMode = false;
    // 探针球节点 → 其在 target.probes 中的索引（_rebuildDots 时重建）。
    private _probeIndexByName = new Map<string, number>();
    // 已注册鼠标事件的探针球节点（退出/重建时统一解绑）。
    private _probeMouseHandlers = new Map<Node, { down: (e: any) => void; move: (e: any) => void; up: (e: any) => void }>();
    // 当前选中的探针球 name 集合。
    private _selected = new Set<string>();

    // ── 探针框选（drag-box）状态 ──────────────────────────────
    // 在探针球上按下后：未拖动松手=单选；拖动=框选。以下为框选期间的状态。
    // 是否已进入框选（本次按下的拖动距离超过阈值）。
    private _probeBoxSelecting = false;
    // 本次按下命中的探针 name（用于「未拖动松手=单选」的落地）。
    private _probeDownName: string | null = null;
    // 按下时的屏幕坐标（判定是否达到拖动阈值 + 计算选区矩形）。
    private _probeDownX = 0;
    private _probeDownY = 0;
    // 按下时是否按了增选修饰键（Ctrl/Cmd/Shift）。
    private _probeDownAdditive = false;
    // 框选起始时的选中集合快照（additive 语义每帧以「快照 ∪ 命中」重建，避免抖动）。
    private _probeBoxSnapshot = new Set<string>();

    // ── T12: 三轴位置 gizmo（PositionController）────────────────────
    // 选中探针后展示的 3 轴平移控制器：拖动它的箭头/平面来移动探针，
    // 探针像单独的场景 node 一样被操作（不再直接拖球本身，避免快速移动脱离
    // 球屏幕区域后事件中断）。惰性创建，本 gizmo 私有实例（不与节点 gizmo 共用单例）。
    private _probeController: PositionController | null = null;
    // controller 拖动中：各选中探针的本地起点（name → 本地坐标）。
    private _ctrlDragStartLocal = new Map<string, Vec3>();
    // controller 拖动中的 Undo 记录 id / 属性路径。
    private _ctrlDragUndoId: string | null = null;
    private _ctrlDragPropPath: string | null = null;
    private _ctrlDragging = false;
    // 拖动中的线框快照：按下时缓存线段拓扑与各端点世界起点，移动时只做「端点 += 世界增量」
    // 并重画，避免每帧重新四面体剖分（onProbeChanged 的重剖分很贵，才导致松手卡顿）。
    private _dragWirePositions: Vec3[] = [];     // 每个线框顶点的世界起点（拷贝，不引用引擎数据）
    private _dragWireIndices: number[] = [];     // 线段索引对（引用 _dragWirePositions）
    private _dragWireMoveMask: boolean[] = [];   // 每个线框顶点是否属于选中探针（需跟随增量移动）

    init() {
        this.createController();
        this._isInitialized = true;
        // 注册到模块级 GizmoList，供状态机在 MODE_CHANGED 时统一通知（对齐 Creator）。
        if (!GizmoList.includes(this)) GizmoList.push(this);
        // 新建的 gizmo 立即对齐当前编辑模式（例如已处于 box 模式时选中新组）。
        this._boxEditMode = currentEditMode === LightEditMode.BOX;
    }

    onShow() {
        this._shown = true;
        // 选中即展示探针球/线框；绿色可拖包围盒只有在 box 编辑模式下才显示（见 updateControllerData）。
        this.updateControllerData();
        // 新选中的 gizmo 可能在全局已经处于 VERTEX 模式后才显示，必须同步
        // 进入 vertex 状态，否则小球可见但不会绑定鼠标选择事件。
        if (currentEditMode === LightEditMode.VERTEX && !this._vertexEditMode) {
            this.lightProbeEditModeChanged(true);
        }
    }

    onHide() {
        this._shown = false;
        this._selected.clear();
        this._controller.hide();
        this._probeController?.hide();
        if (this._dotsRoot) this._dotsRoot.active = false;
        if (this._wireframeNode) this._wireframeNode.active = false;
        if (this._convexNode) this._convexNode.active = false;
        if (this._normalNode) this._normalNode.active = false;
        this._lastInfoSig = '';
        // 与 onShow 的「选中即进 vertex」配对：取消选中/切走节点时自动退出 vertex 模式，
        // 让 currentEditMode 复位为 none（否则状态机会一直停留在 vertex，导致下次选中不再自动进入，
        // 且面板 "Exit Probe Edit Mode" 按钮态无法复位）。box 模式为用户主动开启，这里不动它。
        if (getEditMode() !== LightEditMode.NONE && !GizmoList.some(isUsableProbeGizmo)) {
            changeEditMode(LightEditMode.NONE);
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

        // 包围盒默认隐藏：仅在 box 编辑模式（_boxEditMode===true）下才显示。
        this._controller.hide();
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

    /** 重新生成当前 LightProbeGroup 的探针并刷新可视化。 */
    generateLightProbes(): boolean {
        if (!this.target) return false;

        this.target.generateLightProbes();
        this._probesRef = null;
        this._dotsVolume = -1;
        this._lastInfoSig = '';
        this._rebuildDots(true);
        this._rebuildWireframe();
        this.onComponentChanged(this.target.node);
        return true;
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
        if (this._boundTarget !== this.target) {
            this._selected.clear();
            this._boundTarget = this.target;
        }
        // 未处于显示状态（节点未选中/已切走）：强制隐藏所有可视元素并早退。
        // 否则 onUpdate 的每帧刷新会把探针球/线框重新激活，导致取消选中后探针不消失。
        if (!this._shown) {
            this._controller.hide();
            this._probeController?.hide();
            if (this._dotsRoot) this._dotsRoot.active = false;
            if (this._wireframeNode) this._wireframeNode.active = false;
            if (this._convexNode) this._convexNode.active = false;
            if (this._normalNode) this._normalNode.active = false;
            return;
        }
        if (!(this.target instanceof LightProbeGroup) || (this.target as any).enabledInHierarchy === false) {
            this._controller.hide();
            if (this._dotsRoot) this._dotsRoot.active = false;
            if (this._wireframeNode) this._wireframeNode.active = false;
            if (this._convexNode) this._convexNode.active = false;
            if (this._normalNode) this._normalNode.active = false;
            return;
        }

        const node = this.target.node;
        const worldPos = node.getWorldPosition();
        Quat.identity(tempQuat_a);

        // 绿色可拖包围盒：仅在 box 编辑模式下显示并可编辑，否则隐藏（避免选中即进入 Edit Area Box）。
        if (this._boxEditMode) {
            this._controller.show();
            this._controller.checkEdit();
            this._controller.setScale(unitScale);
            this._controller.setPosition(worldPos);
            this._controller.setRotation(tempQuat_a);
            const min = this.target.minPos;
            const max = this.target.maxPos;
            const center = Vec3.multiplyScalar(new Vec3(), Vec3.add(new Vec3(), min, max), 0.5);
            const fullSize = Vec3.subtract(new Vec3(), max, min);
            this._controller.updateSize(center, fullSize);
        } else {
            this._controller.hide();
        }

        // 探针球容器跟随节点世界变换
        if (this._dotsRoot) {
            this._dotsRoot.setWorldPosition(worldPos);
            this._dotsRoot.setWorldRotation(tempQuat_a);
            this._dotsRoot.setWorldScale(1, 1, 1);
        }
        this._rebuildDots(false);
        // 探针坐标可能因 undo/redo 等外部改动而变，但引擎的四面体数据（info.data）未随之重算，
        // 会导致线框与探针球脱节。检测到脱节时先让引擎重剖分，再重画线框。
        this._syncEngineIfProbesChanged();
        this._rebuildWireframe();
        this._rebuildConvex();
        // vertex 模式下探针数据可能因 undo/redo 等外部变化而改变位置：
        // 数据刷新后同步把 3 轴 gizmo 重新移到当前选中探针中心（拖动中不重定位，见内部 _ctrlDragging 守卫），
        // 否则会出现「探针 undo 跳回原位、但 gizmo 停在旧位置」的不同步。
        if (this._vertexEditMode) {
            this._updateProbeControllerTransform();
        }
    }

    /**
     * 检测探针坐标是否与引擎四面体数据脱节（如 undo/redo 只回退了 target.probes，
     * 但没触发引擎重剖分），若脱节则补一次 onProbeChanged() 让引擎重算四面体顶点，
     * 从而让线框跟随探针球回到正确位置。拖动中不触发（松手已同步），避免每帧重剖分卡顿。
     */
    private _syncEngineIfProbesChanged(): void {
        if (this._syncingEngine) return;                // 重入守卫：onProbeChanged 可能回调刷新，防止递归卡死
        if (this._ctrlDragging) return;                 // 拖动中：由拖动管线处理，松手统一同步
        if (!this.target) return;
        const sig = this._computeProbePosSig();
        if (sig === this._engineSyncedPosSig) return;   // 已同步，无需重剖分
        // 先记指纹再重剖分：onProbeChanged 内部可能同步回调 lightProbeInfoChanged →
        // updateControllerData → 本方法，若指纹未先更新会无限递归重剖分导致卡死。
        this._engineSyncedPosSig = sig;
        this._syncingEngine = true;
        try {
            // 探针位置与上次同步给引擎的不一致（外部改动/undo）：让引擎重算四面体，线框才不会脱节。
            (this.target as any).onProbeChanged?.();
        } finally {
            this._syncingEngine = false;
        }
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

        // 重建前解绑旧球的鼠标事件并清空索引映射（球节点即将被销毁）。
        this._unbindProbeHandlers();
        this._probeIndexByName.clear();
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
            }
            // 唯一 name：既用于选中集合，也用于反查 probes 索引（对齐 Creator LightProbeSphere_*）。
            const probeName = `LightProbeSphere_${i}`;
            dot.name = probeName;
            this._probeIndexByName.set(probeName, i);
            dot.parent = this._dotsRoot;
            dot.setPosition(probes[i]);
            dot.setScale(scale, scale, scale);
            // 选中态高亮
            setMeshColor(dot, this._selected.has(probeName) ? SELECTED_PROBE_COLOR : PROBE_COLOR);
            // vertex 模式下让球可被拖动
            if (this._vertexEditMode) this._bindProbeHandlers(dot, probeName);
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

    private _rebuildConvex(): void {
        if (!this._convexNode || !this._normalNode) return;
        this._convexNode.active = false;
        this._normalNode.active = false;
        const info = this._getLightProbeInfo();
        const data = info?.data;
        if (!this.target || !info?.showConvex || !data || data.empty?.()) return;

        const geometry = buildLightProbeConvex(data.probes ?? [], data.tetrahedrons ?? []);
        for (const node of [this._convexNode, this._normalNode]) {
            node.setWorldPosition(0, 0, 0);
            node.setRotationFromEuler(0, 0, 0);
            node.setWorldScale(1, 1, 1);
        }
        if (geometry.indices.length > 0) {
            ControllerUtils.drawLines(this._convexNode, geometry.positions, geometry.indices, WIREFRAME_COLOR);
            this._convexNode.active = true;
        }
        if (geometry.normalIndices.length > 0) {
            ControllerUtils.drawLines(this._normalNode, geometry.normalPositions, geometry.normalIndices, WIREFRAME_COLOR);
            this._normalNode.active = true;
        }
    }

    /**
     * 拖动开始：把当前线框的顶点【世界起点】与线段拓扑快照下来，并标记每个顶点是否属于
     * 选中探针（属于则拖动中跟随世界增量移动）。之后每帧只做端点平移 + 重画，不做四面体重剖分。
     */
    private _snapshotDragWireframe(): void {
        this._dragWirePositions = [];
        this._dragWireIndices = [];
        this._dragWireMoveMask = [];
        if (!this.target || !this._dotsRoot) return;
        const info = this._getLightProbeInfo();
        const data = info?.data;
        if (!data || data.empty?.()) return;
        const vertices = data.probes ?? [];
        const tetrahedrons = data.tetrahedrons ?? [];
        if (vertices.length === 0 || tetrahedrons.length === 0) return;

        // 选中探针的世界坐标集合（用于判定线框顶点是否需要跟随移动）。
        const selectedWorld: Vec3[] = [];
        const probes = this.target.probes ?? [];
        for (const name of this._selected) {
            const i = this._probeIndexByName.get(name);
            if (i === undefined || i >= probes.length) continue;
            const w = new Vec3();
            Vec3.transformMat4(w, probes[i], this._dotsRoot.worldMatrix);
            selectedWorld.push(w);
        }

        // 顶点世界起点 + 是否属于选中探针（按位置就近匹配，阈值取球半径量级）。
        const EPS2 = 1e-4;
        for (const v of vertices) {
            const p: Vec3 = v.position;
            this._dragWirePositions.push(new Vec3(p.x, p.y, p.z));
            let moves = false;
            for (const sw of selectedWorld) {
                if (Vec3.squaredDistance(p, sw) <= EPS2) { moves = true; break; }
            }
            this._dragWireMoveMask.push(moves);
        }

        // 线段索引（复用 _rebuildWireframe 的内部四面体去重逻辑）。
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
                this._dragWireIndices.push(a, b);
            }
        }
    }

    /**
     * 拖动中：把快照顶点里「属于选中探针」的那些加上世界增量，重画线框。
     * 只做端点平移 + drawLines，不重新四面体剖分（拖动小位移拓扑不变），因此实时且不卡。
     */
    private _updateDragWireframe(worldDelta: Vec3): void {
        if (!this._wireframeNode || this._dragWirePositions.length === 0 || this._dragWireIndices.length === 0) return;
        const positions: Vec3[] = new Array(this._dragWirePositions.length);
        for (let i = 0; i < this._dragWirePositions.length; i++) {
            const base = this._dragWirePositions[i];
            positions[i] = this._dragWireMoveMask[i]
                ? new Vec3(base.x + worldDelta.x, base.y + worldDelta.y, base.z + worldDelta.z)
                : base;
        }
        this._wireframeNode.active = true;
        this._wireframeNode.setWorldPosition(0, 0, 0);
        this._wireframeNode.setRotationFromEuler(0, 0, 0);
        this._wireframeNode.setWorldScale(1, 1, 1);
        ControllerUtils.drawLines(this._wireframeNode, positions, this._dragWireIndices, WIREFRAME_COLOR);
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        // 探针球位于会跟随目标节点变换的 dotsRoot 下，而线框使用世界坐标绘制在
        // 独立节点上。节点移动时 probes 数组没有变化，updateControllerData 的
        // 数据签名缓存不会触发线框重建，因此必须主动让引擎刷新四面体数据。
        // 这也是 NONE 模式下通过全局 position gizmo 移动 LightProbeGroup 的路径。
        if (!this._ctrlDragging && this.target) {
            (this.target as any).onProbeChanged?.(false, false);
            this._rebuildWireframe();
        }
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

    // ── 编辑模式回调（由模块级状态机 MODE_CHANGED 监听驱动，对齐 Creator）──────────────

    /** Box 模式变化：门控绿色包围盒显隐并刷新。 */
    boundingBoxEditModeChanged(mode: boolean): void {
        this._boxEditMode = mode;
        if (!this._isInitialized) return;
        if (mode) {
            this.updateControllerData(); // 内部按 _boxEditMode 显示并刷新包围盒
        } else {
            this._controller?.hide();
        }
    }

    /** Vertex 模式变化：进入时探针可拖动；退出时清理选中/事件并还原 pivot。（T8a） */
    lightProbeEditModeChanged(mode: boolean): void {
        if (!this._isInitialized) {
            if (!mode) {
                this._boxEditMode = false;
                this._controller?.hide();
            }
            return;
        }

        if (mode) {
            if (this._vertexEditMode) return;
            this._vertexEditMode = true;
            // 备份并将变换工具 pivot 设为 center：拖动以选中探针中心为基准，行为对齐 Creator。
            const ttd = getService()?.Gizmo?.transformToolData;
            if (ttd) {
                if (pivotBackup === undefined) pivotBackup = ttd.pivot;
                ttd.pivot = 'center';
            }
            // 重建探针球并为其绑定拖动事件。
            this._probesRef = null;
            this.updateControllerData();
        } else {
            if (!this._vertexEditMode && this._selected.size === 0) {
                // 仍需保证盒子/顶点编辑关闭（NONE/切走场景）。
                this._boxEditMode = false;
                this._controller?.hide();
                return;
            }
            this._vertexEditMode = false;
            this._ctrlDragging = false;
            this._probeController?.hide();
            this._unbindProbeHandlers();
            this._selected.clear();
            this._boxEditMode = false;
            this._controller?.hide();
            // 还原 pivot。
            const ttd = getService()?.Gizmo?.transformToolData;
            if (ttd && pivotBackup !== undefined) {
                ttd.pivot = pivotBackup;
                pivotBackup = undefined;
            }
            // 恢复默认颜色。
            this._probesRef = null;
            this.updateControllerData();
        }
    }

    // ── T8a: 逐探针拖动实现 ──────────────────────────────

    /** 为单个探针球节点注册鼠标事件（gizmo 射线管线会在球被点中时派发这些事件）。 */
    private _bindProbeHandlers(dot: Node, probeName: string): void {
        // 交互区分（对齐 Creator）：在探针球上
        // - 按下后【不拖动】直接松手 = 单选（松手时落地）。
        // - 按下后【拖动】 = 框选：以当前选区矩形内的所有探针为准，gizmo 实时移到选中中心。
        // gizmo-operation 的 _curMouseDownInfos 会把 mousedown 命中的球在后续 move/up 继续派发，
        // 即使光标移出球本体也不断，因此这里同时绑定 down/move/up。
        const down = (e: any) => {
            this._onProbeMouseDown(probeName, e);
        };
        const move = (e: any) => {
            this._onProbeMouseMove(e);
        };
        const up = (e: any) => {
            this._onProbeMouseUp(e);
        };
        this._probeMouseHandlers.set(dot, { down, move, up });
        dot.on('mouseDown', down);
        dot.on('mouseMove', move);
        dot.on('mouseUp', up);
    }

    /** 解绑所有探针球鼠标事件。 */
    private _unbindProbeHandlers(): void {
        for (const [dot, h] of this._probeMouseHandlers) {
            if (dot.isValid) {
                dot.off('mouseDown', h.down);
                dot.off('mouseMove', h.move);
                dot.off('mouseUp', h.up);
            }
        }
        this._probeMouseHandlers.clear();
    }

    /** 拖动中就地更新已存在探针球的本地坐标（不销毁/重建节点）。 */
    private _updateDotPositions(): void {
        if (!this._dotsRoot || !this.target) return;
        const probes = this.target.probes;
        if (!probes) return;
        for (const dot of this._dotsRoot.children) {
            const i = this._probeIndexByName.get(dot.name);
            if (i === undefined || i >= probes.length) continue;
            dot.setPosition(probes[i]);
        }
    }

    /** 按选中集合就地刷新探针球颜色（不销毁/重建节点）。 */
    private _recolorProbes(): void {
        if (!this._dotsRoot) return;
        for (const dot of this._dotsRoot.children) {
            setMeshColor(dot, this._selected.has(dot.name) ? SELECTED_PROBE_COLOR : PROBE_COLOR);
        }
    }

    private _onProbeMouseDown(probeName: string, event: any): void {
        if (!this._vertexEditMode || !this.target) return;
        event.propagationStopped = true;
        // 交互区分：按下时【不立即改选中】，只记录状态。
        // - 松手时若没拖动过 → 单选（在 _onProbeMouseUp 落地）。
        // - 拖动超过阈值 → 进入框选（在 _onProbeMouseMove 处理）。
        this._probeDownName = probeName;
        this._probeDownX = event.x ?? 0;
        this._probeDownY = event.y ?? 0;
        this._probeDownAdditive = !!(event.ctrlKey || event.metaKey || event.shiftKey);
        this._probeBoxSelecting = false;
        // 框选起始快照：additive 时以「快照 ∪ 命中」每帧重建；非 additive 时框选以命中为准。
        this._probeBoxSnapshot = new Set(this._selected);
    }

    /** 探针框选：按下后拖动，达到阈值即进入框选，以当前选区矩形内探针为准，gizmo 实时居中。 */
    private _onProbeMouseMove(event: any): void {
        if (!this._vertexEditMode || !this.target) return;
        if (this._probeDownName === null) return;
        event.propagationStopped = true;

        const x = event.x ?? 0;
        const y = event.y ?? 0;
        const dx = x - this._probeDownX;
        const dy = y - this._probeDownY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // 未达阈值：还不算拖动（保留「松手=单选」的可能）。
        if (!this._probeBoxSelecting && distance < 10) return;
        this._probeBoxSelecting = true;

        // 计算规整选区矩形（left<right、bottom<top），与 gizmo-operation 的选区约定一致。
        const revertX = this._probeDownX > x;
        const revertY = this._probeDownY < y;
        const left = revertX ? x : this._probeDownX;
        const right = revertX ? this._probeDownX : x;
        const bottom = revertY ? this._probeDownY : y;
        const top = revertY ? y : this._probeDownY;

        // 画选区矩形（复用 gizmo-operation 的绘制，保持视觉一致）。
        try {
            getService()?.Gizmo?.showRegionBox?.(left, right, top, bottom);
        } catch (e) {
            // geometry renderer 未就绪时忽略
        }

        // 每帧以快照为基准重建选中集合，避免拖动放大/缩小时累加抖动：
        // - additive（按了修饰键）：从快照出发，并入本次矩形命中。
        // - 非 additive：以本次矩形命中为准（先清空快照基准）。
        this._selected.clear();
        if (this._probeDownAdditive) {
            for (const name of this._probeBoxSnapshot) this._selected.add(name);
        }
        // additive=true：在当前 _selected 基础上并入矩形命中；内部会 _recolorProbes +
        // _updateProbeControllerTransform（把 gizmo 移到最新选中中心）+ 重绘。
        // 从探针小球上起手时也走模块级入口，让所有当前可见的
        // LightProbeGroup 都参与框选，而不是只处理当前 gizmo 实例。
        getService()?.Gizmo?.regionSelectLightProbes?.(
            left,
            right,
            top,
            bottom,
            false,
        );
    }

    /** 松手：未拖动=单选落地；拖动过=框选结束，隐藏选区矩形。 */
    private _onProbeMouseUp(event: any): void {
        if (this._probeDownName === null) return;
        event.propagationStopped = true;
        const name = this._probeDownName;
        const additive = this._probeDownAdditive;
        const wasBoxSelecting = this._probeBoxSelecting;
        // 清理本次按下的状态。
        this._probeDownName = null;
        this._probeBoxSelecting = false;

        if (wasBoxSelecting) {
            // 框选结束：选中集合已在 move 中构建好，这里只隐藏选区矩形。
            try {
                getService()?.Gizmo?.hideRegionBox?.();
            } catch (e) {
                // ignore
            }
            this._probeBoxSnapshot.clear();
            return;
        }

        // 未拖动：单选/增选落地（原 T8b 语义）。
        if (!this._vertexEditMode || !this.target) return;
        if (additive) {
            // 增选：切换该探针（已选→取消、未选→加入）。
            if (this._selected.has(name)) {
                this._selected.delete(name);
            } else {
                this._selected.add(name);
            }
        } else {
            // 无修饰键：清空其它，只选该探针。
            // 选择状态按 gizmo 实例保存，普通单击必须清空其它组的选择。
            unselectAllProbes();
            this._selected.add(name);
        }
        this._probeBoxSnapshot.clear();
        this._recolorProbes();
        this._updateProbeControllerTransform();
    }

    private _repaint(): void {
        try {
            getService()?.Engine?.repaintInEditMode?.();
        } catch (e) {
            // not ready
        }
    }

    // ── T12: 三轴位置 gizmo（PositionController）实现 ──────────────────────────────

    /** 惰性创建本 gizmo 私有的 3 轴平移控制器并绑定回调。 */
    private _ensureProbeController(): PositionController | null {
        if (sharedProbeController) {
            this._probeController = sharedProbeController;
            return sharedProbeController;
        }
        const gizmoRoot = this.getGizmoRoot?.();
        if (!gizmoRoot) return null;
        const ctrl = new PositionController(gizmoRoot);
        ctrl.onControllerMouseDown = sharedProbeControllerDown;
        ctrl.onControllerMouseMove = sharedProbeControllerMove;
        ctrl.onControllerMouseUp = sharedProbeControllerUp;
        // 注册相机移动/FOV 监听，使 gizmo 屏幕尺寸随距离恒定（对齐节点 position gizmo）。
        ctrl.registerEvents?.();
        ctrl.hide();
        this._probeController = ctrl;
        sharedProbeController = ctrl;
        sharedProbeControllerOwner = this;
        return ctrl;
    }

    /** 计算当前选中探针的世界中心。返回 false 表示没有可用选中。 */
    private _getSelectedCenterWorld(out: Vec3): boolean {
        if (!this.target || !this._dotsRoot || this._selected.size === 0) return false;
        const probes = this.target.probes;
        if (!probes) return false;
        out.set(0, 0, 0);
        let count = 0;
        for (const name of this._selected) {
            const i = this._probeIndexByName.get(name);
            if (i === undefined || i >= probes.length) continue;
            Vec3.transformMat4(tempDragA, probes[i], this._dotsRoot.worldMatrix);
            out.add(tempDragA);
            count++;
        }
        if (count === 0) return false;
        out.multiplyScalar(1 / count);
        return true;
    }

    /**
     * 根据当前选中集合刷新 3 轴 gizmo：有选中则移动到选中探针的世界中心并显示，
     * 否则隐藏。拖动进行中（_ctrlDragging）不重定位，避免打断拖动。
     */
    private _updateProbeControllerTransform(): void {
        if (!this._vertexEditMode) return;
        const ctrl = this._ensureProbeController();
        if (!ctrl) return;
        sharedProbeControllerOwner = GizmoList.find(isActiveProbeGizmo) ?? null;
        if (!sharedProbeControllerOwner) {
            ctrl.hide();
            return;
        }
        if (sharedProbeControllerOwner !== this) return;
        if (this._ctrlDragging) return;
        if (getSharedSelectedCenter(tempDragB)) {
            ctrl.setPosition(tempDragB);
            // 世界坐标系箭头（不随探针/节点旋转），行为对齐 Creator 的 global 平移。
            Quat.identity(tempQuat_a);
            ctrl.setRotation(tempQuat_a);
            ctrl.show();
        } else {
            ctrl.hide();
        }
        this._repaint();
    }

    /** 3 轴 gizmo 按下：快照各选中探针本地起点并开始 Undo 记录。 */
    private _onProbeCtrlDown(_event: any): void {
        if (!this._vertexEditMode || !this.target) return;
        const probes = this.target.probes;
        if (!probes) return;
        this._ctrlDragStartLocal.clear();
        for (const name of this._selected) {
            const i = this._probeIndexByName.get(name);
            if (i === undefined || i >= probes.length) continue;
            this._ctrlDragStartLocal.set(name, new Vec3(probes[i]));
        }
        if (this._ctrlDragStartLocal.size === 0) return;
        this._ctrlDragPropPath = this.getCompPropPath('probes');
        const svc = getService();
        try {
            this._ctrlDragUndoId = svc?.Undo?.beginRecording?.([this.target.node.uuid]) ?? null;
        } catch (e) {
            this._ctrlDragUndoId = null;
        }
        if (this._ctrlDragPropPath) this.onControlUpdate(this._ctrlDragPropPath);
        this._ctrlDragging = true;
        // 快照线框拓扑 + 端点世界起点，供拖动中做廉价的「端点跟随增量」重画（不重剖分）。
        this._snapshotDragWireframe();
    }

    /**
     * 3 轴 gizmo 移动：controller 已按被拖轴/平面算好【世界】增量（getDeltaPosition），
     * 把它换算到 dotsRoot 本地空间后叠加到各选中探针的本地起点，实现"像操作场景 node"的移动。
     */
    private _onProbeCtrlMove(_event: any): void {
        if (!this._ctrlDragging || !this._vertexEditMode || !this.target || !this._probeController) return;
        const probes = this.target.probes;
        if (!probes) return;
        const worldDelta = this._probeController.getDeltaPosition();
        // 世界增量 → dotsRoot 本地增量：逆旋转 + 逐轴除以世界缩放。
        const dotsRoot = this._dotsRoot;
        tempDelta.set(worldDelta);
        if (dotsRoot) {
            Quat.invert(tempQuat_a, dotsRoot.worldRotation);
            Vec3.transformQuat(tempDelta, tempDelta, tempQuat_a);
            const ws = dotsRoot.worldScale;
            tempDelta.x /= ws.x || 1;
            tempDelta.y /= ws.y || 1;
            tempDelta.z /= ws.z || 1;
        }
        for (const [name, start] of this._ctrlDragStartLocal) {
            const i = this._probeIndexByName.get(name);
            if (i === undefined || i >= probes.length) continue;
            probes[i] = new Vec3(start.x + tempDelta.x, start.y + tempDelta.y, start.z + tempDelta.z);
        }
        this.target.probes = probes;
        // 拖动中只就地更新球位置，不重建节点（避免频繁重剖分线框，对齐 Creator）。
        this._updateDotPositions();
        // 线框跟随：用缓存拓扑 + 世界增量重画端点（不重剖分，实时跟着小球走）。
        this._updateDragWireframe(worldDelta);
        // 注意：拖动中【不】emit onComponentChanged —— 它会触发 node:change(COMPONENT_CHANGED)
        // 下游的重序列化/重剖分等重活，每帧发一次会明显卡顿；统一放到 mouseUp 发一次。
        this._repaint();
    }

    /** 3 轴 gizmo 松手：同步进引擎 + 重算线框 + 结束 Undo + 把 gizmo 重定位到新中心。 */
    private _onProbeCtrlUp(_event: any): void {
        if (!this._ctrlDragging) return;
        this._ctrlDragging = false;
        if (this.target) {
            // 绝不能用 generateLightProbes()——它会依据包围盒重新生成整组探针，丢弃拖动结果。
            // onProbeChanged() 内部会 syncData + update(true) 做一次四面体重剖分（唯一一次、语义必需）。
            (this.target as any).onProbeChanged?.();
            // 松手不再 _rebuildDots(true)：拖动中已用 _updateDotPositions() 就地移动球，
            // 位置已正确；重建会 removeAllChildren + 逐球重建网格/重绑事件（探针多时很贵，
            // 正是"松手卡顿"的主因，Creator 也不会重建）。只需按新引擎数据重画线框即可。
            this._updateDotPositions();
            this._rebuildWireframe();
            // 拖动结果已同步给引擎：记录已同步位置指纹，避免 _syncEngineIfProbesChanged 重复重剑分。
            this._engineSyncedPosSig = this._computeProbePosSig();
            this.onComponentChanged(this.target.node);
        }
        if (this._ctrlDragPropPath) this.onControlEnd(this._ctrlDragPropPath);
        this._ctrlDragPropPath = null;
        const svc = getService();
        try {
            if (this._ctrlDragUndoId) svc?.Undo?.endRecording?.(this._ctrlDragUndoId);
        } catch (e) {
            // ignore
        }
        this._ctrlDragUndoId = null;
        this._ctrlDragStartLocal.clear();
        // 释放拖动线框快照。
        this._dragWirePositions = [];
        this._dragWireIndices = [];
        this._dragWireMoveMask = [];
        // 把 gizmo 移动到探针的新世界中心。
        this._updateProbeControllerTransform();
        // 同步信息签名：拖动中 onUpdate 被跳过（_lastInfoSig 停在拖动前的值），
        // 若不在此刷新，松手后首帧 onUpdate 会因签名变化而多做一次全量重建（正是本处特意避开的那次）。
        this._lastInfoSig = this._computeInfoSig();
    }

    // ── T8b: 逐探针选择 API（供模块级 RPC 聚合调用）──────────────

    /** 全选本组所有探针。 */
    selectAllProbes(): void {
        if (!this._vertexEditMode) return;
        for (const name of this._probeIndexByName.keys()) this._selected.add(name);
        this._recolorProbes();
        this._updateProbeControllerTransform();
        this._repaint();
    }

    /** 取消本组所有探针选择。 */
    unselectAllProbes(): void {
        if (this._selected.size === 0) return;
        this._selected.clear();
        this._recolorProbes();
        this._updateProbeControllerTransform();
        this._repaint();
    }

    /** 按 name 增选一批探针。 */
    selectProbes(names: Iterable<string>): void {
        if (!this._vertexEditMode) return;
        for (const name of names) {
            if (this._probeIndexByName.has(name)) this._selected.add(name);
        }
        this._recolorProbes();
        this._updateProbeControllerTransform();
        this._repaint();
    }

    /** 按 name 取消选择一批探针。 */
    unselectProbes(names: Iterable<string>): void {
        for (const name of names) this._selected.delete(name);
        this._recolorProbes();
        this._updateProbeControllerTransform();
        this._repaint();
    }

    /** 当前选中探针的索引数组（本组内）。 */
    getSelectedProbeIndices(): number[] {
        const out: number[] = [];
        for (const name of this._selected) {
            const i = this._probeIndexByName.get(name);
            if (i !== undefined) out.push(i);
        }
        return out.sort((a, b) => a - b);
    }

    get selectedProbeCount(): number {
        return this._selected.size;
    }

    // ── 框选（region-select）方案 A：独立入口，不侵入 gizmo-operation 主流程 ──────────
    /**
     * 框选探针（方案 A）。由上层在框选时主动调用，本 gizmo 自行把每个探针投影到屏幕，
     * 判定是否落入屏幕矩形（left/right/top/bottom，已规整为 left<right、bottom<top）。
     *
     * 关键点：
     * - 仅 vertex 模式生效；否则返回 0（不干预场景节点框选）。
     * - 用 render-scene 相机 `camera.worldToScreen(OUT, worldPos)`（out 在第一个参数！）投影，
     *   与 node-utils.ts isNodeInRegion 的相机 API 用法一致。
     * - 探针在 GIZMOS 层、gizmo-operation 的框选管线取不到它们，所以必须在这里自行投影判定。
     * - additive=false：以框选结果为准（先清空再选）；additive=true：并入现有选中集合。
     *   每帧调用应保持幂等 —— 上层若逐帧调用，应在框选起始快照选中集合，
     *   每帧以 (快照 ∪ 命中集) 作为 additive 语义传入，避免累加抖动。
     * @returns 本组当前选中探针数量。
     */
    regionSelectProbes(left: number, right: number, top: number, bottom: number, additive: boolean): number {
        if (!this._vertexEditMode || !this.target || !this._dotsRoot) return 0;
        const probes = this.target.probes;
        if (!probes || probes.length === 0) return this._selected.size;
        const camera = getService()?.Camera?.getCamera?.()?.camera;
        if (!camera) return this._selected.size;

        if (!additive) this._selected.clear();

        const worldMat = this._dotsRoot.worldMatrix;
        for (const [name, i] of this._probeIndexByName) {
            if (i >= probes.length) continue;
            // 探针本地坐标 → 世界坐标（dotsRoot 世界矩阵，与探针球实际位置一致）。
            Vec3.transformMat4(tempRegionWorld, probes[i], worldMat);
            // render-scene 相机：worldToScreen(OUT, worldPos)，out 在第一个参数。
            camera.worldToScreen(tempRegionScreen, tempRegionWorld);
            // 与 inRegion 判定一致：x∈[left,right] 且 y∈[bottom,top]（用中心点，探针是点无体积）。
            if (
                tempRegionScreen.x >= left &&
                tempRegionScreen.x <= right &&
                tempRegionScreen.y <= top &&
                tempRegionScreen.y >= bottom
            ) {
                this._selected.add(name);
            }
        }

        // 就地刷新高亮 + 重定位 3 轴 gizmo 到新的选中中心。
        this._recolorProbes();
        this._updateProbeControllerTransform();
        this._repaint();
        return this._selected.size;
    }

    // ── T8c: 键盘删除 / 复制选中探针 ──────────────────────────────

    /** 删除当前选中的探针（对齐 Creator deleteCurrentSelectedProbes）。返回删除数量。 */
    deleteCurrentSelectedProbes(): number {
        if (!this._vertexEditMode || !this.target) return 0;
        const probes = this.target.probes;
        if (!probes || this._selected.size === 0) return 0;
        // 收集要删除的索引（降序，便于就地 splice 不影响后续索引）。
        const delIndices = this.getSelectedProbeIndices();
        if (delIndices.length === 0) return 0;

        const node = this.target.node;

        // 过滤掉被选中的探针（用 Set 判定索引）。
        const delSet = new Set(delIndices);
        const kept: Vec3[] = [];
        for (let i = 0; i < probes.length; i++) {
            if (!delSet.has(i)) kept.push(probes[i]);
        }
        this.target.probes = kept;
        this._selected.clear();
        // 用 onProbeChanged 同步删除结果，而非 generateLightProbes（后者会重新生成整组探针，撤销删除）。
        (this.target as any).onProbeChanged?.();
        this._engineSyncedPosSig = this._computeProbePosSig();
        this._probesRef = null;
        this._rebuildDots(true);
        this._rebuildWireframe();
        this.onComponentChanged(node);
        // 选中已清空：隐藏 3 轴 gizmo。
        this._updateProbeControllerTransform();
        this._repaint();
        return delIndices.length;
    }

    /** 复制当前选中的探针（在原位新增副本，对齐 Creator duplicateCurrentSelectedProbes）。返回新增数量。 */
    duplicateCurrentSelectedProbes(): number {
        if (!this._vertexEditMode || !this.target) return 0;
        const probes = this.target.probes;
        if (!probes || this._selected.size === 0) return 0;
        const dupIndices = this.getSelectedProbeIndices();
        if (dupIndices.length === 0) return 0;

        const node = this.target.node;

        const next = probes.slice();
        for (const i of dupIndices) {
            next.push(new Vec3(probes[i]));
        }
        this.target.probes = next;
        // 用 onProbeChanged 同步复制结果，而非 generateLightProbes（后者会重新生成整组探针，撤销复制）。
        (this.target as any).onProbeChanged?.();
        this._engineSyncedPosSig = this._computeProbePosSig();
        this._probesRef = null;
        // 选中新复制出来的探针（索引为 next 尾部），方便立即拖动。
        const baseLen = probes.length;
        this._selected.clear();
        for (let k = 0; k < dupIndices.length; k++) {
            this._selected.add('LightProbeSphere_' + (baseLen + k));
        }
        this._rebuildDots(true);
        this._rebuildWireframe();
        this.onComponentChanged(node);
        // 选中变为新复制出来的探针：把 3 轴 gizmo 移到它们的世界中心。
        this._updateProbeControllerTransform();
        this._repaint();
        return dupIndices.length;
    }

    /**
     * vertex 模式下的键盘处理：Delete/Backspace 删除选中探针；Ctrl/Cmd+D 复制选中探针。
     * 返回 false 表示已消费该事件（阻止后续默认处理，如删除节点）。
     */
    onKeyDown(event: any): boolean | void {
        if (!this._vertexEditMode) return;
        const key = (event?.key || '').toLowerCase();
        const isDelete = key === 'delete' || key === 'backspace' || event?.keyCode === 8 || event?.keyCode === 46;
        const isDuplicate = (event?.ctrlKey || event?.metaKey) && key === 'd';
        if (this._selected.size === 0) {
            // vertex 模式下即便没选中也吞掉删除键，避免误删 LightProbeGroup 节点。
            if (isDelete || isDuplicate) return false;
            return;
        }
        if (isDuplicate) {
            void duplicateSelectedProbes().catch(e => console.warn('[LightProbeGroup] duplicateSelectedProbes failed:', e));
            return false;
        }
        if (isDelete) {
            void deleteSelectedProbes().catch(e => console.warn('[LightProbeGroup] deleteSelectedProbes failed:', e));
            return false;
        }
    }


    /** 探针信息变化：失效缓存并重绘。 */
    lightProbeInfoChanged(): void {
        this._probesRef = null;
        this._dotsVolume = -1;
        this._lastInfoSig = '';
        if (this._isInitialized) this.updateControllerData();
    }

    // lightProbeInfo 的显示设置/探针数据可能在没有节点变化时改变（如烘焙、面板开关、球体积）。
    // 每帧只做一次廉价签名比较，变化时才刷新，避免每帧重建。
    onUpdate() {
        // 拖动/框选进行中：探针坐标每帧都在变，签名会每帧变化。此时【绝不能】走下面的刷新路径，
        // 否则 _probesRef=null 会让 _rebuildDots 每帧强制重建全部探针球（removeAllChildren+逐球重建网格/重绑事件），
        // 极卡。拖动由拖动管线用 _updateDotPositions()/_updateDragWireframe() 就地更新，无需 onUpdate 介入。
        if (this._ctrlDragging || this._probeBoxSelecting) return;
        const sig = this._computeInfoSig();
        if (sig === this._lastInfoSig) return;
        this._lastInfoSig = sig;
        // 位置指纹变化可能来自 undo/redo 的原地改写（probes 数组引用不变），
        // 需失效缓存强制重建探针球，否则球不会跟随回退后的坐标。
        this._probesRef = null;
        this.updateControllerData();
    }

    /** 探针位置指纹：数量 + 各坐标分量加权和。用于检测 undo/redo 等外部改动。 */
    private _computeProbePosSig(): string {
        const probes = this.target?.probes;
        if (!probes) return '0';
        let posSum = 0;
        for (let i = 0; i < probes.length; i++) {
            const p = probes[i];
            posSum += p.x + p.y * 2 + p.z * 3;
        }
        return `${probes.length}|${posSum.toFixed(3)}`;
    }

    private _computeInfoSig(): string {
        const info = this._getLightProbeInfo();
        const data = info?.data;
        const probes = this.target?.probes;
        // 廉价位置校验和：undo/redo 一次探针移动只改坐标、不改数量，
        // 仅凭 length/tetrahedrons 计数无法察觉，会导致 gizmo 不跟随。
        // 累加坐标分量得到一个位置指纹，位置一变签名就变，从而触发 updateControllerData。
        let posSum = 0;
        if (probes) {
            for (let i = 0; i < probes.length; i++) {
                const p = probes[i];
                posSum += p.x + p.y * 2 + p.z * 3;
            }
        }
        return [
            probes ? probes.length : 0,
            info ? (info.lightProbeSphereVolume ?? 1) : 1,
            info ? (info.showProbe ?? true) : true,
            info ? (info.showWireframe ?? true) : true,
            info ? (info.showConvex ?? false) : false,
            data?.tetrahedrons?.length ?? 0,
            data?.probes?.length ?? 0,
            posSum.toFixed(3),
            this.target?.node.worldPosition?.toString?.() ?? '',
        ].join('|');
    }

    onDestroy() {
        // 从模块级 GizmoList 移除，避免状态机继续通知已销毁实例。
        const idx = GizmoList.indexOf(this);
        if (idx >= 0) GizmoList.splice(idx, 1);
        this._unbindProbeHandlers();
        if (this._dotsRoot) {
            this._dotsRoot.destroy();
            this._dotsRoot = null;
        }
        if (this._wireframeNode) {
            this._wireframeNode.destroy();
            this._wireframeNode = null;
        }
        if (this._convexNode) {
            this._convexNode.destroy();
            this._convexNode = null;
        }
        if (this._normalNode) {
            this._normalNode.destroy();
            this._normalNode = null;
        }
        if (sharedProbeControllerOwner === this) {
            sharedProbeController?.hide();
            (sharedProbeController as any)?.destroy?.();
            sharedProbeController = null;
            sharedProbeControllerOwner = null;
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

// 对齐 Creator index.ts 的 methods：供 GizmoService.execGizmoMethods 反射调用。
export const methods = {
    changeEditMode,
    getEditMode,
    lightProbeInfoChanged,
    selectAllProbes,
    unselectAllProbes,
    getSelectedProbeCount,
    deleteSelectedProbes,
    duplicateSelectedProbes,
    regionSelectProbes,
    generateLightProbes,
};

registerGizmo(name, { SelectGizmo, IconGizmo, methods });
