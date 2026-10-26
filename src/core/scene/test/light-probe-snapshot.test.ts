jest.mock('cc', () => ({
    LightProbeGroup: class LightProbeGroup {},
    Node: { EventType: { LIGHT_PROBE_CHANGED: 'light-probe-changed' } },
}));

import { LightProbeGroup, type Component, type Node, type Scene } from 'cc';
import {
    beginLightProbeRestore,
    captureLightProbeData,
    captureLightProbeGroup,
    getLightProbeSnapshotScenes,
    isLightProbeRestoreInProgress,
    restoreLightProbeData,
    restoreLightProbeGroup,
} from '../scene-process/service/scene/light-probe-snapshot';

class Point {
    constructor(public x = 0, public y = 0, public z = 0) {}
    set(x: number, y: number, z: number) { Object.assign(this, { x, y, z }); }
}

class Matrix {
    m00 = 1; m01 = 2; m02 = 3;
    m03 = 4; m04 = 5; m05 = 6;
    m06 = 7; m07 = 8; m08 = 9;
    first() { return this.m00; }
}

class Vertex {
    normal = new Point(0, 1, 0);
    coefficients: Point[];
    constructor(public position: Point) {
        if (!position) throw new Error('Vertex requires a position');
        this.coefficients = Array.from({ length: 9 }, (_, i) => new Point(position.x + i, 2, 3));
    }
}

class Tetrahedron {
    invalid = false;
    neighbours = [1, 2, 3, -1];
    matrix = new Matrix();
    offset = new Point(4, 5, 6);
    sphere = { center: new Point(7, 8, 9), radiusSquared: 10 };
    constructor(public vertex0: number, public vertex1: number, public vertex2: number, public vertex3: number) {
        if (vertex0 === undefined) throw new Error('Tetrahedron requires vertex indices');
    }
    isOuterCell() { return this.vertex3 < 0; }
}

class ProbeData {
    _tetrahedrons: Tetrahedron[];
    constructor(public _probes: Vertex[]) {
        if (!_probes) throw new Error('ProbeData requires points');
        this._tetrahedrons = _probes.length ? [new Tetrahedron(0, 1, 2, 3), new Tetrahedron(0, 1, 2, -1)] : [];
    }
    get probes() { return this._probes; }
    get tetrahedrons() { return this._tetrahedrons; }
    empty() { return !this._probes.length || !this._tetrahedrons.length; }
}

const createData = (count = 4) => new ProbeData(Array.from({ length: count }, (_, i) => new Vertex(new Point(i, 0, 0))));

function fixture(initial: ProbeData | null = createData()) {
    const events: string[] = [];
    let current = initial;
    const resource = { data: initial };
    const groups = ['a', 'b'].map(uuid => ({
        isValid: true,
        node: { uuid, emit: jest.fn(() => events.push(`changed:${uuid}`)) },
    }));
    const entries = groups.map(group => ({ node: group.node, probes: [new Point(group.node.uuid === 'a' ? 0 : 1)] }));
    const info = {
        get data() { return current; },
        set data(value: ProbeData | null) { current = value; resource.data = value; events.push('data'); },
        _nodes: entries.slice(),
        update: jest.fn(),
        syncData: jest.fn(),
        onProbeBakeFinished: jest.fn(() => { events.push('baked'); }),
        onProbeBakeCleared: jest.fn(),
    };
    const model = {
        tetrahedronIndex: 12,
        clearSHUBOs: jest.fn(() => events.push('clearSH')),
    };
    const scene = {
        globals: { lightProbeInfo: info },
        renderScene: { models: [model] },
        getComponentsInChildren: jest.fn(() => groups),
    } as unknown as Scene;
    return { scene, info, model, resource, events, groups, entries };
}

