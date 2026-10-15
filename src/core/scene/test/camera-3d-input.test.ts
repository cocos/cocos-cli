/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SUD. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Camera, Quat, Vec3, geometry } from 'cc';
import { CameraController3D } from '../scene-process/service/camera/camera-controller-3d';
import type { ISceneMouseEvent } from '../scene-process/service/operation/types';

jest.mock('cc', () => {
    class Vector {
        x = 0;
        y = 0;
        z = 0;
        static ZERO = new Vector();
        static UNIT_X = new Vector(1, 0, 0);
        static UNIT_Y = new Vector(0, 1, 0);
        static UNIT_Z = new Vector(0, 0, 1);

        constructor(x: number | Vector = 0, y = 0, z = 0) { this.set(x, y, z); }
        set(x: number | Vector, y = 0, z = 0) {
            if (typeof x === 'object') { ({ x, y, z } = x); }
            Object.assign(this, { x, y, z });
            return this;
        }
        clone() { return new Vector(this); }
        static copy(out: Vector, value: Vector) { return out.set(value); }
        static add(out: Vector, a: Vector, b: Vector) {
            return out.set(a.x + b.x, a.y + b.y, a.z + b.z);
        }
        static subtract(out: Vector, a: Vector, b: Vector) {
            return out.set(a.x - b.x, a.y - b.y, a.z - b.z);
        }
        static multiplyScalar(out: Vector, value: Vector, scalar: number) {
            return out.set(value.x * scalar, value.y * scalar, value.z * scalar);
        }
        static scaleAndAdd(out: Vector, a: Vector, b: Vector, scalar: number) {
            return out.set(a.x + b.x * scalar, a.y + b.y * scalar, a.z + b.z * scalar);
        }
        static lerp(out: Vector, a: Vector, b: Vector, ratio: number) {
            return out.set(
                a.x + (b.x - a.x) * ratio,
                a.y + (b.y - a.y) * ratio,
                a.z + (b.z - a.z) * ratio,
            );
        }
        static dot(a: Vector, b: Vector) { return a.x * b.x + a.y * b.y + a.z * b.z; }
        static distance(a: Vector, b: Vector) {
            return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        }
        static normalize(out: Vector, value: Vector) {
            return Vector.multiplyScalar(out, value, 1 / (Math.hypot(value.x, value.y, value.z) || 1));
        }
        static transformQuat(out: Vector, value: Vector, q: Rotation) {
            const tx = 2 * (q.y * value.z - q.z * value.y);
            const ty = 2 * (q.z * value.x - q.x * value.z);
            const tz = 2 * (q.x * value.y - q.y * value.x);
            return out.set(
                value.x + q.w * tx + q.y * tz - q.z * ty,
                value.y + q.w * ty + q.z * tx - q.x * tz,
                value.z + q.w * tz + q.x * ty - q.y * tx,
            );
        }
    }
    class Rotation {
        constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
        clone() { return new Rotation(this.x, this.y, this.z, this.w); }
        static copy(out: Rotation, value: Rotation) { return Object.assign(out, value); }
        static fromViewUp(out: Rotation) { return out; }

        /** 在单位四元数之间插值，以实际中间朝向验证动画期间的输入 */
        static slerp(out: Rotation, start: Rotation, end: Rotation, ratio: number) {
            const dot = start.x * end.x + start.y * end.y + start.z * end.z + start.w * end.w;
            const sign = dot < 0 ? -1 : 1;
            const angle = Math.acos(Math.min(1, Math.abs(dot)));
            const sine = Math.sin(angle);
            const startWeight = sine > 1e-6 ? Math.sin((1 - ratio) * angle) / sine : 1 - ratio;
            const endWeight = sign * (sine > 1e-6 ? Math.sin(ratio * angle) / sine : ratio);
            return Object.assign(out, {
                x: start.x * startWeight + end.x * endWeight,
                y: start.y * startWeight + end.y * endWeight,
                z: start.z * startWeight + end.z * endWeight,
                w: start.w * startWeight + end.w * endWeight,
            });
        }

        /** 测试中的方向轴始终转向 +Z，对应单位旋转 */
        static rotationTo(out: Rotation) { return Rotation.copy(out, new Rotation()); }
    }
    class Color {
        static RED = new Color();
        static GREEN = new Color();
        static BLUE = new Color();
        clone() { return new Color(); }
    }
    class Ray {
        o = new Vector();
        d = new Vector(0, 0, -1);
    }
    class Plane {
        n = new Vector();
        d = 0;
        static fromNormalAndPoint(out: Plane, normal: Vector, point: Vector) {
            out.n.set(normal);
            out.d = Vector.dot(normal, point);
            return out;
        }
    }
    class TestNode {
        position = new Vector();
        children = [];
        components = [];
        layer = 0;
        objFlags = 0;
        parent = null;
        getWorldPosition() { return this.position.clone(); }
        getWorldMatrix(out: object) {
            return Object.assign(out, {
                m00: 1, m01: 0, m04: 0, m05: 1,
                m12: this.position.x, m13: this.position.y, m14: this.position.z,
            });
        }
        getComponent() { return null; }
    }
    return {
        Vec3: Vector, Quat: Rotation, Color, Mat4: class {},
        Vec2: class { x = 0; y = 0; },
        Rect: class {
            constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
        },
        Node: TestNode, v3: () => new Vector(), quat: () => new Rotation(),
        Layers: { Enum: { GIZMOS: 1 } }, CCObject: { Flags: { HideInHierarchy: 1 } },
        Camera: { ProjectionType: { ORTHO: 0, PERSPECTIVE: 1 } },
        geometry: {
            Ray, Plane,
            intersect: {
                rayPlane(ray: Ray, plane: Plane) {
                    const denominator = Vector.dot(ray.d, plane.n);
                    if (Math.abs(denominator) < Number.EPSILON) { return 0; }
                    return Math.max(0, (plane.d - Vector.dot(ray.o, plane.n)) / denominator);
                },
            },
        },
    };
});

