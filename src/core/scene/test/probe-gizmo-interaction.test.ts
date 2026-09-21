jest.mock('cc', () => {
    class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        set(v: Vec3) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        clone() { return new Vec3(this.x, this.y, this.z); }
        static strictEquals(a: Vec3, b: Vec3) { return a.x === b.x && a.y === b.y && a.z === b.z; }
        static multiplyScalar(out: Vec3, a: Vec3, n: number) { out.x = a.x * n; out.y = a.y * n; out.z = a.z * n; return out; }
    }
    return { Vec3, Vec4: class {}, Event: class { constructor(public type: string) {} }, Layers: { Enum: {} }, director: { getScene: () => null } };
});
jest.mock('../scene-process/service/core/decorator', () => ({ Service: { Engine: { repaintInEditMode: jest.fn() } } }));
jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({ updateBoundingBox: jest.fn(), updatePositions: jest.fn() }));
jest.mock('../scene-process/service/gizmo/utils/node-utils', () => ({}));
jest.mock('../scene-process/service/gizmo/utils/selection-utils', () => ({}));
jest.mock('../scene-process/service/gizmo/utils/editor-node', () => ({}));
jest.mock('../scene-process/service/gizmo/controller/editable', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/utils/controller-utils', () => ({ __esModule: true, default: { axisDirectionMap: {}, AxisName: {} } }));
jest.mock('../scene-process/service/gizmo/utils/controller-shape', () => ({
    __esModule: true, default: { calcBoxPoints: jest.fn(() => []), calcCubeData: jest.fn(() => ({ positions: [] })) },
}));

import { Vec3 } from 'cc';
import BoxController from '../scene-process/service/gizmo/controller/box';
import GizmoOperation from '../scene-process/service/gizmo/gizmo-operation';
import { updateBoundingBox, updatePositions } from '../scene-process/service/gizmo/utils/engine-utils';

beforeEach(() => { jest.clearAllMocks(); (globalThis as any).cc = {}; });

it('keeps captured drag ownership and all deltas without scene-wide picking, then resumes hover picking', () => {
    const operation = new GizmoOperation() as any;
    const hitPoint = new Vec3(1, 2, 3);
    const events: any[] = [];
    const handle = { emit: (_type: string, event: any) => { events.push(event); event.propagationStopped = true; } };
    const lowerHandle = { emit: jest.fn() };
    operation._curMouseDownInfos = [{ node: handle, hitPoint }, { node: lowerHandle, hitPoint }];
    operation._gizmoMouseDownEvent = {};
    operation._mouseDownRaycastGizmos = [{}];
    const pick = jest.spyOn(operation, 'raycastGizmos').mockReturnValue([]);
    const hover = jest.spyOn(operation, '_changeMouseHover').mockReturnValue(true);
    for (let x = 0; x < 100; x++) operation.onMouseMove({ x, y: 10, moveDeltaX: 1, moveDeltaY: 2, leftButton: true });
    expect(pick).not.toHaveBeenCalled();
    expect(events).toHaveLength(100);
    expect(events.every(event => event.hitPoint === hitPoint && event.moveDeltaX === 1 && event.moveDeltaY === -2)).toBe(true);
    expect(lowerHandle.emit).not.toHaveBeenCalled();
    operation.onMouseUp({ x: 100, y: 10, leftButton: true });
    expect(events[100].type).toBe('mouseUp');
    operation.onMouseMove({ x: 101, y: 10 });
    expect(pick).toHaveBeenCalledTimes(1);
    expect(hover).toHaveBeenCalledTimes(1);
});

it('updates box geometry only when its numeric size/center changes, while keeping handles current', () => {
    const controller = Object.create(BoxController.prototype) as any;
    Object.assign(controller, { _center: new Vec3(), _size: new Vec3(1, 1, 1),
        _cubeNodeMR: {}, _wireFrameBoxMeshRenderer: {}, _edit: true,
        updateEditHandles: jest.fn(), adjustEditHandlesSize: jest.fn() });
    const size = new Vec3(4, 4, 4), center = new Vec3();
    controller.updateSize(center, size);
    expect(updatePositions).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 100; i++) controller.updateSize(center, size);
    expect(updatePositions).toHaveBeenCalledTimes(2);
    expect(controller.adjustEditHandlesSize).toHaveBeenCalledTimes(101);
    size.x = 8;
    controller.updateSize(center, size);
    expect(updatePositions).toHaveBeenCalledTimes(4);
    expect(updateBoundingBox).toHaveBeenLastCalledWith(controller._cubeNodeMR, new Vec3(-4, -2, -2), new Vec3(4, 2, 2));
    expect(controller._size).not.toBe(size);
    center.y = 3;
    controller.updateSize(center, size);
    expect(updatePositions).toHaveBeenCalledTimes(6);
    expect(controller._center).not.toBe(center);
});
