// LightFX allocates giSamples² × 64 × 5 Vec2 entries using signed 32-bit arithmetic.
// This is an overflow boundary, not a memory/performance recommendation.
export const MAX_LIGHTMAP_GI_SAMPLES = Math.floor(Math.sqrt(0x7fffffff / (64 * 5)));

/** Reject unsafe Lightmap input without silently changing the requested quality. */
export function validateLightmapGISamples(value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > MAX_LIGHTMAP_GI_SAMPLES) {
        throw new RangeError(`Lightmap GI Samples must be an integer between 1 and ${MAX_LIGHTMAP_GI_SAMPLES}. Higher values overflow the native LightFX sample buffer. Reduce GI Samples and bake again.`);
    }
}
