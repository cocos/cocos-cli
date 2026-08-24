const mockService = {
    Editor: {
        getCurrentEditorType: jest.fn(),
        getCurrentEditorUuid: jest.fn(),
        getRootNode: jest.fn(),
    },
};
const mockCc = {
    director: {
        getScene: jest.fn(),
    },
    Layers: {
        Enum: {
            GIZMOS: 1 << 21,
            SCENE_GIZMO: 1 << 24,
            EDITOR: 1 << 22,
        },
    },
};

jest.mock('cc', () => ({
    __esModule: true,
    default: mockCc,
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: mockService,
}));

const mockDumpNode = jest.fn((node: any) => ({
    active: { value: true },
    __comps__: node.components ?? [],
}));
jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: { dumpNode: mockDumpNode },
}));

describe('SelectionService prefab path resolution', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockService.Editor.getCurrentEditorType.mockReturnValue('unknown');
        mockService.Editor.getCurrentEditorUuid.mockReturnValue(null);
        mockService.Editor.getRootNode.mockReturnValue(null);
        mockCc.director.getScene.mockReturnValue(null);
        delete (globalThis as any).EditorExtends;
    });

    it('stores uuid for prefab-root-relative paths when EditorExtends has no absolute path entry', () => {
        const child = { name: 'Child', uuid: 'child-uuid', children: [], components: [] };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child], components: [] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn(() => ''),
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);

        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();
        const broadcast = jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);

        selection.select('Node/Child');

        expect((selection as any)._selections).toEqual([{ path: 'Node/Child', uuid: 'child-uuid' }]);
        expect(broadcast).toHaveBeenCalledWith('selection:select', 'Node/Child', ['Node/Child']);
    });

    it('stores uuid for the prefab root path itself', () => {
        const root = { name: 'Node', uuid: 'root-uuid', children: [], components: [] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn(() => ''),
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);

        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);

        selection.select('Node');

        expect((selection as any)._selections).toEqual([{ path: 'Node', uuid: 'root-uuid' }]);
    });

    it('stores uuid for prefab paths with scene and hidden Canvas prefixes', () => {
        const child = { name: 'Child', uuid: 'child-uuid', children: [], components: [] };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child], components: [] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn(() => ''),
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);

        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);

        mockCc.director.getScene.mockReturnValue({ name: 'virtual-scene' });
        selection.select('virtual-scene/should_hide_in_hierarchy/Node/Child');

        expect((selection as any)._selections).toEqual([{
            path: 'virtual-scene/should_hide_in_hierarchy/Node/Child',
            uuid: 'child-uuid',
        }]);
    });

    it('uses prefab system path segments when display names collide with generated suffixes', () => {
        const generatedSuffixNode = { name: 'Child', uuid: 'generated-uuid', children: [], components: [] };
        const literalSuffixNode = { name: 'Child_001', uuid: 'literal-uuid', children: [], components: [] };
        const root = {
            name: 'Node',
            uuid: 'root-uuid',
            children: [generatedSuffixNode, literalSuffixNode],
            components: [],
        };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn(() => ''),
                getNodeByPath: jest.fn(() => null),
                getNodePath: jest.fn((node: any) => {
                    if (node === root) return 'Node';
                    if (node === generatedSuffixNode) return 'Node/Child_001';
                    if (node === literalSuffixNode) return 'Node/Child_001_001';
                    return '';
                }),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);

        const { SelectionService } = require('../scene-process/service/selection');
        const { getEditorNodeByPath } = require('../scene-process/service/gizmo/utils/editor-node');
        const selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);

        selection.select('Node/Child_001');

        expect((selection as any)._selections).toEqual([{
            path: 'Node/Child_001',
            uuid: 'generated-uuid',
        }]);
        expect(getEditorNodeByPath('Node/Child_001')).toBe(generatedSuffixNode);
        expect(getEditorNodeByPath('Node\\Child_001')).toBe(generatedSuffixNode);
    });

    it('does not alias the prefab display root name when its system path segment differs', () => {
        const child = { name: 'Child', uuid: 'child-uuid', children: [], components: [] };
        const root = { name: 'Player', uuid: 'root-uuid', children: [child], components: [] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn(() => ''),
                getNodeByPath: jest.fn(() => null),
                getNodePath: jest.fn((node: any) => {
                    if (node === root) return 'virtual-scene/should_hide_in_hierarchy/Player_001/';
                    if (node === child) return 'virtual-scene/should_hide_in_hierarchy/Player_001/Child';
                    return '';
                }),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);

        const { getEditorNodeUuidByPath } = require('../scene-process/service/gizmo/utils/editor-node');

        expect(getEditorNodeUuidByPath('Player/Child')).toBe('');
        expect(getEditorNodeUuidByPath('Player_001/Child')).toBe('child-uuid');
        expect(getEditorNodeUuidByPath('should_hide_in_hierarchy/Player/Child')).toBe('');
        expect(getEditorNodeUuidByPath('should_hide_in_hierarchy/Player_001/Child')).toBe('child-uuid');
    });

    it('does not resolve stale prefab paths from a previous virtual scene', () => {
        const child = { name: 'Child', uuid: 'child-uuid', children: [], components: [] };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child], components: [] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn(() => ''),
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);
        mockCc.director.getScene.mockReturnValue({ name: 'new-virtual-scene' });

        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);

        selection.select('old-virtual-scene/should_hide_in_hierarchy/Node/Child');

        expect((selection as any)._selections).toEqual([{
            path: 'old-virtual-scene/should_hide_in_hierarchy/Node/Child',
            uuid: '',
        }]);
    });

    it('does not match arbitrary old paths that merely contain the prefab root name', () => {
        const child = { name: 'Child', uuid: 'child-uuid', children: [], components: [] };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child], components: [] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn(() => ''),
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);

        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);

        selection.select('Other/Node/Child');

        expect((selection as any)._selections).toEqual([{ path: 'Other/Node/Child', uuid: '' }]);
    });

    it('prefers the node in the current editor when an editor helper has the same runtime uuid', () => {
        const selectedNode = { name: 'GreenBtn', uuid: 'Node.520', layer: 1 << 25, children: [], components: [] };
        const canvas = { name: 'Canvas', uuid: 'canvas-uuid', layer: 1 << 25, children: [selectedNode], components: [] };
        const editorGrid = {
            name: 'internal/editor/grid-2d',
            uuid: 'Node.520',
            layer: 1 << 22,
            children: [],
            components: [],
        };
        const root = {
            name: 'scene-2d',
            uuid: 'scene-uuid',
            layer: 0,
            children: [canvas, editorGrid],
            components: [],
        };
        (globalThis as any).EditorExtends = {
            Node: {
                // Reproduces the engine lookup collision observed in the scene
                // process: the generated editor node shadows the scene node.
                getNode: jest.fn(() => editorGrid),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('scene');
        mockService.Editor.getRootNode.mockReturnValue(root);

        const { getEditorNodeByPath, getEditorNodeByUuid } = require('../scene-process/service/gizmo/utils/editor-node');

        expect(getEditorNodeByUuid('Node.520')).toBe(selectedNode);
        expect(getEditorNodeByPath('Canvas/GreenBtn')).toBe(selectedNode);
    });

    it('publishes the latest unsaved node transform for screenshot capture', async () => {
        const root: any = { name: 'Scene', uuid: 'scene-uuid', children: [], parent: null };
        const node: any = {
            name: 'Button',
            uuid: 'button-uuid',
            children: [],
            parent: root,
            position: { x: -360, y: 140, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
        };
        root.children.push(node);
        (globalThis as any).EditorExtends = {
            Node: { getNodePath: jest.fn(() => 'Canvas/Button') },
        };
        mockService.Editor.getCurrentEditorUuid.mockReturnValue('scene-uuid');
        mockService.Editor.getRootNode.mockReturnValue(root);
        const { Rpc } = require('../scene-process/rpc');
        const request = jest.fn(() => Promise.resolve(true));
        jest.spyOn(Rpc, 'isWebTransport').mockReturnValue(true);
        jest.spyOn(Rpc, 'getInstance').mockReturnValue({ request });
        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();

        (selection as any)._publishBrowserNodeTransform(node);
        await Promise.resolve();

        expect(request).toHaveBeenCalledWith('browserSceneState', 'setEditorState', [
            'scene-uuid',
            {
                nodeTransforms: [expect.objectContaining({
                    uuid: 'button-uuid',
                    path: 'Canvas/Button',
                    revision: 1,
                    position: { x: -360, y: 140, z: 0 },
                })],
            },
        ]);
    });

    it('publishes unsaved node and component inspector values for screenshot capture', async () => {
        const root: any = { name: 'Scene', uuid: 'scene-uuid', children: [], parent: null };
        const node: any = {
            name: 'Button',
            uuid: 'button-uuid',
            children: [],
            components: [{ type: 'cc.Sprite', value: { color: { value: '#ff0000' } } }],
            parent: root,
        };
        root.children.push(node);
        (globalThis as any).EditorExtends = {
            Node: { getNodePath: jest.fn(() => 'Canvas/Button') },
        };
        mockService.Editor.getCurrentEditorUuid.mockReturnValue('scene-uuid');
        mockService.Editor.getRootNode.mockReturnValue(root);
        const { Rpc } = require('../scene-process/rpc');
        const request = jest.fn(() => Promise.resolve(true));
        jest.spyOn(Rpc, 'isWebTransport').mockReturnValue(true);
        jest.spyOn(Rpc, 'getInstance').mockReturnValue({ request });
        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();

        (selection as any)._publishBrowserNodeSnapshot(node);
        await Promise.resolve();

        expect(mockDumpNode).toHaveBeenCalledWith(node);
        expect(request).toHaveBeenCalledWith('browserSceneState', 'setEditorState', [
            'scene-uuid',
            {
                nodeSnapshots: [expect.objectContaining({
                    uuid: 'button-uuid',
                    path: 'Canvas/Button',
                    revision: 1,
                    dump: expect.objectContaining({ active: { value: true } }),
                })],
            },
        ]);
    });
});

describe('SelectionService 前导 / 归一化', () => {
    function createSelection() {
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeUuidByPath: jest.fn((path: string) => (path === 'Canvas' ? 'canvas-uuid' : '')),
                getNodeByPath: jest.fn(() => null),
                getNode: jest.fn(() => null),
            },
        };
        const { SelectionService } = require('../scene-process/service/selection');
        const selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);
        return selection;
    }

    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockService.Editor.getCurrentEditorType.mockReturnValue('unknown');
        mockService.Editor.getRootNode.mockReturnValue(null);
        mockCc.director.getScene.mockReturnValue(null);
        delete (globalThis as any).EditorExtends;
    });

    it('带前导 / 选中时存归一化路径并解析出 uuid', () => {
        const selection = createSelection();

        selection.select('/Canvas');

        expect((selection as any)._selections).toEqual([{ path: 'Canvas', uuid: 'canvas-uuid' }]);
        expect(selection.query()).toEqual(['Canvas']);
    });

    it('两种拼法只算一次选中', () => {
        const selection = createSelection();

        selection.select('Canvas');
        selection.select('/Canvas');
        selection.select('//Canvas');

        expect((selection as any)._selections).toHaveLength(1);
    });

    it('带前导 / 可以取消不带 / 选中的节点', () => {
        const selection = createSelection();

        selection.select('Canvas');
        selection.unselect('/Canvas');

        expect((selection as any)._selections).toEqual([]);
    });

    it('isSelect 忽略前导 /', () => {
        const selection = createSelection();

        selection.select('/Canvas');

        expect(selection.isSelect('Canvas')).toBe(true);
        expect(selection.isSelect('/Canvas')).toBe(true);
        expect(selection.isSelect('//Canvas')).toBe(true);
        expect(selection.isSelect('Other')).toBe(false);
    });

    it('broadcast 与 query 一致，都用归一化路径', () => {
        const selection = createSelection();
        const broadcast = jest.spyOn(selection, 'broadcast');

        selection.select('/Canvas');
        expect(broadcast).toHaveBeenCalledWith('selection:select', 'Canvas', ['Canvas']);

        selection.unselect('//Canvas');
        expect(broadcast).toHaveBeenCalledWith('selection:unselect', 'Canvas', []);
    });

    it('根路径仍然是 "/"，不会被剥成空串', () => {
        const selection = createSelection();

        selection.select('///');

        expect((selection as any)._selections).toEqual([{ path: '/', uuid: '' }]);
        expect(selection.isSelect('/')).toBe(true);
    });
});

export {};
