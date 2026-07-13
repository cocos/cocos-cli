jest.mock('../scene-process/service/animation/auxiliary-curve', () => ({
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

describe('animation clip operations', () => {
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
