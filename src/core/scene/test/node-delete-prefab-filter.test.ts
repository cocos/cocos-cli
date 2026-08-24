const mockEditorNode = {
    getNodeByPath: jest.fn(),
};

(global as any).EditorExtends = {
    Node: mockEditorNode,
};

const mockService = {
    Editor: {
        lock: jest.fn(async () => undefined),
        unlock: jest.fn(),
        getRootNode: jest.fn(() => ({ uuid: 'scene-root' })),
    },
    Prefab: {
        filterChildOfPrefabAssetWhenRemoveNode: jest.fn(),
    },
    Undo: {
        push: jest.fn(),
    },
};

const mockBaseRemoveNode = jest.fn();
const mockCaptureRemoveNodeCommand = jest.fn(() => ({ type: 'remove-node' }));
const mockShouldRecordStructureCommand = jest.fn(() => true);

jest.mock('cc', () => ({
    CCClass: {},
    CCObject: {},
    Component: class Component {},
    Node: class Node {},
    Prefab: class Prefab {},
    Quat: class Quat {},
    Vec3: class Vec3 {},
}));

jest.mock('../scene-process/service/core', () => ({
    BaseService: class BaseService {},
    register: () => () => undefined,
    Service: mockService,
}));

jest.mock('../scene-process/service/node/index', () => ({
    __esModule: true,
    default: {
        baseRemoveNode: mockBaseRemoveNode,
    },
}));

jest.mock('../scene-process/service/node/node-create', () => ({
    createNodeByAsset: jest.fn(),
    loadAny: jest.fn(),
}));

jest.mock('../scene-process/service/node/node-utils', () => ({
    getUICanvasNode: jest.fn(),
    setLayer: jest.fn(),
}));

jest.mock('../scene-process/service/node/node-undo', () => ({
    NodeUndoHelper: jest.fn().mockImplementation(() => ({
        shouldRecordStructureCommand: mockShouldRecordStructureCommand,
    })),
}));

jest.mock('../scene-process/service/prefab/utils', () => ({
    prefabUtils: {},
}));

jest.mock('../scene-process/service/scene/utils', () => ({
    sceneUtils: {},
}));

jest.mock('../scene-process/service/undo/commands/remove-node-command', () => ({
    RemoveNodeCommand: {
        capture: mockCaptureRemoveNodeCommand,
    },
}));

jest.mock('../scene-process/service/undo/commands/remove-component-command', () => ({
    RemoveComponentCommand: {},
}));

jest.mock('../scene-process/service/animation/property-commit-event', () => ({
    broadcastAnimationPropertyCommitted: jest.fn(),
}));

describe('NodeService delete prefab filtering', () => {
    const node = { uuid: 'child-uuid', name: 'Child' };

    beforeEach(() => {
        jest.clearAllMocks();
        mockEditorNode.getNodeByPath.mockReturnValue(node);
        mockService.Editor.getRootNode.mockReturnValue({ uuid: 'scene-root' });
        mockShouldRecordStructureCommand.mockReturnValue(true);
    });

    it('skips deletion when the target is filtered out as a prefab asset child', async () => {
        mockService.Prefab.filterChildOfPrefabAssetWhenRemoveNode.mockReturnValue([]);

        const { NodeService } = require('../scene-process/service/node');
        const service = new NodeService();

        await expect(service.delete({ path: '/Child' })).resolves.toBeNull();

        expect(mockService.Prefab.filterChildOfPrefabAssetWhenRemoveNode).toHaveBeenCalledWith('child-uuid');
        expect(mockBaseRemoveNode).not.toHaveBeenCalled();
        expect(mockCaptureRemoveNodeCommand).not.toHaveBeenCalled();
        expect(mockService.Undo.push).not.toHaveBeenCalled();
        expect(mockService.Editor.unlock).toHaveBeenCalled();
    });

    it('continues deletion when the target is allowed by prefab filtering', async () => {
        mockService.Prefab.filterChildOfPrefabAssetWhenRemoveNode.mockReturnValue(['child-uuid']);

        const { NodeService } = require('../scene-process/service/node');
        const service = new NodeService();

        await expect(service.delete({ path: '/Child', keepWorldTransform: true })).resolves.toEqual({
            path: '/Child',
        });

        expect(mockBaseRemoveNode).toHaveBeenCalledWith(node, true);
        expect(mockCaptureRemoveNodeCommand).toHaveBeenCalledWith(node, true);
        expect(mockService.Undo.push).toHaveBeenCalledWith({ type: 'remove-node' });
    });
});

export {};
