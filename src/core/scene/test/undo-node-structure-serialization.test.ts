const mockPrefabSerialize = jest.fn();
const mockGetNodePath = jest.fn((node: MockNode) => node.path);

class MockNode {
    isValid = true;
    components: Array<{ uuid: string; __prefab?: unknown }> = [];
    children: MockNode[] = [];
    parent: MockNode | null = null;
    path = '';

    constructor(public uuid: string, public name = uuid) { }

    getSiblingIndex(): number {
        return this.parent ? this.parent.children.indexOf(this) : 0;
    }
}

jest.mock('cc', () => ({
    editorExtrasTag: Symbol('editorExtrasTag'),
    Node: MockNode,
}));

jest.mock('../scene-process/service/node/index', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../scene-process/service/prefab/prefab-editor-utils', () => ({
    editorPrefabUtils: {
        serialize: mockPrefabSerialize,
    },
}));

jest.mock('../scene-process/service/undo/commands/command-utils-shared', () => ({
    createUndoId: jest.fn((type: string) => `${type}:id`),
    success: jest.fn((meta: unknown) => ({ success: true, meta })),
    failure: jest.fn((meta: unknown, reason: string) => ({ success: false, meta, reason })),
    isNodeInCurrentScene: jest.fn(() => false),
    getEditorNodeManager: jest.fn(() => null),
    getEditorExtends: jest.fn(() => null),
    getNodePath: mockGetNodePath,
}));

import { editorExtrasTag } from 'cc';
import { captureNodeStructureSnapshot } from '../scene-process/service/undo/commands/node-structure-command-utils';

describe('captureNodeStructureSnapshot serialization', () => {
    beforeEach(() => {
        mockPrefabSerialize.mockReset();
        mockPrefabSerialize.mockReturnValue(JSON.stringify({ __type__: 'cc.Prefab' }));
        mockGetNodePath.mockClear();
        (global as any).EditorExtends = {
            serialize: jest.fn((node: MockNode) => JSON.stringify({
                __type__: 'cc.Node',
                uuid: node.uuid,
                name: node.name,
            })),
        };
    });

    it('serializes a plain node as node JSON instead of prefab JSON', () => {
        const node = new MockNode('plain-node', 'PlainNode');
        node.path = '/PlainNode';

        const snapshot = captureNodeStructureSnapshot(node as any);

        expect(snapshot).not.toBeNull();
        expect((global as any).EditorExtends.serialize).toHaveBeenCalledWith(node);
        expect(mockPrefabSerialize).not.toHaveBeenCalled();
        expect(JSON.parse(snapshot!.serializedJson)).toMatchObject({
            __type__: 'cc.Node',
            uuid: 'plain-node',
        });
    });

    it('keeps prefab serialization for prefab-related nodes', () => {
        const node = new MockNode('prefab-node', 'PrefabNode') as MockNode & { _prefab?: unknown };
        node.path = '/PrefabNode';
        node._prefab = { instance: {} };

        const snapshot = captureNodeStructureSnapshot(node as any);

        expect(snapshot).not.toBeNull();
        expect(mockPrefabSerialize).toHaveBeenCalledWith(node);
        expect((global as any).EditorExtends.serialize).not.toHaveBeenCalled();
        expect(JSON.parse(snapshot!.serializedJson)).toMatchObject({
            __type__: 'cc.Prefab',
        });
    });

    it('serializes mounted plain nodes as node JSON instead of prefab JSON', () => {
        const prefabRoot = new MockNode('prefab-root', 'PrefabRoot');
        const node = new MockNode('mounted-button', 'Button') as MockNode & {
            [editorExtrasTag]?: { mountedRoot?: MockNode };
        };
        node.path = '/PrefabRoot/Button';
        node[editorExtrasTag] = { mountedRoot: prefabRoot };
        node.components.push({ uuid: 'button-comp', __prefab: { fileId: 'button-comp-file-id' } });

        const snapshot = captureNodeStructureSnapshot(node as any);

        expect(snapshot).not.toBeNull();
        expect((global as any).EditorExtends.serialize).toHaveBeenCalledWith(node);
        expect(mockPrefabSerialize).not.toHaveBeenCalled();
        expect(JSON.parse(snapshot!.serializedJson)).toMatchObject({
            __type__: 'cc.Node',
            uuid: 'mounted-button',
        });
    });

    it('can force prefab serialization for prefab undo snapshots', () => {
        const node = new MockNode('plain-prefab-editor-root', 'PlainPrefabRoot');
        node.path = '/PlainPrefabRoot';

        const snapshot = captureNodeStructureSnapshot(node as any, '', { serialization: 'prefab' });

        expect(snapshot).not.toBeNull();
        expect(mockPrefabSerialize).toHaveBeenCalledWith(node);
        expect((global as any).EditorExtends.serialize).not.toHaveBeenCalled();
    });
});
