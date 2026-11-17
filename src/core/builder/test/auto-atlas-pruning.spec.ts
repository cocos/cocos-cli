import type { IAtlasInfo, IBundle, IPacInfo } from '../@types/protected';
import { pruneOriginalAssetsInPac } from '../worker/builder/asset-handler/bundle/pac-pruning';

const image = 'original-image';
const texture = `${image}@texture`;
const frame = `${image}@spriteFrame`;

// The fixture starts after shared-asset analysis: main stores the originals,
// while the source bundle's addressable records redirect to main.
function sharedBundles(ownerOutput = true) {
    function bundle(name: string, root: string, output: boolean, redirect: Record<string, string>) {
        const assets = new Set([image, texture, frame, 'atlas-image', 'atlas-texture']);
        const roots = new Set([image, texture, frame]);
        return {
            name, root, output, redirect, assets, roots,
            containsAsset(uuid: string) { return assets.has(uuid); },
            getRedirect(uuid: string) { return this.redirect[uuid]; },
            removeAsset(uuid: string) {
                assets.delete(uuid);
                roots.delete(uuid);
                delete this.redirect[uuid];
            },
        };
    }
    return [
        bundle('main', '', true, {}),
        bundle('gbundle', 'db://assets/gbundle', ownerOutput, { [image]: 'main', [texture]: 'main', [frame]: 'main' }),
    ];
}

function prune(
    bundles: ReturnType<typeof sharedBundles>,
    removeTextureInBundle: boolean,
    removeImageInBundle: boolean,
    dependedAssets: Record<string, string[]> = {},
    atlasPath = 'db://assets/gbundle/language/lang.pac',
) {
    const removeImageTask = jest.fn();
    pruneOriginalAssetsInPac(
        bundles as unknown as IBundle[],
        { spriteFrameInfos: [{ uuid: frame, imageUuid: image, textureUuid: texture }] } as IAtlasInfo,
        { path: atlasPath, packOptions: { removeTextureInBundle, removeImageInBundle } } as IPacInfo,
        dependedAssets,
        removeImageTask,
    );
    return removeImageTask;
}

