interface TerrainLightmapRestoreTarget {
    _lightmapInfos: readonly unknown[];
    getBlocks(): readonly { _updateLightmap(info: unknown): void }[];
}

/** Rebind existing blocks after dump restoration replaces their serialized lightmap entries. */
export function restoreTerrainLightmapBindings(component: object, dump: { type?: string; extends?: string[]; value?: object }): void {
    if ((dump.type !== 'cc.Terrain' && !dump.extends?.includes('cc.Terrain')) || !dump.value || !('_lightmapInfos' in dump.value)) return;
    const terrain = component as TerrainLightmapRestoreTarget;
    // Terrain.onRestore may retain already-built blocks. Update their references
    // and invalidate their material even when the restored array is empty.
    terrain.getBlocks().forEach((block, index) => block._updateLightmap(terrain._lightmapInfos[index] ?? null));
}
