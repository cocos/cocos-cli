jest.mock('cc', () => ({
    Vec3: class Vec3 {},
    Texture2D: class Texture2D {},
    js: {
        getClassName: (value: { type?: string }) => value.type
            ?? (value.constructor.name === 'Vertex' ? 'cc.Vertex' : 'cc.Other'),
    },
}));

import { Vec3, Texture2D } from 'cc';
import { withLightProbeCoefficientType } from '../scene-process/service/dump/light-probe-metadata';
import { withLightmapTextureType } from '../scene-process/service/dump/lightmap-metadata';

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

describe('Lightmap texture snapshot metadata', () => {
    it.each(['cc.ModelBakeSettings', 'cc.TerrainBlockLightmapInfo'])('types even cleared texture references on %s without changing engine metadata', type => {
        const attributes = Object.freeze({ default: null });
        expect(withLightmapTextureType(attributes, { type }, 'texture')).toEqual({ default: null, ctor: Texture2D });
        expect(attributes).toEqual({ default: null });
    });
    it('preserves declared constructors', () => {
        const attributes = { ctor: class CustomTexture {} };
        expect(withLightmapTextureType(attributes, { type: 'cc.ModelBakeSettings' }, 'texture')).toBe(attributes);
    });
    it.each([[null, 'texture'], [{ type: 'cc.Other' }, 'texture'], [{ type: 'cc.ModelBakeSettings' }, 'uvParam']])('does not change unrelated properties (%p, %s)', (owner, key) => {
        const attributes = {};
        expect(withLightmapTextureType(attributes, owner as object | null, key as string)).toBe(attributes);
    });
});
