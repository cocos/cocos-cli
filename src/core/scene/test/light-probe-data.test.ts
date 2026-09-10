jest.mock('cc', () => ({
    Vec3: class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}
        static clone(v: { x: number; y: number; z: number }) { return new this(v.x, v.y, v.z); }
    },
}));

import { Vec3 } from 'cc';
import type { Scene } from 'cc';
import { preserveLightProbeCoefficients } from '../scene-process/service/scene/light-probe-data';

function probe(x: number, coefficient: number | null) {
    return { position: new Vec3(x, 0, 0), coefficients: coefficient === null ? [] : Array.from({ length: 9 }, (_, i) => new Vec3(coefficient + i, coefficient, coefficient)) };
}

function fixture(probes: ReturnType<typeof probe>[]) {
    const info = { data: { probes }, onProbeBakeFinished: jest.fn() };
    const scene = { globals: { lightProbeInfo: info } } as unknown as Scene;
    return { info, scene };
}

describe('Light probe data across scene activation', () => {
    it('preserves both groups when activation truncates then expands the probe array', () => {
        const original = Array.from({ length: 43 }, (_, i) => probe(i, i + 1));
        const { scene, info } = fixture(original.slice());
        const restore = preserveLightProbeCoefficients(scene);
        info.data.probes.length = 16;
        info.data.probes.push(...Array.from({ length: 27 }, (_, i) => probe(i + 16, 0)));
        restore(scene);
        expect(info.data.probes).toEqual(original);
        expect(info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
    });

    it('matches reordered positions and independently consumes duplicates', () => {
        const originals = [probe(1, 10), probe(1, 20), probe(2, 30)];
        const { scene, info } = fixture(originals.slice());
        const restore = preserveLightProbeCoefficients(scene);
        info.data.probes = [probe(2, 0), probe(1, 0), probe(1, 0)];
        restore(scene);
        expect(info.data.probes).toEqual([originals[2], originals[0], originals[1]]);
    });

    it('copies values before activation mutates existing vertices in place', () => {
        const { scene, info } = fixture([probe(1, 10)]);
        const restore = preserveLightProbeCoefficients(scene);
        info.data.probes[0].coefficients[0].x = 999;
        restore(scene);
        expect(info.data.probes).toEqual([probe(1, 10)]);
    });

    it('preserves cleared arrays rather than restoring zero-filled baked results', () => {
        const { scene, info } = fixture([probe(1, null), probe(2, null)]);
        const restore = preserveLightProbeCoefficients(scene);
        info.data.probes = [probe(1, 0), probe(2, 0)];
        restore(scene);
        expect(info.data.probes).toEqual([probe(1, null), probe(2, null)]);
    });

    it('does not apply a saved coefficient to a new position or excess duplicate', () => {
        const { scene, info } = fixture([probe(1, 10)]);
        const restore = preserveLightProbeCoefficients(scene);
        info.data.probes = [probe(2, 0), probe(1, 0), probe(1, 0)];
        restore(scene);
        expect(info.data.probes).toEqual([probe(2, 0), probe(1, 10), probe(1, 0)]);
    });

    it('does not write to a different scene or reapply a consumed snapshot', () => {
        const first = fixture([probe(1, 10)]);
        const second = fixture([probe(1, 0)]);
        const restore = preserveLightProbeCoefficients(first.scene);
        restore(second.scene);
        expect(second.info.data.probes).toEqual([probe(1, 0)]);
        expect(second.info.onProbeBakeFinished).not.toHaveBeenCalled();
        restore(first.scene);
        first.info.data.probes = [probe(1, null)];
        restore(first.scene);
        expect(first.info.data.probes).toEqual([probe(1, null)]);
        expect(first.info.onProbeBakeFinished).toHaveBeenCalledTimes(1);
    });

    it('leaves empty scenes and their notifications untouched', () => {
        const { scene, info } = fixture([]);
        preserveLightProbeCoefficients(scene)(scene);
        expect(info.data.probes).toEqual([]);
        expect(info.onProbeBakeFinished).not.toHaveBeenCalled();
    });
});
