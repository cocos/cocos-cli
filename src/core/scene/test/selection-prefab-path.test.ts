const mockService = {
    Editor: {
        getCurrentEditorType: jest.fn(),
        getRootNode: jest.fn(),
    },
};
const mockCc = {
    director: {
        getScene: jest.fn(),
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

describe('SelectionService prefab path resolution', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockService.Editor.getCurrentEditorType.mockReturnValue('unknown');
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