describe('raw light probe data snapshots', () => {
    it('preserves typed vertices and every tetrahedron field without calling their constructors', () => {
        const { scene, info } = fixture();
        const snapshot = captureLightProbeData(scene);
        const saved = snapshot.data as unknown as ProbeData;
        expect(saved).toEqual(info.data);
        expect(saved).not.toBe(info.data);
        expect(saved).toBeInstanceOf(ProbeData);
        expect(saved.empty()).toBe(false);
        expect(saved.probes[0]).toBeInstanceOf(Vertex);
        expect(saved.probes[0].position).toBeInstanceOf(Point);
        expect(saved.tetrahedrons[0]).toBeInstanceOf(Tetrahedron);
        expect(saved.tetrahedrons[0].matrix.first()).toBe(1);
        expect(saved.tetrahedrons[1].isOuterCell()).toBe(true);
        expect(saved.tetrahedrons[0].sphere).not.toBe(info.data!.tetrahedrons[0].sphere);
        expect(saved.tetrahedrons[0].neighbours).not.toBe(info.data!.tetrahedrons[0].neighbours);
    });

    it('isolates captures and repeated restores from later in-place edits', () => {
        const { scene, info } = fixture();
        const snapshot = captureLightProbeData(scene);
        info.data!.probes[0].coefficients[0].x = 100;
        info.data!.tetrahedrons[0].matrix.m08 = 100;
        restoreLightProbeData(scene, snapshot);
        expect(info.data!.probes[0].coefficients[0].x).toBe(0);
        expect(info.data!.tetrahedrons[0].matrix.m08).toBe(9);
        const firstRestore = info.data;
        info.data!.probes[0].normal.y = 100;
        info.data!.tetrahedrons[0].sphere.center.x = 100;
        info.data!.tetrahedrons[0].neighbours[0] = 100;
        restoreLightProbeData(scene, snapshot);
        expect(info.data).not.toBe(firstRestore);
        expect(info.data!.probes[0].normal.y).toBe(1);
        expect(info.data!.tetrahedrons[0].sphere.center.x).toBe(7);
        expect(info.data!.tetrahedrons[0].neighbours[0]).toBe(1);
    });

    it.each([null, createData(0)])('restores null and empty data without generating new probes (%s)', original => {
        const { scene, info, resource, model } = fixture(original);
        const snapshot = captureLightProbeData(scene);
        info.data = createData();
        restoreLightProbeData(scene, snapshot);
        expect(info.data).toEqual(original);
        expect(resource.data).toBe(info.data);
        expect(model.tetrahedronIndex).toBe(-1);
        expect(model.clearSHUBOs).toHaveBeenCalledTimes(1);
        expect(info.update).not.toHaveBeenCalled();
        expect(info.onProbeBakeCleared).not.toHaveBeenCalled();
    });

    it('keeps all 1,000 probes and baked coefficients using raw data only', () => {
        const { scene, info } = fixture(createData(1000));
        const snapshot = captureLightProbeData(scene);
        info.data!.probes.length = 4;
        restoreLightProbeData(scene, snapshot);
        expect(info.data!.probes).toHaveLength(1000);
        expect(info.data!.probes[999].coefficients[8]).toEqual(new Point(1007, 2, 3));
        expect(info.update).not.toHaveBeenCalled();
        expect(scene.getComponentsInChildren).toHaveBeenCalledTimes(1);
    });

    it('restores registration order after re-enabling a group, retaining registration entries and arrays', () => {
        const { scene, info, entries } = fixture();
        const snapshot = captureLightProbeData(scene);
        info._nodes = [entries[1], entries[0]];
        restoreLightProbeData(scene, snapshot);
        expect(snapshot.nodeOrder).toEqual(['a', 'b']);
        expect(info._nodes[0]).toBe(entries[0]);
        expect(info._nodes[1]).toBe(entries[1]);
        expect(info._nodes[0].probes).toBe(entries[0].probes);
        // A subsequent engine update consumes groups in this same SH order.
        expect(info._nodes.flatMap(entry => entry.probes.map(point => point.x))).toEqual([0, 1]);
    });

    it('refreshes render caches then notifies valid groups without rebuilding probe data', () => {
        const { scene, info, events, groups } = fixture();
        groups[1].isValid = false;
        restoreLightProbeData(scene, captureLightProbeData(scene));
        expect(events).toEqual(['data', 'clearSH', 'baked', 'changed:a']);
        expect(groups[0].node.emit).toHaveBeenCalledWith('light-probe-changed');
        expect(groups[1].node.emit).not.toHaveBeenCalled();
        expect(info.update).not.toHaveBeenCalled();
        expect(info.syncData).not.toHaveBeenCalled();
    });
});

