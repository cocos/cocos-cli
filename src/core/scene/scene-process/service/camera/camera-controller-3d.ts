import { Camera, Color, gfx, js, Layers, Mat4, MeshRenderer, Node, Quat, Vec3, ISizeLike } from 'cc';
import CameraControllerBase, { EditorCameraInfo } from './camera-controller-base';
import { CameraMoveMode, CameraUtils } from './utils';
import FiniteStateMachine from '../utils/state-machine/finite-state-machine';
import LinearTicks from './grid/linear-ticks';
import { tweenNumber, tweenPosition, tweenRotation } from './tween';
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

const ORTHO = Camera.ProjectionType.ORTHO;
const PERSPECTIVE = Camera.ProjectionType.PERSPECTIVE;

enum ModeCommand {
    ToIdle = 'toIdle',
    ToPan = 'toPan',
    ToOrbit = 'toOrbit',
    ToWander = 'toWander',
}

export class CameraController3D extends CameraControllerBase {
    private v3a = new Vec3();
    private v3b = new Vec3();
    private v3c = new Vec3();
    private v3d = new Vec3();

    protected _wheelSpeed = 0.01;
    protected _near = 0.1;
    protected _far = 10000;
    protected readonly _orthoScale = 0.1;
    protected readonly _minScalar = 0.1;

    private homePos = new Vec3(50, 50, 50);
    private homeRot = Quat.fromViewUp(new Quat(), Vec3.normalize(this.v3a, this.homePos));
    private _sceneViewCenter = new Vec3();
    public viewDist = 20;

    private forward = new Vec3(Vec3.UNIT_Z);

    private _curRot = new Quat();
    private _curEye = new Vec3();

    private _lineColor = new Color(85, 85, 85, 255);

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

    public get sceneViewCenter() {
        return this._sceneViewCenter;
    }

    public set sceneViewCenter(value: Vec3) {
        this._sceneViewCenter.set(value);
    }

    public get wanderSpeed() {
        return this._wanderMode.wanderSpeed;
    }

    public set wanderSpeed(value: number) {
        this._wanderMode.wanderSpeed = value;
    }

    public get enableAcceleration() {
        return this._wanderMode.enableAcceleration;
    }

    public set enableAcceleration(value: boolean) {
        this._wanderMode.enableAcceleration = value;
    }

    init(camera: Camera) {
        super.init(camera);

        const parentNode = this.node.parent || this.node;
        this._gridMeshComp = CameraUtils.createGrid('internal/editor/grid', parentNode);
        this._gridMeshComp.node.active = false;
        this._gridMeshComp.node.setWorldRotationFromEuler(90, 0, 0);

        this.initOriginAxis();
        this._initMode();
        this.reset();
        this._initLinearTick();
    }

    showGrid(visible: boolean) {
        super.showGrid(visible);
        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = visible;
        }
        if (this._originAxisVerticalMeshComp?.node) {
            this._originAxisVerticalMeshComp.node.active = visible;
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
        this._originAxisHorizontalMeshComp.node.active = (this.originAxisX_Visible || this.originAxisZ_Visible);
        this._originAxisVerticalMeshComp.node.active = this.originAxisY_Visible;
    }

    updateOriginAxisByConfig(config: { x?: boolean; y?: boolean; z?: boolean }, update = true) {
        if (config.x !== undefined) this.originAxisX_Visible = config.x;
        if (config.y !== undefined) this.originAxisY_Visible = config.y;
        if (config.z !== undefined) this.originAxisZ_Visible = config.z;

        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = (this.originAxisX_Visible || this.originAxisZ_Visible);
        }
        if (this._originAxisVerticalMeshComp?.node) {
            this._originAxisVerticalMeshComp.node.active = this.originAxisY_Visible;
        }

