import { validLightmapUV } from '../scene-process/service/baking/lightfx/lightmap-uv';

describe('Lightmap export UV validation', () => {
    it.each([
        [null, 3, false], [[0, 0], 3, false], [[0, NaN], 1, false], [[Infinity, 0], 1, false],
        [[0, 0, 1, 0, 0, 1], 3, true], [new Float32Array([0, 1]), 1, true], [[], 0, false],
    ])('validates UV1 %p for %p vertices', (uv, count, expected) => {
        expect(validLightmapUV(uv as number[] | null, count as number)).toBe(expected);
    });
});