function groupFixture() {
    const { scene, info } = fixture();
    const group = Object.assign(new LightProbeGroup(), {
        name: 'Probes', _name: 'Probes', enabled: true, enabledInHierarchy: true, isValid: true, __prefab: null as LightProbeGroup['__prefab'],
        probes: [new Point(1, 2, 3)], minPos: new Point(-5, -5, -5), maxPos: new Point(5, 5, 5),
        _method: 0, nProbesX: 10, nProbesY: 11, nProbesZ: 12,
        node: { scene, emit: jest.fn() },
    });
    Object.defineProperty(group, 'method', { get: () => group._method });
    return { group, info };
}

describe('raw built-in LightProbeGroup snapshots', () => {
    it('captures all editable group fields and restores independent point arrays before enabling', () => {
        const { group, info } = groupFixture();
        const snapshot = captureLightProbeGroup(group)!;
        expect(snapshot).toEqual({
            name: 'Probes', enabled: true, prefab: null, probes: [new Point(1, 2, 3)], method: 0,
            minPos: new Point(-5, -5, -5), maxPos: new Point(5, 5, 5),
            nProbesX: 10, nProbesY: 11, nProbesZ: 12,
        });
        group.probes[0].x = 99;
        group.minPos.x = 99;
        let enabled = false;
        Object.defineProperty(group, 'enabled', {
            get: () => enabled,
            set: value => {
                expect(group.probes[0].x).toBe(1);
                expect(group.minPos.x).toBe(-5);
                enabled = value;
            },
        });
        restoreLightProbeGroup(group, snapshot);
        expect(enabled).toBe(true);
        expect(info.syncData).toHaveBeenCalledWith(group.node, group.probes);
        expect(group.probes).not.toBe(snapshot.probes);
        group.probes[0].x = 123;
        restoreLightProbeGroup(group, snapshot);
        expect(group.probes[0].x).toBe(1);
        expect(info.update).not.toHaveBeenCalled();
        expect(group.node.emit).not.toHaveBeenCalled();
    });

    it('does not register an inactive or disabled group while restoring its raw fields', () => {
        const { group, info } = groupFixture();
        const snapshot = captureLightProbeGroup(group)!;
        group.enabledInHierarchy = false;
        snapshot.enabled = false;
        restoreLightProbeGroup(group, snapshot);
        expect(group.enabled).toBe(false);
        expect(info.syncData).not.toHaveBeenCalled();
    });

    it('preserves an empty backing name so node renames still change the derived component name', () => {
        const { group } = groupFixture();
        group.node.name = 'OriginalNode';
        group._name = '';
        Object.defineProperty(group, 'name', {
            get: () => group._name || `${group.node.name}<LightProbeGroup>`,
            set: (name: string) => { group._name = name; },
        });
        const defaultName = captureLightProbeGroup(group)!;
        expect(defaultName.name).toBe('');
        group.name = 'Custom probe name';
        const customName = captureLightProbeGroup(group)!;
        restoreLightProbeGroup(group, defaultName);
        group.node.name = 'RenamedNode';
        expect(group.name).toBe('RenamedNode<LightProbeGroup>');
        expect(group._name).toBe('');
        restoreLightProbeGroup(group, customName);
        group.node.name = 'AnotherNodeName';
        expect(group.name).toBe('Custom probe name');
    });

    it('restores inherited prefab identity values without sharing mutable history or dropping its prototype', () => {
        class CompPrefabInfo { fileId = 'probe-prefab-file-id'; }
        const { group } = groupFixture();
        group.__prefab = new CompPrefabInfo();
        const snapshot = captureLightProbeGroup(group)!;
        group.__prefab.fileId = 'changed';
        restoreLightProbeGroup(group, snapshot);
        expect(group.__prefab).toBeInstanceOf(CompPrefabInfo);
        expect(group.__prefab!.fileId).toBe('probe-prefab-file-id');
        expect(group.__prefab).not.toBe(snapshot.prefab);
        group.__prefab!.fileId = 'changed-again';
        restoreLightProbeGroup(group, snapshot);
        expect(group.__prefab!.fileId).toBe('probe-prefab-file-id');
        expect(snapshot.prefab!.fileId).toBe('probe-prefab-file-id');
        snapshot.prefab = null;
        restoreLightProbeGroup(group, snapshot);
        expect(group.__prefab).toBeNull();
    });

    it('leaves custom subclasses and unrelated components on the generic snapshot path', () => {
        class CustomGroup extends LightProbeGroup { customField = 1; }
        expect(captureLightProbeGroup(new CustomGroup())).toBeUndefined();
        expect(captureLightProbeGroup({ constructor: class Other {} } as unknown as Component)).toBeUndefined();
    });
});

