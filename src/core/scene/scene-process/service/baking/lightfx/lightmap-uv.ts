/** UV presence alone is insufficient: truncated or non-finite attributes cannot be exported safely. */
export function validLightmapUV(uv: ArrayLike<number> | null, vertexCount: number): boolean {
    if (!uv || !Number.isInteger(vertexCount) || vertexCount <= 0 || uv.length !== vertexCount * 2) { return false; }
    for (let index = 0; index < uv.length; index++) {
        if (!Number.isFinite(uv[index])) { return false; }
    }
    return true;
}
