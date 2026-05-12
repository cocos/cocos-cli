import { Camera, Color, gfx, js, Layers, MeshRenderer, Node, Quat, Vec3, ISizeLike } from 'cc';
import CameraControllerBase, { EditorCameraInfo } from './camera-controller-base';
import { CameraMoveMode, CameraUtils } from './utils';
import FiniteStateMachine from '../utils/state-machine/finite-state-machine';
import LinearTicks from './grid/linear-ticks';
import { tweenPosition, tweenRotation, tweenNumber } from './tween';
import IdleMode from './modes/idle-mode';
import OrbitMode from './modes/orbit-mode';
import PanMode from './modes/pan-mode';
import WanderMode from './modes/wander-mode';
import type ModeBase3D from './modes/mode-base-3d';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../operation/types';
import { Service } from '../core/decorator';

// ---------- node utility helpers ----------

function getCenterWorldPos3D(nodes: Node[]): Vec3 {
    if (nodes.length === 0) return new Vec3();
    if (nodes.length === 1) return nodes[0].getWorldPosition();
    const center = new Vec3();
    for (const node of nodes) {
        Vec3.add(center, center, node.getWorldPosition());
    }
    Vec3.multiplyScalar(center, center, 1 / nodes.length);
    return center;
}

function getWorldPosition3D(node: Node): Vec3 {
    return node.getWorldPosition();
}

function getMaxRangeOfNode(node: Node): number {
    let maxRange = 0.001;

    if (!node) return maxRange;
    if (node.layer & Layers.Enum.GIZMOS || node.layer & Layers.Enum.SCENE_GIZMO || node.layer & Layers.Enum.EDITOR) {
        return maxRange;
    }

    let compRange = 0;
    const components = node.components;

    if (components.length === 0) {
        maxRange = 1;
    }

    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        const className = js.getClassName(component);
        switch (className) {
            case 'cc.SphereLight':
            case 'cc.SpotLight':
            case 'cc.PointLight':
                compRange = (component as any).range ?? 3;
                break;
            case 'cc.RangedDirectionalLight':
            case 'cc.DirectionalLight':
            case 'cc.Camera':
                compRange = 3;
                break;
            case 'cc.MeshRenderer':
            case 'cc.SkinnedMeshRenderer':
            case 'cc.SkinnedMeshBatchRenderer': {
                const mr = component as MeshRenderer;
                if (mr.mesh && mr.model) {
                    const worldBound = mr.model.worldBounds;
                    if (worldBound) {
                        const he = worldBound.halfExtents;
                        if (!Number.isNaN(he.x) && !Number.isNaN(he.y) && !Number.isNaN(he.z)) {
                            compRange = Math.max(he.x, he.y, he.z);
                        }
                    }
                }
                break;
            }
            case 'cc.UITransform': {
                const ui = component as any;
                if (ui.getBoundingBox) {
                    const bbox = ui.getBoundingBox();
                    if (ui.node.parent) {
                        const wm = ui.node.parent.worldMatrix;
                        if (wm && bbox.transformMat4) {
                            bbox.transformMat4(wm);
                        }
                    }
                    compRange = Math.max(bbox.width / 2, bbox.height / 2);
                }
                break;
            }
            case 'cc.BoxCollider': {
                const size = (component as any).size;
                if (size) compRange = Math.max(size.x / 2, size.y / 2, size.z / 2);
                break;
            }
            case 'cc.SphereCollider':
                compRange = (component as any).radius ?? 1;
                break;
            case 'cc.CapsuleCollider': {
                const cap = component as any;
                compRange = Math.max((cap.height ?? 2) / 2, cap.radius ?? 0.5);
                break;
            }
            case 'cc.ReflectionProbe': {
                const size = (component as any).size;
                if (size) compRange = Math.max(size.x, size.y, size.z) / 2;
                break;
            }
        }

        if (compRange > maxRange) {
            maxRange = compRange;
        } else if (compRange === 0) {
            maxRange = Math.max(maxRange, 1);
        }
    }

    return Math.min(Math.max(maxRange, -1e10), 1e10);
}

