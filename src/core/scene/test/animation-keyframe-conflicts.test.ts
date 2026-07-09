jest.mock('cc', () => ({
    Asset: class Asset {},
    deserialize: (value: unknown) => value,
    editorExtrasTag: '__editorExtras__',
    js: {
        getClassByName: jest.fn(),
    },
}));

import {
    copyAuxKey,
    moveAuxKeys,
    renameAuxiliaryCurve,
} from '../scene-process/service/animation/auxiliary-curve';
import { moveCurveKeys } from '../scene-process/service/animation/property-curve-keyframe';

class FakeCurve {
    constructor(private _keyframes: Array<[number, unknown]>) {}

    keyframes() {
        return this._keyframes;
    }

    assignSorted(keyframes: Array<[number, unknown]>) {
        this._keyframes = keyframes;
    }

    indexOfKeyframe(time: number) {
        return this._keyframes.findIndex(([keyTime]) => Math.abs(keyTime - time) <= 1e-6);
    }

    removeKeyframe(index: number) {
        this._keyframes.splice(index, 1);
    }

    getKeyframeValue(index: number) {
        return this._keyframes[index]?.[1];
    }
}

function createClip(curves: Record<string, FakeCurve>, sample = 30) {
    return {
        sample,
        _auxiliaryCurveEntries: Object.entries(curves).map(([name, curve]) => ({ name, curve })),
        getAuxiliaryCurve_experimental(name: string) {
            return this._auxiliaryCurveEntries.find((entry) => entry.name === name)?.curve || null;
        },
        getAuxiliaryCurveNames_experimental() {
            return this._auxiliaryCurveEntries.map((entry) => entry.name);
        },
        hasAuxiliaryCurve_experimental(name: string) {
            return this._auxiliaryCurveEntries.some((entry) => entry.name === name);
        },
        renameAuxiliaryCurve_experimental(name: string, newName: string) {
            const entry = this._auxiliaryCurveEntries.find((item) => item.name === name);
            if (entry) {
                entry.name = newName;
            }
        },
    };
}

describe('animation keyframe conflict handling', () => {
    it('copyAuxKey clones the source value before replacing an earlier target frame', () => {
        const curve = new FakeCurve([[0, 0], [1, 30]]);
        const clip = createClip({ BlendWeight: curve });

        expect(copyAuxKey(clip as any, 'BlendWeight', 30, 0)).toBe(true);

        expect(curve.keyframes()).toEqual([[0, 30], [1, 30]]);
    });

    it('moveAuxKeys replaces existing target-frame keys instead of leaving duplicates', () => {
        const curve = new FakeCurve([[0, 0], [1, 30]]);
        const clip = createClip({ BlendWeight: curve });

        expect(moveAuxKeys(clip as any, 'BlendWeight', [30], -30)).toBe(true);

        expect(curve.keyframes()).toEqual([[0, 30]]);
    });

    it('moveCurveKeys replaces existing target-frame keys instead of leaving duplicates', () => {
        const curve = new FakeCurve([[0, 0], [1, 30]]);
        const clip = { sample: 30 };

        expect(moveCurveKeys(clip as any, curve as any, [30], -30)).toBe(true);

        expect(curve.keyframes()).toEqual([[0, 30]]);
    });

    it('renameAuxiliaryCurve rejects duplicate target names without mutating the clip', () => {
        const clip = createClip({
            BlendWeight: new FakeCurve([]),
            ExistingWeight: new FakeCurve([]),
        });

        expect(renameAuxiliaryCurve(clip as any, 'BlendWeight', 'ExistingWeight')).toBe(false);

        expect(clip.getAuxiliaryCurveNames_experimental()).toEqual(['BlendWeight', 'ExistingWeight']);
    });
});
