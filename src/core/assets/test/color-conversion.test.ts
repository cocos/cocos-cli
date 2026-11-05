import { linearToSrgb8Bit } from '../asset-handler/assets/utils/color-conversion';

describe('offline sRGB color quantization', () => {
    it.each([[-1, 0], [0, 0], [1, 255], [2, 255], [0.5, 188], [0.18, 118]])('converts %s to %s', (linear, byte) => {
        expect(linearToSrgb8Bit(linear)).toBe(byte);
    });

    it('round trips all 256 encoded channel values', () => {
        for (let byte = 0; byte < 256; byte++) {
            const encoded = byte / 255;
            const linear = encoded < 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
            expect(linearToSrgb8Bit(linear)).toBe(byte);
        }
    });
});
