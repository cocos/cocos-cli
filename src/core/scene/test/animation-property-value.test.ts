const mockQueryPropertyMetadata = jest.fn();
const mockResolveRelativeNodePath = jest.fn();
const mockIsAssetValue = jest.fn();
const mockLoadAssetValue = jest.fn();
const mockQueryAssetCtor = jest.fn();
const mockQueryAssetUuid = jest.fn();
const mockSerializeAssetValue = jest.fn();

jest.mock('cc', () => ({ Node: class Node {} }));

jest.mock('../scene-process/service/animation/property-metadata', () => ({
    queryAnimationPropertyMetadata: mockQueryPropertyMetadata,
}));

jest.mock('../scene-process/service/animation/scene-node', () => ({
    resolveAnimationRelativeNodePath: mockResolveRelativeNodePath,
}));

jest.mock('../scene-process/service/animation/asset-value', () => ({
    isAnimationAssetValue: mockIsAssetValue,
    loadAnimationAssetValue: mockLoadAssetValue,
    queryAnimationAssetCtor: mockQueryAssetCtor,
    queryAnimationAssetUuid: mockQueryAssetUuid,
    serializeAnimationAssetValue: mockSerializeAssetValue,
}));

jest.mock('../scene-process/service/animation/utils', () => ({
    cloneSerializableValue: (value: unknown) => value,
}));

const { normalizeProvidedAnimationPropertyOperationValue } = require('../scene-process/service/animation/property-value');

describe('normalizeProvidedAnimationPropertyOperationValue', () => {
    const rootNode = {} as any;
    const createOperation = (value: unknown) => ({
        type: 'createPropertyKey',
        clipUuid: 'clip-uuid',
        nodePath: 'Enemy',
        propKey: 'cc.Sprite.spriteFrame',
        frame: 0,
        value,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockResolveRelativeNodePath.mockReturnValue('Enemy');
        mockQueryPropertyMetadata.mockReturnValue({ type: { value: 'cc.SpriteFrame' } });
        mockQueryAssetCtor.mockReturnValue(null);
    });

    it.each([null, undefined])('returns %p without resolving the target', async (value) => {
        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode,
            'Root',
            createOperation(value),
        )).resolves.toBe(value);

        expect(mockResolveRelativeNodePath).not.toHaveBeenCalled();
        expect(mockQueryPropertyMetadata).not.toHaveBeenCalled();
    });

    it('returns the provided value when the animation target is not bound', async () => {
        const value = { uuid: 'asset-uuid' };
        mockResolveRelativeNodePath.mockReturnValue(null);

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode,
            'Root',
            createOperation(value),
        )).resolves.toBe(value);

        expect(mockQueryPropertyMetadata).not.toHaveBeenCalled();
        expect(mockQueryAssetCtor).not.toHaveBeenCalled();
    });

    it('returns non-asset property values unchanged', async () => {
        const value = { x: 1, y: 2, z: 3 };
        mockQueryPropertyMetadata.mockReturnValue({ type: { value: 'cc.Vec3' } });

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode,
            'Root',
            { ...createOperation(value), propKey: 'position' },
        )).resolves.toBe(value);

        expect(mockQueryPropertyMetadata).toHaveBeenCalledWith(rootNode, 'Enemy', 'position');
        expect(mockQueryAssetUuid).not.toHaveBeenCalled();
    });

    it('keeps an already-instantiated asset value without loading it again', async () => {
        class SpriteFrame {}
        const value = new SpriteFrame();
        mockQueryAssetCtor.mockReturnValue(SpriteFrame);

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode,
            'Root',
            createOperation(value),
        )).resolves.toBe(value);

        expect(mockQueryAssetUuid).not.toHaveBeenCalled();
        expect(mockLoadAssetValue).not.toHaveBeenCalled();
    });

    it('keeps an asset-shaped value without a UUID unchanged', async () => {
        class SpriteFrame {}
        const value = { name: 'missing-uuid' };
        mockQueryAssetCtor.mockReturnValue(SpriteFrame);
        mockQueryAssetUuid.mockReturnValue('');

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode,
            'Root',
            createOperation(value),
        )).resolves.toBe(value);

        expect(mockLoadAssetValue).not.toHaveBeenCalled();
    });

    it('loads an asset instance from a provided UUID value', async () => {
        class SpriteFrame {}
        const value = { uuid: 'asset-uuid' };
        const loaded = new SpriteFrame();
        mockQueryAssetCtor.mockReturnValue(SpriteFrame);
        mockQueryAssetUuid.mockReturnValue('asset-uuid');
        mockLoadAssetValue.mockResolvedValue(loaded);

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode,
            'Root',
            createOperation(value),
        )).resolves.toBe(loaded);

        expect(mockLoadAssetValue).toHaveBeenCalledWith(SpriteFrame, 'asset-uuid');
    });
});
