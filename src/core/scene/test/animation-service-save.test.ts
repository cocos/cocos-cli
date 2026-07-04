const mockRequest = jest.fn();

jest.mock('cc', () => ({
    AnimationClip: class AnimationClip {},
    Node: class Node {},
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: jest.fn(() => ({
            request: mockRequest,
        })),
    },
}));

jest.mock('../scene-process/service/animation/scene-node', () => ({
    isSkeletonClip: jest.fn(() => false),
}));

jest.mock('../scene-process/service/animation/skeleton-meta', () => ({
    saveSkeletonAnimationMeta: jest.fn(),
}));

(globalThis as any).EditorExtends = {
    serialize: jest.fn(() => 'serialized-clip'),
};

const { saveAnimationServiceClip } = require('../scene-process/service/animation/service-save');

describe('saveAnimationServiceClip', () => {
    beforeEach(() => {
        mockRequest.mockReset();
        (globalThis as any).EditorExtends.serialize.mockClear();
    });

    it('saves an existing clip asset by uuid', async () => {
        mockRequest
            .mockResolvedValueOnce({ uuid: 'clip-uuid', url: 'db://assets/anims/Run.anim' })
            .mockResolvedValueOnce(true);

        await expect(saveAnimationServiceClip({
            session: { clipUuid: 'clip-uuid' },
            rootNode: {},
            clip: { name: 'Run' },
        })).resolves.toBe(true);

        expect(mockRequest).toHaveBeenNthCalledWith(1, 'assetManager', 'queryAssetInfo', ['clip-uuid']);
        expect(mockRequest).toHaveBeenNthCalledWith(2, 'assetManager', 'saveAsset', ['clip-uuid', 'serialized-clip']);
    });

    it('fails instead of creating a clip at a hard-coded fallback path when asset info is missing', async () => {
        mockRequest.mockResolvedValueOnce(null);

        await expect(saveAnimationServiceClip({
            session: { clipUuid: 'missing-clip-uuid' },
            rootNode: {},
            clip: { name: 'Run' },
        })).rejects.toThrow('Animation clip asset not found: missing-clip-uuid');

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('assetManager', 'queryAssetInfo', ['missing-clip-uuid']);
    });
});
