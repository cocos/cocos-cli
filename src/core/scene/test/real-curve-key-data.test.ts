jest.mock('cc', () => ({
    editorExtrasTag: '__editorExtras__',
}), { virtual: true });

import {
    createMergedRealCurveValue,
    dumpRealKeyData,
} from '../scene-process/service/animation/real-curve-key-data';

describe('RealCurve key data helpers', () => {
    it('keeps public dumps compact while allowing internal zero-preserving dumps', () => {
        const value = {
            value: 12,
            leftTangent: 0,
            rightTangent: 0,
            leftTangentWeight: 0,
            rightTangentWeight: 0,
            interpolationMode: 0,
            tangentWeightMode: 0,
            easingMethod: 0,
            __editorExtras__: { tangentMode: 0 },
        };

        expect(dumpRealKeyData(value)).toEqual({});
        expect(dumpRealKeyData(value, { includeDefaults: true })).toMatchObject({
            inTangent: 0,
            outTangent: 0,
            inTangentWeight: 0,
            outTangentWeight: 0,
            interpMode: 0,
            tangentWeightMode: 0,
            tangentMode: 0,
            easingMethod: 0,
        });
    });

    it('preserves existing zero key data without relying on explicit key markers when merging', () => {
        const existed = {
            value: 84,
            leftTangent: 0,
            rightTangent: 0,
            leftTangentWeight: 0,
            rightTangentWeight: 0,
            interpolationMode: 0,
            tangentWeightMode: 0,
            easingMethod: 0,
            __editorExtras__: { tangentMode: 0 },
        };

        expect(createMergedRealCurveValue(84, existed, { broken: true })).toMatchObject({
            value: 84,
            leftTangent: 0,
            rightTangent: 0,
            leftTangentWeight: 0,
            rightTangentWeight: 0,
            interpolationMode: 0,
            tangentWeightMode: 0,
            easingMethod: 0,
            __editorExtras__: {
                tangentMode: 0,
                broken: true,
            },
        });
        expect(dumpRealKeyData(createMergedRealCurveValue(84, existed, { broken: true }))).toEqual({
            broken: true,
        });
    });
});