function getMaxRangeOfNodes(nodes: Node[]): number {
    if (nodes.length === 0) return 1;
    let maxRange = Number.MIN_VALUE;

    for (const node of nodes) {
        const range = getMaxRangeOfNode(node);
        if (range > maxRange) maxRange = range;

        const childRange = getMaxRangeOfNodes(node.children as Node[]);
        if (childRange > maxRange) maxRange = childRange;
    }

    return Math.max(maxRange, 1);
}

function makeVec3InRange(v: Vec3, min: number, max: number): void {
    v.x = Math.min(max, Math.max(min, v.x));
    v.y = Math.min(max, Math.max(min, v.y));
    v.z = Math.min(max, Math.max(min, v.z));
}

// ---------- smooth mouse wheel helper ----------

export function smoothMouseWheelScale(delta: number): number {
    return (delta > 0 ? 1 : -1) * (Math.pow(2, Math.abs(delta) * 0.02) - 1) * 10;
}

// ---------- constants ----------

const _maxTicks = 100;

export class CameraController3D extends CameraControllerBase {
    protected _wheelSpeed = 0.01;
    protected _near = 0.1;
    protected _far = 10000;

    private _orthoScale = 0.1;
    private _minScalar = 0.1;

    public homePos = new Vec3(50, 50, 50);
    public homeRot: Quat;

    public sceneViewCenter = new Vec3();
    public viewDist = 20;
    public forward = new Vec3(Vec3.UNIT_Z);

    private _curRot = new Quat();
    private _curEye = new Vec3();

    private _lineColor = new Color(255, 255, 255, 50);

    // 预分配临时变量，避免高频方法中反复 new 产生 GC 压力
    private v3a = new Vec3();
    private v3b = new Vec3();
    private q1 = new Quat();

    public lastMouseWheelDeltaY = 0;
    public maxMouseWheelDeltaY = 1000;

    private _modeFSM!: FiniteStateMachine<ModeBase3D>;
    private _idleMode!: IdleMode;
    private _orbitMode!: OrbitMode;
    private _panMode!: PanMode;
    private _wanderMode!: WanderMode;

    public view?: number;
    private hTicks!: LinearTicks;
    private vTicks!: LinearTicks;

    public shiftKey?: boolean;
    public altKey?: boolean;
    public mousePressing = false;

    public lastFocusNodeUUID: string[] = [];

    // 动画状态
    private _posAnim: any = null;
    private _rotAnim: any = null;
    private _distAnim: any = null;

    constructor() {
        super();

        // Quat.fromViewUp 的 view 参数是相机的后向（+Z），即从原点指向相机位置的方向
        const viewDir = new Vec3();
        Vec3.normalize(viewDir, this.homePos);
        this.homeRot = new Quat();
        Quat.fromViewUp(this.homeRot, viewDir);
    }

    init(camera: Camera) {
        super.init(camera);

        // 创建网格
        const parentNode = this.node.parent || this.node;
        this._gridMeshComp = CameraUtils.createGrid('internal/editor/grid', parentNode);
        this._gridMeshComp.node.active = false;
        this._gridMeshComp.node.setWorldRotationFromEuler(90, 0, 0);

        // 初始化原点轴
        this.initOriginAxis();

        // 初始化模式状态机
        this._initMode();

        // 初始化线性刻度
        this._initLinearTick();

        // 重置相机位置
        this.reset();

        // 初始更新网格
        this.updateGrid();
    }

