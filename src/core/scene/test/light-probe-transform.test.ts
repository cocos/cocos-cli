jest.mock('cc', () => ({
    Vec3: class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        static clone(v: { x: number; y: number; z: number }) { return new this(v.x, v.y, v.z); }
        static strictEquals(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
            return a.x === b.x && a.y === b.y && a.z === b.z;
        }
    },
}));

import { Vec3, type Node, type Scene } from 'cc';
import { getLightProbeTransformScene, synchronizeLightProbeTransform, withLightProbeTransformScenes } from '../scene-process/service/scene/light-probe-transform';

function fixture() {
    const group = { isValid: true, enabledInHierarchy: true };
    const nextPositions = Array.from({ length: 4 }, (_, index) => new Vec3(index, 0, 0));
    const probes = nextPositions.map(position => ({ position: Vec3.clone(position), coefficients: [new Vec3(1, 2, 3)] }));
    const events: string[] = [];
    const info = {
        data: { probes },
        update: jest.fn((tet: boolean) => {
            events.push(tet ? 'tetrahedrons' : 'positions');
            // Model the engine's in-place mutation and retention of stale SH.
            probes.forEach((probe, i) => Object.assign(probe.position, nextPositions[i]));
        }),
        onProbeBakeCleared: jest.fn(() => { events.push('clear'); probes.forEach(probe => { probe.coefficients = []; }); }),
        onProbeBakeFinished: jest.fn(() => { events.push('refresh'); }),
    };
    const scene = { isValid: true, globals: { lightProbeInfo: info }, getComponentsInChildren: () => [group] } as unknown as Scene;
    Object.defineProperty(scene, 'scene', { value: scene });
    const node = { isValid: true, scene, getComponentsInChildren: () => [group] } as unknown as Node;
    return { scene, node, group, nextPositions, info, events };
}

describe('Light probe position synchronization', () => {
    it.each([null, { probes: [] }])('does not scan ordinary scene subtrees without generated probes (%s)', data => {
        const { node, scene, info } = fixture();
        (scene.globals.lightProbeInfo as any).data = data;
        const scan = jest.spyOn(node, 'getComponentsInChildren');
        synchronizeLightProbeTransform(node);
        expect(withLightProbeTransformScenes([node])).toEqual([node]);
        expect(scan).not.toHaveBeenCalled();
        expect(info.update).not.toHaveBeenCalled();
    });
    it('retains moved and stationary groups coefficients when translating a group', () => {
        const { node, nextPositions, info, events } = fixture();
        // First two samples belong to A, last two to the stationary group B.
        info.data.probes.forEach((probe, index) => { probe.coefficients = [new Vec3(index + 1, 2, 3)]; });
        const coefficients = info.data.probes.map(probe => probe.coefficients.map(value => Vec3.clone(value)));
        nextPositions.slice(0, 2).forEach(point => { point.x += 7; });
        synchronizeLightProbeTransform(node, true);
        expect({ events, positions: info.data.probes.map(probe => probe.position), coefficients: info.data.probes.map(probe => probe.coefficients) })
            .toEqual({ events: ['positions', 'tetrahedrons', 'refresh'], positions: nextPositions, coefficients });
        synchronizeLightProbeTransform(node, true);
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        expect(info.update.mock.calls).toEqual([[false], [true], [false]]);
    });

    it('updates positions, rebuilds once and invalidates SH only when samples actually moved', () => {
        const { node, nextPositions, info, events } = fixture();
        nextPositions.forEach(point => { point.x += 7; });
        synchronizeLightProbeTransform(node);
        expect({ events, positions: info.data.probes.map(probe => probe.position), coefficients: info.data.probes.map(probe => probe.coefficients) })
            .toEqual({ events: ['positions', 'tetrahedrons', 'clear'], positions: nextPositions, coefficients: [[], [], [], []] });
        synchronizeLightProbeTransform(node);
        expect(info.onProbeBakeCleared).toHaveBeenCalledTimes(1);
        expect(info.update.mock.calls).toEqual([[false], [true], [false]]);
    });

    it('preserves baked coefficients and tetrahedrons for unchanged sample positions', () => {
        const { node, info } = fixture();
        const before = JSON.stringify(info.data);
        synchronizeLightProbeTransform(node);
        expect(JSON.stringify(info.data)).toBe(before);
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        expect(info.update.mock.calls).toEqual([[false]]);
    });

    it.each(['disabled', 'destroyed', 'unrelated'] as const)('does not rebuild a %s subtree', kind => {
        const { node, group, info } = fixture();
        if (kind === 'disabled') group.enabledInHierarchy = false;
        if (kind === 'destroyed') group.isValid = false;
        if (kind === 'unrelated') node.getComponentsInChildren = (() => []) as Node['getComponentsInChildren'];
        synchronizeLightProbeTransform(node);
        expect(info.update).not.toHaveBeenCalled();
    });

    it('handles ancestor transforms through descendants without relying on selection', () => {
        const { scene, group } = fixture();
        const parent = { isValid: true, scene, getComponentsInChildren: () => [group] } as unknown as Node;
        expect(getLightProbeTransformScene(parent)).toBe(scene);
    });

    it('captures one scene after all affected nodes, even when explicitly selected first', () => {
        const { scene, node } = fixture();
        const other = { isValid: true, scene, getComponentsInChildren: () => [] } as unknown as Node;
        expect(withLightProbeTransformScenes([scene, node, other, node])).toEqual([node, other, scene]);
        expect(withLightProbeTransformScenes([other])).toEqual([other]);
    });

    it('ignores detached or invalid nodes without a scene', () => {
        const nodes = [{ isValid: true }, { isValid: false }] as Node[];
        expect(withLightProbeTransformScenes(nodes)).toEqual(nodes);
        nodes.forEach(node => synchronizeLightProbeTransform(node));
    });
});
