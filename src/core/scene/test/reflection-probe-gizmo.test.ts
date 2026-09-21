const mockLoad = jest.fn(), mockInstantiate = jest.fn(), mockRepaint = jest.fn();
let mockRoot: any;
jest.mock('cc', () => {
    class Vec3 {
        static ZERO = new Vec3();
        constructor(public x = 0, public y = 0, public z = 0) {}
        clone() { return new Vec3(this.x, this.y, this.z); }
        static divide(out: Vec3, a: Vec3, b: Vec3) { out.x = a.x / b.x; out.y = a.y / b.y; out.z = a.z / b.z; return out; }
        static add(out: Vec3, a: Vec3, b: Vec3) { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; }
        static strictEquals(a: Vec3, b: Vec3) { return a.x === b.x && a.y === b.y && a.z === b.z; }
        static multiplyScalar(out: Vec3, value: Vec3, scale: number) {
            Object.assign(out, { x: value.x * scale, y: value.y * scale, z: value.z * scale }); return out;
        }
    }
    class Node {
        isValid = true; active = true; layer = 0; _objFlags = 0; children: Node[] = [];
        parent: Node | null = null; name = ''; worldPosition = new Vec3();
        getComponent = jest.fn();
        setWorldPosition = jest.fn((value: Vec3) => { this.worldPosition = new Vec3(value.x, value.y, value.z); });
        getWorldPosition() { return this.worldPosition; }
        getWorldScale() { return new Vec3(1, 1, 1); }
        getWorldRotation() {}
        destroy = jest.fn(() => { this.isValid = false; });
    }
    return {
        Vec3, Node, Quat: class {}, Color: class {}, Prefab: class {}, MeshRenderer: class {},
        Material: class { initialize = jest.fn(); destroy = jest.fn(); },
        ReflectionProbe: class { node = new Node(); size = new Vec3(5, 5, 5); isValid = true;
            enabledInHierarchy = true; probeType = 0; previewSphere: Node | null = null; },
        ReflectionProbeType: { BAKED_CUBEMAP: 1 }, renderer: { scene: { ProbeType: { CUBE: 0, PLANAR: 1 } } },
        assetManager: { loadAny: mockLoad }, instantiate: mockInstantiate,
        CCObject: { Flags: { DontSave: 1 << 10, HideInHierarchy: 1 << 11 } },
        Layers: { Enum: { GIZMOS: 1 << 21, IGNORE_RAYCAST: 1 << 20 } }, js: { getClassName: () => 'cc.ReflectionProbe' },
    };
});
jest.mock('../scene-process/service/gizmo/controller/box', () => ({ __esModule: true, default: class {
    show() {} hide() {} setColor() {} checkEdit() {} setScale() {} setPosition() {} setRotation() {} updateSize() {}
} }));
jest.mock('../scene-process/service/gizmo/base/gizmo-icon', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({ registerGizmo: jest.fn() }));
jest.mock('../scene-process/service/core/decorator', () => ({ Service: {
    Gizmo: { get gizmoRootNode() { return mockRoot; } }, Engine: { repaintInEditMode: mockRepaint },
} }));

import { CCObject, Layers, Node, Prefab, ReflectionProbe, ReflectionProbeType, Vec3 } from 'cc';
import { SelectGizmo } from '../scene-process/service/gizmo/components/reflection-probe';

