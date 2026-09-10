import { js, Texture2D } from 'cc';

/** Keep cleared lightmap bindings in snapshots even on engines without asset type metadata. */
export function withLightmapTextureType<T extends object>(attributes: T, owner: object | null, key?: string): T | (T & { ctor: typeof Texture2D }) {
    if ((!('ctor' in attributes) || !attributes.ctor) && owner && key === 'texture') {
        const type = js.getClassName(owner);
        if (type === 'cc.ModelBakeSettings' || type === 'cc.TerrainBlockLightmapInfo') {
            return { ...attributes, ctor: Texture2D };
        }
    }
    return attributes;
}
