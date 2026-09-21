jest.mock('cc', () => {
    class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        clone() { return new Vec3(this.x, this.y, this.z); }
        static divide(out: Vec3, a: Vec3, b: Vec3) { out.x = a.x / b.x; out.y = a.y / b.y; out.z = a.z / b.z; return out; }
        static add(out: Vec3, a: Vec3, b: Vec3) { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; }
        static strictEquals(a: Vec3, b: Vec3) { return a.x === b.x && a.y === b.y && a.z === b.z; }
    }
    return { Vec3, Color: class {}, Quat: class {}, ReflectionProbe: class {}, js: { getClassName: () => 'cc.ReflectionProbe' } };
});
jest.mock('../scene-process/service/gizmo/base/gizmo-icon', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/controller/box', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({ registerGizmo: jest.fn() }));
jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true, default: class {
        constructor(public target: unknown) {}
        getCompPropPath() { return 'size'; }
        onControlUpdate = jest.fn();
        onComponentChanged = jest.fn();
    },
}));

import { Vec3, type ReflectionProbe } from 'cc';
import { SelectGizmo } from '../scene-process/service/gizmo/components/reflection-probe';

it('records before synchronous size changes and skips repeated, unchanged and clamped inputs', () => {
    let size = new Vec3(2, 2, 2);
    const writes: Vec3[] = [], before: Vec3[] = [];
    const target = {
        node: { getWorldScale: () => new Vec3(2, 1, 1) },
        get size() { return size; },
        set size(value: Vec3) { size = value.clone(); writes.push(size); },
    } as ReflectionProbe;
    const gizmo = new SelectGizmo(target);
    let delta = new Vec3();
    Object.assign(gizmo, { _isInitialized: true, _controller: { updated: true, getDeltaSize: () => delta.clone() } });
    (gizmo.onControlUpdate as jest.Mock).mockImplementation(() => before.push(size.clone()));
    gizmo.onControllerMouseDown();
    gizmo.onControllerMouseMove();
    expect(writes).toHaveLength(0);
    delta.x = 4;
    for (let i = 0; i < 100; i++) gizmo.onControllerMouseMove();
    expect(writes).toEqual([new Vec3(4, 2, 2)]);
    expect(before).toEqual([new Vec3(2, 2, 2)]);
    expect((gizmo as any).onComponentChanged).toHaveBeenCalledTimes(1);
    delta.x = -100;
    gizmo.onControllerMouseMove();
    delta.x = -200;
    gizmo.onControllerMouseMove();
    expect(writes).toEqual([new Vec3(4, 2, 2), new Vec3(0, 2, 2)]);
    expect(target.size).toEqual(new Vec3(0, 2, 2));
});