describe('Reflection probe preview sphere', () => {
    let sphere: Node, mesh: any, probe: ReflectionProbe;
    let gizmo: InstanceType<typeof SelectGizmo>;
    const complete = () => mockLoad.mock.calls.at(-1)[1](null, new Prefab());
    beforeEach(() => {
        jest.clearAllMocks();
        mockRoot = new Node(); sphere = new Node(); probe = new ReflectionProbe();
        mesh = { bakeSettings: {}, setSharedMaterial: jest.fn() };
        (sphere.getComponent as jest.Mock).mockReturnValue(mesh);
        mockInstantiate.mockReturnValue(sphere);
        gizmo = new SelectGizmo(probe);
    });

    it('creates the Creator preview material under the editor root, excluded from saving and baking', () => {
        gizmo.show(); complete();
        expect(mockLoad).toHaveBeenCalledWith('655c9519-1a37-472b-bae6-29fefac0b550', expect.any(Function));
        expect(sphere.parent).toBe(mockRoot);
        expect(sphere.parent).not.toBe(probe.node);
        expect(sphere._objFlags & CCObject.Flags.DontSave).not.toBe(0);
        expect(sphere._objFlags & CCObject.Flags.HideInHierarchy).not.toBe(0);
        expect(sphere.layer).toBe(Layers.Enum.GIZMOS | Layers.Enum.IGNORE_RAYCAST);
        expect(mesh.bakeSettings).toEqual({ reflectionProbe: ReflectionProbeType.BAKED_CUBEMAP, bakeToReflectionProbe: false, bakeable: false });
        expect(mesh.setSharedMaterial.mock.calls[0][0].initialize).toHaveBeenCalledWith({ effectName: 'builtin-reflection-probe-preview', technique: 0 });
        expect(probe.previewSphere).toBe(sphere);
        expect(sphere.active).toBe(true);
        expect(mockRepaint).toHaveBeenCalled();
    });

    it('follows the probe and detaches on hide, reusing the same sphere when selected again', () => {
        gizmo.show(); complete();
        probe.node.setWorldPosition(new Vec3(42, 0, 0)); gizmo.update(0);
        expect(sphere.worldPosition.x).toBe(42);
        gizmo.hide();
        expect(probe.previewSphere).toBeNull(); expect(sphere.active).toBe(false);
        gizmo.show();
        expect(probe.previewSphere).toBe(sphere); expect(sphere.active).toBe(true);
        expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it('does not resurrect a selection hidden while the prefab loads', () => {
        gizmo.show(); gizmo.hide(); complete();
        expect(sphere.active).toBe(false); expect(probe.previewSphere).toBeNull();
    });

    it('uses the latest target when loading finishes and unbinds replaced targets', () => {
        gizmo.show(); const other = new ReflectionProbe(); gizmo.target = other; complete();
        expect(probe.previewSphere).toBeNull(); expect(other.previewSphere).toBe(sphere);
        gizmo.target = probe;
        expect(other.previewSphere).toBeNull(); expect(probe.previewSphere).toBe(sphere);
    });

    it('hides the sphere for planar and disabled probes and restores it on returning to Cube', () => {
        gizmo.show(); complete();
        probe.probeType = 1; gizmo.onTargetUpdate();
        expect(sphere.active).toBe(false); expect(probe.previewSphere).toBeNull();
        probe.probeType = 0; gizmo.onTargetUpdate(); expect(sphere.active).toBe(true);
        Object.defineProperty(probe, 'enabledInHierarchy', { value: false }); gizmo.update(0);
        expect(sphere.active).toBe(false); expect(probe.previewSphere).toBeNull();
    });

    it('destroys its node and material without destroying the shared prefab', () => {
        gizmo.show(); complete();
        const material = mesh.setSharedMaterial.mock.calls[0][0];
        gizmo.destroy();
        expect(probe.previewSphere).toBeNull(); expect(sphere.active).toBe(false);
        expect(sphere.destroy).toHaveBeenCalledTimes(1); expect(material.destroy).toHaveBeenCalledTimes(1);
    });

    it('ignores completion after destruction', () => {
        gizmo.show(); gizmo.destroy(); complete();
        expect(mockInstantiate).not.toHaveBeenCalled(); expect(probe.previewSphere).toBeNull();
    });

    it('can retry a failed load on the next selection without flooding every frame', () => {
        const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            gizmo.show(); mockLoad.mock.calls[0][1](new Error('load failed'));
            gizmo.update(0); expect(mockLoad).toHaveBeenCalledTimes(1);
            gizmo.hide(); gizmo.show(); complete();
            expect(probe.previewSphere).toBe(sphere);
        } finally { warning.mockRestore(); }
    });
});

it('records before synchronous size changes and skips repeated, unchanged and clamped inputs', () => {
    let size = new Vec3(2, 2, 2);
    const writes: Vec3[] = [], before: Vec3[] = [];
    const target = {
        node: { getWorldScale: () => new Vec3(2, 1, 1) },
        get size() { return size; },
        set size(value: Vec3) { size = value.clone(); writes.push(size); },
    } as ReflectionProbe;
    const gizmo = new SelectGizmo(target);
    const delta = new Vec3();
    // Keep the real GizmoBase used by the preview lifecycle tests; stub only
    // this instance's recording/notification boundaries for the drag assertion.
    Object.assign(gizmo, {
        _isInitialized: true,
        _controller: { updated: true, getDeltaSize: () => delta.clone() },
        getCompPropPath: jest.fn(() => 'size'),
        onControlUpdate: jest.fn(),
        onComponentChanged: jest.fn(),
    });
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