jest.mock('../scene-process/service/camera/utils', () => ({
    CameraMoveMode: { IDLE: 0, PAN: 2, ORBIT: 3, WANDER: 4 },
    CameraUtils: {
        createGrid: () => ({
            node: {
                active: false,
                worldPosition: new Vec3(),
                worldRotation: new Quat(),
                inverseTransformPoint(out: Vec3, point: Vec3) {
                    const q = this.worldRotation;
                    Vec3.subtract(out, point, this.worldPosition);
                    return Vec3.transformQuat(out, out, new Quat(-q.x, -q.y, -q.z, q.w));
                },
                setWorldRotationFromEuler(x: number, y: number) {
                    const pitch = x * Math.PI / 360;
                    const yaw = y * Math.PI / 360;
                    this.worldRotation = new Quat(
                        Math.sin(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw),
                        -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch) * Math.cos(yaw),
                    );
                },
            },
        }),
        showWanderTip: jest.fn(), hideWanderTip: jest.fn(), showWanderSpeedToast: jest.fn(),
    },
}));
jest.mock('../scene-process/service/camera/modes/engine-state', () => ({
    enterCameraState: jest.fn(), exitCameraState: jest.fn(), NeedAnimState: {},
}));
jest.mock('../scene-process/service/core/decorator', () => ({
    Service: { Engine: { repaintInEditMode: jest.fn() }, Gizmo: { transformToolData: {} } },
}));
const mockModelRaycast = jest.fn(() => []);
jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({
    getRaycastResultsForSnap: () => mockModelRaycast(),
}));
jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: async () => undefined }) },
}));

interface ViewOptions {
    projection: 'perspective' | 'ortho';
    width?: number;
    height?: number;
    dpr?: number;
    fov?: number;
    yaw?: number;
    pitch?: number;
    offset?: number;
    parentScale?: number;
}

/**
 * 用独立的透视和正交投影模型检查真实控制器的输入结果
 *
 * 保留输入处理和聚焦动画，只替换引擎环境与绘制操作
 */