describe('light probe snapshot restore boundaries', () => {
    it('keeps nested restores guarded and releases each boundary only once', () => {
        const first = fixture();
        const second = fixture();
        const finishOuter = beginLightProbeRestore(first.scene);
        const finishInner = beginLightProbeRestore(first.scene);
        expect(isLightProbeRestoreInProgress(first.scene)).toBe(true);
        expect(isLightProbeRestoreInProgress(second.scene)).toBe(false);
        finishInner();
        finishInner();
        expect(isLightProbeRestoreInProgress(first.scene)).toBe(true);
        restoreLightProbeData(first.scene, captureLightProbeData(first.scene));
        expect(isLightProbeRestoreInProgress(first.scene)).toBe(true);
        finishOuter();
        expect(isLightProbeRestoreInProgress(first.scene)).toBe(false);
    });

    it('guards rendering and group notifications and releases the guard when a listener throws', () => {
        const { scene, info, groups } = fixture();
        const snapshot = captureLightProbeData(scene);
        info.onProbeBakeFinished.mockImplementation(() => {
            expect(isLightProbeRestoreInProgress(scene)).toBe(true);
        });
        groups[0].node.emit.mockImplementation(() => {
            expect(isLightProbeRestoreInProgress(scene)).toBe(true);
            throw new Error('listener failed');
        });
        expect(() => restoreLightProbeData(scene, snapshot)).toThrow('listener failed');
        expect(isLightProbeRestoreInProgress(scene)).toBe(false);
    });

    it('captures disabled and empty groups and deduplicates their valid scenes', () => {
        const first = { isValid: true } as Scene;
        const second = { isValid: true } as Scene;
        const child = (scene: Scene) => ({
            isValid: true, scene,
            getComponentsInChildren: jest.fn(() => [{ isValid: true, enabledInHierarchy: false, probes: [] }]),
        } as unknown as Node);
        const a = child(first), b = child(first), c = child(second);
        expect(getLightProbeSnapshotScenes([a, b, c])).toEqual([first, second]);
        expect(a.getComponentsInChildren).toHaveBeenCalledWith('cc.LightProbeGroup');
        expect(b.getComponentsInChildren).not.toHaveBeenCalled();
    });

    it('ignores invalid or detached nodes, invalid scenes and subtrees without valid groups', () => {
        const validScene = { isValid: true };
        const nodes = [
            { isValid: false, scene: validScene },
            { isValid: true },
            { isValid: true, scene: { isValid: false } },
            { isValid: true, scene: validScene, getComponentsInChildren: () => [] },
            { isValid: true, scene: validScene, getComponentsInChildren: () => [{ isValid: false }] },
        ] as unknown as Node[];
        expect(getLightProbeSnapshotScenes(nodes)).toEqual([]);
    });
});
