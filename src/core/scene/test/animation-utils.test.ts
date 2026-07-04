jest.mock('cc', () => ({
    Asset: class Asset {},
}));

const { Asset } = require('cc');
const { cloneValue } = require('../scene-process/service/animation/utils');

describe('animation utils', () => {
    it('deep-clones plain containers without cloning asset objects', () => {
        class SpriteAsset extends Asset {
            uuid = 'asset-uuid';
        }
        const asset = new SpriteAsset();
        const source = {
            keyframes: [{ frame: 0, value: 1 }],
            asset,
        };

        const cloned = cloneValue(source);

        expect(cloned).not.toBe(source);
        expect(cloned.keyframes).not.toBe(source.keyframes);
        expect(cloned.keyframes[0]).not.toBe(source.keyframes[0]);
        expect(cloned).toMatchObject({ keyframes: [{ frame: 0, value: 1 }] });
        expect(cloned.asset).toBe(asset);
    });

    it('deep-clones plain uuid descriptors instead of treating them as assets', () => {
        const source = {
            asset: { uuid: 'asset-uuid' },
        };

        const cloned = cloneValue(source);

        expect(cloned.asset).not.toBe(source.asset);
        expect(cloned.asset).toEqual({ uuid: 'asset-uuid' });
    });

    it('clones engine value-like objects via clone() without sharing the original reference', () => {
        class ValueLike {
            constructor(public x: number, public y: number, public z: number) {}
            clone() {
                return new ValueLike(this.x, this.y, this.z);
            }
        }
        const source = new ValueLike(1, 2, 3);

        const cloned = cloneValue(source);

        expect(cloned).not.toBe(source);
        expect(cloned).toBeInstanceOf(ValueLike);
        expect(cloned).toMatchObject({ x: 1, y: 2, z: 3 });
    });
});