function createFixture(options: ViewOptions) {
    const { projection, dpr = 1, fov = 45, yaw = 0, pitch = 0, offset = 0 } = options;
    const halfFovTangent = Math.tan(fov * Math.PI / 360);
    const parentScale = options.parentScale ?? 1;

    // 视口可位于画布的一部分，所有输入统一使用渲染像素
    const viewport = {
        x: offset * dpr, y: offset * dpr,
        width: (options.width ?? 1280) * dpr,
        height: (options.height ?? 720) * dpr,
    };

    const position = new Vec3();
    const rotation = new Quat();
    const node = {
        // 统一缩放的父节点用于验证动画局部坐标与输入世界位移之间的转换
        parent: options.parentScale === undefined ? null : {
            inverseTransformPoint: (out: Vec3, point: Vec3) =>
                Vec3.multiplyScalar(out, point, 1 / parentScale),
        },
        getPosition: (out = new Vec3()) => Vec3.multiplyScalar(out, position, 1 / parentScale),
        getRotation: (out = new Quat()) => Object.assign(out, rotation),
        setPosition: (value: Vec3) => Vec3.multiplyScalar(position, value, parentScale),
        setRotation: (value: Quat) => Object.assign(rotation, value),
        getWorldPosition: (out = new Vec3()) => Vec3.copy(out, position),
        getWorldRotation: (out = new Quat()) => Object.assign(out, rotation),
        setWorldPosition: (value: Vec3) => position.set(value),
        setWorldRotation: (value: Quat) => Object.assign(rotation, value),
    };
    const camera = {
        node, near: 0.1, far: 10000, fov,
        projection: projection === 'ortho'
            ? Camera.ProjectionType.ORTHO : Camera.ProjectionType.PERSPECTIVE,
        orthoHeight: 100 * halfFovTangent,
        camera: {
            width: 2560 * dpr, height: 1440 * dpr,
            update: jest.fn(),
            screenPointToRay: jest.fn(),
        },
    };
    const controller = new CameraController3D();
    jest.spyOn(controller, 'updateGrid').mockImplementation(() => {});
    controller.init(camera as unknown as Camera);

    // 初始化会重置相机，因此在初始化后设置用例指定的朝向和聚焦深度
    const yawHalf = yaw * Math.PI / 360;
    const pitchHalf = pitch * Math.PI / 360;
    rotation.x = Math.cos(yawHalf) * Math.sin(pitchHalf);
    rotation.y = Math.sin(yawHalf) * Math.cos(pitchHalf);
    rotation.z = -Math.sin(yawHalf) * Math.sin(pitchHalf);
    rotation.w = Math.cos(yawHalf) * Math.cos(pitchHalf);
    controller.sceneViewCenter = new Vec3(17, -24, 9);
    controller.viewDist = 100;
    Vec3.transformQuat(position, new Vec3(0, 0, 100), rotation);
    Vec3.add(position, position, controller.sceneViewCenter);

    // 只有 update 才同步渲染状态，用于检查连续输入是否读取了过期投影
    let renderPosition = position.clone();
    let renderHeight = camera.orthoHeight;
    let renderOrtho = camera.projection === Camera.ProjectionType.ORTHO;
    camera.camera.update.mockImplementation(() => {
        renderPosition = position.clone();
        renderHeight = camera.orthoHeight;
        renderOrtho = camera.projection === Camera.ProjectionType.ORTHO;
    });
    camera.camera.screenPointToRay.mockImplementation((out: geometry.Ray, x: number, y: number) => {
        const halfHeight = renderOrtho ? renderHeight : halfFovTangent;
        const local = new Vec3(
            ((x - viewport.x) / viewport.width * 2 - 1) * halfHeight
                * viewport.width / viewport.height,
            (1 - (camera.camera.height - y - viewport.y) / viewport.height * 2) * halfHeight,
            renderOrtho ? -camera.near : -1,
        );
        if (renderOrtho) {
            Vec3.transformQuat(out.o, local, rotation);
            Vec3.add(out.o, out.o, renderPosition);
            Vec3.transformQuat(out.d, new Vec3(0, 0, -1), rotation);
        } else {
            Vec3.copy(out.o, renderPosition);
            Vec3.transformQuat(out.d, local, rotation);
            Vec3.normalize(out.d, out.d);
        }
        return out;
    });

    // 从世界坐标独立计算屏幕位置，以实际像素位移验证控制器行为
    const point = Vec3.transformQuat(new Vec3(), new Vec3(20, 10, 0), rotation);
    Vec3.add(point, point, controller.sceneViewCenter);
    const project = (world = point) => {
        const local = Vec3.subtract(new Vec3(), world, position);
        const inverse = new Quat(-rotation.x, -rotation.y, -rotation.z, rotation.w);
        Vec3.transformQuat(local, local, inverse);
        const halfHeight = camera.projection === Camera.ProjectionType.ORTHO
            ? camera.orthoHeight : -local.z * halfFovTangent;
        const scale = viewport.height / (2 * halfHeight);
        return {
            x: viewport.x + viewport.width / 2 + local.x * scale,
            y: viewport.y + viewport.height / 2 - local.y * scale,
        };
    };

    return { controller, camera, position, rotation, viewport, project, dpr };
}

