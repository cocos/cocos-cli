const mockNodes = new Map<string, any>();
const mockComponents = new Map<string, any>();
const mockEmit = jest.fn();
const mockDumpNode = jest.fn();
const mockDumpComponent = jest.fn();
let mockScene: any;

jest.mock('cc', () => {
    class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        clone() { return new Vec3(this.x, this.y, this.z); }
    }
    class LightProbeGroup {
        node: any; uuid = ''; isValid = true; name = 'probes'; enabled = true;
        probes: any[] = []; minPos = new Vec3(); maxPos = new Vec3(10, 10, 10);
        _method = 0; nProbesX = 10; nProbesY = 10; nProbesZ = 10;
        get method() { return this._method; }
        get enabledInHierarchy() { return this.enabled; }
    }
    return { Vec3, LightProbeGroup, Component: class {}, Node: class { static EventType: Record<string, string> = { LIGHT_PROBE_CHANGED: 'probe-changed' }; },
        director: { getScene: () => mockScene }, js: { getClassName: (ctor: any) => ctor === LightProbeGroup ? 'cc.LightProbeGroup' : ctor.name },
    };
});
jest.mock('../scene-process/service/core', () => ({ BaseService: class { broadcast() {} } }));
jest.mock('../scene-process/service/core/decorator', () => ({ register: () => () => {}, Service: { Engine: { repaintInEditMode() {} } } }));
jest.mock('../scene-process/service/core/global-events', () => ({ ServiceEvents: { emit: mockEmit } }));
jest.mock('../scene-process/service/dump', () => ({ __esModule: true, default: {
    dumpNode: mockDumpNode, dumpComponent: mockDumpComponent,
    restoreNodeSnapshotProperties: async (node: any, dump: any) => {
        node.position = { ...dump.position };
        if (dump.globals) Object.assign(node.globals, JSON.parse(JSON.stringify(dump.globals)));
    },
    restoreComponentSnapshotProperties: async (component: any, dump: any) => { component.extra = dump.value.extra; },
} }));

import { LightProbeGroup, Vec3 } from 'cc';
import { UndoService } from '../scene-process/service/undo';
import { isLightProbeRestoreInProgress } from '../scene-process/service/scene/light-probe-snapshot';

const previousCC = Reflect.get(globalThis, 'cc');
beforeAll(() => { Object.assign(globalThis, { cc: { ...require('cc'), EditorExtends: {
    Node: { getNode: (uuid: string) => mockNodes.get(uuid), getNodePath: (node: any) => `/${node.uuid}` },
    Component: { getComponent: (uuid: string) => mockComponents.get(uuid), getPathFromUuid: (uuid: string) => uuid },
} } }); });
afterAll(() => { Object.assign(globalThis, { cc: previousCC }); });

function makeNode(uuid: string, groups: any[] = []): any {
    const node = { uuid, isValid: true, scene: mockScene, name: uuid, components: groups, position: { x: 0, y: 0, z: 0 },
        getComponentsInChildren: () => groups, isChildOf: (scene: any) => scene === mockScene,
        emit: jest.fn(),
    };
    mockNodes.set(uuid, node);
    return node;
}

function fixture(count = 1000) {
    mockNodes.clear(); mockComponents.clear(); jest.clearAllMocks();
    const group: any = new LightProbeGroup();
    group.uuid = 'group-component';
    group.probes = Array.from({ length: count }, (_, i) => new Vec3(i, 1, 2));
    const other: any = new LightProbeGroup(); other.uuid = 'other-component'; other.probes = [new Vec3(9999, 0, 0)];
    mockScene = makeNode('scene', [group, other]); mockScene.scene = mockScene; mockScene.components = [];
    group.node = makeNode('group', [group]); other.node = makeNode('other', [other]);
    mockComponents.set(group.uuid, group); mockComponents.set(other.uuid, other);
    const info = { data: { probes: [...group.probes, ...other.probes].map((p, i) => ({ position: p.clone(), normal: new Vec3(), coefficients: [new Vec3(i + 1, 2, 3)] })), tetrahedrons: [{ vertex0: 0, vertex1: 1, vertex2: 2, vertex3: 3 }] },
        _nodes: [{ node: group.node }, { node: other.node }], syncData: jest.fn(), update: jest.fn(), onProbeBakeFinished: jest.fn(),
    };
    mockScene.globals = { lightProbeInfo: info, unrelatedSetting: 1 };
    mockDumpNode.mockImplementation((node: any) => ({ position: { ...node.position }, ...(node === mockScene ? { globals: { unrelatedSetting: node.globals.unrelatedSetting } } : {}) }));
    mockDumpComponent.mockImplementation((comp: any) => ({ value: { extra: comp.extra } }));
    return { service: new UndoService(), group, other, info, scene: mockScene };
}

