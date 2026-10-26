export {};

const mockNodes = new Map<string, any>();
const mockEvents: string[] = [];
const mockRestoreDepth = new Map<any, number>();
const mockNodeRestoreDepths: number[] = [];
let mockCommand: any;
const mockDumpNode = jest.fn((node: any, _options?: any) => ({ marker: node.marker }));
jest.mock('cc', () => ({ Node: class {}, Component: class {} }));
jest.mock('../scene-process/service/core', () => ({ Service: { Undo: { push: (command: any) => { mockCommand = command; } } } }));
jest.mock('../scene-process/service/node/index', () => ({ __esModule: true, default: {} }));
jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: { dumpNode: (node: any, options: any) => mockDumpNode(node, options) },
}));
jest.mock('../scene-process/service/scene/light-probe-snapshot', () => ({
    getLightProbeSnapshotScenes: (nodes: any[]) => [...new Set(nodes
        .filter(node => node.isValid && node.scene?.globals?.lightProbeInfo && node.getComponentsInChildren().some((group: any) => group.isValid))
        .map(node => node.scene))],
    beginLightProbeRestore: (scene: any) => {
        mockRestoreDepth.set(scene, (mockRestoreDepth.get(scene) ?? 0) + 1);
        return () => mockRestoreDepth.set(scene, mockRestoreDepth.get(scene)! - 1);
    },
    captureLightProbeData: (scene: any) => ({ data: JSON.parse(JSON.stringify(scene.globals.lightProbeInfo.data)), nodeOrder: [] }),
    restoreLightProbeData: (scene: any, snapshot: any) => {
        expect(mockRestoreDepth.get(scene)).toBeGreaterThan(0);
        mockEvents.push(`probes:${scene.uuid}`);
        scene.globals.lightProbeInfo.data = JSON.parse(JSON.stringify(snapshot.data));
    },
}));
jest.mock('../scene-process/service/undo/commands/create-node-command', () => ({ CreateNodeCommand: {} }));
jest.mock('../scene-process/service/undo/commands/snapshot-command', () => ({
    SnapshotCommand: class {
        constructor(public options: any, public before: any, public after: any, public adapter: any) {}
    },
}));
jest.mock('../scene-process/service/undo/commands/command-utils-shared', () => ({
    createUndoId: () => 'reparent',
    snapshotMapsEqual: (before: Map<string, any>, after: Map<string, any>) => JSON.stringify([...before]) === JSON.stringify([...after]),
    restoreNodeSnapshotDump: async (node: any, dump: any) => {
        mockNodeRestoreDepths.push(mockRestoreDepth.get(node.scene) ?? 0);
        mockEvents.push(`restore:${node.uuid}`);
        node.marker = dump.marker;
    },
}));

const previousExtends: unknown = Reflect.get(globalThis, 'EditorExtends');
Object.assign(globalThis, { EditorExtends: { Node: {
    getNode: (uuid: string) => mockNodes.get(uuid),
    getNodePath: (node: { uuid: string }) => `/${node.uuid}`,
    getNodeByPath: (path: string) => mockNodes.get(path.slice(1)),
} } });
const { NodeUndoHelper } = require('../scene-process/service/node/node-undo');

function node(uuid: string, scene?: any): any {
    const result: any = { uuid, isValid: true, scene, marker: `${uuid}:before`, parent: null,
        getSiblingIndex: () => 0, setSiblingIndex: jest.fn(),
        getComponentsInChildren: () => uuid === 'unrelated' ? [] : [{ isValid: true, enabledInHierarchy: true }],
        setParent: jest.fn((parent: any) => { mockEvents.push(`parent:${uuid}`); result.parent = parent; }),
    };
    mockNodes.set(uuid, result);
    return result;
}

afterAll(() => { Object.assign(globalThis, { EditorExtends: previousExtends }); });
beforeEach(() => {
    mockNodes.clear();
    mockEvents.length = 0;
    mockCommand = undefined;
    mockDumpNode.mockClear();
    mockRestoreDepth.clear();
    mockNodeRestoreDepths.length = 0;
});

function probeFixture() {
    const scene = node('scene');
    scene.scene = scene;
    scene.globals = { lightProbeInfo: { data: { probes: [{ coefficients: [1] }] } } };
    const group = node('group', scene);
    return { scene, group };
}