/** 创建与输入桥接相同、使用渲染像素的鼠标事件 */
function mouseEvent(overrides: Partial<ISceneMouseEvent> = {}): ISceneMouseEvent {
    return {
        x: 0, y: 0, clientX: 0, clientY: 0,
        deltaX: 0, deltaY: 0, wheelDeltaX: 0, wheelDeltaY: 0,
        moveDeltaX: 0, moveDeltaY: 0, movementX: 0, movementY: 0,
        leftButton: false, middleButton: false, rightButton: false, button: 0, buttons: 0,
        ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
        ...overrides,
    };
}

const originalCC = Object.getOwnPropertyDescriptor(globalThis, 'cc');

beforeAll(() => {
    // 聚焦动画使用全局 cc，必须与控制器导入的引擎桩保持一致
    Object.defineProperty(globalThis, 'cc', {
        configurable: true, writable: true, value: jest.requireMock('cc'),
    });
});

afterAll(() => {
    if (originalCC) {
        Object.defineProperty(globalThis, 'cc', originalCC);
    } else {
        Reflect.deleteProperty(globalThis, 'cc');
    }
});

afterEach(() => {
    jest.restoreAllMocks();
    mockModelRaycast.mockClear();
});

describe.each(['perspective', 'ortho'] as const)('3D %s camera input', projection => {
    describe.each([
        { width: 1280, height: 720, dpr: 1, fov: 45, yaw: 0, offset: 0 },
        { width: 640, height: 360, dpr: 1, fov: 45, yaw: 0, offset: 0 },
        { width: 640, height: 360, dpr: 2, fov: 45, yaw: 90, offset: 0 },
        { width: 900, height: 480, dpr: 2, fov: 90, yaw: 35, pitch: -25, offset: 80 },
    ])('$width x $height, DPR $dpr, FOV $fov, yaw $yaw', options => {
        it('pans by the mouse distance at the focus plane, including after viewport resize', async () => {
            const f = createFixture({ ...options, projection });
            f.controller.onMouseDown(mouseEvent({ middleButton: true, button: 1, buttons: 4 }));
            await new Promise<void>(resolve => setImmediate(resolve));

            for (const ratio of [1, 0.75]) {
                f.viewport.width *= ratio;
                f.viewport.height *= ratio;
                const before = f.project();
                f.controller.onMouseMove(mouseEvent({
                    moveDeltaX: 100 * f.dpr, moveDeltaY: -40 * f.dpr,
                }));
                const after = f.project();
                expect((after.x - before.x) / f.dpr).toBeCloseTo(100, 6);
                expect((after.y - before.y) / f.dpr).toBeCloseTo(-40, 6);
                expect(f.controller.viewDist).toBeCloseTo(100, 6);
            }
        });

        it('keeps the focus-plane point under the mouse fixed through repeated wheel zooms', () => {
            const f = createFixture({ ...options, projection });
            const before = f.project();
            for (const deltaY of [-120, -120, 240]) {
                f.controller.onMouseWheel(mouseEvent({ ...before, deltaY: deltaY * f.dpr }));
                const after = f.project();
                expect(after.x / f.dpr).toBeCloseTo(before.x / f.dpr, 6);
                expect(after.y / f.dpr).toBeCloseTo(before.y / f.dpr, 6);
                expect(f.controller.viewDist).toBeCloseTo(
                    Vec3.distance(f.position, f.controller.sceneViewCenter), 6,
                );
            }
        });
    });

    it('keeps keyboard zoom centered when no mouse anchor is supplied', () => {
        const f = createFixture({ projection });
        const center = f.controller.sceneViewCenter.clone();
        const before = f.project(center);
        f.controller.scale(-10);
        expect(f.project(center)).toEqual(before);
    });

    it.each([0, 100])('preserves the focus-relative target when zooming at offset %s', offset => {
        jest.useFakeTimers();
        try {
            const f = createFixture({ projection, yaw: 35, pitch: -25 });
            const forward = Vec3.transformQuat(new Vec3(), Vec3.UNIT_Z, f.rotation);
            const target = Vec3.scaleAndAdd(new Vec3(), f.controller.sceneViewCenter, forward, 20);
            const expectedOffset = Vec3.multiplyScalar(new Vec3(), forward, 100);

            // 动画尚未结束时插入滚轮输入，覆盖动画终点与缩放锚点发生冲突的时序
            f.controller.focusByXY(target);
            jest.advanceTimersByTime(100);

            const cursor = f.project(target);
            f.controller.onMouseWheel(mouseEvent({
                x: cursor.x + offset, y: cursor.y, deltaY: -120,
            }));
            jest.runAllTimers();

            const actualOffset = Vec3.subtract(new Vec3(), f.position, f.controller.sceneViewCenter);
            expect(Vec3.distance(actualOffset, expectedOffset)).toBeCloseTo(0, 6);
            expect(f.controller.viewDist).toBeGreaterThan(f.camera.near);
        } finally {
            jest.useRealTimers();
        }
    });

    it.each([
        { animation: 'restore', input: 'wheel' },
        { animation: 'restore', input: 'pan' },
        { animation: 'direction', input: 'wheel' },
        { animation: 'direction', input: 'pan' },
    ])('preserves the $animation focus-relative target during $input input', async options => {
        jest.useFakeTimers();
        try {
            const f = createFixture({ projection, yaw: 35, pitch: -25 });
            const expectedRotation = new Quat();
            const expectedPosition = options.animation === 'restore'
                ? new Vec3(5, 50, 100)
                : Vec3.add(new Vec3(), f.controller.sceneViewCenter, new Vec3(0, 0, 100));

            // 通过公开入口启动位置和旋转动画，让输入发生在转向尚未完成时
            if (options.animation === 'restore') {
                f.controller.focus(null, {
                    position: expectedPosition, rotation: expectedRotation, viewCenter: new Vec3(),
                });
            } else {
                f.controller.rotateCameraToDir(Vec3.UNIT_Z, true);
            }
            const expectedOffset = Vec3.subtract(
                new Vec3(), expectedPosition, f.controller.sceneViewCenter,
            );
            jest.advanceTimersByTime(100);

            const cursor = f.project(f.controller.sceneViewCenter);
            if (options.input === 'wheel') {
                f.controller.onMouseWheel(mouseEvent({ ...cursor, deltaY: -120 }));
            } else {
                f.controller.onMouseDown(mouseEvent({
                    ...cursor, middleButton: true, button: 1, buttons: 4,
                }));
                await jest.advanceTimersByTimeAsync(0);
                f.controller.onMouseMove(mouseEvent({
                    x: cursor.x + 10, y: cursor.y, moveDeltaX: 10,
                }));
            }
            jest.runAllTimers();

            // 输入产生的平移应同时作用于相机与聚焦点，保留动画目标相对聚焦点的位置
            const actualOffset = Vec3.subtract(new Vec3(), f.position, f.controller.sceneViewCenter);
            expect(Vec3.distance(actualOffset, expectedOffset)).toBeCloseTo(0, 6);
            expect(f.rotation.x).toBeCloseTo(expectedRotation.x, 6);
            expect(f.rotation.y).toBeCloseTo(expectedRotation.y, 6);
            expect(f.rotation.z).toBeCloseTo(expectedRotation.z, 6);
            expect(f.rotation.w).toBeCloseTo(expectedRotation.w, 6);
            expect(f.controller.viewDist).toBeCloseTo(
                Vec3.distance(f.position, f.controller.sceneViewCenter), 6,
            );
        } finally {
            jest.useRealTimers();
        }
    });

    it.each([40, 160])('keeps the point under the cursor fixed at camera depth %s', depth => {
        const f = createFixture({ projection, yaw: 35, pitch: -25, dpr: 2, offset: 80 });
        const point = Vec3.transformQuat(new Vec3(), new Vec3(10, 5, 100 - depth), f.rotation);
        Vec3.add(point, point, f.controller.sceneViewCenter);
        const before = f.project(point);
        f.controller.onMouseWheel(mouseEvent({ ...before, deltaY: -120 }));
        const after = f.project(point);
        expect(after.x / f.dpr).toBeCloseTo(before.x / f.dpr, 6);
        expect(after.y / f.dpr).toBeCloseTo(before.y / f.dpr, 6);
    });

    it('pans at the focus depth after switching projection and zooming', async () => {
        const f = createFixture({ projection, yaw: 35, pitch: -25, dpr: 2, offset: 80 });
        for (let i = 0; i < 2; i++) {
            f.controller.changeProjection();
            f.controller.onMouseWheel(mouseEvent({ ...f.project(), deltaY: -120 }));
            const point = f.controller.sceneViewCenter.clone();
            const before = f.project(point);
            f.controller.onMouseDown(mouseEvent({
                ...before, middleButton: true, button: 1, buttons: 4,
            }));
            await new Promise<void>(resolve => setImmediate(resolve));
            f.controller.onMouseMove(mouseEvent({ moveDeltaX: 100 * f.dpr }));
            expect((f.project(point).x - before.x) / f.dpr).toBeCloseTo(100, 6);
            f.controller.onMouseUp(mouseEvent({ middleButton: true, button: 1 }));
            await new Promise<void>(resolve => setImmediate(resolve));
        }
    });

    it.each([{ x: 40, z: 35 }, { x: 20, z: -20 }])(
        'pans the empty grid under the mouse at ($x, 0, $z)', async ({ x, z }) => {
            const f = createFixture({ projection, yaw: 35, pitch: -25, dpr: 2, offset: 80 });
            f.controller.showGrid(true);
            const point = new Vec3(x, 0, z);
            const before = f.project(point);
            f.controller.onMouseDown(mouseEvent({
                ...before, middleButton: true, button: 1, buttons: 4,
            }));
            await new Promise<void>(resolve => setImmediate(resolve));
            f.controller.onMouseMove(mouseEvent({
                x: before.x + 100 * f.dpr, y: before.y - 40 * f.dpr,
                moveDeltaX: 100 * f.dpr, moveDeltaY: -40 * f.dpr,
            }));
            const after = f.project(point);
            expect((after.x - before.x) / f.dpr).toBeCloseTo(100, 6);
            expect((after.y - before.y) / f.dpr).toBeCloseTo(-40, 6);
            expect(mockModelRaycast).not.toHaveBeenCalled();
        },
    );

    it('uses the grid point when space starts a pan without a mouse-down event', async () => {
        const f = createFixture({ projection, yaw: 35, pitch: -25, dpr: 2, offset: 80 });
        f.controller.showGrid(true);
        const point = new Vec3(40, 0, 35);
        const before = f.project(point);
        f.controller.onKeyDown({
            key: ' ', code: 'Space', keyCode: 32, repeat: false,
            ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
        });
        await new Promise<void>(resolve => setImmediate(resolve));
        f.controller.onMouseMove(mouseEvent({
            x: before.x + 100 * f.dpr, y: before.y - 40 * f.dpr,
            moveDeltaX: 100 * f.dpr, moveDeltaY: -40 * f.dpr,
        }));
        const after = f.project(point);
        expect((after.x - before.x) / f.dpr).toBeCloseTo(100, 6);
        expect((after.y - before.y) / f.dpr).toBeCloseTo(-40, 6);
        expect(mockModelRaycast).not.toHaveBeenCalled();
    });

    it('falls back to the focus plane when looking parallel to the grid', async () => {
        const f = createFixture({ projection });
        f.controller.showGrid(true);
        const point = f.controller.sceneViewCenter.clone();
        const before = f.project(point);
        f.controller.onMouseDown(mouseEvent({
            ...before, middleButton: true, button: 1, buttons: 4,
        }));
        await new Promise<void>(resolve => setImmediate(resolve));
        f.controller.onMouseMove(mouseEvent({ moveDeltaX: 100 * f.dpr }));
        expect((f.project(point).x - before.x) / f.dpr).toBeCloseTo(100, 6);
    });

    it.each([
        { yaw: 0, useSpace: false }, { yaw: 90, useSpace: false },
        { yaw: 0, useSpace: true }, { yaw: 90, useSpace: true },
    ])('uses focus depth near the grid horizon (yaw $yaw, space $useSpace)', async options => {
        // 视线略微朝下，使平面交点位于远裁剪面内、实际网格覆盖范围外
        const f = createFixture({ projection, yaw: options.yaw, pitch: -0.1 });
        f.position.set(30, 10, 40);
        const back = Vec3.transformQuat(new Vec3(), new Vec3(0, 0, 100), f.rotation);
        f.controller.sceneViewCenter = Vec3.subtract(new Vec3(), f.position, back);
        f.controller.showGrid(true);

        const point = f.controller.sceneViewCenter.clone();
        const before = f.project(point);
        if (options.useSpace) {
            f.controller.onKeyDown({
                key: ' ', code: 'Space', keyCode: 32, repeat: false,
                ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
            });
        } else {
            f.controller.onMouseDown(mouseEvent({
                ...before, middleButton: true, button: 1, buttons: 4,
            }));
        }
        await new Promise<void>(resolve => setImmediate(resolve));

        // 回退到聚焦深度后，短距离拖动不应被远处平面交点放大
        f.controller.onMouseMove(mouseEvent({
            x: before.x + 10, y: before.y, moveDeltaX: 10,
        }));

        expect(f.project(point).x - before.x).toBeCloseTo(10, 6);
        expect(f.project(point).y - before.y).toBeCloseTo(0, 6);
    });

    it('keeps the mouse anchor valid at the zoom-in limit', () => {
        const f = createFixture({ projection });
        f.controller.wheelSpeed = 1;
        f.camera.orthoHeight = 100;
        const before = f.project();
        f.controller.onMouseWheel(mouseEvent({ ...before, deltaY: -120 }));
        const after = f.project();
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
        expect(f.controller.viewDist).toBeGreaterThan(f.camera.near);
        expect(f.camera.orthoHeight).toBeGreaterThan(0);
    });

    it('continues to use the wheel for movement speed in right-button wander mode', async () => {
        const f = createFixture({ projection });
        f.controller.onMouseDown(mouseEvent({ rightButton: true, button: 2, buttons: 2 }));
        await new Promise<void>(resolve => setImmediate(resolve));
        const before = f.project();
        const speed = f.controller.wanderSpeed;
        f.controller.onMouseWheel(mouseEvent({ ...before, deltaY: -120 }));
        expect(f.project()).toEqual(before);
        expect(f.controller.wanderSpeed).not.toBe(speed);
    });
});