describe('Light probe Undo recording hot path', () => {
    it('records 1000 probes without scene/component Dump and restores both groups SH before publishing', async () => {
        const { service, group, info, scene } = fixture();
        const before = JSON.stringify(info.data);
        const id = service.beginRecording([group.node.uuid]);
        group.probes[0].x = 321;
        info.data.probes[0].position.x = 321;
        info.data.probes.forEach(probe => { probe.coefficients = []; });
        await service.endRecording(id);
        expect(mockDumpNode.mock.calls.map(([node]) => node.uuid)).toEqual(['group', 'group']);
        expect(mockDumpNode).toHaveBeenCalledWith(group.node, { includeComponents: false });
        expect(mockDumpComponent).not.toHaveBeenCalled();
        scene.globals.unrelatedSetting = 9;
        mockEmit.mockImplementation((event: string) => {
            if (event === 'node:change') expect(JSON.stringify(info.data)).toBe(before);
        });
        await expect(service.undo()).resolves.toMatchObject({ success: true });
        expect(group.probes[0].x).toBe(0);
        expect(scene.globals.unrelatedSetting).toBe(9);
        expect(info.update).not.toHaveBeenCalled();
        mockEmit.mockReset();
        await expect(service.redo()).resolves.toMatchObject({ success: true });
        expect(group.probes[0].x).toBe(321);
        expect(info.data.probes.every(probe => probe.coefficients.length === 0)).toBe(true);
        await service.undo();
        expect(JSON.stringify(info.data)).toBe(before);
    });

    it('fixes scene targets before disabling a component and keeps registration order on Undo', async () => {
        const { service, group, other, info } = fixture(4);
        const id = service.beginRecording([group.uuid]);
        group.enabled = false; info._nodes = [{ node: other.node }]; info.data.probes = [];
        await service.endRecording(id);
        info.syncData.mockImplementation(() => { info._nodes.push({ node: group.node }); });
        await service.undo();
        expect(group.enabled).toBe(true);
        expect(info._nodes.map(entry => entry.node.uuid)).toEqual(['group', 'other']);
        expect(info.data.probes).toHaveLength(5);
        expect(mockDumpNode).not.toHaveBeenCalled(); expect(mockDumpComponent).not.toHaveBeenCalled();
    });

    it('records null data before first generation and restores it on Undo', async () => {
        const { service, group, info } = fixture(0);
        (info as any).data = null;
        const id = service.beginRecording([group.node.uuid]);
        group.probes = [new Vec3(1, 2, 3)]; (info as any).data = { probes: [], tetrahedrons: [] };
        await service.endRecording(id); await service.undo();
        expect(group.probes).toEqual([]); expect(info.data).toBeNull();
        await service.redo(); expect(group.probes).toHaveLength(1); expect(info.data).not.toBeNull();
    });

    it('does not create an Undo entry for unchanged raw data', async () => {
        const { service, group } = fixture();
        await service.endRecording(service.beginRecording([group.node.uuid]));
        expect(service.canUndo()).toBe(false);
    });

    it('preserves the full Dump for explicit scene settings and ordinary component snapshots', async () => {
        const { service, scene } = fixture();
        const id = service.beginRecording([scene.uuid]);
        scene.globals.unrelatedSetting = 10;
        await service.endRecording(id);
        expect(mockDumpNode.mock.calls.map(([node]) => node.uuid)).toEqual(['scene', 'scene']);
        await service.undo(); expect(scene.globals.unrelatedSetting).toBe(1);
    });

    it('keeps subclass properties on the generic component path', async () => {
        const { service, group } = fixture(4);
        class CustomGroup extends LightProbeGroup { extra = 'before'; }
        const custom: any = Object.assign(new CustomGroup(), group); custom.extra = 'before';
        group.node.components = [custom]; mockComponents.set(custom.uuid, custom);
        const id = service.beginRecording([custom.uuid]); custom.extra = 'after'; await service.endRecording(id);
        expect(mockDumpComponent).toHaveBeenCalledTimes(2);
        await service.undo(); expect(custom.extra).toBe('before');
    });

    it('does not restore a captured probe scene into a different current scene', async () => {
        const { service, group, info } = fixture(4);
        const id = service.beginRecording([group.uuid]); group.minPos.x = -20; await service.endRecording(id);
        mockScene = { isValid: true };
        group.node.isChildOf = () => false;
        await expect(service.undo()).resolves.toMatchObject({ success: false });
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
    });

    it('releases the restore guard and publishes completed node changes even if a later target fails', async () => {
        const { service, group, other, scene } = fixture(4);
        const id = service.beginRecording([group.node.uuid, other.uuid]);
        group.node.position.x = 20; other.minPos.x = 30;
        await service.endRecording(id);
        other.isValid = false;
        mockEmit.mockImplementation((event: string) => {
            if (event === 'node:before-change') expect(isLightProbeRestoreInProgress(scene)).toBe(true);
            if (event === 'node:change') expect(isLightProbeRestoreInProgress(scene)).toBe(false);
        });
        await expect(service.undo()).resolves.toMatchObject({ success: false });
        expect(group.node.position.x).toBe(0);
        expect(mockEmit).toHaveBeenCalledWith('node:change', group.node, expect.anything());
        expect(isLightProbeRestoreInProgress(scene)).toBe(false);
    });
});
