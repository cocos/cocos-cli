const mockTexture = class Texture2D {};
jest.mock('cc', () => ({ Texture2D: mockTexture, js: { getClassName: (value: any) => value.type } }));
import { withLightmapTextureType } from '../scene-process/service/dump/lightmap-metadata';

describe('Lightmap texture snapshot metadata', () => {
    it.each(['cc.ModelBakeSettings', 'cc.TerrainBlockLightmapInfo'])('types even cleared texture references on %s without changing engine metadata', type => {
        const attributes = Object.freeze({ default: null });
        expect(withLightmapTextureType(attributes, { type }, 'texture')).toEqual({ default: null, ctor: mockTexture });
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
