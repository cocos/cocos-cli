class MockAnimation {}
class MockSkeletalAnimation extends MockAnimation {}

jest.mock('cc', () => ({
    Animation: MockAnimation,
    SkeletalAnimation: MockSkeletalAnimation,
    Node: class Node {},
    Scene: class Scene {},
    animation: {},
    js: {},
}));

(globalThis as any).EditorExtends = {
    Node: {
        getNode: jest.fn(),
        getNodeByPath: jest.fn(),
        getNodePath: jest.fn(),
    },
};

const { isSkeletonClip } = require('../scene-process/service/animation/scene-node');

describe('animation scene-node classification', () => {
    it('does not classify an ordinary sub-asset clip as skeletal', () => {
        const ordinaryRoot = {
            getComponent: jest.fn((type: unknown) => type === MockAnimation ? new MockAnimation() : null),
        };

        expect(isSkeletonClip('gltf-asset@walk', ordinaryRoot)).toBe(false);
    });

    it('classifies a clip on a SkeletalAnimation root as skeletal', () => {
        const skeletalRoot = {
            getComponent: jest.fn((type: unknown) => type === MockSkeletalAnimation ? new MockSkeletalAnimation() : null),
        };

        expect(isSkeletonClip('gltf-asset@walk', skeletalRoot)).toBe(true);
    });

    it('keeps the sub-asset UUID fallback when the root node is unavailable', () => {
        expect(isSkeletonClip('gltf-asset@walk')).toBe(true);
    });
});
