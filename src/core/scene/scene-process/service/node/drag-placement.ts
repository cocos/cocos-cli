import { CCObject, Layers, Node, Vec2, Vec3, director } from 'cc';

import { Service } from '../core/decorator';
import { ray } from '../gizmo/utils/engine-utils';
import raycastUtil from '../gizmo/utils/raycast';
import { isEditorNode } from '../gizmo/utils/node-utils';

import type { ICreateDragPointer } from '../../../common/node';

const PLANE_EPSILON = 1e-6;

const _tmpSub = new Vec3();

/**
 * 编辑器相机组件；与 gizmo/utils/node-utils.ts 一致以 any 访问，
 * 因为 screenPointToRay / rect / node 等成员未在公共 ICameraService 类型上暴露
 */
function getEditorCamera(): any {
    try {
        return Service.Camera?.getCamera?.();
    } catch {
        return null;
    }
}

function getCurCameraInfo(): any {
    try {
        return (Service.Camera as any)?.getCurCameraInfo?.();
    } catch {
        return null;
    }
}

/**
 * 用渲染相机（component.camera）把画布像素坐标写入全局 ray
 * 渲染相机的 screenPointToRay 签名为 (out, x, y)，与 cc.Camera 组件的 (x, y, out) 不同；
 * gizmo 拾取同样使用渲染相机，这里保持一致
 */
function cameraToRay(x: number, y: number): boolean {
    const component = getEditorCamera();
    const rendererCamera = component?.camera;
    if (!rendererCamera) {
        return false;
    }

    rendererCamera.screenPointToRay(ray, x, y);
    return true;
}

/** 画布实际渲染尺寸，对应 canvas.width / canvas.height */
export function getCanvasRenderSize(): { width: number; height: number } {
    const canvas = (cc as any).game?.canvas;
    return {
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
    };
}

/**
 * 结构性校验 pointer 字段；不校验与当前画布/相机是否一致
 * 尺寸与 viewport 的一致性由 pointerMatchesCanvas / 会话内相机快照负责
 */
export function validatePointer(pointer: ICreateDragPointer | undefined | null): pointer is ICreateDragPointer {
    if (!pointer || typeof pointer !== 'object') {
        return false;
    }

    const numbers = [pointer.x, pointer.y, pointer.width, pointer.height, pointer.sequence];
    for (const value of numbers) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
        }
    }

    if (pointer.width <= 0 || pointer.height <= 0) {
        return false;
    }

    if (!Number.isInteger(pointer.sequence)) {
        return false;
    }

    const viewport = pointer.viewport;
    if (!viewport || typeof viewport !== 'object') {
        return false;
    }

    const viewportNumbers = [viewport.x, viewport.y, viewport.width, viewport.height];
    for (const value of viewportNumbers) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
        }
    }

    return viewport.width > 0 && viewport.height > 0;
}

/** pointer 记录的渲染尺寸是否与当前画布一致（容忍 1px 取整误差） */
export function pointerMatchesCanvas(pointer: ICreateDragPointer): boolean {
    const size = getCanvasRenderSize();
    if (size.width <= 0 || size.height <= 0) {
        return false;
    }

    return Math.abs(pointer.width - size.width) <= 1
        && Math.abs(pointer.height - size.height) <= 1;
}

export interface IDropPointOptions {
    /** 当前 Scene 的工作模式，决定 2D 平面还是 3D 表面优先 */
    workMode: '2d' | '3d';
    /** 目标是否为 UI 节点；UI 始终落在 Canvas 平面 */
    canvasRequired: boolean;
    /** UI 落点参考的 Canvas 节点；缺省时使用世界 z=0 平面 */
    canvasNode?: Node | null;
    /** 需要从射线检测中排除的临时节点（临时根 + 临时 Canvas 子树） */
    excludeNodes?: Node[];
}

/**
 * 将画布像素坐标（左下角原点）解析为世界落点
 * - UI：Canvas 节点平面，无 Canvas 时世界 z=0 平面
 * - 2D 普通：世界 z=0 平面（正交相机）
 * - 3D 普通：优先网格表面交点，无命中时使用过视图中心且平行相机的平面
 * 无法解析时返回 null（对应 NO_PLACEMENT）
 */
