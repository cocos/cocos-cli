jest.mock('../scene-process/service/animation/auxiliary-curve', () => ({
    dumpAuxiliaryCurves: jest.fn(() => ({})),
    addAuxiliaryCurve: jest.fn(),
    copyAuxKey: jest.fn(),
    createAuxKey: jest.fn(),
    moveAuxKeys: jest.fn(),
    removeAuxKey: jest.fn(),
    removeAuxiliaryCurve: jest.fn(),
    renameAuxiliaryCurve: jest.fn(),
    updateAuxKeyData: jest.fn(),
}));

jest.mock('../scene-process/service/animation/embedded-player', () => ({
    dumpEmbeddedPlayers: jest.fn(() => []),
    addEmbeddedPlayer: jest.fn(),
    addEmbeddedPlayerGroup: jest.fn(),
    clearEmbeddedPlayers: jest.fn(),
    deleteEmbeddedPlayer: jest.fn(),
    removeEmbeddedPlayerGroup: jest.fn(),
    updateEmbeddedPlayer: jest.fn(),
}));

jest.mock('../scene-process/service/animation/property-curve', () => ({
    addPropertyCurve: jest.fn(),
    copyPropertyKeysTo: jest.fn(),
    createPropertyKey: jest.fn(),
    movePropertyKeys: jest.fn(),
    removePropertyCurve: jest.fn(),
    removePropertyKey: jest.fn(),
    removePropertyKeys: jest.fn(),
    setPropertyCurveExtrapolation: jest.fn(),
    updatePropertyKey: jest.fn(),
    updatePropertyKeyData: jest.fn(),
}));

const { applyClipOperation } = require('../scene-process/service/animation/clip-operations');
const { syncAnimationClipDuration } = require('../scene-process/service/animation/clip-duration');

describe('animation clip operations', () => {
    it('preserves a skeletal track duration when an event moves earlier', () => {
        const clip = {
            sample: 60,
            duration: 1,
            events: [{ frame: 0.8, func: 'onPointEight', params: [] }],
            _tracks: [],
            _exoticAnimation: {
                _nodeAnimations: [{
                    _path: 'Root/Bone',
                    _position: { times: [0, 1] },
                    _rotation: null,
                    _scale: null,
                }],
            },
        };

        const duration = syncAnimationClipDuration(clip);

        expect(duration).toBe(1);
        expect(clip.duration).toBe(1);
    });

    it('keeps an ordinary clip track duration when an event moves earlier', () => {
        const clip = {
            sample: 60,
            duration: 1,
            events: [{ frame: 0.8, func: 'onPointEight', params: [] }],
            _tracks: [],
            range: () => ({ max: 1 }),
        };

        const duration = syncAnimationClipDuration(clip);

        expect(duration).toBe(1);
        expect(clip.duration).toBe(1);
    });

    it('keeps event time stable when changing sample rate', async () => {
        const clip = {
            sample: 30,
            events: [{ frame: 1, func: 'onOneSecond', params: [] }],
            updateEventDatas: jest.fn(),
        };

        const result = await applyClipOperation(clip, {
            type: 'changeSample',
            clipUuid: 'clip-uuid',
            sample: 60,
        }, {});

        expect(result).toBe(true);
        expect(clip.sample).toBe(60);
        expect(clip.events[0].frame).toBe(1);
        expect(Math.round(clip.events[0].frame * clip.sample)).toBe(60);
        expect(clip.updateEventDatas).toHaveBeenCalled();
    });
});
