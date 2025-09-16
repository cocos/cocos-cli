import { Constructor, Asset } from 'cc';

export function loadAssetSync<T extends Asset>(uuid: string, type: Constructor<T>): T | undefined {
    // @ts-ignore
    return EditorExtends.serialize.asAsset(uuid, type);
}
