import { Camera, CCObject, Color, geometry, gfx, js, Layers, Mat4, MeshRenderer, Node, Quat, Vec2, Vec3, ISizeLike } from 'cc';
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
import { getRaycastResultsForSnap } from '../gizmo/utils/engine-utils';
import { Rpc } from '../../rpc';

// ---------- node utility helpers ----------

const tempMatrix = new Mat4();

function limitRange(distance: number): number {
    return Math.min(Math.max(distance, -1e10), 1e10);
}

function getMainWindowSize(): ISizeLike {
    const canvas = (cc as any).game?.canvas;
    return {
        width: canvas?.width ?? 1280,
        height: canvas?.height ?? 720,
    };
}

function getObbFromRect(mat: Mat4, rect: any, outBL?: Vec2 | null, outTL?: Vec2 | null, outTR?: Vec2 | null, outBR?: Vec2 | null): Vec2[] {
    const x = rect.x;
    const y = rect.y;
    const width = rect.width;
    const height = rect.height;

    const tx = mat.m00 * x + mat.m04 * y + mat.m12;
    const ty = mat.m01 * x + mat.m05 * y + mat.m13;
    const xa = mat.m00 * width;
    const xb = mat.m01 * width;
    const yc = mat.m04 * height;
    const yd = mat.m05 * height;

    outBL = outBL || new Vec2();
    outTL = outTL || new Vec2();
    outTR = outTR || new Vec2();
    outBR = outBR || new Vec2();

    outTL.x = tx;
    outTL.y = ty;
    outTR.x = xa + tx;
    outTR.y = xb + ty;
    outBL.x = yc + tx;
    outBL.y = yd + ty;
    outBR.x = xa + yc + tx;
    outBR.y = xb + yd + ty;

    return [outBL, outTL, outTR, outBR];
}

function getObbFromBound(aabb: geometry.AABB): Vec3[] {
    const minPos = new Vec3();
    const maxPos = new Vec3();
    aabb.getBoundary(minPos, maxPos);

    return [
        minPos,
        new Vec3(maxPos.x, minPos.y, minPos.z),
        new Vec3(maxPos.x, maxPos.y, minPos.z),
        new Vec3(minPos.x, maxPos.y, minPos.z),
        maxPos,
        new Vec3(minPos.x, maxPos.y, maxPos.z),
        new Vec3(minPos.x, minPos.y, maxPos.z),
        new Vec3(maxPos.x, minPos.y, maxPos.z),
    ];
}

function getObbFromMeshRenderer(modelComp: MeshRenderer, mat: Mat4): Vec3[] {
    modelComp.model?.updateWorldBound?.();
    let worldBound = modelComp.model?.worldBounds;
    if (!worldBound) {
        worldBound = geometry.AABB.create();
        const modelBound = modelComp.model?.modelBounds;
        if (modelBound) {
            geometry.AABB.transform(worldBound, modelBound, mat);
        } else {
            geometry.AABB.transform(worldBound, worldBound, Mat4.IDENTITY);
        }
    }
    return getObbFromBound(worldBound);
}

function getObbFromUITransform(modelComp: any, mat: Mat4): Vec3[] {
    let size = (cc as any).size(0, 0);
    let width = size.width;
    let height = size.height;
    const rect = new (cc as any).Rect(0, 0, width, height);
    const outBL = new Vec2();
    const outTL = new Vec2();
    const outTR = new Vec2();
    const outBR = new Vec2();
    if (modelComp) {
        size = modelComp.contentSize;
        width = size.width;
        height = size.height;
        const anchor = modelComp.anchorPoint;

        rect.x = -anchor.x * width;
        rect.y = -anchor.y * height;
        rect.width = width;
        rect.height = height;
    }

    const bounds = getObbFromRect(mat, rect, outBL, outTL, outTR, outBR);
    const pos = getWorldPosition3D(modelComp.node);
    return bounds.map(item => new Vec3(item.x, item.y, pos.z));
}