describe('Probe globals in reparent history', () => {
    it('captures one affected scene and restores it after parent and node data without reparenting the root', async () => {
        const { scene, group } = probeFixture();
        const oldParent = node('old', scene);
        const newParent = node('new', scene);
        group.parent = oldParent;
        const helper = new NodeUndoHelper(() => {});
        const before = helper.captureReparentSnapshots([group]);
        expect([...before.keys()]).toEqual(['group', 'scene']);
        group.parent = newParent;
        group.marker = 'group:after';
        scene.marker = 'scene:after';
        scene.globals.lightProbeInfo.data.probes[0].coefficients = [2];
        helper.recordReparentSnapshots('reparent', 'Set Parent', before, ['group']);
        expect([...mockCommand.after.keys()]).toEqual(['group', 'scene']);
        expect(await mockCommand.adapter.apply(before)).toEqual({ success: true });
        expect(mockEvents).toEqual(['parent:group', 'restore:group', 'probes:scene']);
        expect([group.parent.uuid, group.marker, scene.marker, scene.setParent.mock.calls.length])
            .toEqual(['old', 'group:before', 'scene:after', 0]);
        expect(scene.globals.lightProbeInfo.data.probes[0].coefficients).toEqual([1]);
        mockEvents.length = 0;
        expect(await mockCommand.adapter.apply(mockCommand.after)).toEqual({ success: true });
        expect(mockEvents).toEqual(['parent:group', 'restore:group', 'probes:scene']);
        expect([group.parent.uuid, scene.marker]).toEqual(['new', 'scene:after']);
        expect(scene.globals.lightProbeInfo.data.probes[0].coefficients).toEqual([2]);
        expect(mockDumpNode.mock.calls.map(([target]) => target.uuid)).toEqual(['group', 'group']);
    });

    it('does not capture scene globals for a subtree without probe groups', () => {
        const scene = node('scene');
        scene.scene = scene;
        scene.globals = { lightProbeInfo: {} };
        const unrelated = node('unrelated', scene);
        const helper = new NodeUndoHelper(() => {});
        expect([...helper.captureReparentSnapshots([unrelated]).keys()]).toEqual(['unrelated']);
    });

    it('keeps explicit scene snapshots complete rather than treating them as automatic probe targets', async () => {
        const { scene, group } = probeFixture();
        const parent = node('parent', scene);
        group.parent = parent;
        const helper = new NodeUndoHelper(() => {});
        const before = helper.captureReparentSnapshots([scene, group]);
        expect(before.get('scene')).not.toHaveProperty('lightProbeData');
        scene.marker = 'scene:after';
        helper.recordReparentSnapshots('reparent', 'Set Parent', before, ['group']);
        expect(mockCommand.after.get('scene')).not.toHaveProperty('lightProbeData');
        expect(await mockCommand.adapter.apply(before)).toEqual({ success: true });
        expect(scene.marker).toBe('scene:before');
        expect(scene.setParent).not.toHaveBeenCalled();
        expect(mockDumpNode.mock.calls.map(([target]) => target.uuid)).toEqual(['group', 'scene', 'group', 'scene']);
    });

    it('preserves raw snapshot targets when the changed subtree no longer has probe data', async () => {
        const { scene, group } = probeFixture();
        const parent = node('parent', scene);
        group.parent = parent;
        const helper = new NodeUndoHelper(() => {});
        const before = helper.captureReparentSnapshots([group]);
        scene.globals.lightProbeInfo.data = null;
        helper.recordReparentSnapshots('reparent', 'Set Parent', before, ['group']);
        expect(mockCommand.after.get('scene').lightProbeData.data).toBeNull();
        expect(await mockCommand.adapter.apply(before)).toEqual({ success: true });
        expect(scene.globals.lightProbeInfo.data.probes[0].coefficients).toEqual([1]);
        expect(await mockCommand.adapter.apply(mockCommand.after)).toEqual({ success: true });
        expect(scene.globals.lightProbeInfo.data).toBeNull();
        expect(mockDumpNode.mock.calls.map(([target]) => target.uuid)).toEqual(['group', 'group']);
    });

    it('notifies reparent observers only after the affected scene probe data is restored', async () => {
        const { scene, group } = probeFixture();
        const parent = node('parent', scene);
        group.parent = parent;
        const observedData: number[][] = [];
        const helper = new NodeUndoHelper((event: string) => {
            if (event === 'node:change') {
                expect(mockRestoreDepth.get(scene)).toBe(0);
                observedData.push([...scene.globals.lightProbeInfo.data.probes[0].coefficients]);
            }
        });
        const before = helper.captureReparentSnapshots([group]);
        scene.globals.lightProbeInfo.data.probes[0].coefficients = [2];
        helper.recordReparentSnapshots('reparent', 'Set Parent', before, ['group']);
        expect(await mockCommand.adapter.apply(before)).toEqual({ success: true });
        expect(observedData).toEqual([[1], [1], [1]]);
        expect(mockNodeRestoreDepths).toEqual([1]);
    });
});

