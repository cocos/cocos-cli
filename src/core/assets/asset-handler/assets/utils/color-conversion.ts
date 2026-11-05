// Quantize linear color to the nearest 8-bit sRGB value for offline asset data.
const linearValues = Array.from({ length: 256 }, (_, byte) => {
    const value = byte / 255;
    return value < 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});
export function linearToSrgb8Bit(value: number): number {
    if (value <= 0) return 0;
    if (value >= 1) return 255;
    let low = 0;
    let high = 255;
    while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (linearValues[middle] <= value) low = middle;
        else high = middle;
    }
    return value - linearValues[low] <= linearValues[high] - value ? low : high;
}
