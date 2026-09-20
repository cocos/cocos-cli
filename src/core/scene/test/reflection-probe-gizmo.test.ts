const mockLoad = jest.fn(), mockInstantiate = jest.fn(), mockRepaint = jest.fn();
let mockRoot: any;
jest.mock('cc', () => {
    class Vec3 {
        static ZERO = new Vec3();
        constructor(public x = 0, public y = 0, public z = 0) {}
        static multiplyScalar(out: Vec3, value: Vec3, scale: number) {
            Object.assign(out, { x: value.x * scale, y: value.y * scale, z: value.z * scale }); return out;
        }
    }
    class Node {
        isValid = true; active = true; layer = 0; _objFlags = 0; children: Node[] = [];
        parent: Node | null = null; name = ''; worldPosition = new Vec3();
        getComponent = jest.fn();
        setWorldPosition = jest.fn((value: Vec3) => { this.worldPosition = { ...value }; });
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