function getWorldOrientedBounds(node: Node): Vec3[] {
    node.getWorldMatrix(tempMatrix);

    const modelComp = node.getComponent(MeshRenderer);
    if (modelComp) {
        return getObbFromMeshRenderer(modelComp, tempMatrix);
    }

    const UITransform = (cc as any).UITransform;
    const uiComp = UITransform ? node.getComponent(UITransform) : null;
    if (uiComp) {
        return getObbFromUITransform(uiComp, tempMatrix);
    }

    const rect = new (cc as any).Rect(0, 0, 0, 0);
    const bounds = getObbFromRect(tempMatrix, rect);
    const pos = getWorldPosition3D(node);
    return bounds.map(item => new Vec3(item.x, item.y, pos.z));
}

function getCenterWorldPos3D(nodes: Node[]): Vec3 {
    let minX: number | null = null;
    let minY: number | null = null;
    let minZ: number | null = null;
    let maxX: number | null = null;
    let maxY: number | null = null;
    let maxZ: number | null = null;

    for (let i = 0; i < nodes.length; ++i) {
        const bounds = getWorldOrientedBounds(nodes[i]);
        for (let j = 0; j < bounds.length; ++j) {
            const v = bounds[j];
            if (minX === null || v.x < minX) minX = v.x;
            if (maxX === null || v.x > maxX) maxX = v.x;
            if (minY === null || v.y < minY) minY = v.y;
            if (maxY === null || v.y > maxY) maxY = v.y;
            if (minZ === null || v.z < minZ) minZ = v.z;
            if (maxZ === null || v.z > maxZ) maxZ = v.z;
        }
    }

    minX = limitRange(minX!);
    maxX = limitRange(maxX!);
    minY = limitRange(minY!);
    maxY = limitRange(maxY!);
    minZ = limitRange(minZ!);
    maxZ = limitRange(maxZ!);

    return new Vec3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
}

function getWorldPosition3D(node: Node): Vec3 {
    return node.getWorldPosition();
}

function getBoundaryOfMeshNode(node: Node): geometry.AABB | null {
    if (!node) return null;
    const modelComp = node.getComponent(MeshRenderer);
    if (!modelComp) return null;

    const SkinnedMeshRenderer = (cc as any).SkinnedMeshRenderer;
    if (SkinnedMeshRenderer && modelComp instanceof SkinnedMeshRenderer) {
        modelComp.model?.updateTransform?.(-1);
        return modelComp.model?.worldBounds ?? null;
    }

    if (modelComp.mesh && modelComp.model) {
        let transformAABB = modelComp.model.modelBounds?.clone() ?? null;
        if (!transformAABB) {
            const mesh = modelComp.mesh;
            if (mesh && mesh.minPosition && mesh.maxPosition) {
                transformAABB = geometry.AABB.fromPoints(geometry.AABB.create(), mesh.minPosition, mesh.maxPosition);
            }
        }
        if (transformAABB) {
            geometry.AABB.transform(transformAABB, transformAABB, node.worldMatrix);
        }
        return transformAABB;
    }
    return null;
}

// 引擎的粒子发射器形状枚举未从 cc 公开导出，这里与 Creator（utils/node.ts）一致，
// 按其稳定的序列化值定义一个本地 ShapeType 枚举，避免使用魔法数字。
enum ShapeType {
    Box = 0,
    Circle = 1,
    Cone = 2,
    Sphere = 3,
    Hemisphere = 4,
}

function getRangeFromParticleComp(component: any): number {
    let range = 0;
    if (component.shapeModule?.enable) {
        const shapeModule = component.shapeModule;
        switch (shapeModule.shapeType) {
            case ShapeType.Box:
                range = Math.max(shapeModule.scale.x, shapeModule.scale.y, shapeModule.scale.z);
                break;
            case ShapeType.Circle:
            case ShapeType.Sphere:
            case ShapeType.Hemisphere:
                range = shapeModule.radius;
                break;
            case ShapeType.Cone:
                range = Math.max(shapeModule.radius, shapeModule.length);
                break;
        }
    }
    return range;
}