describe('auto-atlas original assets across shared bundles', () => {
    it('reports package growth only for originals retained by options inside an output asset bundle', () => {
        [
            { path: 'db://assets/gbundle/lang.pac', expected: true },
            { path: 'db://assets/outside/lang.pac', expected: false },
            { path: 'db://assets/gbundle-other/lang.pac', expected: false },
            { path: 'db://assets/gbundle/lang.pac', expected: false, output: false },
            { path: 'db://assets/gbundle/lang.pac', expected: false, depended: { [texture]: ['material'] } },
        ].forEach((test) => {
            const bundles = sharedBundles();
            if (test.output === false) { bundles.forEach((bundle) => { bundle.output = false; }); }
            const retainedByOptions = pruneOriginalAssetsInPac(
                bundles as unknown as IBundle[],
                { spriteFrameInfos: [{ uuid: frame, imageUuid: image, textureUuid: texture }] } as IAtlasInfo,
                { path: test.path, packOptions: { removeTextureInBundle: false, removeImageInBundle: false } } as IPacInfo,
                test.depended || {},
            );
            expect(retainedByOptions).toBe(test.expected);
        });
    });

    it.each([false, true])('retains the original texture and its image when texture pruning is disabled (image pruning: %s)', (removeImage) => {
        const bundles = sharedBundles();
        const removeTask = prune(bundles, false, removeImage);
        expect(bundles[0].assets.has(texture)).toBe(true);
        expect(bundles[0].assets.has(image)).toBe(true);
        expect(bundles[1].redirect).toEqual({ [image]: 'main', [texture]: 'main', [frame]: 'main' });
        expect(removeTask).not.toHaveBeenCalled();
    });

    it('removes pruned originals from the owner, redirected records and directory roots', () => {
        const bundles = sharedBundles();
        const removeTask = prune(bundles, true, true);
        for (const bundle of bundles) {
            expect([...bundle.assets]).toEqual([frame, 'atlas-image', 'atlas-texture']);
            expect([...bundle.roots]).toEqual([frame]);
        }
        expect(bundles[1].redirect).toEqual({ [frame]: 'main' });
        expect(removeTask).toHaveBeenCalledTimes(1);
        expect(removeTask).toHaveBeenCalledWith(image);
    });

    it('retains the original image when only texture pruning is enabled', () => {
        const bundles = sharedBundles();
        const removeTask = prune(bundles, true, false);
        expect(bundles[0].assets.has(texture)).toBe(false);
        expect(bundles[0].assets.has(image)).toBe(true);
        expect(bundles[1].redirect).toEqual({ [image]: 'main', [frame]: 'main' });
        expect(removeTask).not.toHaveBeenCalled();
    });

    it('keeps explicitly referenced original textures and their images despite pruning options', () => {
        const bundles = sharedBundles();
        prune(bundles, true, true, { [texture]: ['material'] });
        expect(bundles[0].assets.has(texture)).toBe(true);
        expect(bundles[0].assets.has(image)).toBe(true);
        expect(bundles[1].redirect[texture]).toBe('main');
        expect(bundles[1].redirect[image]).toBe('main');
    });

    it('keeps explicitly referenced images while pruning unused textures', () => {
        const bundles = sharedBundles();
        const removeTask = prune(bundles, true, true, { [image]: ['image-user'] });
        expect(bundles[0].assets.has(texture)).toBe(false);
        expect(bundles[0].assets.has(image)).toBe(true);
        expect(bundles[1].redirect[image]).toBe('main');
        expect(removeTask).not.toHaveBeenCalled();
    });

    it('preserves an image shared by a retained texture and a pruned texture', () => {
        const bundles = sharedBundles();
        const retainedTexture = 'retained-texture';
        bundles[0].assets.add(retainedTexture);
        pruneOriginalAssetsInPac(
            bundles as unknown as IBundle[],
            { spriteFrameInfos: [
                { uuid: frame, imageUuid: image, textureUuid: texture },
                { uuid: 'other-frame', imageUuid: image, textureUuid: retainedTexture },
            ] } as IAtlasInfo,
            { path: 'db://assets/gbundle/lang.pac', packOptions: { removeTextureInBundle: true, removeImageInBundle: true } } as IPacInfo,
            { [retainedTexture]: ['material'] },
        );
        expect(bundles[0].assets.has(texture)).toBe(false);
        expect(bundles[0].assets.has(retainedTexture)).toBe(true);
        expect(bundles[0].assets.has(image)).toBe(true);
        expect(bundles[1].redirect[image]).toBe('main');
    });

    it('cleans redirects through multiple output bundles', () => {
        const bundles = sharedBundles();
        bundles.push({ ...sharedBundles()[1], name: 'remote', root: 'db://assets/remote', redirect: { [image]: 'gbundle', [texture]: 'gbundle', [frame]: 'main' } });
        prune(bundles, true, true);
        expect(bundles[2].redirect).toEqual({ [frame]: 'main' });
        expect(bundles[2].assets.has(texture)).toBe(false);
        expect(bundles[2].roots.has(image)).toBe(false);
    });

    it('does not modify bundles excluded from the output', () => {
        const bundles = sharedBundles(false);
        prune(bundles, true, true);
        expect(bundles[0].assets.has(texture)).toBe(false);
        expect(bundles[1].assets.has(texture)).toBe(true);
        expect(bundles[1].redirect[texture]).toBe('main');
    });

    it.each(['db://assets/outside/lang.pac', 'db://assets/gbundle-other/lang.pac'])('preserves the existing pruning policy for atlases outside asset bundles: %s', (path) => {
        const bundles = sharedBundles();
        prune(bundles, false, false, {}, path);
        expect(bundles[0].assets.has(texture)).toBe(false);
        expect(bundles[0].assets.has(image)).toBe(false);
        expect(bundles[1].redirect).toEqual({ [frame]: 'main' });
    });
});
