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
    it('locks imported skeletal clips while preserving the skeletal and baked flags', () => {
        const dump = createClipDump({ name: 'Idle', duration: 1, speed: 1, wrapMode: 2, events: [] }, undefined, {
            isSkeleton: true,
            useBakedAnimation: true,
        });

        expect(dump).toMatchObject({
            isLock: true,
            isSkeleton: true,
            useBakedAnimation: true,
        });
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