function isEditorNode(node: Node): boolean {
    if (node.layer & Layers.Enum.GIZMOS) {
        return true;
    }

    let iterNode: Node | null = node;
    while (iterNode) {
        if (iterNode.objFlags & CCObject.Flags.HideInHierarchy) {
            return true;
        }
        iterNode = iterNode.parent;
    }

    return false;
}

function getMaxRangeOfNode(node: Node): number {
    let maxRange = 0.001;
    if (!node || isEditorNode(node)) return maxRange;

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
            case 'cc.LightProbeGroup': {
                const comp = component as any;
                const probesSize = new Vec3(comp.maxPos).subtract(comp.minPos);
                compRange = Math.max(Math.abs(probesSize.x / 2), Math.abs(probesSize.y / 2), Math.abs(probesSize.z / 2));
                break;
            }
            case 'cc.RangedDirectionalLight':
            case 'cc.DirectionalLight':
            case 'cc.Camera':
                compRange = 3;
                break;
            case 'cc.MeshRenderer':
            case 'cc.SkinnedMeshRenderer':
            case 'cc.AvatarModelComponent':
            case 'cc.SkinnedMeshBatchRenderer': {
                const mr = component as MeshRenderer;
                if (mr.mesh && mr.model) {
                    let worldBound: any = mr.model.worldBounds;

                    if (!worldBound) {
                        const modelBound = mr.model.modelBounds;
                        if (modelBound) {
                            worldBound = geometry.AABB.create();
                            geometry.AABB.transform(worldBound, modelBound, node.worldMatrix);
                        }
                    }

                    if (worldBound && (
                        Number.isNaN(worldBound.halfExtents.x)
                        || Number.isNaN(worldBound.halfExtents.y)
                        || Number.isNaN(worldBound.halfExtents.z)
                    )) {
                        worldBound = getBoundaryOfMeshNode(node);
                    }

                    if (worldBound) {
                        compRange = Math.max(worldBound.halfExtents.x, worldBound.halfExtents.y, worldBound.halfExtents.z);
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
            case 'cc.ParticleSystem': {
                compRange = getRangeFromParticleComp(component);
                break;
            }
            default: {
                const Terrain = (cc as any).Terrain;
                if (Terrain && className === js.getClassName(Terrain)) {
                    const info = (component as any).info;
                    if (info?.size) {
                        compRange = Math.max(info.size.width / 2, info.size.height / 2);
                    }
                }
                break;
            }
        }

        if (compRange > maxRange) {
            maxRange = compRange;
        } else if (compRange === 0) {
            maxRange = Math.max(maxRange, 1);
        }
    }

    return limitRange(maxRange);
}

function getMaxRangeOfNodes(nodes: Node[]): number {
    let maxRange = Number.MIN_VALUE;

    if (nodes) {
        for (const node of nodes) {
            let range = getMaxRangeOfNode(node);
            if (range > maxRange) maxRange = range;

            range = getMaxRangeOfNodes(node.children as Node[]);
            if (range > maxRange) maxRange = range;
        }
    }

    return maxRange;
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

// 基准高度下网格向相机两侧各延伸的距离，单位为世界单位
const gridRange = 5000;

// 网格范围随相机高度等比缩放时使用的基准高度，单位为世界单位
const gridReferenceHeight = 500;

/**
 * 按相机高度计算网格单侧延伸量，供绘制与交点范围检查共用
 *
 * 结果向零取整并转换为有符号的 32 位整数
 */
function getGridHalfExtent(cameraHeight: number): number {
    return (gridRange * (cameraHeight / gridReferenceHeight)) | 0;
}

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

    // 缩放前的世界锚点需保留到位置补偿结束
    private _zoomAnchor = new Vec3();

    private _inputRay = new geometry.Ray();
    private _inputPlane = new geometry.Plane();

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

    public get lineColor() {
        return this._lineColor;
    }

    public set lineColor(value: Color) {
        this._lineColor = value;
    }

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
        this._originAxisHorizontalMeshComp.node.active = (this.originAxisX_Visible || this.originAxisZ_Visible);
        this._originAxisVerticalMeshComp.node.active = this.originAxisY_Visible;
        void this.initOriginAxisFromConfig();
    }

    private async initOriginAxisFromConfig() {
        try {
            const rpc = Rpc.getInstance();
            const gizmos = await rpc.request('sceneConfigInstance', 'get', ['gizmo']) as any;
            if (gizmos?.originAxis3D) {
                this.updateOriginAxisByConfig(gizmos.originAxis3D, false);
            }
        } catch {
            // Use the default 3D origin axes when config is unavailable.
        }
    }

    updateOriginAxisByConfig(config: { x?: boolean; y?: boolean; z?: boolean }, update = true) {
        if (config.x !== undefined) this.originAxisX_Visible = config.x;
        if (config.y !== undefined) this.originAxisY_Visible = config.y;
        if (config.z !== undefined) this.originAxisZ_Visible = config.z;

        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = !!this._gridMeshComp?.node?.active && (this.originAxisX_Visible || this.originAxisZ_Visible);
        }
        if (this._originAxisVerticalMeshComp?.node) {
            this._originAxisVerticalMeshComp.node.active = !!this._gridMeshComp?.node?.active && this.originAxisY_Visible;
        }

        if (update) {
            this.updateOriginAxis();
        }
        Service.Engine?.repaintInEditMode?.();
    }

    private getOriginAxisData() {
        const cameraPos = new Vec3();
        this.node.getPosition(cameraPos);

        const scaleRange = getGridHalfExtent(cameraPos.y);

        const curStartX = -scaleRange + cameraPos.x;
        const curEndX = scaleRange + cameraPos.x;
        const curStartY = -scaleRange + cameraPos.z;
        const curEndY = scaleRange + cameraPos.z;
        this.hTicks?.range(curStartX, curEndX, gridRange);
        this.vTicks?.range(curStartY, curEndY, gridRange);

        return {
            startX: curStartX,
            endX: curEndX,
            startY: curStartY,
            endY: curEndY,
            cameraPos,
        };
    }

    private updateOriginAxisVertical() {
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
    changeMode(modeCommand: ModeCommand, event?: ISceneMouseEvent) {
        if (!this._modeFSM) return;
        this._modeFSM.issueCommand(modeCommand, { event });
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

    // ---------- 输入投影 ----------

    /**
     * 同步相机并更新鼠标位置对应的世界射线
     *
     * 输入为渲染画布左上角起算的像素坐标，视口或射线无效时返回 false
     */
    private _updateInputRay(x: number, y: number): boolean {
        const camera = this._camera.camera;
        if (!camera || camera.width <= 0 || camera.height <= 0) {
            return false;
        }

        // 输入可能发生在下一帧渲染前，需要先同步相机位置和投影矩阵
        camera.update();
        return !!camera.screenPointToRay(this._inputRay, x, camera.height - y);
    }

    /**
     * 将鼠标位置投影到经过参考点、垂直于视线的平面
     *
     * 参考点默认为聚焦点，输入使用渲染画布左上角像素
     * 视口无效或射线无法向前命中时返回 false，不修改输出向量
     */
    private _screenToViewPlane(
        out: Vec3, x: number, y: number, reference = this._sceneViewCenter,
    ): boolean {
        if (!this._updateInputRay(x, y)) {
            return false;
        }

        // 使用朝向相机的平面，让同一参考深度上的像素位移对应一致的世界位移
        this.node.getWorldRotation(this._curRot);
        Vec3.transformQuat(this.forward, Vec3.UNIT_Z, this._curRot);
        geometry.Plane.fromNormalAndPoint(this._inputPlane, this.forward, reference);

        const distance = geometry.intersect.rayPlane(this._inputRay, this._inputPlane);
        if (!Number.isFinite(distance) || distance <= 0) {
            return false;
        }

        Vec3.scaleAndAdd(out, this._inputRay.o, this._inputRay.d, distance);
        return true;
    }

    /** 同步平移相机与聚焦点，保持后续环绕和缩放的参考深度 */
    private _translateView(delta: Vec3): void {
        this.node.getWorldPosition(this._curEye);
        Vec3.add(this._curEye, this._curEye, delta);
        this.node.setWorldPosition(this._curEye);

        Vec3.add(this._sceneViewCenter, this._sceneViewCenter, delta);
        this.viewDist = Vec3.distance(this._curEye, this._sceneViewCenter);
    }

    // ---------- 平移 ----------

    /**
     * 获取一次拖动使用的平移参考点
     *
     * 透视视图采用网格覆盖范围和相机裁剪范围内的交点，其他情况使用聚焦点
     * 返回独立快照，拖动过程中不会随相机或聚焦点变化
     */
    getPanPoint(x: number, y: number): Vec3 {
        const focusPoint = this._sceneViewCenter.clone();
        const gridNode = this._gridMeshComp?.node;
        if (this.isOrtho() || !gridNode?.active || !this._updateInputRay(x, y)) {
            return focusPoint;
        }

        // 空白网格也有实际深度，使用网格节点的世界变换构建平面
        Vec3.transformQuat(this.v3a, Vec3.UNIT_Z, gridNode.worldRotation);
        geometry.Plane.fromNormalAndPoint(this._inputPlane, this.v3a, gridNode.worldPosition);
        const distance = geometry.intersect.rayPlane(this._inputRay, this._inputPlane);
        if (!Number.isFinite(distance) || distance <= 0) {
            return focusPoint;
        }

        // 裁剪面按视线方向的深度判断，不能直接使用斜射线上的距离
        const point = Vec3.scaleAndAdd(new Vec3(), this._inputRay.o, this._inputRay.d, distance);
        this.node.getWorldPosition(this._curEye);
        this.node.getWorldRotation(this._curRot);
        Vec3.transformQuat(this.forward, Vec3.UNIT_Z, this._curRot);
        Vec3.subtract(this.v3b, this._curEye, point);
        const depth = Vec3.dot(this.v3b, this.forward);
        const withinClipRange = depth >= this._camera.near && depth <= this._camera.far;
        if (!withinClipRange) {
            return focusPoint;
        }

        // 网格顶点位于局部 XY 平面；只接受绘制范围内的交点，避免平视时取到远处延长线
        const localPoint = gridNode.inverseTransformPoint(this.v3a, point);
        const cameraPosition = this.node.getPosition(this.v3c);
        const halfExtent = Math.abs(getGridHalfExtent(cameraPosition.y));
        const withinGrid = Math.abs(localPoint.x - cameraPosition.x) < halfExtent
            && Math.abs(localPoint.y - cameraPosition.z) < halfExtent;

        return withinGrid ? point : focusPoint;
    }

    /** 在本次拖动的参考深度上按鼠标的渲染像素位移平移场景 */
    pan(deltaX: number, deltaY: number, reference = this._sceneViewCenter): void {
        // 视平面上的位移与起点无关，用两个屏幕点求差即可换算鼠标增量
        if (!this._screenToViewPlane(this.v3a, 0, 0, reference)
            || !this._screenToViewPlane(this.v3b, deltaX, deltaY, reference)) {
            return;
        }

        Vec3.subtract(this.v3c, this.v3a, this.v3b);
        this._translateView(this.v3c);
        this.updateGrid();
    }

    // ---------- 缩放 ----------

    /**
     * 缩放视图并保持鼠标下方的世界锚点
     *
     * 未提供完整鼠标坐标或无法投影时，仅执行以视图中心为基准的缩放
     */
    scale(delta: number, offsetX?: number, offsetY?: number): void {
        // 先记录缩放前的世界锚点，避免投影变化后丢失补偿位置
        const hasAnchor = offsetX !== undefined && offsetY !== undefined
            && this._screenToViewPlane(this._zoomAnchor, offsetX, offsetY);
        const distanceScale = Math.abs(this.viewDist) < this._minScalar ? 1 : this.viewDist;

        // 正交视图调整可见高度，透视视图沿视线移动相机
        if (this.isOrtho()) {
            const newOrthoHeight = this._camera.orthoHeight
                + delta * this._wheelSpeed * distanceScale * this._orthoScale;
            this.setOrthoHeight(newOrthoHeight);
        } else {
            this._scalePerspective(delta, distanceScale, hasAnchor);
        }

        // 同一屏幕位置重新投影后，用前后差值同步平移相机与聚焦点
        if (hasAnchor && this._screenToViewPlane(this.v3b, offsetX, offsetY)) {
            Vec3.subtract(this.v3c, this._zoomAnchor, this.v3b);
            this._translateView(this.v3c);
        }

        this.updateGrid();
        Service.Engine?.repaintInEditMode?.();
    }

    /**
     * 沿视线移动透视相机，并更新相机到聚焦点的距离
     *
     * 保持鼠标锚点时，将聚焦平面留在近裁剪面之外，避免相机越过锚点
     */
    private _scalePerspective(delta: number, distanceScale: number, keepFocusPlane: boolean): void {
        this.node.getWorldPosition(this._curEye);
        this.node.getWorldRotation(this._curRot);
        Vec3.transformQuat(this.forward, Vec3.UNIT_Z, this._curRot);

        // 直接从相机和聚焦点计算深度，不依赖输入投影使用的临时平面
        let distance = this.smoothScale(delta) * this._wheelSpeed * distanceScale;
        if (keepFocusPlane) {
            Vec3.subtract(this.v3a, this._curEye, this._sceneViewCenter);
            const depth = Vec3.dot(this.v3a, this.forward);
            const minDepth = Math.max(this._camera.near * 1.01, 0.01);
            distance = Math.max(distance, minDepth - depth);
        }

        Vec3.scaleAndAdd(this._curEye, this._curEye, this.forward, distance);
        makeVec3InRange(this._curEye, -1e12, 1e12);
        this.viewDist = Vec3.distance(this._curEye, this._sceneViewCenter);
        this.node.setWorldPosition(this._curEye);
    }

    smoothScale(delta: number) {
        return smoothMouseWheelScale(delta);
    }

    // ---------- 焦点 ----------

    /**
     * 将相机移动到目标位置，并让动画轨迹跟随聚焦点的平移
     *
     * 目标位置使用节点局部坐标，动画期间的聚焦点世界位移同步叠加到每一帧
     */
    private _animatePosition(target: Vec3): void {
        const startPosition = this.node.getPosition();
        const referenceCenter = this._sceneViewCenter.clone();

        tweenPosition(startPosition, target, 300).step(position => {
            // 输入产生的世界位移需转换到节点局部空间，再应用于相机轨迹
            const parent = this.node.parent;
            if (parent) {
                parent.inverseTransformPoint(this.v3a, this._sceneViewCenter);
                parent.inverseTransformPoint(this.v3b, referenceCenter);
                Vec3.subtract(this.v3a, this.v3a, this.v3b);
            } else {
                Vec3.subtract(this.v3a, this._sceneViewCenter, referenceCenter);
            }
            Vec3.add(this.v3a, position, this.v3a);
            this.node.setPosition(this.v3a);

            // 相机与聚焦点保持同一平移量，后续投影切换可继续使用一致的距离状态
            this.node.getWorldPosition(this._curEye);
            this.viewDist = Vec3.distance(this._curEye, this._sceneViewCenter);

            this.updateGrid();
            Service.Engine?.repaintInEditMode?.();
        });
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
                const A = new Vec3(0, 0, 1);
                const length = Math.min(this._camera.camera.width, this._camera.camera.height) / 2;
                const B = new Vec3(length, 0, 1);
                const worldA = new Vec3(0, 0, 0);
                this._camera?.screenToWorld(A, worldA);
                const worldB = new Vec3(0, 0, 0);
                this._camera?.screenToWorld(B, worldB);
                const disWorld = worldA.subtract(worldB).length();
                dist = Math.max((maxRange / length) * disWorld, this.near * 1.3);
                dist = Math.min(dist, this.far * 0.9);
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
            this._animatePosition(this.v3d);
        }
    }

    focus(nodeUuids?: string[] | null, editorCameraInfo?: EditorCameraInfo, immediate = false) {
        if (this.isMoving()) return;
        if (!this._camera?.camera) return;

        if (editorCameraInfo) {
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
                this._animatePosition(this._curEye);
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

        if (undoId) await Service.Undo?.endRecording?.(undoId);
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
    isMoving(): boolean {
        return this._modeFSM?.currentState !== this._idleMode;
    }

    onMouseDBlDown(event: ISceneMouseEvent) {
        if (!this._modeFSM) return;
        const isViewMode = !!Service.Gizmo?.isViewMode;
        if (isViewMode) {
            const x = event.x;
            const y = getMainWindowSize().height - event.y;
            let results = getRaycastResultsForSnap(this._camera, x, y);
            results = results.filter(result => !(result.node.objFlags & CCObject.Flags.HideInHierarchy)) as typeof results;
            if (results.length > 0) {
                this.focusByXY(results[0].hitPoint);
            }
        }
        return (this._modeFSM.currentState as ModeBase3D).onMouseDBlDown(event);
    }

    onMouseDown(event: ISceneMouseEvent) {
        if (!this._modeFSM) return;
        this.altKey = event.altKey;
        this.shiftKey = event.shiftKey;
        this.mousePressing = true;

        const isViewMode = !!Service.Gizmo?.isViewMode;
        if (event.middleButton || (!event.rightButton && isViewMode)) {
            this.changeMode(ModeCommand.ToPan, event);
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
        if (!this._modeFSM) return;
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
        if (!this._modeFSM) return;
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
        if (!this._modeFSM) return;
        if ((this._modeFSM.currentState as ModeBase3D).modeName !== CameraMoveMode.WANDER) {
            let deltaY = event.deltaY;
            if (Math.abs(deltaY - this.lastMouseWheelDeltaY) > this.maxMouseWheelDeltaY) {
                deltaY = this.lastMouseWheelDeltaY + Math.sign(deltaY) * this.maxMouseWheelDeltaY;
            }
            this.scale(deltaY * this._wheelBaseScale, event.x, event.y);
        }

        (this._modeFSM.currentState as ModeBase3D).onMouseWheel(event);
        Service.Engine?.repaintInEditMode?.();
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        if (!this._modeFSM) return;
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
        if (!this._modeFSM) return;
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
        if (!this._modeFSM) return;
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

        const scaleRange = getGridHalfExtent(cameraPos.y);

        const curStartX = -scaleRange + cameraPos.x;
        const curEndX = scaleRange + cameraPos.x;
        const curStartY = -scaleRange + cameraPos.z;
        const curEndY = scaleRange + cameraPos.z;
        this.hTicks.range(curStartX, curEndX, gridRange);
        this.vTicks.range(curStartY, curEndY, gridRange);

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
        const startRotation = new Quat();
        this.node.getRotation(startRotation);

        Quat.rotationTo(this._curRot, Vec3.UNIT_Z, dir);

        const offset = new Vec3();
        if (rotateByViewDist) {
            offset.z = this.viewDist;
            Vec3.transformQuat(offset, offset, this._curRot);
            Vec3.add(this._curEye, this._sceneViewCenter, offset);
        }

        this._animatePosition(this._curEye);
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
        if (newOrthoHeight <= 0) {
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
