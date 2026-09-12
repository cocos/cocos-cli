export {};

const mockNodes = new Map<string, any>();
const mockEvents: string[] = [];
let mockCommand: any;
jest.mock('cc', () => ({ Node: class {}, Component: class {} }));
jest.mock('../scene-process/service/core', () => ({ Service: { Undo: { push: (command: any) => { mockCommand = command; } } } }));
jest.mock('../scene-process/service/node/index', () => ({ __esModule: true, default: {} }));
jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: { dumpNode: (node: any) => ({ marker: node.marker }) },
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
    restoreNodeSnapshotDump: async (node: any, dump: any) => { mockEvents.push(`restore:${node.uuid}`); node.marker = dump.marker; },
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
beforeEach(() => { mockNodes.clear(); mockEvents.length = 0; mockCommand = undefined; });

describe('Probe globals in reparent history', () => {
    it('captures one affected scene and restores it after parent and node data without reparenting the root', async () => {
        const scene = node('scene');
        scene.scene = scene;
        scene.globals = { lightProbeInfo: { data: { probes: [{}] } } };
        const oldParent = node('old', scene);
        const newParent = node('new', scene);
        const group = node('group', scene);
        group.parent = oldParent;
        const helper = new NodeUndoHelper(() => {});
        const before = helper.captureReparentSnapshots([group]);
        expect([...before.keys()]).toEqual(['group', 'scene']);
        group.parent = newParent;
        group.marker = 'group:after';
        scene.marker = 'scene:after';
        helper.recordReparentSnapshots('reparent', 'Set Parent', before, ['group']);
        expect([...mockCommand.after.keys()]).toEqual(['group', 'scene']);
        expect(await mockCommand.adapter.apply(before)).toEqual({ success: true });
        expect(mockEvents).toEqual(['parent:group', 'restore:group', 'restore:scene']);
        expect([group.parent.uuid, group.marker, scene.marker, scene.setParent.mock.calls.length])
            .toEqual(['old', 'group:before', 'scene:before', 0]);
        mockEvents.length = 0;
        expect(await mockCommand.adapter.apply(mockCommand.after)).toEqual({ success: true });
        expect(mockEvents).toEqual(['parent:group', 'restore:group', 'restore:scene']);
        expect([group.parent.uuid, scene.marker]).toEqual(['new', 'scene:after']);
    });

    it('does not capture scene globals for a subtree with no enabled probes', () => {
        const scene = node('scene');
        scene.scene = scene;
        scene.globals = { lightProbeInfo: {} };
        const unrelated = node('unrelated', scene);
        const helper = new NodeUndoHelper(() => {});
        expect([...helper.captureReparentSnapshots([unrelated]).keys()]).toEqual(['unrelated']);
    });
});
