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
        const { getEditorNodeByPath } = require('../scene-process/service/utils/editor-node');
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

        const { getEditorNodeUuidByPath } = require('../scene-process/service/utils/editor-node');

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

describe('SelectionService current addresses', () => {
    function createSelection() {
        const component = { onFocusInEditor: jest.fn(), onLostFocusInEditor: jest.fn() };
        const parent = { uuid: 'parent-uuid', components: [], _components: [] };
        const child = { uuid: 'child-uuid', components: [component], _components: [component] };
        const other = { uuid: 'other-uuid', components: [], _components: [] };
        const nodes = new Map([parent, child, other].map(node => [node.uuid, node]));
        const paths = new Map([
            [parent.uuid, 'Parent'],
            [child.uuid, 'Parent/Child'],
            [other.uuid, 'Other'],
        ]);
        (globalThis as any).EditorExtends = {
            Node: {
                getNode: (uuid: string) => nodes.get(uuid) ?? null,
                getNodePath: (node: { uuid: string }) => paths.get(node.uuid) ?? '',
                getNodeUuidByPath: (path: string) => [...paths].find(([, value]) => value === path)?.[0] ?? '',
            },
        };
        const { SelectionService } = require('../scene-process/service/selection') as typeof import('../scene-process/service/selection');
        const { ServiceEvents } = require('../scene-process/service/core/global-events') as typeof import('../scene-process/service/core/global-events');
        const selection = new SelectionService();
        // Use the same optional service lifecycle as the service manager.
        (selection as { init?: () => void }).init?.();
        const broadcast = jest.spyOn(selection, 'broadcast');
        return { selection, ServiceEvents, broadcast, parent, child, other, nodes, paths, component };
    }

    afterEach(() => {
        const { ServiceEvents } = require('../scene-process/service/core/global-events');
        ServiceEvents.clear();
        jest.restoreAllMocks();
        jest.resetModules();
        jest.clearAllMocks();
        mockService.Editor.getCurrentEditorType.mockReturnValue('unknown');
        mockService.Editor.getRootNode.mockReturnValue(null);
        mockCc.director.getScene.mockReturnValue(null);
        delete (globalThis as any).EditorExtends;
    });

    it('queries the selected descendant at its current address after ancestor rename', () => {
        const { selection, ServiceEvents, parent, child, paths } = createSelection();
        selection.select('Parent/Child');

        paths.set(parent.uuid, 'Renamed');
        paths.set(child.uuid, 'Renamed/Child');
        ServiceEvents.emit('node:change', parent, { type: 'set-property', propPath: 'name' });

        expect(selection.query()).toEqual(['Renamed/Child']);
    });

    it.each(['isSelect', 'select', 'unselect', 'clear'] as const)(
        '%s uses the current descendant address without a preceding query',
        operation => {
            const { selection, ServiceEvents, parent, child, paths, broadcast, component } = createSelection();
            selection.select('Parent/Child');
            broadcast.mockClear();
            const unselected = jest.fn();
            ServiceEvents.on('selection:unselect', unselected);
            paths.set(parent.uuid, 'Other/Parent');
            paths.set(child.uuid, 'Other/Parent/Child');
            ServiceEvents.emit('node:change', parent, { type: 'parent-changed' });

            if (operation === 'isSelect') {
                expect(selection.isSelect('/Other/Parent/Child')).toBe(true);
                expect(selection.isSelect('Parent/Child')).toBe(false);
            } else if (operation === 'select') {
                selection.select('/Other/Parent/Child');
                expect(selection.query()).toEqual(['Other/Parent/Child']);
                expect(component.onFocusInEditor).toHaveBeenCalledTimes(1);
                expect(broadcast).not.toHaveBeenCalled();
            } else if (operation === 'unselect') {
                selection.unselect('/Other/Parent/Child');
                expect(selection.query()).toEqual([]);
                expect(component.onLostFocusInEditor).toHaveBeenCalledTimes(1);
                expect(broadcast.mock.calls).toEqual([['selection:unselect', 'Other/Parent/Child', []]]);
            } else {
                selection.clear();
                expect(unselected.mock.calls).toEqual([['Other/Parent/Child', []]]);
                expect(component.onLostFocusInEditor).toHaveBeenCalledTimes(1);
                expect(broadcast.mock.calls).toEqual([['selection:clear']]);
            }
        },
    );

    it('follows Undo/Redo addresses without propPath while preserving selection order and notifications', () => {
        const { selection, ServiceEvents, parent, child, paths, broadcast, component } = createSelection();
        selection.select('Other');
        selection.select('Parent/Child');
        broadcast.mockClear();

        paths.set(child.uuid, 'Renamed/Child_001');
        ServiceEvents.emit('node:change', parent, { type: 'set-property', source: 'undo' });
        expect(selection.query()).toEqual(['Renamed/Child_001', 'Other']);
        paths.set(child.uuid, 'Parent/Child');
        ServiceEvents.emit('node:change', parent, { source: 'undo' });
        expect(selection.query()).toEqual(['Parent/Child', 'Other']);
        expect(broadcast).not.toHaveBeenCalled();
        expect(component.onFocusInEditor).toHaveBeenCalledTimes(1);
        expect(component.onLostFocusInEditor).not.toHaveBeenCalled();
    });

    it.each([
        { description: 'selected-node rename', ancestor: false, opts: { type: 'set-property', propPath: 'name' } },
        { description: 'ancestor reparent', ancestor: true, opts: { type: 'parent-changed' } },
        { description: 'ancestor Undo without property metadata', ancestor: true, opts: { source: 'undo' } },
    ] as const)('retains the latest address after $description followed by index removal', ({ ancestor, opts }) => {
        const { selection, ServiceEvents, parent, child, paths, nodes, broadcast, component } = createSelection();
        selection.select('Parent/Child');
        broadcast.mockClear();
        const currentPath = ancestor ? 'Moved/Parent/Child' : 'Parent/Renamed';
        if (ancestor) paths.set(parent.uuid, 'Moved/Parent');
        paths.set(child.uuid, currentPath);
        ServiceEvents.emit('node:change', ancestor ? parent : child, opts);
        // Remove the node before any selection read can refresh its cached address.
        nodes.delete(child.uuid);
        paths.delete(child.uuid);

        expect(selection.query()).toEqual([currentPath]);
        expect(selection.isSelect(currentPath)).toBe(true);
        expect(broadcast).not.toHaveBeenCalled();
        selection.unselect(currentPath);

        expect(selection.query()).toEqual([]);
        expect(broadcast.mock.calls).toEqual([['selection:unselect', currentPath, []]]);
        expect(component.onFocusInEditor).toHaveBeenCalledTimes(1);
        expect(component.onLostFocusInEditor).not.toHaveBeenCalled();
    });

    it('clears missing renamed nodes in selection order with their latest event addresses', () => {
        const { selection, ServiceEvents, child, paths, nodes, broadcast } = createSelection();
        selection.select('Other');
        selection.select('Parent/Child');
        broadcast.mockClear();
        const unselected = jest.fn();
        ServiceEvents.on('selection:unselect', unselected);
        paths.set(child.uuid, 'Parent/Renamed');
        ServiceEvents.emit('node:change', child, { type: 'set-property', propPath: 'name' });
        nodes.delete(child.uuid);
        paths.delete(child.uuid);

        selection.clear();

        expect(unselected.mock.calls).toEqual([
            ['Parent/Renamed', ['Other']],
            ['Other', []],
        ]);
        expect(broadcast.mock.calls).toEqual([['selection:clear']]);
        expect(selection.query()).toEqual([]);
    });

    it('stops observing node changes when the selection service is destroyed', () => {
        const { selection, ServiceEvents, child, paths, nodes, broadcast } = createSelection();
        selection.select('Parent/Child');
        (selection as { destroy?: () => void }).destroy?.();
        broadcast.mockClear();
        paths.set(child.uuid, 'Parent/Renamed');
        ServiceEvents.emit('node:change', child, { type: 'set-property', propPath: 'name' });
        nodes.delete(child.uuid);
        paths.delete(child.uuid);

        expect(selection.query()).toEqual(['Parent/Child']);
        expect(broadcast).not.toHaveBeenCalled();
    });

    it.each([
        ['isSelect', 'unselect'],
        ['isSelect', 'clear'],
        ['select', 'unselect'],
        ['select', 'clear'],
    ] as const)('retains the latest address after %s followed by index removal and %s', (operation, removal) => {
        const { selection, ServiceEvents, child, paths, nodes, broadcast, component } = createSelection();
        selection.select('Other');
        selection.select('Parent/Child');
        broadcast.mockClear();
        const unselected = jest.fn();
        ServiceEvents.on('selection:unselect', unselected);
        paths.set(child.uuid, 'Renamed/Child');
        // No node event or query refreshes the cache before this UUID-based lookup.
        if (operation === 'isSelect') {
            expect(selection.isSelect('Renamed/Child')).toBe(true);
        } else {
            selection.select('Renamed/Child');
        }
        nodes.delete(child.uuid);
        paths.delete(child.uuid);

        expect(selection.query()).toEqual(['Renamed/Child', 'Other']);
        expect(broadcast).not.toHaveBeenCalled();
        expect(component.onFocusInEditor).toHaveBeenCalledTimes(1);
        if (removal === 'unselect') {
            selection.unselect('Renamed/Child');
            expect(selection.query()).toEqual(['Other']);
            expect(broadcast.mock.calls).toEqual([['selection:unselect', 'Renamed/Child', ['Other']]]);
        } else {
            selection.clear();
            expect(selection.query()).toEqual([]);
            expect(unselected.mock.calls).toEqual([['Renamed/Child', ['Other']], ['Other', []]]);
            expect(broadcast.mock.calls).toEqual([['selection:clear']]);
        }
    });

    it('reports current selected paths in select and unselect event payloads without node events', () => {
        const { selection, child, paths, broadcast } = createSelection();
        selection.select('Parent/Child');
        broadcast.mockClear();
        paths.set(child.uuid, 'Renamed/Child');

        selection.select('Other');
        paths.set(child.uuid, 'Renamed/Child_001');
        selection.unselect('Other');

        expect(broadcast.mock.calls).toEqual([
            ['selection:select', 'Other', ['Other', 'Renamed/Child']],
            ['selection:unselect', 'Other', ['Renamed/Child_001']],
        ]);
    });

    it('clears multiple selections in order using current event addresses', () => {
        const { selection, ServiceEvents, child, other, paths, broadcast, component } = createSelection();
        selection.select('Other');
        selection.select('Parent/Child');
        broadcast.mockClear();
        const unselected = jest.fn();
        ServiceEvents.on('selection:unselect', unselected);
        paths.set(child.uuid, 'Renamed/Child');
        paths.set(other.uuid, 'RenamedOther');

        selection.clear();

        expect(unselected.mock.calls).toEqual([
            ['Renamed/Child', ['RenamedOther']],
            ['RenamedOther', []],
        ]);
        expect(broadcast.mock.calls).toEqual([['selection:clear']]);
        expect(component.onLostFocusInEditor).toHaveBeenCalledTimes(1);
        expect(selection.query()).toEqual([]);
    });

    it('selects a new node at the old address independently of the moved selected node', () => {
        const { selection, child, paths, nodes } = createSelection();
        selection.select('Parent/Child');
        paths.set(child.uuid, 'Renamed/Child');
        const replacement = { uuid: 'replacement-uuid', components: [], _components: [] };
        nodes.set(replacement.uuid, replacement);
        paths.set(replacement.uuid, 'Parent/Child');

        selection.select('Parent/Child');
        expect(selection.query()).toEqual(['Parent/Child', 'Renamed/Child']);
        selection.unselect('Parent/Child');
        expect(selection.query()).toEqual(['Renamed/Child']);
    });

    it('retains unresolved and temporarily missing entries without rebinding their UUIDs by path', () => {
        const { selection, child, paths, nodes, component } = createSelection();
        selection.select('Unresolved');
        selection.select('Parent/Child');
        nodes.delete(child.uuid);
        paths.delete(child.uuid);
        const replacement = { uuid: 'replacement-uuid', components: [], _components: [] };
        nodes.set(replacement.uuid, replacement);
        paths.set(replacement.uuid, 'Parent/Child');
        expect(selection.query()).toEqual(['Parent/Child', 'Unresolved']);

        paths.set(replacement.uuid, 'ReplacementMoved');
        expect(selection.query()).toEqual(['Parent/Child', 'Unresolved']);
        nodes.set(child.uuid, child);
        paths.set(child.uuid, 'Restored/Child');
        expect(selection.query()).toEqual(['Restored/Child', 'Unresolved']);
        selection.unselect('Restored/Child');
        selection.unselect('Unresolved');
        expect(selection.query()).toEqual([]);
        expect(component.onLostFocusInEditor).toHaveBeenCalledTimes(1);
    });

    it.each(['Node/Child', 'should_hide_in_hierarchy/Node/Child', '/virtual-scene/should_hide_in_hierarchy/Node/Child'])(
        'accepts prefab alias %s after returning the canonical path',
        alias => {
            const { selection, parent, child, paths, broadcast, component } = createSelection();
            const canonicalPath = 'virtual-scene/should_hide_in_hierarchy/Node/Child';
            paths.set(parent.uuid, 'virtual-scene/should_hide_in_hierarchy/Node');
            paths.set(child.uuid, canonicalPath);
            mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
            mockService.Editor.getRootNode.mockReturnValue({
                ...parent, name: 'Node', children: [{ ...child, name: 'Child', children: [] }],
            });
            mockCc.director.getScene.mockReturnValue({ name: 'virtual-scene' });

            selection.select(alias);
            expect(selection.isSelect(alias)).toBe(true);
            selection.select(alias);
            expect(selection.query()).toEqual([canonicalPath]);
            selection.unselect(alias);

            expect(selection.query()).toEqual([]);
            expect(broadcast.mock.calls).toEqual([
                ['selection:select', canonicalPath, [canonicalPath]],
                ['selection:unselect', canonicalPath, []],
            ]);
            expect(component.onFocusInEditor).toHaveBeenCalledTimes(1);
            expect(component.onLostFocusInEditor).toHaveBeenCalledTimes(1);
        },
    );
});

export {};
