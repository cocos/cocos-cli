jest.mock('cc', () => ({
    Animation: class Animation {},
    AnimationClip: class AnimationClip {},
    AnimationState: class AnimationState {},
    Node: class Node {},
}));
jest.mock('../scene-process/service/animation/clip-dump', () => ({
    createClipDump: jest.fn(),
}));
jest.mock('../scene-process/service/animation/property-menu', () => ({
    ACTIVE_PROPERTY: {},
    DEFAULT_PROPERTIES: [],
}));
jest.mock('../scene-process/service/animation/property-metadata', () => ({
    queryAnimationPropertyMetadata: jest.fn(() => null),
    queryComponentAnimableProperties: jest.fn(() => []),
}));
jest.mock('../scene-process/service/animation/scene-node', () => ({
    getNodeByPath: jest.fn(),
    getNodeByUuid: jest.fn(),
    isSkeletonClip: jest.fn(),
    isUsingBakedAnimation: jest.fn(),
    queryAnimationRootNode: jest.fn(),
}));
jest.mock('../scene-process/service/animation/utils', () => ({
    clipUuid: jest.fn(),
}));

const { createAnimationServiceClipDump, upgradeUntypedAnimationTracks } = require('../scene-process/service/animation/service-target');

function createPropertyPath(property: string) {
    return {
        length: 2,
        isHierarchyAt: (index: number) => index === 0,
        parseHierarchyAt: () => 'Bone',
        isComponentAt: () => false,
        isPropertyAt: (index: number) => index === 1,
        parsePropertyAt: () => property,
    };
}

describe('skeletal animation track upgrade', () => {
    it('does not upgrade untyped tracks while creating a read-only clip dump', () => {
        const upgrade = jest.fn();
        const clip = { upgradeUntypedTracks: upgrade };

        createAnimationServiceClipDump({} as any, clip as any);

        expect(upgrade).not.toHaveBeenCalled();
    });

    it('refines untyped bone transform tracks before clip dumping', () => {
        let refine: ((path: unknown, proxy: unknown) => string | null) | undefined;
        const clip = {
            upgradeUntypedTracks(callback: (path: unknown, proxy: unknown) => string | null) {
                refine = callback;
            },
        };

        upgradeUntypedAnimationTracks({} as any, clip as any);

        expect(refine).toBeDefined();
        expect(refine!(createPropertyPath('position'), undefined)).toBe('vec3');
        expect(refine!(createPropertyPath('scale'), undefined)).toBe('vec3');
    });

    it('does not invent a type for unsupported untyped properties', () => {
        let refine: ((path: unknown, proxy: unknown) => string | null) | undefined;
        const clip = {
            upgradeUntypedTracks(callback: (path: unknown, proxy: unknown) => string | null) {
                refine = callback;
            },
        };

        upgradeUntypedAnimationTracks({} as any, clip as any);

        expect(refine!(createPropertyPath('unsupported'), undefined)).toBeNull();
    });
});
