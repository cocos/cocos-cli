const mockCloneNode = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/scene', () => ({
    NodeType: {
        EMPTY: 'Empty',
        SPRITE: 'Sprite',
    },
    Scene: {
        Node: {
            clone: (...args: unknown[]) => mockCloneNode(...args),
        },
    },
}));

import { NodeApi } from '../src/api/scene/node';
import { SchemaNodeClone, SchemaNodeCloneResult } from '../src/api/scene/node-schema';
import { COMMON_STATUS } from '../src/api/base/schema-base';

describe('scene-clone-node API', () => {
    beforeEach(() => {
        mockCloneNode.mockReset();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('validates request and result schemas', () => {
        expect(SchemaNodeClone.parse({ sourcePath: 'Canvas/Panel' })).toEqual({
            sourcePath: 'Canvas/Panel',
        });
        expect(SchemaNodeClone.parse({
            sourcePath: 'Canvas/Panel',
            targetParentPath: 'Canvas/Container',
        })).toEqual({
            sourcePath: 'Canvas/Panel',
            targetParentPath: 'Canvas/Container',
        });
        expect(SchemaNodeCloneResult.parse({
            nodeId: 'node-uuid',
            path: 'Canvas/Panel_001',
            name: 'Panel_001',
        })).toEqual({
            nodeId: 'node-uuid',
            path: 'Canvas/Panel_001',
            name: 'Panel_001',
        });
    });

    it('returns the cloned node identifier', async () => {
        mockCloneNode.mockResolvedValue({
            nodeId: 'clone-uuid',
            path: 'Canvas/Panel_001',
            name: 'Panel_001',
            properties: {},
            prefab: null,
        });

        const result = await new NodeApi().cloneNode({ sourcePath: 'Canvas/Panel' });

        expect(mockCloneNode).toHaveBeenCalledWith({ sourcePath: 'Canvas/Panel' });
        expect(result).toEqual({
            code: COMMON_STATUS.SUCCESS,
            data: {
                nodeId: 'clone-uuid',
                path: 'Canvas/Panel_001',
                name: 'Panel_001',
            },
        });
    });

    it('rejects empty source and target paths', () => {
        expect(SchemaNodeClone.safeParse({ sourcePath: '' }).success).toBe(false);
        expect(SchemaNodeClone.safeParse({ sourcePath: 'Canvas/Panel', targetParentPath: '' }).success).toBe(false);
    });

    it.each([
        'Source node not found at path: Canvas/Missing',
        'Target parent node not found at path: Canvas/MissingParent',
    ])('returns 404 for missing nodes: %s', async (message) => {
        mockCloneNode.mockRejectedValue(new Error(message));

        const result = await new NodeApi().cloneNode({ sourcePath: 'Canvas/Panel' });

        expect(result.code).toBe(COMMON_STATUS.NOT_FOUND);
        expect(result.reason).toBe(message);
    });

    it.each([
        'Failed to clone node: the scene is not opened.',
        'Failed to clone node: cloning is only supported in the scene editor.',
        'Cannot clone the scene root node.',
    ])('returns 400 for unsupported clone requests: %s', async (message) => {
        mockCloneNode.mockRejectedValue(new Error(message));

        const result = await new NodeApi().cloneNode({ sourcePath: '/' });

        expect(result.code).toBe(COMMON_STATUS.BAD_REQUEST);
        expect(result.reason).toBe(message);
    });

    it('keeps unknown failures as 500', async () => {
        mockCloneNode.mockRejectedValue(new Error('unexpected clone failure'));

        const result = await new NodeApi().cloneNode({ sourcePath: 'Canvas/Panel' });

        expect(result.code).toBe(COMMON_STATUS.FAIL);
        expect(result.reason).toBe('unexpected clone failure');
    });
});