export function computeWorldDropPoint(
    pointer: ICreateDragPointer,
    options: IDropPointOptions,
): Vec3 | null {
    const camera = getEditorCamera();
    if (!camera) {
        return null;
    }

    if (!cameraToRay(pointer.x, pointer.y)) {
        return null;
    }

    if (options.workMode === '3d' && !options.canvasRequired) {
        const surfaceHit = raycastNearestHitPoint(pointer.x, pointer.y, options.excludeNodes);
        if (surfaceHit) {
            return surfaceHit;
        }

        return intersectViewCenterPlane(camera);
    }

    if (options.canvasRequired && options.canvasNode?.isValid) {
        return intersectNodePlane(options.canvasNode);
    }

    // 2D 普通节点 / 无 Canvas 的 UI：世界 XY 平面（z=0）
    return intersectRayPlane(
        ray.o,
        ray.d,
        Vec3.ZERO,
        Vec3.UNIT_Z,
        new Vec3(),
    );
}

// --- 内部工具 ---

function raycastNearestHitPoint(x: number, y: number, excludeNodes?: Node[]): Vec3 | null {
    const renderScene = director.getScene()?.renderScene;
    if (!renderScene) {
        return null;
    }

    if (!cameraToRay(x, y)) {
        return null;
    }

    const excludeSet = new Set<Node>();
    for (const node of excludeNodes ?? []) {
        if (node?.isValid) {
            excludeSet.add(node);
        }
    }

    const mask = ~Layers.Enum.SCENE_GIZMO;
    if (!raycastUtil.raycastAll(renderScene, ray, mask, Infinity, false, undefined, new Vec2(x, y))) {
        return null;
    }

    let bestDistance = Infinity;
    let bestPoint: Vec3 | null = null;

    for (const result of raycastUtil.rayResultAll) {
        const node = result?.node;
        if (!node || isEditorNode(node)) {
            continue;
        }
        // 临时节点带 HideInHierarchy / LockedInEditor，天然排除；excludeSet 兜底
        if (node._objFlags & CCObject.Flags.HideInHierarchy) {
            continue;
        }
        if (node._objFlags & CCObject.Flags.LockedInEditor) {
            continue;
        }
        if (isUnderAny(node, excludeSet)) {
            continue;
        }
        if (result.distance < bestDistance) {
            bestDistance = result.distance;
            bestPoint = result.hitPoint.clone();
        }
    }

    return bestPoint;
}

function isUnderAny(node: Node, roots: Set<Node>): boolean {
    if (roots.size === 0) {
        return false;
    }

    let iter: Node | null = node;
    while (iter) {
        if (roots.has(iter)) {
            return true;
        }
        iter = iter.parent;
    }

    return false;
}

function intersectViewCenterPlane(camera: any): Vec3 | null {
    const info = getCurCameraInfo();
    const center = info?.viewCenter;
    const forward = camera?.node?.forward as Vec3 | undefined;
    if (!center || !forward) {
        return null;
    }

    return intersectRayPlane(
        ray.o,
        ray.d,
        new Vec3(center.x, center.y, center.z),
        forward,
        new Vec3(),
    );
}

function intersectNodePlane(node: Node): Vec3 | null {
    const planePoint = node.getWorldPosition(new Vec3());
    const planeNormal = node.forward.clone();

    return intersectRayPlane(ray.o, ray.d, planePoint, planeNormal, new Vec3());
}

function intersectRayPlane(
    rayOrigin: Vec3,
    rayDir: Vec3,
    planePoint: Vec3,
    planeNormal: Vec3,
    out: Vec3,
): Vec3 | null {
    const denominator = Vec3.dot(rayDir, planeNormal);
    if (Math.abs(denominator) < PLANE_EPSILON) {
        return null;
    }

    Vec3.subtract(_tmpSub, planePoint, rayOrigin);
    const t = Vec3.dot(_tmpSub, planeNormal) / denominator;
    if (t < 0) {
        return null;
    }

    Vec3.scaleAndAdd(out, rayOrigin, rayDir, t);
    return out;
}
