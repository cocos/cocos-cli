jest.mock('../scene-process/service/animation/auxiliary-curve', () => ({
    dumpAuxiliaryCurves: jest.fn(() => ({})),
}));
jest.mock('../scene-process/service/animation/embedded-player', () => ({
    dumpEmbeddedPlayers: jest.fn(() => []),
    queryEmbeddedPlayerGroups: jest.fn(() => []),
}));
jest.mock('../scene-process/service/animation/property-curve', () => ({
    dumpPropertyCurves: jest.fn(() => []),
}));
jest.mock('../scene-process/service/animation/utils', () => ({
    cloneValue: <T>(value: T): T => value,
    getClipSample: jest.fn(() => 30),
}));

const { createClipDump } = require('../scene-process/service/animation/clip-dump');

describe('animation clip dump', () => {
    it('does not claim an imported skeletal clip is fully locked without an explicit lock contract', () => {
        const dump = createClipDump({ name: 'Idle', duration: 1, speed: 1, wrapMode: 2, events: [] }, undefined, {
            isSkeleton: true,
            useBakedAnimation: true,
        });

        expect(dump).toMatchObject({
            isLock: false,
            isSkeleton: true,
            useBakedAnimation: true,
        });
    });

    it('dumps imported exotic skeletal transform keyframes', () => {
        const clip = {
            name: 'Idle',
            duration: 1,
            speed: 1,
            wrapMode: 2,
            events: [],
            _exoticAnimation: {
                _nodeAnimations: [{
                    _path: 'CharacterArmature/Root/Body/Hips',
                    _position: {
                        times: [0, 1],
                        values: {
                            get(index: number, value: { x?: number; y?: number; z?: number }) {
                                Object.assign(value, index === 0 ? { x: 1, y: 2, z: 3 } : { x: 4, y: 5, z: 6 });
                            },
                        },
                    },
                    _rotation: null,
                    _scale: null,
                }],
            },
        };

        const dump = createClipDump(clip, undefined, {
            isSkeleton: true,
            useBakedAnimation: false,
        });

        expect(dump.curves).toEqual(expect.arrayContaining([expect.objectContaining({
            nodePath: 'CharacterArmature/Root/Body/Hips',
            key: 'position',
            keyframes: [
                expect.objectContaining({ frame: 0, dump: expect.objectContaining({ value: { x: 1, y: 2, z: 3 }, readonly: true }) }),
                expect.objectContaining({ frame: 30, dump: expect.objectContaining({ value: { x: 4, y: 5, z: 6 }, readonly: true }) }),
            ],
        })]));
    });

    it('does not lock ordinary animation clips', () => {
        const dump = createClipDump({ name: 'Authored', duration: 1, speed: 1, wrapMode: 2, events: [] }, undefined, {
            isSkeleton: false,
            useBakedAnimation: false,
        });

        expect(dump).toMatchObject({
            isLock: false,
            isSkeleton: false,
            useBakedAnimation: false,
        });
    });
});