describe('camera state after animations', () => {
    describe.each([
        { animation: 'restore', parentScale: 1 },
        { animation: 'restore', parentScale: 2 },
        { animation: 'direction', parentScale: 1 },
    ])('$animation, parent scale $parentScale', ({ animation, parentScale }) => {
        it.each([
            { input: 'wheel', x: 0, y: 0 },
            { input: 'wheel', x: 100, y: -60 },
            { input: 'wheel', x: -200, y: 120 },
            { input: 'pan', x: 100, y: -40 },
        ])('keeps the camera position after $input at ($x, $y)', async options => {
            jest.useFakeTimers();
            try {
                const f = createFixture({ projection: 'ortho', yaw: 35, pitch: -25, parentScale });
                if (animation === 'restore') {
                    f.controller.focus(null, {
                        position: new Vec3(0, 0, 1000 / parentScale),
                        rotation: new Quat(),
                        viewCenter: new Vec3(),
                    });
                } else {
                    f.controller.rotateCameraToDir(Vec3.UNIT_Z, true);
                }
                jest.advanceTimersByTime(100);

                // 覆盖居中、偏心缩放和平移，检查聚焦点改变后后续动画帧的状态一致性
                const cursor = {
                    x: f.viewport.x + f.viewport.width / 2 + options.x,
                    y: f.viewport.y + f.viewport.height / 2 + options.y,
                };
                if (options.input === 'wheel') {
                    f.controller.onMouseWheel(mouseEvent({ ...cursor, deltaY: -120 }));
                } else {
                    f.controller.onMouseDown(mouseEvent({
                        ...cursor, middleButton: true, button: 1, buttons: 4,
                    }));
                    await jest.advanceTimersByTimeAsync(0);
                    f.controller.onMouseMove(mouseEvent({
                        x: cursor.x + options.x, y: cursor.y + options.y,
                        moveDeltaX: options.x, moveDeltaY: options.y,
                    }));
                    f.controller.onMouseUp(mouseEvent({ middleButton: true, button: 1 }));
                    await jest.advanceTimersByTimeAsync(0);
                }
                jest.runAllTimers();

                const before = f.position.clone();
                f.controller.changeProjection();
                expect(Vec3.distance(f.position, before)).toBeCloseTo(0, 6);
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
