jest.mock('../scene-process/service/animation/property-curve', () => ({
    dumpPropertyCurves: jest.fn((clip: { _tracks?: unknown[] }) => (clip._tracks || []).map(() => ({
        nodePath: 'Bone',
        key: 'position',
        keyframes: [],
    }))),
}));
jest.mock('../scene-process/service/animation/property-curve-track', () => ({
    parseAnimationTrackTarget: jest.fn(() => ({ nodePath: 'Bone', propKey: 'position' })),
}));
jest.mock('../scene-process/service/animation/property-metadata', () => ({
    queryAnimationPropertyMetadata: jest.fn(() => null),
}));

const { dumpUntypedAnimationCurves } = require('../scene-process/service/animation/untyped-animation-track');

describe('untyped animation track dump', () => {
    it('upgrades a temporary track view without changing the source clip', () => {
        const sourceTrack = {
            upgrade: jest.fn(() => ({ typed: true })),
        };
        const clip = {
            sample: 30,
            _tracks: [sourceTrack],
        };

        const curves = dumpUntypedAnimationCurves(clip as any, {});

        expect(curves).toHaveLength(1);
        expect(sourceTrack.upgrade).toHaveBeenCalledTimes(1);
        expect(clip._tracks).toEqual([sourceTrack]);
    });

    it('skips tracks that cannot be upgraded', () => {
        const clip = {
            _tracks: [{ upgrade: jest.fn(() => null) }],
        };

        expect(dumpUntypedAnimationCurves(clip as any, {})).toEqual([]);
    });
});