    showGrid(visible: boolean) {
        super.showGrid(visible);
        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = visible && (this.originAxisX_Visible || this.originAxisZ_Visible);
        }
        if (this._originAxisVerticalMeshComp?.node) {
            this._originAxisVerticalMeshComp.node.active = visible && this.originAxisY_Visible;
        }
    }

    // ---------- 原点轴 ----------

    private initOriginAxis() {
        const parentNode = this.node.parent || this.node;
        this._originAxisHorizontalMeshComp = CameraUtils.createGrid('internal/editor/grid', parentNode);
        this._originAxisHorizontalMeshComp.node.setWorldRotationFromEuler(90, 0, 0);
        this._originAxisVerticalMeshComp = CameraUtils.createGrid('internal/editor/grid', parentNode);
        this._originAxisVerticalMeshComp.node.setWorldRotationFromEuler(0, 90, 0);

        this.originAxisX_Visible = true;
        this.originAxisZ_Visible = true;
        this._originAxisHorizontalMeshComp.node.active = true;
        this._originAxisVerticalMeshComp.node.active = false;
    }

    updateOriginAxisByConfig(config: { x?: boolean; y?: boolean; z?: boolean }, update = true) {
        if (config.x !== undefined) this.originAxisX_Visible = config.x;
        if (config.y !== undefined) this.originAxisY_Visible = config.y;
        if (config.z !== undefined) this.originAxisZ_Visible = config.z;

        const showHorizontal = this.originAxisX_Visible || this.originAxisZ_Visible;
        const showVertical = this.originAxisY_Visible;

        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = showHorizontal;
        }
        if (this._originAxisVerticalMeshComp?.node) {
            this._originAxisVerticalMeshComp.node.active = showVertical;
        }

        if (update) {
            this.updateOriginAxis();
        }
    }

    getOriginAxisData() {
        const pos = this.v3a;
        this.node.getWorldPosition(pos);

        // 根据摄像机位置计算可见范围
        const dist = Math.abs(pos.y) + this._far;
        return {
            minH: pos.x - dist,
            maxH: pos.x + dist,
            minV: pos.z - dist,
            maxV: pos.z + dist,
            yDist: dist,
        };
    }

    updateOriginAxisHorizontal() {
        if (!this._originAxisHorizontalMeshComp?.node?.active) return;

        const { minH, maxH, minV, maxV } = this.getOriginAxisData();
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];
        let idx = 0;

        // X 轴 (水平红线) — mesh on XZ plane via RG32F, rotated 90° on X
        if (this.originAxisX_Visible) {
            const cameraPos = this.v3a;
            this.node.getPosition(cameraPos);
            positions.push(0, cameraPos.z);
            positions.push(0, minV);
            positions.push(0, cameraPos.z);
            positions.push(0, maxV);
            const c = this.originAxisX_Color;
            for (let i = 0; i < 4; i++) {
                colors.push(c.x, c.y, c.z, c.w);
            }
            indices.push(idx, idx + 1, idx + 2, idx + 3);
            idx += 4;
        }

        // Z 轴 (水平蓝线)
        if (this.originAxisZ_Visible) {
            const cameraPos = this.v3a;
            this.node.getPosition(cameraPos);
            positions.push(cameraPos.x, 0);
            positions.push(minH, 0);
            positions.push(cameraPos.x, 0);
            positions.push(maxH, 0);
            const c = this.originAxisZ_Color;
            for (let i = 0; i < 4; i++) {
                colors.push(c.x, c.y, c.z, c.w);
            }
            indices.push(idx, idx + 1, idx + 2, idx + 3);
            idx += 4;
        }

        // 补齐到 _maxTicks * _maxTicks
        while (positions.length / 2 < _maxTicks * _maxTicks) {
            positions.push(0, 0);
            colors.push(0, 0, 0, 0);
        }
        while (indices.length < _maxTicks * _maxTicks) {
            indices.push(0);
        }

        CameraUtils.updateVBAttr(this._originAxisHorizontalMeshComp, 'a_position', positions);
        CameraUtils.updateVBAttr(this._originAxisHorizontalMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
        CameraUtils.updateIB(this._originAxisHorizontalMeshComp, indices);
    }

    updateOriginAxisVertical() {
        if (!this._originAxisVerticalMeshComp?.node?.active) return;

        const { minH, maxH, yDist } = this.getOriginAxisData();
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        // Y 轴 (垂直绿线) — mesh rotated 90° on Y, RG32F maps to world Y
        if (this.originAxisY_Visible) {
            const cameraPos = this.v3a;
            this.node.getPosition(cameraPos);
            positions.push(0, cameraPos.z);
            positions.push(0, -yDist);
            positions.push(0, cameraPos.z);
            positions.push(0, yDist);
            const c = this.originAxisY_Color;
            for (let i = 0; i < 4; i++) {
                colors.push(c.x, c.y, c.z, c.w);
            }
            indices.push(0, 1, 2, 3);
        }

        // 补齐
        while (positions.length / 2 < _maxTicks * _maxTicks) {
            positions.push(0, 0);
            colors.push(0, 0, 0, 0);
        }
        while (indices.length < _maxTicks * _maxTicks) {
            indices.push(0);
        }

        CameraUtils.updateVBAttr(this._originAxisVerticalMeshComp, 'a_position', positions);
        CameraUtils.updateVBAttr(this._originAxisVerticalMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
        CameraUtils.updateIB(this._originAxisVerticalMeshComp, indices);
    }

    updateOriginAxis() {
        this.updateOriginAxisHorizontal();
        this.updateOriginAxisVertical();
    }

    // ---------- 模式状态机 ----------

    private _initMode() {
        this._idleMode = new IdleMode(this);
        this._orbitMode = new OrbitMode(this);
        this._panMode = new PanMode(this);
        this._wanderMode = new WanderMode(this);

        const modes = [this._idleMode, this._orbitMode, this._panMode, this._wanderMode];
        this._modeFSM = new FiniteStateMachine<ModeBase3D>(modes);

        // 添加所有模式之间的转换 (排除自身到自身)
        const modeNames = ['idle', 'orbit', 'pan', 'wander'];
        for (let i = 0; i < modes.length; i++) {
            for (let j = 0; j < modes.length; j++) {
                if (i !== j) {
                    this._modeFSM.addTransition(modes[i], modes[j], modeNames[j]);
                }
            }
        }

        this._modeFSM.Begin(this._idleMode);
    }

    private _initLinearTick() {
        this.hTicks = new LinearTicks();
        this.vTicks = new LinearTicks();
        this.hTicks.initTicks([2, 5], 0.001, 1000).spacing(10, 80);
        this.vTicks.initTicks([2, 5], 0.001, 1000).spacing(10, 80);
    }

    // ---------- active ----------

    set active(value: boolean) {
        if (value) {
            this._camera.projection = 1;
            this.node.setWorldPosition(this._curEye);
            this.node.setWorldRotation(this._curRot);
            this._camera.far = this.far;
            this._camera.near = this.near;
        } else {
            this.node.getWorldPosition(this._curEye);
            this.node.getWorldRotation(this._curRot);
        }
        this.showGrid(value);
    }

    get wanderSpeed(): number {
        return this._wanderMode.wanderSpeed;
    }

    set wanderSpeed(value: number) {
        this._wanderMode.wanderSpeed = value;
    }

    get enableAcceleration(): boolean {
        return this._wanderMode.enableAcceleration;
    }

    set enableAcceleration(value: boolean) {
        this._wanderMode.enableAcceleration = value;
    }

    // ---------- 模式切换 ----------

    async changeMode(command: string) {
        await this._modeFSM.issueCommand(command);
        this.emit('mode', command);
    }

    // ---------- 重置 ----------

    reset() {
        this.node.setWorldPosition(this.homePos);
        this.node.setWorldRotation(this.homeRot);

        Vec3.copy(this._curEye, this.homePos);
        Quat.copy(this._curRot, this.homeRot);

        this.updateViewCenterByDist(-this.viewDist);
    }

    // ---------- viewCenter ----------

    updateViewCenterByDist(viewDist: number) {
        this.node.getWorldRotation(this._curRot);

        const fwd = this.v3a;
        Vec3.set(fwd, 0, 0, -1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        this.node.getWorldPosition(this._curEye);
        Vec3.multiplyScalar(fwd, fwd, -viewDist);
        Vec3.add(this.sceneViewCenter, this._curEye, fwd);
    }

    // ---------- 缩放 ----------

    scale(delta: number) {
        let scalar = this.viewDist;
        if (Math.abs(scalar) < this._minScalar) {
            scalar = 1;
        }
        if (this.isOrtho()) {
            let height = this._camera.orthoHeight;
            height -= delta * this._wheelSpeed * scalar * this._orthoScale;
            height = Math.max(this._minScalar, height);
            this.setOrthoHeight(height);
        } else {
            const smoothed = smoothMouseWheelScale(delta);
            this.node.getWorldPosition(this._curEye);
            this.node.getWorldRotation(this._curRot);

            const fwd = this.v3a;
            Vec3.set(fwd, 0, 0, -1);
            Vec3.transformQuat(fwd, fwd, this._curRot);
            Vec3.normalize(fwd, fwd);

            Vec3.multiplyScalar(fwd, fwd, smoothed * this._wheelSpeed * scalar);
            Vec3.add(this._curEye, this._curEye, fwd);

            makeVec3InRange(this._curEye, -1e6, 1e6);

            this.node.setWorldPosition(this._curEye);
            this.viewDist = Vec3.distance(this._curEye, this.sceneViewCenter);
        }
        this.updateGrid();
    }

    smoothScale(delta: number) {
        this.scale(delta * this._wheelBaseScale);
    }

    // ---------- 焦点 ----------

    focusByNode(nodes: Node[], notChangeDist = false, immediate = false) {
        if (nodes.length === 0) return;

        // 判定 pivot 模式
        let pivot = 'center';
        pivot = Service.Gizmo?.transformToolData?.pivot ?? 'center';

        let targetPos: Vec3;
        if (pivot === 'pivot' && nodes.length === 1) {
            targetPos = getWorldPosition3D(nodes[0]);
        } else {
            targetPos = getCenterWorldPos3D(nodes);
        }

        const range = getMaxRangeOfNodes(nodes);
        let targetDist = this.viewDist;
        if (!notChangeDist) {
            if (this._camera.projection === Camera.ProjectionType.PERSPECTIVE) {
                const camWidth = this._camera.camera?.width;
                const camHeight = this._camera.camera?.height;
                if (camWidth && camHeight) {
                    const length = Math.min(camWidth, camHeight) / 2;
                    const A = new Vec3(0, 0, 1);
                    const B = new Vec3(length, 0, 1);
                    const worldA = new Vec3();
                    this._camera.screenToWorld(A, worldA);
                    const worldB = new Vec3();
                    this._camera.screenToWorld(B, worldB);
                    const disWorld = worldA.subtract(worldB).length();
                    if (disWorld > length * 3) {
                        targetDist = Math.max((range / length) * disWorld, this.near * 1.3);
                        targetDist = Math.min(targetDist, this.far * 0.9);
                    } else {
                        targetDist = Math.max(range * 2.5, 1);
                    }
                } else {
                    targetDist = Math.max(range * 2.5, 1);
                }
            } else {
                const fovRad = (this._camera.fov / 180) * Math.PI;
                const depthSize = fovRad * this._camera.orthoHeight;
                targetDist = ((range * depthSize) / this._camera.orthoHeight) * 13;
                let angle = this._camera.node.eulerAngles.x % 360;
                angle = Math.abs(angle) > 90 ? 180 - Math.abs(angle) : Math.abs(angle);
                targetDist = targetDist / Math.cos((angle / 180) * Math.PI);
            }
        }

        // 计算目标相机位置
        this.node.getWorldRotation(this._curRot);
        const fwd = this.v3a;
        Vec3.set(fwd, 0, 0, 1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        const targetCamPos = this.v3b;
        Vec3.multiplyScalar(targetCamPos, fwd, targetDist);
        Vec3.add(targetCamPos, targetPos, targetCamPos);

        Vec3.copy(this.sceneViewCenter, targetPos);

        if (immediate) {
            this.node.setWorldPosition(targetCamPos);
            Vec3.copy(this._curEye, targetCamPos);
            this.viewDist = Vec3.distance(targetCamPos, this.sceneViewCenter);
            this.updateGrid();
        } else {
            const startPos = this.node.getWorldPosition().clone();
            const endPos = targetCamPos.clone();

            this._posAnim = tweenPosition(startPos, endPos, 300);
            this._posAnim.step((pos: Vec3) => {
                this.node.setWorldPosition(pos);
                Vec3.copy(this._curEye, pos);
                this.viewDist = Vec3.distance(pos, this.sceneViewCenter);
                this.updateGrid();
            });
        }

        Service.Engine?.repaintInEditMode?.();
    }

    focus(nodeUuids: string[], editorCameraInfo?: EditorCameraInfo, immediate = false) {
        if (editorCameraInfo) {
            if (editorCameraInfo.position) {
                Vec3.copy(this._curEye, editorCameraInfo.position);
            } else {
                Vec3.copy(this._curEye, this.homePos);
            }
            if (editorCameraInfo.rotation) {
                Quat.copy(this._curRot, editorCameraInfo.rotation);
            } else {
                Quat.copy(this._curRot, this.homeRot);
            }
            if (editorCameraInfo.viewCenter) {
                Vec3.copy(this.sceneViewCenter, editorCameraInfo.viewCenter);
            } else {
                Vec3.set(this.sceneViewCenter, 0, 0, 0);
            }
            this.viewDist = Vec3.distance(this._curEye, this.sceneViewCenter);
            if (editorCameraInfo.viewDist !== undefined) {
                this.viewDist = editorCameraInfo.viewDist;
            }
            this.node.setWorldPosition(this._curEye);
            this.node.setWorldRotation(this._curRot);
            this.updateGrid();
            Service.Engine?.repaintInEditMode?.();
            return;
        }

        if (!nodeUuids || nodeUuids.length === 0) return;

        // 通过 UUID 查找节点
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const nodes: Node[] = [];
        for (const uuid of nodeUuids) {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                nodes.push(node);
            }
        }

        if (nodes.length === 0) return;

        this.lastFocusNodeUUID = nodeUuids.slice();
        this.focusByNode(nodes, false, immediate);
    }

    focusByXY(hitPoint: Vec3, immediate = false) {
        if (!hitPoint) return;

        const targetPos = hitPoint.clone();
        const targetDist = this.viewDist;

        this.node.getWorldRotation(this._curRot);
        const fwd = this.v3a;
        Vec3.set(fwd, 0, 0, 1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        const targetCamPos = this.v3b;
        Vec3.multiplyScalar(targetCamPos, fwd, targetDist);
        Vec3.add(targetCamPos, targetPos, targetCamPos);

        if (immediate) {
            this.node.setWorldPosition(targetCamPos);
            Vec3.copy(this._curEye, targetCamPos);
            Vec3.copy(this.sceneViewCenter, targetPos);
            this.viewDist = Vec3.distance(targetCamPos, this.sceneViewCenter);
            this.updateGrid();
        } else {
            const startPos = this.node.getWorldPosition().clone();
            const endPos = targetCamPos.clone();
            this._posAnim = tweenPosition(startPos, endPos, 300);
            this._posAnim.step((pos: Vec3) => {
                this.node.setWorldPosition(pos);
                Vec3.copy(this._curEye, pos);
                this.viewDist = Vec3.distance(pos, this.sceneViewCenter);
                this.updateGrid();
            });
        }

        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 对齐 ----------

    alignNodeToSceneView(nodeUuids: string[]) {
        if (!nodeUuids || nodeUuids.length === 0) return;

        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const nodes: Node[] = [];
        for (const uuid of nodeUuids) {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                nodes.push(node);
            }
        }
        if (nodes.length === 0) return;

        // 开始撤销记录
        let undoId: string | undefined;
        undoId = Service.Undo?.beginRecording?.(nodeUuids);

        const camPos = this.node.getWorldPosition();
        const camRot = this.node.getWorldRotation();

        for (const node of nodes) {
            node.setWorldPosition(camPos);
            node.setWorldRotation(camRot);

            // 同步相机组件的正交高度
            const cameras = node.getComponents(Camera as any) as Camera[];
            this.alignCameraOrthoHeightToNode(cameras);
        }

        // 结束撤销记录
        if (undoId) {
            Service.Undo?.endRecording?.(undoId);
        }

        Service.Engine?.repaintInEditMode?.();
    }

    alignCameraOrthoHeightToNode(cameras: Camera[]) {
        if (!cameras || cameras.length === 0) return;
        for (const cam of cameras) {
            if (cam && this._camera) {
                cam.orthoHeight = this._camera.orthoHeight;
            }
        }
    }

    alignSceneViewToNode(nodeUuids: string[]) {
        if (!nodeUuids || nodeUuids.length === 0) return;

        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const node = EditorExtends.Node.getNode(nodeUuids[0]);
        if (!node) return;

        const targetPos = node.getWorldPosition();
        const targetRot = node.getWorldRotation();

        this.node.setWorldPosition(targetPos);
        this.node.setWorldRotation(targetRot);
        this.updateViewCenterByDist(-this.viewDist);
        this.updateGrid();

        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 鼠标/键盘事件 ----------

    isMoving(): boolean {
        return this._modeFSM.currentState !== this._idleMode;
    }

    onMouseDBlDown(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseDBlDown(event);
    }

    onMouseDown(event: ISceneMouseEvent) {
        this.mousePressing = true;
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;

        // 根据按键组合切换模式
        if (event.rightButton) {
            // 右键：进入漫游模式
            void this.changeMode('wander');
        } else if (event.middleButton) {
            // 中键：进入平移模式
            void this.changeMode('pan');
        } else if (event.leftButton && event.altKey) {
            // Alt + 左键：进入旋转模式
            void this.changeMode('orbit');
        } else if (event.leftButton) {
            const isViewMode = !!Service.Gizmo?.isViewMode;
            if (isViewMode) {
                void this.changeMode('pan');
            }
        }

        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseDown(event);
    }

    onMouseMove(event: ISceneMouseEvent) {
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;

        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseMove(event);

        Service.Engine?.repaintInEditMode?.();
    }

    onMouseUp(event: ISceneMouseEvent) {
        this.mousePressing = false;

        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseUp(event);

        // 松开按键后返回空闲模式
        if (this._modeFSM.currentState !== this._idleMode) {
            void this.changeMode('idle');
        }
    }

    onMouseWheel(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        if (currentMode.modeName === CameraMoveMode.WANDER) {
            // 漫游模式下滚轮调节速度
            currentMode.onMouseWheel(event);
        } else {
            // 普通模式下滚轮缩放
            const delta = event.wheelDeltaY || event.deltaY;
            this.smoothScale(delta);
        }

        Service.Engine?.repaintInEditMode?.();
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onKeyDown(event);
    }

    onKeyUp(event: ISceneKeyboardEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onKeyUp(event);
    }

    onUpdate(deltaTime: number) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onUpdate(deltaTime);
    }

    onResize(size: ISizeLike) {
        this.updateGrid();
        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 网格 ----------

    private _updateGridData(
        positions: number[],
        colors: number[],
        lineColor: Color,
        lineEnd: number,
    ) {
        const camPos = this.v3a;
        this.node.getWorldPosition(camPos);

        const viewRange = this.viewDist * 4;
        this.hTicks.range(camPos.x - viewRange, camPos.x + viewRange, 1000);
        this.vTicks.range(camPos.z - viewRange, camPos.z + viewRange, 1000);

        const r = lineColor.r / 255;
        const g = lineColor.g / 255;
        const b = lineColor.b / 255;

        let idx = 0;

        for (let level = this.hTicks.minTickLevel; level <= this.hTicks.maxTickLevel; level++) {
            const ticks = this.hTicks.ticksAtLevel(level, true);
            const ratio = this.hTicks.tickRatios[level];
            const alpha = (lineColor.a / 255) * ratio;

            for (const tick of ticks) {
                if (idx + 2 > _maxTicks * _maxTicks) break;
                // 竖线：固定 x，从 minV 到 maxV
                positions[idx * 2] = tick;
                positions[idx * 2 + 1] = camPos.z - viewRange;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;

                positions[idx * 2] = tick;
                positions[idx * 2 + 1] = camPos.z + viewRange;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;
            }
        }

        for (let level = this.vTicks.minTickLevel; level <= this.vTicks.maxTickLevel; level++) {
            const ticks = this.vTicks.ticksAtLevel(level, true);
            const ratio = this.vTicks.tickRatios[level];
            const alpha = (lineColor.a / 255) * ratio;

            for (const tick of ticks) {
                if (idx + 2 > _maxTicks * _maxTicks) break;
                // 横线：固定 z，从 minH 到 maxH
                positions[idx * 2] = camPos.x - viewRange;
                positions[idx * 2 + 1] = tick;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;

                positions[idx * 2] = camPos.x + viewRange;
                positions[idx * 2 + 1] = tick;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;
            }
        }

        // 填充剩余为零
        while (idx < _maxTicks * _maxTicks) {
            positions[idx * 2] = 0;
            positions[idx * 2 + 1] = 0;
            colors[idx * 4] = 0;
            colors[idx * 4 + 1] = 0;
            colors[idx * 4 + 2] = 0;
            colors[idx * 4 + 3] = 0;
            idx++;
        }

        return idx;
    }

    updateGrid() {
        if (!this._gridMeshComp) return;

        const totalPoints = _maxTicks * _maxTicks;
        const positions: number[] = new Array(totalPoints * 2).fill(0);
        const colors: number[] = new Array(totalPoints * 4).fill(0);
        const indices: number[] = [];

        const count = this._updateGridData(positions, colors, this._lineColor, totalPoints);

        for (let i = 0; i < totalPoints; i++) {
            indices.push(i);
        }

        CameraUtils.updateVBAttr(this._gridMeshComp, 'a_position', positions);
        CameraUtils.updateVBAttr(this._gridMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
        CameraUtils.updateIB(this._gridMeshComp, indices);

        this.updateOriginAxis();
    }

    refresh() {
        this.updateGrid();
        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 旋转相机到指定方向 ----------

    rotateCameraToDir(dir: Vec3, rotateByViewDist: boolean) {
        const startRot = this.node.getWorldRotation().clone();
        const startPos = this.node.getWorldPosition().clone();

        // 计算目标旋转
        const normalizedDir = this.v3a;
        Vec3.normalize(normalizedDir, dir);

        const targetRot = new Quat();
        Quat.fromViewUp(targetRot, normalizedDir);

        // 计算目标位置
        const targetPos = new Vec3();
        if (rotateByViewDist) {
            Vec3.multiplyScalar(this.v3b, normalizedDir, -this.viewDist);
            Vec3.add(targetPos, this.sceneViewCenter, this.v3b);
        } else {
            Vec3.copy(targetPos, startPos);
        }

        this._rotAnim = tweenRotation(startRot, targetRot, 300);
        this._rotAnim.step((rot: Quat) => {
            this.node.setWorldRotation(rot);
        });

        this._posAnim = tweenPosition(startPos, targetPos, 300);
        this._posAnim.step((pos: Vec3) => {
            this.node.setWorldPosition(pos);
            this.updateViewCenterByDist(-this.viewDist);
            this.updateGrid();
        });

        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 投影相关 ----------

    getDepthSize(): number {
        if (this.isOrtho()) {
            return this._camera.orthoHeight * 2;
        }
        const fovRad = this._camera.fov * Math.PI / 180;
        return 2 * this.viewDist * Math.tan(fovRad / 2);
    }

    calcCameraPosInOrtho(): Vec3 {
        // 在正交模式下计算等效的透视位置
        const depthSize = this._camera.orthoHeight;
        const fovRad = this._camera.fov * Math.PI / 180;
        const halfFov = Math.tan(fovRad / 2);
        const dist = halfFov > 0 ? depthSize / halfFov : this.viewDist;

        this.node.getWorldRotation(this._curRot);
        const fwd = this.v3a;
        Vec3.set(fwd, 0, 0, 1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        const pos = this.v3b;
        Vec3.multiplyScalar(fwd, fwd, dist);
        Vec3.add(pos, this.sceneViewCenter, fwd);
        return pos.clone();
    }

    isOrtho(): boolean {
        return this._camera.projection === Camera.ProjectionType.ORTHO;
    }

    setOrthoHeight(newOrthoHeight: number) {
        newOrthoHeight = Math.max(this._minScalar, newOrthoHeight);
        this._camera.orthoHeight = newOrthoHeight;

        // 尝试同步到 Gizmo
        if (Service.Gizmo?.transformToolData) {
            Service.Gizmo.transformToolData.cameraOrthoHeight = newOrthoHeight;
        }
    }

    changeProjection() {
        if (this.isOrtho()) {
            // 正交 -> 透视
            const pos = this.calcCameraPosInOrtho();
            this._camera.projection = Camera.ProjectionType.PERSPECTIVE;
            this.node.setWorldPosition(pos);
            this.viewDist = Vec3.distance(pos, this.sceneViewCenter);
        } else {
            // 透视 -> 正交
            this._camera.projection = Camera.ProjectionType.ORTHO;
            const fovRad = this._camera.fov * Math.PI / 180;
            const halfFov = Math.tan(fovRad / 2);
            this._camera.orthoHeight = this.viewDist * halfFov;
        }

        this.updateGrid();

        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 缩放快捷键 ----------

    zoomUp() {
        this.scale(20);
    }

    zoomDown() {
        this.scale(-20);
    }

    zoomReset() {
        this.reset();
    }

    onDesignResolutionChange() {
        this.updateGrid();
    }
}

export default CameraController3D;
