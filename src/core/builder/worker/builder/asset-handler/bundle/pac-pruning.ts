import type { IAtlasInfo, IBundle, IPacInfo } from '../../../../@types/protected';

/** Apply the source atlas's retention policy before processing shared SpriteFrames. */
export function pruneOriginalAssetsInPac(
    bundles: IBundle[],
    atlas: IAtlasInfo,
    pacInfo: IPacInfo,
    dependedAssets: Record<string, string[]>,
    removeImageTask?: (uuid: string) => void,
) {
    // Sharing can move an original asset into main, whose root is empty. Its
    // output location must not override the options of the owning asset bundle.
    const atlasInBundle = bundles.some((bundle) => !!bundle.root && pacInfo.path.startsWith(bundle.root + '/'));
    const outputBundles = bundles.filter((bundle) => bundle.output);
    const shouldRemoveTexture = (uuid: string) => !dependedAssets[uuid]
        && (pacInfo.packOptions.removeTextureInBundle || !atlasInBundle);
    const retainedImages = new Set(atlas.spriteFrameInfos
        .filter((sprite) => !shouldRemoveTexture(sprite.textureUuid))
        .map((sprite) => sprite.imageUuid));
    for (const sprite of atlas.spriteFrameInfos) {
        const removeTexture = shouldRemoveTexture(sprite.textureUuid);
        // A retained original Texture2D still needs its original ImageAsset,
        // including when it is retained only by the atlas's build option.
        const removeImage = !retainedImages.has(sprite.imageUuid) && !dependedAssets[sprite.imageUuid]
            && (pacInfo.packOptions.removeImageInBundle || !atlasInBundle);

        for (const bundle of outputBundles) {
            if (removeTexture) {
                bundle.removeAsset(sprite.textureUuid);
            }
            if (removeImage) {
                bundle.removeAsset(sprite.imageUuid);
            }
        }
        if (removeImage && outputBundles.length) {
            removeImageTask?.(sprite.imageUuid);
        }
    }
}