describe('Probe globals in node property history', () => {
    it('records node properties and raw probe data, then restores probe data before notifying observers', async () => {
        const { scene, group } = probeFixture();
        const observedData: number[][] = [];
        const helper = new NodeUndoHelper((event: string) => {
            if (event === 'node:change') {
                expect(mockRestoreDepth.get(scene)).toBe(0);
                observedData.push([...scene.globals.lightProbeInfo.data.probes[0].coefficients]);
            }
        });
        await helper.recordNodeSnapshot(group, { type: 'position', label: 'Position' }, async () => {
            group.marker = 'group:after';
            scene.globals.lightProbeInfo.data.probes[0].coefficients = [2];
            return true;
        });
        expect([...mockCommand.before.keys()]).toEqual(['group', 'scene']);
        expect(mockDumpNode.mock.calls.map(([target]) => target.uuid)).toEqual(['group', 'group']);
        expect(mockDumpNode).toHaveBeenCalledWith(group, { includeComponents: false });
        expect(await mockCommand.adapter.apply(mockCommand.before)).toEqual({ success: true });
        expect(mockEvents).toEqual(['restore:group', 'probes:scene']);
        expect([group.marker, observedData]).toEqual(['group:before', [[1], [1]]]);
        observedData.length = 0;
        expect(await mockCommand.adapter.apply(mockCommand.after)).toEqual({ success: true });
        expect([group.marker, observedData]).toEqual(['group:after', [[2], [2]]]);
        expect(mockNodeRestoreDepths).toEqual([1, 1]);
    });

    it('keeps explicitly requested scene property history on the full dump path', async () => {
        const { scene } = probeFixture();
        const helper = new NodeUndoHelper(() => {});
        await helper.recordNodeSnapshot(scene, { type: 'scene', label: 'Scene' }, async () => {
            scene.marker = 'scene:after';
            return true;
        });
        expect(mockCommand.before.get('scene')).not.toHaveProperty('lightProbeData');
        expect(mockCommand.after.get('scene')).not.toHaveProperty('lightProbeData');
        expect(await mockCommand.adapter.apply(mockCommand.before)).toEqual({ success: true });
        expect(scene.marker).toBe('scene:before');
        expect(mockNodeRestoreDepths).toEqual([0]);
    });

    it.each([null, { probes: [] }])('captures a disabled group before activation even with empty scene data: %s', async data => {
        const { scene, group } = probeFixture();
        const component = { isValid: true, enabledInHierarchy: false };
        group.getComponentsInChildren = () => [component];
        scene.globals.lightProbeInfo.data = data;
        const helper = new NodeUndoHelper(() => {});
        await helper.recordNodeSnapshot(group, { type: 'active', label: 'Activate' }, async () => {
            component.enabledInHierarchy = true;
            group.marker = 'group:after';
            scene.globals.lightProbeInfo.data = { probes: [{ coefficients: [2] }] };
            return true;
        });
        expect(mockCommand.before.get('scene').lightProbeData.data).toEqual(data);
        expect(await mockCommand.adapter.apply(mockCommand.before)).toEqual({ success: true });
        expect(scene.globals.lightProbeInfo.data).toEqual(data);
        expect(await mockCommand.adapter.apply(mockCommand.after)).toEqual({ success: true });
        expect(scene.globals.lightProbeInfo.data.probes[0].coefficients).toEqual([2]);
        expect(mockDumpNode.mock.calls.map(([target]) => target.uuid)).toEqual(['group', 'group']);
    });

    it('releases the probe restore guard when a node cannot be restored', async () => {
        const { scene, group } = probeFixture();
        const helper = new NodeUndoHelper(() => {});
        await helper.recordNodeSnapshot(group, { type: 'position', label: 'Position' }, async () => {
            group.marker = 'group:after';
            return true;
        });
        mockNodes.delete(group.uuid);
        expect(await mockCommand.adapter.apply(mockCommand.before)).toMatchObject({ success: false });
        expect(mockRestoreDepth.get(scene)).toBe(0);
    });

    it('does not restore raw probe data onto a different scene found at the old path', async () => {
        const { scene, group } = probeFixture();
        const helper = new NodeUndoHelper(() => {});
        await helper.recordNodeSnapshot(group, { type: 'position', label: 'Position' }, async () => {
            group.marker = 'group:after';
            return true;
        });
        mockNodes.delete(scene.uuid);
        const anotherScene = node('another-scene');
        anotherScene.scene = anotherScene;
        anotherScene.globals = { lightProbeInfo: { data: { probes: [{ coefficients: [9] }] } } };
        const before = mockCommand.before;
        before.get('scene').path = '/another-scene';
        expect(await mockCommand.adapter.apply(before)).toMatchObject({ success: false });
        expect(anotherScene.globals.lightProbeInfo.data.probes[0].coefficients).toEqual([9]);
    });
});
