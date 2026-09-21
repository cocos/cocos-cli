jest.mock('cc', () => ({
    Vec3: class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        set(v: { x: number; y: number; z: number }) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        static clone(v: { x: number; y: number; z: number }) { return new this(v.x, v.y, v.z); }
        static strictEquals(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
            return a.x === b.x && a.y === b.y && a.z === b.z;
        }
    },
}));

import { Vec3, type Node, type Scene } from 'cc';
import {
    beginLightProbeTransformEdit,
    flushLightProbeTransformEdit,
    getLightProbeTransformScene,
    isLightProbeTransformInProgress,
    synchronizeLightProbeTransform,
    withLightProbeTransformScenes,
} from '../scene-process/service/scene/light-probe-transform';
import { beginLightProbeRestore } from '../scene-process/service/scene/light-probe-snapshot';

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
    it('skips intermediate transform rebuilds only inside a probe snapshot restore batch', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeRestore(scene);
        try {
            nextPositions.forEach(point => { point.x += 7; });
            synchronizeLightProbeTransform(node);
            expect(info.update).not.toHaveBeenCalled();
        } finally { finish(); }
        synchronizeLightProbeTransform(node);
        expect(info.update.mock.calls).toEqual([[false], [true]]);
    });
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

describe('Light probe node transform edit batches', () => {
    it('updates positions during 100 moves and rebuilds once on release without changing SH', () => {
        const { scene, node, nextPositions, info } = fixture();
        info.data.probes.forEach((probe, index) => { probe.coefficients = [new Vec3(index + 1, 2, 3)]; });
        const coefficients = info.data.probes.map(probe => probe.coefficients.map(value => Vec3.clone(value)));
        const finish = beginLightProbeTransformEdit([node]);
        expect(finish).toBeDefined();
        expect(isLightProbeTransformInProgress(scene)).toBe(true);
        for (let move = 0; move < 100; move++) {
            // Keep the stationary group's samples intact while translating this group.
            nextPositions.slice(0, 2).forEach(point => { point.x += 1; });
            synchronizeLightProbeTransform(node, true);
            expect(info.data.probes.map(probe => probe.position)).toEqual(nextPositions);
        }
        expect(info.update.mock.calls).toEqual(Array.from({ length: 100 }, () => [false]));
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        finish!();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
        expect(info.update.mock.calls.filter(([tet]) => tet)).toEqual([[true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        expect(info.data.probes.map(probe => probe.coefficients)).toEqual(coefficients);
    });

    it.each([
        { preserveFlags: [false] },
        { preserveFlags: [false, true] },
        { preserveFlags: [true, false, true] },
    ])('clears SH once if any changed transform requires invalidation: $preserveFlags', ({ preserveFlags }) => {
        const { node, nextPositions, info, events } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        for (const preserve of preserveFlags) {
            nextPositions.forEach(point => { point.x += 1; });
            synchronizeLightProbeTransform(node, preserve);
        }
        expect(info.update.mock.calls).toEqual(preserveFlags.map(() => [false]));
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        finish!();
        expect(events.slice(-2)).toEqual(['tetrahedrons', 'clear']);
        expect(info.update.mock.calls.filter(([tet]) => tet)).toEqual([[true]]);
        expect(info.onProbeBakeCleared).toHaveBeenCalledTimes(1);
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        expect(info.data.probes.map(probe => probe.coefficients)).toEqual([[], [], [], []]);
    });

    it('does not let an unchanged transform invalidate a later translation', () => {
        const { node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        synchronizeLightProbeTransform(node, false);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
    });

    it('deduplicates a scene shared by multiple groups and their selected ancestor', () => {
        const { scene, node, group, nextPositions, info } = fixture();
        const otherGroup = { isValid: true, enabledInHierarchy: true };
        const otherNode = { isValid: true, scene, getComponentsInChildren: () => [otherGroup] } as unknown as Node;
        const parent = { isValid: true, scene, getComponentsInChildren: () => [group, otherGroup] } as unknown as Node;
        const finish = beginLightProbeTransformEdit([parent, node, otherNode, node]);
        for (const target of [parent, node, otherNode]) {
            nextPositions.forEach(point => { point.x += 1; });
            synchronizeLightProbeTransform(target, true);
        }
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [false], [false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
    });

    it('waits for the last nested editor and ignores duplicate releases', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finishOuter = beginLightProbeTransformEdit([node]);
        const finishInner = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        finishOuter!();
        finishOuter!();
        expect(isLightProbeTransformInProgress(scene)).toBe(true);
        expect(info.update.mock.calls).toEqual([[false]]);
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        finishInner!();
        finishInner!();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
        expect(info.update.mock.calls).toEqual([[false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        // A later standalone transform must return to the existing immediate path.
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        expect(info.update.mock.calls).toEqual([[false], [true], [false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(2);
    });

    it.each([0, 10])('does not rebuild an unchanged batch with %i update events', updates => {
        const { scene, node, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        for (let index = 0; index < updates; index++) synchronizeLightProbeTransform(node);
        finish!();
        expect(info.update.mock.calls).toEqual(Array.from({ length: updates }, () => [false]));
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
    });

    it.each(['ordinary', 'disabled', 'empty', 'detached', 'invalid'] as const)('does not start a batch for %s nodes', kind => {
        const { scene, node, group, info } = fixture();
        if (kind === 'ordinary') node.getComponentsInChildren = (() => []) as Node['getComponentsInChildren'];
        if (kind === 'disabled') group.enabledInHierarchy = false;
        if (kind === 'empty') info.data.probes.length = 0;
        if (kind === 'detached') Object.assign(node, { scene: null });
        if (kind === 'invalid') Object.assign(node, { isValid: false });
        expect(beginLightProbeTransformEdit([node])).toBeUndefined();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
        expect(info.update).not.toHaveBeenCalled();
    });

    it('releases a destroyed scene without attempting a final rebuild', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        Object.assign(scene, { isValid: false });
        finish!();
        finish!();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
        expect(info.update.mock.calls).toEqual([[false]]);
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
    });

    it('flushes each affected scene independently once', () => {
        const first = fixture();
        const second = fixture();
        const finish = beginLightProbeTransformEdit([first.node, second.node]);
        for (const { node, nextPositions } of [first, second]) {
            nextPositions.forEach(point => { point.x += 1; });
            synchronizeLightProbeTransform(node, true);
        }
        finish!();
        for (const { scene, info } of [first, second]) {
            expect(info.update.mock.calls).toEqual([[false], [true]]);
            expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
            expect(isLightProbeTransformInProgress(scene)).toBe(false);
        }
    });
});

describe('Flushing light probe transforms before scene serialization', () => {
    it('rebuilds before returning, keeps the batch open, and does not repeat unchanged work on release', () => {
        const { scene, node, nextPositions, info, events } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        flushLightProbeTransformEdit(scene);
        expect(events).toEqual(['positions', 'tetrahedrons', 'refresh']);
        expect(isLightProbeTransformInProgress(scene)).toBe(true);
        expect(info.data.probes.map(probe => probe.position)).toEqual(nextPositions);
        flushLightProbeTransformEdit(scene);
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
    });

    it('resets the coefficient policy for changes after a flush and finishes only the new work', () => {
        const { scene, node, nextPositions, info, events } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, false);
        flushLightProbeTransformEdit(scene);
        expect(info.onProbeBakeCleared).toHaveBeenCalledTimes(1);
        expect(isLightProbeTransformInProgress(scene)).toBe(true);
        nextPositions.forEach(point => { point.x += 2; });
        synchronizeLightProbeTransform(node, true);
        expect(info.update.mock.calls).toEqual([[false], [true], [false]]);
        finish!();
        expect(events).toEqual(['positions', 'tetrahedrons', 'clear', 'positions', 'tetrahedrons', 'refresh']);
        expect(info.onProbeBakeCleared).toHaveBeenCalledTimes(1);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])('does nothing for an unchanged scene, with an active batch: %s', active => {
        const { scene, node, info } = fixture();
        const finish = active ? beginLightProbeTransformEdit([node]) : undefined;
        flushLightProbeTransformEdit(scene);
        expect(info.update).not.toHaveBeenCalled();
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        expect(isLightProbeTransformInProgress(scene)).toBe(active);
        finish?.();
    });

    it('does not rebuild a destroyed scene or prevent the active batch from being released', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        Object.assign(scene, { isValid: false });
        flushLightProbeTransformEdit(scene);
        expect(info.update.mock.calls).toEqual([[false]]);
        expect(isLightProbeTransformInProgress(scene)).toBe(true);
        finish!();
        expect(info.update.mock.calls).toEqual([[false]]);
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
    });

    it('does not consume pending changes while probe snapshots are being restored', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        const finishRestore = beginLightProbeRestore(scene);
        try {
            flushLightProbeTransformEdit(scene);
            expect(info.update.mock.calls).toEqual([[false]]);
        } finally {
            finishRestore();
        }
        flushLightProbeTransformEdit(scene);
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
    });

    it('does not release nested gesture ownership when it flushes', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finishOuter = beginLightProbeTransformEdit([node]);
        const finishInner = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        flushLightProbeTransformEdit(scene);
        finishOuter!();
        expect(isLightProbeTransformInProgress(scene)).toBe(true);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        finishInner!();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
        expect(info.update.mock.calls).toEqual([[false], [true], [false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(2);
    });

    it('does not repeat a flush triggered again by its baking notification', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        info.onProbeBakeFinished.mockImplementationOnce(() => flushLightProbeTransformEdit(scene));
        flushLightProbeTransformEdit(scene);
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
    });

    it('keeps new edits made by baking notification listeners pending for the final release', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        info.onProbeBakeFinished.mockImplementationOnce(() => {
            nextPositions.forEach(point => { point.x += 1; });
            synchronizeLightProbeTransform(node, false);
        });
        flushLightProbeTransformEdit(scene);
        expect(info.update.mock.calls).toEqual([[false], [true], [false]]);
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [true], [false], [true]]);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        expect(info.onProbeBakeCleared).toHaveBeenCalledTimes(1);
    });

    it('keeps failed flush work dirty for retry and retains its original invalidation policy', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, false);
        info.update.mockImplementationOnce(() => { throw new Error('tetrahedron rebuild failed'); });
        expect(() => flushLightProbeTransformEdit(scene)).toThrow('tetrahedron rebuild failed');
        expect(isLightProbeTransformInProgress(scene)).toBe(true);
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [true], [false], [true]]);
        expect(info.onProbeBakeCleared).toHaveBeenCalledTimes(1);
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
        expect(isLightProbeTransformInProgress(scene)).toBe(false);
    });

    it('does not overwrite a new invalidating edit when a preserving flush notification throws', () => {
        const { scene, node, nextPositions, info } = fixture();
        const finish = beginLightProbeTransformEdit([node]);
        nextPositions.forEach(point => { point.x += 1; });
        synchronizeLightProbeTransform(node, true);
        info.onProbeBakeFinished.mockImplementationOnce(() => {
            nextPositions.forEach(point => { point.x += 1; });
            synchronizeLightProbeTransform(node, false);
            throw new Error('baking notification failed');
        });
        expect(() => flushLightProbeTransformEdit(scene)).toThrow('baking notification failed');
        finish!();
        expect(info.update.mock.calls).toEqual([[false], [true], [false], [true]]);
        expect(info.onProbeBakeCleared).toHaveBeenCalledTimes(1);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
    });

    it('finishes other scenes and releases all ownership if one final rebuild fails', () => {
        const first = fixture();
        const second = fixture();
        const finish = beginLightProbeTransformEdit([first.node, second.node]);
        for (const item of [first, second]) {
            item.nextPositions.forEach(point => { point.x += 1; });
            synchronizeLightProbeTransform(item.node, true);
        }
        first.info.update.mockImplementationOnce(() => { throw new Error('rebuild failed'); });
        expect(() => finish!()).toThrow('rebuild failed');
        expect(second.info.update.mock.calls).toEqual([[false], [true]]);
        expect(second.info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
        expect(isLightProbeTransformInProgress(first.scene)).toBe(false);
        expect(isLightProbeTransformInProgress(second.scene)).toBe(false);
        expect(() => finish!()).not.toThrow();
    });
});