        if (update) {
            this.updateOriginAxis();
        }
        Service.Engine?.repaintInEditMode?.();
    }

    private getOriginAxisData() {
        const cameraPos = new Vec3();
        this.node.getPosition(cameraPos);

        const distance = cameraPos.y;
        const scale = distance / 500;
        const range = 5000;
        const scaleRange = (range * scale) | 0;

        const curStartX = -scaleRange + cameraPos.x;
        const curEndX = scaleRange + cameraPos.x;
        const curStartY = -scaleRange + cameraPos.z;
        const curEndY = scaleRange + cameraPos.z;
        this.hTicks?.range(curStartX, curEndX, range);
        this.vTicks?.range(curStartY, curEndY, range);

        return {
            startX: curStartX,
            endX: curEndX,
            startY: curStartY,
            endY: curEndY,
            cameraPos,
        };
    }

    private updateOriginAxisVertical() {
        if (!this._originAxisVerticalMeshComp?.node?.active) return;

        const { startY, endY, cameraPos } = this.getOriginAxisData();
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        if (this.originAxisY_Visible) {
            positions.push(0, cameraPos.z);
            positions.push(0, startY);
            positions.push(0, cameraPos.z);
            positions.push(0, endY);

            const c = this.originAxisY_Color;
            for (let i = 0; i < 4; i++) {
                colors.push(c.x, c.y, c.z, c.w);
            }

            for (let i = 0; i < positions.length; i += 2) {
                indices.push(i / 2);
            }

            CameraUtils.updateVBAttr(this._originAxisVerticalMeshComp, gfx.AttributeName.ATTR_POSITION, positions);
            CameraUtils.updateVBAttr(this._originAxisVerticalMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
            CameraUtils.updateIB(this._originAxisVerticalMeshComp, indices);
        }
    }

    private updateOriginAxisHorizontal() {
        if (!this._originAxisHorizontalMeshComp?.node?.active) return;

        const { startY, endY, startX, endX, cameraPos } = this.getOriginAxisData();
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        if (this.originAxisX_Visible) {
            positions.push(0, cameraPos.z);
            positions.push(0, startY);
            positions.push(0, cameraPos.z);
            positions.push(0, endY);

            const c = this.originAxisX_Color;
            for (let i = 0; i < 4; i++) {
                colors.push(c.x, c.y, c.z, c.w);
            }
        }

        if (this.originAxisZ_Visible) {
            positions.push(cameraPos.x, 0);
            positions.push(startX, 0);
            positions.push(cameraPos.x, 0);
            positions.push(endX, 0);

            const c = this.originAxisZ_Color;
            for (let i = 0; i < 4; i++) {
                colors.push(c.x, c.y, c.z, c.w);
            }
        }

        if (positions.length > 0) {
            for (let i = 0; i < positions.length; i += 2) {
                indices.push(i / 2);
            }
            CameraUtils.updateVBAttr(this._originAxisHorizontalMeshComp, gfx.AttributeName.ATTR_POSITION, positions);
            CameraUtils.updateVBAttr(this._originAxisHorizontalMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
            CameraUtils.updateIB(this._originAxisHorizontalMeshComp, indices);
        }
    }

    private updateOriginAxis() {
        this.updateOriginAxisHorizontal();
        this.updateOriginAxisVertical();
    }

    // ---------- 模式状态机 ----------

    private _initMode() {
        this._idleMode = new IdleMode(this);
        this._orbitMode = new OrbitMode(this);
        this._panMode = new PanMode(this);
        this._wanderMode = new WanderMode(this);

        this._modeFSM = new FiniteStateMachine<ModeBase3D>([this._idleMode, this._orbitMode, this._panMode, this._wanderMode]);

        this._modeFSM.addTransition(this._idleMode, this._orbitMode, ModeCommand.ToOrbit);
        this._modeFSM.addTransition(this._idleMode, this._panMode, ModeCommand.ToPan);
        this._modeFSM.addTransition(this._idleMode, this._wanderMode, ModeCommand.ToWander);
        this._modeFSM.addTransition(this._orbitMode, this._idleMode, ModeCommand.ToIdle);
        this._modeFSM.addTransition(this._orbitMode, this._panMode, ModeCommand.ToPan);
        this._modeFSM.addTransition(this._orbitMode, this._wanderMode, ModeCommand.ToWander);
        this._modeFSM.addTransition(this._panMode, this._idleMode, ModeCommand.ToIdle);
        this._modeFSM.addTransition(this._panMode, this._orbitMode, ModeCommand.ToOrbit);
        this._modeFSM.addTransition(this._panMode, this._wanderMode, ModeCommand.ToWander);
        this._modeFSM.addTransition(this._wanderMode, this._idleMode, ModeCommand.ToIdle);
        this._modeFSM.addTransition(this._wanderMode, this._orbitMode, ModeCommand.ToOrbit);
        this._modeFSM.addTransition(this._wanderMode, this._panMode, ModeCommand.ToPan);

        this._modeFSM.Begin(this._idleMode);
    }

    private _initLinearTick() {
        this.hTicks = new LinearTicks().initTicks([5, 2], 1, 10000).spacing(15, 80);
        this.vTicks = new LinearTicks().initTicks([5, 2], 1, 10000).spacing(15, 80);
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

    // ---------- 模式切换 ----------

    changeMode(modeCommand: ModeCommand) {
        this._modeFSM.issueCommand(modeCommand);
        let mode = CameraMoveMode.IDLE;
        switch (modeCommand) {
            case ModeCommand.ToIdle: mode = CameraMoveMode.IDLE; break;
            case ModeCommand.ToOrbit: mode = CameraMoveMode.ORBIT; break;
            case ModeCommand.ToPan: mode = CameraMoveMode.PAN; break;
            case ModeCommand.ToWander: mode = CameraMoveMode.WANDER; break;
        }
        this.emit('mode', mode);
    }

    // ---------- 重置 ----------

    reset() {
        this.node.setWorldPosition(this.homePos);
        this.node.setWorldRotation(this.homeRot);
        this.node.getWorldRotation(this._curRot);
        this.node.getWorldPosition(this._curEye);
        (this.node as any).updateWorldTransform?.();
    }

    // ---------- viewCenter ----------

    updateViewCenterByDist(viewDist: number) {
        this.node.getWorldPosition(this._curEye);
        this.node.getWorldRotation(this._curRot);
        Vec3.transformQuat(this.forward, Vec3.UNIT_Z, this._curRot);
        Vec3.multiplyScalar(this.v3a, this.forward, viewDist);
        Vec3.add(this._sceneViewCenter, this._curEye, this.v3a);
    }

    // ---------- 缩放 ----------

    scale(delta: number) {
        let scalar = this.viewDist;
        if (Math.abs(scalar) < this._minScalar) {
            scalar = 1;
        }
        if (this.isOrtho()) {
            let newOrthoHeight = this._camera.orthoHeight;
            newOrthoHeight += delta * this._wheelSpeed * scalar * this._orthoScale;
            this.setOrthoHeight(newOrthoHeight);
        } else {
            delta = this.smoothScale(delta);
            this.node.getWorldPosition(this._curEye);
            this.node.getWorldRotation(this._curRot);
            Vec3.transformQuat(this.forward, Vec3.UNIT_Z, this._curRot);

            Vec3.multiplyScalar(this.v3a, this.forward, delta * this._wheelSpeed * scalar);
            Vec3.add(this._curEye, this._curEye, this.v3a);
            makeVec3InRange(this._curEye, -1e12, 1e12);

            this.viewDist = Vec3.distance(this._curEye, this._sceneViewCenter);
            this.node.setWorldPosition(this._curEye);
        }

        this.updateGrid();
        Service.Engine?.repaintInEditMode?.();
    }

    smoothScale(delta: number) {
        return smoothMouseWheelScale(delta);
    }

    // ---------- 焦点 ----------

    isMoving(): boolean {
        return this._modeFSM.currentState !== this._idleMode;
    }

    private focusByNode(nodes: Node[], notChangeDist = true, immediate = false) {
        if (nodes.length === 0) return;

        let worldPos = Vec3.ZERO;
        const pivot = Service.Gizmo?.transformToolData?.pivot ?? 'center';

        if (pivot === 'center') {
            worldPos = getCenterWorldPos3D(nodes);
        } else {
            worldPos = getWorldPosition3D(nodes[nodes.length - 1]);
        }

        const maxRange = getMaxRangeOfNodes(nodes);
        let dist = this.viewDist;

        if (!notChangeDist) {
            if (this._camera.projection === PERSPECTIVE) {
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
                    dist = Math.max((maxRange / length) * disWorld, this.near * 1.3);
                    dist = Math.min(dist, this.far * 0.9);
                } else {
                    dist = Math.max(maxRange * 2.5, 1);
                }
            } else if (this._camera.projection === ORTHO) {
                const depthSize = (this._camera.fov / 180) * Math.PI * this._camera.orthoHeight;
                dist = ((maxRange * depthSize) / this._camera.orthoHeight) * 13;
                let angle = this._camera.node.eulerAngles.x % 360;
                angle = Math.abs(angle) > 90 ? 180 - Math.abs(angle) : Math.abs(angle);
                dist = dist / Math.cos((angle / 180) * Math.PI);
            }
        }

        this.sceneViewCenter = worldPos;

        this.node.getRotation(this._curRot);
        Vec3.transformQuat(this.forward, Vec3.UNIT_Z, this._curRot);
        Vec3.multiplyScalar(this.v3c, this.forward, dist);
        Vec3.add(this.v3d, worldPos, this.v3c);

        if (this.isOrtho()) {
            const depthSize = this.getDepthSize();
            const newOrthoHeight = depthSize * dist;
            if (immediate) {
                this._camera.orthoHeight = newOrthoHeight;
                if (Service.Gizmo?.transformToolData) {
                    Service.Gizmo.transformToolData.cameraOrthoHeight = newOrthoHeight;
                }
                Service.Engine?.repaintInEditMode?.();
            } else {
                tweenNumber(this._camera.orthoHeight, newOrthoHeight, 300).step((orthoHeight: number) => {
                    if (this._camera) {
                        this._camera.orthoHeight = orthoHeight;
                        if (Service.Gizmo?.transformToolData) {
                            Service.Gizmo.transformToolData.cameraOrthoHeight = orthoHeight;
                        }
                        Service.Engine?.repaintInEditMode?.();
                    }
                });
            }
        }

        if (immediate) {
            this.node.setPosition(this.v3d);
            Vec3.copy(this._curEye, this.v3d);
            this.viewDist = Vec3.distance(this.v3d, this._sceneViewCenter);
            this.updateGrid();
            Service.Engine?.repaintInEditMode?.();
        } else {
            const startPosition = this.node.getPosition();
            tweenPosition(startPosition, this.v3d, 300).step((position: Vec3) => {
                this.node.setPosition(position);
                Vec3.copy(this._curEye, position);
                this.viewDist = Vec3.distance(position, this._sceneViewCenter);
                this.updateGrid();
                Service.Engine?.repaintInEditMode?.();
            });
        }
    }

    focus(nodeUuids?: string[] | null, editorCameraInfo?: EditorCameraInfo, immediate = false) {
        if (this.isMoving()) return;
        if (!this._camera?.camera) return;

        if (editorCameraInfo) {
            const startPosition = this.node.getPosition();
            const startRotation = this.node.getRotation();
            const { position, rotation, viewCenter } = editorCameraInfo;

            if (position) {
                this._curEye.x = position.x || 0;
                this._curEye.y = position.y || 0;
                this._curEye.z = position.z || 0;
            } else {
                this._curEye.x = this.homePos.x || 0;
                this._curEye.y = this.homePos.y || 0;
                this._curEye.z = this.homePos.z || 0;
            }

            if (rotation) {
                this._curRot.x = rotation.x || 0;
                this._curRot.y = rotation.y || 0;
                this._curRot.z = rotation.z || 0;
                this._curRot.w = rotation.w || 0;
            } else {
                this._curRot.x = this.homeRot.x || 0;
                this._curRot.y = this.homeRot.y || 0;
                this._curRot.z = this.homeRot.z || 0;
                this._curRot.w = this.homeRot.w || 0;
            }

            this.sceneViewCenter = (viewCenter as Vec3) || new Vec3();
            this.viewDist = Vec3.distance(this._curEye, this._sceneViewCenter);

            if (immediate) {
                this.node.setPosition(this._curEye);
                this.node.setRotation(this._curRot);
                this.updateGrid();
                Service.Engine?.repaintInEditMode?.();
            } else {
                tweenPosition(startPosition, this._curEye, 300).step((position: Vec3) => {
                    this.node.setPosition(position);
                    this.updateGrid();
                    Service.Engine?.repaintInEditMode?.();
                });
                tweenRotation(startRotation, this._curRot, 300).step((rotation: Quat) => {
                    this.node.setRotation(rotation);
                    this.updateGrid();
                });
            }
        } else if (nodeUuids && nodeUuids.length > 0) {
            const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
            if (!EditorExtends) return;

            const nodes: Node[] = [];
            for (const uuid of nodeUuids) {
                const node = EditorExtends.Node.getNode(uuid);
                if (node) nodes.push(node);
            }
            if (nodes.length === 0) return;

            this.lastFocusNodeUUID = nodeUuids.slice();
            this.focusByNode(nodes, false, immediate);
        }
    }

    focusByXY(hitPoint: Vec3, immediate = false) {
        if (this.isMoving()) return;
        if (!this._camera?.camera) return;

        const node = new Node();
        node.position.set(hitPoint);
        this.focusByNode([node], true, immediate);
    }

    // ---------- 对齐 ----------

    async alignNodeToSceneView(nodeUuids: string[]) {
        if (!nodeUuids || nodeUuids.length === 0) return;

        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const nodes: Node[] = [];
        for (const uuid of nodeUuids) {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) nodes.push(node);
        }
        if (nodes.length === 0) return;

        const uuids = nodes.map(node => node.uuid);
        const undoId = await Service.Undo?.beginRecording?.(uuids);

        const baseNode = nodes[0];
        const oldBaseWorldMatrix = Mat4.fromRT(new Mat4(), baseNode.getWorldRotation(), baseNode.getWorldPosition());
        Mat4.invert(oldBaseWorldMatrix, oldBaseWorldMatrix);
        const oldBaseRotInv = baseNode.getWorldRotation();
        Quat.invert(oldBaseRotInv, oldBaseRotInv);

        const cameraPos = this.node.getWorldPosition();
        const cameraRot = this.node.getWorldRotation();
        const newBaseMatrix = Mat4.fromRT(new Mat4(), cameraRot, cameraPos);

        baseNode.setWorldPosition(cameraPos);
        baseNode.setWorldRotation(cameraRot);
        this.alignCameraOrthoHeightToNode(baseNode.getComponents(Camera as any) as Camera[]);

        if (nodes.length > 1) {
            for (let i = 1; i < nodes.length; i++) {
                const node = nodes[i];
                const pos = node.getWorldPosition();
                const rot = node.getWorldRotation();

                Vec3.transformMat4(pos, pos, oldBaseWorldMatrix);
                Quat.multiply(rot, oldBaseRotInv, rot);

                Vec3.transformMat4(pos, pos, newBaseMatrix);
                node.setWorldPosition(pos);
                Quat.multiply(rot, cameraRot, rot);
                node.setWorldRotation(rot);
                this.alignCameraOrthoHeightToNode(node.getComponents(Camera as any) as Camera[]);
            }
        }

        if (undoId) Service.Undo?.endRecording?.(undoId);
        Service.Engine?.repaintInEditMode?.();
    }

    private alignCameraOrthoHeightToNode(cameraComponent: Camera[]) {
        if (cameraComponent.length === 1) {
            const camera = cameraComponent[0];
            if (camera && camera.projection === ORTHO) {
                camera.orthoHeight = this._camera.orthoHeight;
            }
        }
    }

    alignSceneViewToNode(nodeUuids: string[]) {
        if (!nodeUuids || nodeUuids.length === 0) return;

        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const nodes: Node[] = [];
        for (const uuid of nodeUuids) {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) nodes.push(node);
        }
        if (nodes.length === 0) return;

        const baseNode = nodes[0];
        const pos = baseNode.getWorldPosition();
        const rot = baseNode.getWorldRotation();
        this.node.setWorldPosition(pos);
        this.node.setWorldRotation(rot);
        this.updateViewCenterByDist(-this.viewDist);
        this.updateGrid();

        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 鼠标/键盘事件 ----------

    onMouseDBlDown(event: ISceneMouseEvent) {
        return (this._modeFSM.currentState as ModeBase3D).onMouseDBlDown(event);
    }

    onMouseDown(event: ISceneMouseEvent) {
        this.altKey = event.altKey;
        this.shiftKey = event.shiftKey;
        this.mousePressing = true;

        const isViewMode = !!Service.Gizmo?.isViewMode;
        if (event.middleButton || (!event.rightButton && isViewMode)) {
            this.changeMode(ModeCommand.ToPan);
        } else if (event.rightButton && !event.leftButton) {
            this.changeMode(ModeCommand.ToWander);
        } else if (event.leftButton) {
            if ((this._modeFSM.currentState as ModeBase3D).modeName === CameraMoveMode.WANDER) {
                this.changeMode(ModeCommand.ToIdle);
            }
        }

        return (this._modeFSM.currentState as ModeBase3D).onMouseDown(event);
    }

    onMouseMove(event: ISceneMouseEvent) {
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;

        if (event.altKey) {
            if ((this._modeFSM.currentState as ModeBase3D).modeName !== CameraMoveMode.ORBIT) {
                this.changeMode(ModeCommand.ToOrbit);
            }
        } else {
            if ((this._modeFSM.currentState as ModeBase3D).modeName === CameraMoveMode.ORBIT) {
                this.changeMode(ModeCommand.ToIdle);
            }
        }

        return (this._modeFSM.currentState as ModeBase3D).onMouseMove(event);
    }

    onMouseUp(event: ISceneMouseEvent) {
        this.mousePressing = false;

        const isViewMode = !!Service.Gizmo?.isViewMode;
        if (event.middleButton || (!event.rightButton && isViewMode)) {
            if ((this._modeFSM.currentState as ModeBase3D).modeName === CameraMoveMode.PAN) {
                this.changeMode(ModeCommand.ToIdle);
            }
        } else if (event.rightButton) {
            if ((this._modeFSM.currentState as ModeBase3D).modeName === CameraMoveMode.WANDER) {
                this.changeMode(ModeCommand.ToIdle);
            }
        }

        if (isViewMode) {
            this.changeMode(ModeCommand.ToIdle);
        }

        return (this._modeFSM.currentState as ModeBase3D).onMouseUp(event);
    }

    onMouseWheel(event: ISceneMouseEvent) {
        if ((this._modeFSM.currentState as ModeBase3D).modeName !== CameraMoveMode.WANDER) {
            let deltaY = event.deltaY;
            if (Math.abs(deltaY - this.lastMouseWheelDeltaY) > this.maxMouseWheelDeltaY) {
                deltaY = this.lastMouseWheelDeltaY + Math.sign(deltaY) * this.maxMouseWheelDeltaY;
            }
            this.scale(deltaY * this._wheelBaseScale);
        }

        (this._modeFSM.currentState as ModeBase3D).onMouseWheel(event);
        Service.Engine?.repaintInEditMode?.();
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;

        if (event.altKey) {
            if ((this._modeFSM.currentState as ModeBase3D).modeName !== CameraMoveMode.ORBIT) {
                this.changeMode(ModeCommand.ToOrbit);
            }
        }

        const key = event.key.toLowerCase();
        switch (key) {
            case ' ':
                this.changeMode(ModeCommand.ToPan);
                break;
        }

        (this._modeFSM.currentState as ModeBase3D).onKeyDown(event);
    }

    onKeyUp(event: ISceneKeyboardEvent) {
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;

        if (!event.altKey && !this.mousePressing) {
            if ((this._modeFSM.currentState as ModeBase3D).modeName === CameraMoveMode.ORBIT) {
                this.changeMode(ModeCommand.ToIdle);
            }
        }

        const key = event.key.toLowerCase();
        switch (key) {
            case ' ':
                if ((this._modeFSM.currentState as ModeBase3D).modeName === CameraMoveMode.PAN) {
                    this.changeMode(ModeCommand.ToIdle);
                }
                break;
            case 'h':
                this.focus();
                break;
        }

        (this._modeFSM.currentState as ModeBase3D).onKeyUp(event);
    }

    onUpdate(deltaTime: number) {
        (this._modeFSM.currentState as ModeBase3D).onUpdate(deltaTime);
    }

    onResize(size?: ISizeLike) {
        this.updateGrid();
        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 网格 ----------

    private _updateGridData(positions: number[], colors: number[], lineColor: Color) {
        const cameraPos = new Vec3();
        this.node.getPosition(cameraPos);

        const distance = cameraPos.y;
        const scale = distance / 500;
        const range = 5000;
        const scaleRange = (range * scale) | 0;

        const curStartX = -scaleRange + cameraPos.x;
        const curEndX = scaleRange + cameraPos.x;
        const curStartY = -scaleRange + cameraPos.z;
        const curEndY = scaleRange + cameraPos.z;
        this.hTicks.range(curStartX, curEndX, range);
        this.vTicks.range(curStartY, curEndY, range);

        const r = lineColor.r / 255;
        const g = lineColor.g / 255;
        const b = lineColor.b / 255;
        const lineOpacity = 200 / 255;

        for (let i = this.hTicks.minTickLevel; i <= this.hTicks.maxTickLevel; ++i) {
            const ratio = this.hTicks.tickRatios[i];
            if (ratio > 0) {
                const ticks = this.hTicks.ticksAtLevel(i, true);
                for (let j = 0; j < ticks.length; ++j) {
                    const tick = ticks[j];
                    if (this.originAxisX_Visible && 0 === tick) continue;
                    if (positions.length / 2 >= _maxTicks * _maxTicks - 4) break;

                    let alpha = ratio * lineOpacity;
                    const dist = Math.abs(tick - cameraPos.x);
                    if (scaleRange > 0) alpha *= 1 - dist / scaleRange;

                    positions.push(tick, cameraPos.z);
                    positions.push(tick, curStartY);
                    positions.push(tick, cameraPos.z);
                    positions.push(tick, curEndY);
                    colors.push(r, g, b, alpha);
                    colors.push(r, g, b, 0);
                    colors.push(r, g, b, alpha);
                    colors.push(r, g, b, 0);
                }
            }
        }

        for (let i = this.vTicks.minTickLevel; i <= this.vTicks.maxTickLevel; ++i) {
            const ratio = this.vTicks.tickRatios[i];
            if (ratio > 0) {
                const ticks = this.vTicks.ticksAtLevel(i, true);
                for (let j = 0; j < ticks.length; ++j) {
                    const tick = ticks[j];
                    if (this.originAxisZ_Visible && 0 === tick) continue;
                    if (positions.length / 2 >= _maxTicks * _maxTicks - 4) break;

                    let alpha = ratio * lineOpacity;
                    const dist = Math.abs(tick - cameraPos.z);
                    if (scaleRange > 0) alpha *= 1 - dist / scaleRange;

                    positions.push(cameraPos.x, tick);
                    positions.push(curStartX, tick);
                    positions.push(cameraPos.x, tick);
                    positions.push(curEndX, tick);
                    colors.push(r, g, b, alpha);
                    colors.push(r, g, b, 0);
                    colors.push(r, g, b, alpha);
                    colors.push(r, g, b, 0);
                }
            }
        }
    }

    updateGrid() {
        if (!this._gridMeshComp) return;

        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];
        this._updateGridData(positions, colors, this._lineColor);

        if (positions.length > 0) {
            for (let i = 0; i < positions.length; i += 2) {
                indices.push(i / 2);
            }
            CameraUtils.updateVBAttr(this._gridMeshComp, gfx.AttributeName.ATTR_POSITION, positions);
            CameraUtils.updateVBAttr(this._gridMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
            CameraUtils.updateIB(this._gridMeshComp, indices);
        }
        this.updateOriginAxis();
    }

    refresh() {
        this.updateGrid();
        Service.Engine?.repaintInEditMode?.();
    }

    // ---------- 旋转相机到指定方向 ----------

    rotateCameraToDir(dir: Vec3, rotateByViewDist: boolean) {
        const startPosition = new Vec3();
        const startRotation = new Quat();
        this.node.getPosition(startPosition);
        this.node.getRotation(startRotation);

        Quat.rotationTo(this._curRot, Vec3.UNIT_Z, dir);

        const offset = new Vec3();
        if (rotateByViewDist) {
            offset.z = this.viewDist;
            Vec3.transformQuat(offset, offset, this._curRot);
            Vec3.add(this._curEye, this._sceneViewCenter, offset);
        }

        tweenPosition(startPosition, this._curEye, 300).step((position: Vec3) => {
            this.node.setPosition(position);
            this.updateGrid();
            Service.Engine?.repaintInEditMode?.();
        });
        tweenRotation(startRotation, this._curRot, 300).step((rotation: Quat) => {
            this.node.setRotation(rotation);
            this.updateGrid();
        });
    }

    // ---------- 投影相关 ----------

    getDepthSize(): number {
        const fov = this._camera.fov;
        return Math.tan(((fov / 2) * Math.PI) / 180);
    }

    calcCameraPosInOrtho(): Vec3 {
        const depthSize = this.getDepthSize();
        const minDist = this._camera.orthoHeight / depthSize;
        if (this.viewDist < minDist) {
            this.viewDist = minDist;
        }

        this.node.getWorldRotation(this._curRot);
        Vec3.transformQuat(this.forward, Vec3.UNIT_Z, this._curRot);
        Vec3.normalize(this.forward, this.forward);
        Vec3.multiplyScalar(this.v3a, this.forward, this.viewDist);
        Vec3.add(this.v3b, this._sceneViewCenter, this.v3a);

        return this.v3b;
    }

    isOrtho(): boolean {
        return this._camera.projection === ORTHO;
    }

    setOrthoHeight(newOrthoHeight: number) {
        if (newOrthoHeight < 0) {
            newOrthoHeight = 0.01;
        }
        this._camera.orthoHeight = newOrthoHeight;
        if (Service.Gizmo?.transformToolData) {
            Service.Gizmo.transformToolData.cameraOrthoHeight = newOrthoHeight;
        }
    }

    changeProjection() {
        if (this.isOrtho()) {
            const cameraPos = this.calcCameraPosInOrtho();
            this.node.setWorldPosition(cameraPos);
            this._camera.projection = PERSPECTIVE;
            this.emit('projection-changed', PERSPECTIVE);
            this.updateGrid();
        } else {
            this._camera.projection = ORTHO;
            const depthSize = this.getDepthSize();
            const newOrthoHeight = depthSize * this.viewDist;
            this.setOrthoHeight(newOrthoHeight);
            this.emit('projection-changed', ORTHO);
        }

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
