const mockQueryPropertyMetadata = jest.fn();
const mockResolveRelativeNodePath = jest.fn();
const mockIsAssetValue = jest.fn();
const mockLoadAssetValue = jest.fn();
const mockQueryAssetCtor = jest.fn();
const mockQueryAssetUuid = jest.fn();
const mockSerializeAssetValue = jest.fn();
const mockResolveCurveTarget = jest.fn();
const mockFindPropertyTrack = jest.fn();
const mockParsePropertyTrack = jest.fn();

jest.mock('cc', () => ({ Node: class Node {} }));

jest.mock('../scene-process/service/animation/property-metadata', () => ({
    queryAnimationPropertyMetadata: mockQueryPropertyMetadata,
}));

jest.mock('../scene-process/service/animation/property-curve', () => ({
    resolvePropertyCurveTarget: mockResolveCurveTarget,
}));

jest.mock('../scene-process/service/animation/property-curve-track', () => ({
    findPropertyTrack: mockFindPropertyTrack,
    parsePropertyTrack: mockParsePropertyTrack,
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
        mockResolveCurveTarget.mockReturnValue({ nodePath: 'Enemy', propKey: 'cc.Sprite.spriteFrame' });
        mockFindPropertyTrack.mockReturnValue(null);
        mockParsePropertyTrack.mockReturnValue(null);
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

    it('loads missing-node resources using metadata recovered from an existing track', async () => {
        class SpriteFrame {}
        const clip = {};
        const track = {};
        const metadata = { type: { value: 'cc.SpriteFrame' }, valueCtor: SpriteFrame };
        const loaded = new SpriteFrame();
        const operation = createOperation({ uuid: 'asset-uuid' });
        mockQueryPropertyMetadata.mockReturnValue(null);
        mockFindPropertyTrack.mockReturnValue(track);
        mockParsePropertyTrack.mockReturnValue({ nodePath: 'Enemy', descriptor: metadata });
        mockQueryAssetCtor.mockReturnValue(SpriteFrame);
        mockQueryAssetUuid.mockReturnValue('asset-uuid');
        mockLoadAssetValue.mockResolvedValue(loaded);

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode, 'Root', operation, clip,
        )).resolves.toBe(loaded);

        expect(mockResolveCurveTarget).toHaveBeenCalledWith(
            clip, { rootNode, rootPath: 'Root' }, operation,
        );
        expect(mockFindPropertyTrack).toHaveBeenCalledWith(clip, 'Enemy', operation.propKey);
        expect(mockQueryAssetCtor).toHaveBeenCalledWith(metadata);
        expect(mockLoadAssetValue).toHaveBeenCalledWith(SpriteFrame, 'asset-uuid');
    });

    it('keeps live-node metadata authoritative when an existing track is available', async () => {
        const metadata = { type: { value: 'cc.Asset' } };
        mockQueryPropertyMetadata.mockReturnValue(metadata);

        await normalizeProvidedAnimationPropertyOperationValue(
            rootNode, 'Root', createOperation({ uuid: 'asset-uuid' }), {},
        );

        expect(mockQueryAssetCtor).toHaveBeenCalledWith(metadata);
        expect(mockFindPropertyTrack).not.toHaveBeenCalled();
    });

    it('does not load a resource when the clip rejects the target', async () => {
        const value = { uuid: 'asset-uuid' };
        mockResolveCurveTarget.mockReturnValue(null);

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode, 'Root', createOperation(value), {},
        )).resolves.toBe(value);

        expect(mockQueryPropertyMetadata).not.toHaveBeenCalled();
        expect(mockFindPropertyTrack).not.toHaveBeenCalled();
        expect(mockLoadAssetValue).not.toHaveBeenCalled();
    });

    it('leaves resources unhydrated when the existing track has no recoverable type', async () => {
        const value = { uuid: 'asset-uuid' };
        mockQueryPropertyMetadata.mockReturnValue(null);
        mockFindPropertyTrack.mockReturnValue({});
        mockParsePropertyTrack.mockReturnValue({ descriptor: { type: { value: 'cc.Object' } } });

        await expect(normalizeProvidedAnimationPropertyOperationValue(
            rootNode, 'Root', createOperation(value), {},
        )).resolves.toBe(value);

        expect(mockLoadAssetValue).not.toHaveBeenCalled();
    });
});
