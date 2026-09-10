jest.mock('cc', () => ({
    Vec3: class Vec3 {},
    js: { getClassName: (object: object) => object.constructor.name === 'Vertex' ? 'cc.Vertex' : 'cc.Other' },
}));

import { Vec3 } from 'cc';
import { withLightProbeCoefficientType } from '../scene-process/service/dump/light-probe-metadata';

class Vertex { coefficients: Vec3[] = []; }

describe('Light probe dump metadata', () => {
    it('supplies Vec3 for legacy SH arrays without mutating engine attributes', () => {
        const attributes = Object.freeze({ default: () => [], serializable: true, visible: false });
        const owner = new Vertex();
        expect(withLightProbeCoefficientType(attributes, owner, 'coefficients')).toEqual({ ...attributes, ctor: Vec3 });
        expect(attributes).not.toHaveProperty('ctor');
    });

    it('preserves an engine-provided element constructor', () => {
        const attributes = { ctor: Vec3, serializable: true };
        expect(withLightProbeCoefficientType(attributes, new Vertex(), 'coefficients')).toBe(attributes);
    });

    it.each([
        [new Vertex(), 'position'],
        [{ coefficients: [] }, 'coefficients'],
        [null, 'coefficients'],
    ])('does not change unrelated metadata (%p, %s)', (owner, key) => {
        const attributes = { ctor: undefined, default: () => [] };
        expect(withLightProbeCoefficientType(attributes, owner, key)).toBe(attributes);
    });
});
