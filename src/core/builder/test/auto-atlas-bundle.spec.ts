import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAtlasInfo, IPacInfo } from '../@types/protected';
import { Bundle } from '../worker/builder/asset-handler/bundle/bundle';
import { sortBundleInPac } from '../worker/builder/asset-handler/bundle/pac';

// Isolate external services; exercise the real Bundle bookkeeping, path/config
// generation, atlas sorting and native-image copying together.
jest.mock('@cocos/asset-db', () => ({ Asset: class Asset {}, VirtualAsset: class VirtualAsset {} }));
jest.mock('fast-glob', () => ({}), { virtual: true });
jest.mock('../share/bundle-utils', () => ({
    BundleCompressionTypes: { NONE: 'none', MERGE_ALL_JSON: 'merge_all_json' },
    BuiltinBundleName: { MAIN: 'main', INTERNAL: 'internal' },
}));
jest.mock('../worker/builder/manager/asset-library', () => ({
    buildAssetLibrary: {
        getAsset: () => ({ meta: { userData: {} } }),
        getAssetInfo: (uuid: string) => ({ uuid, loadUrl: `db://assets/gbundle/${uuid}.png`, url: `db://assets/gbundle/${uuid}.png`, type: 'cc.Asset' }),
    },
}));
jest.mock('../worker/builder/utils', () => ({}));
jest.mock('../worker/builder/utils/bundle', () => ({}));
jest.mock('../worker/builder/utils/zip', () => ({}));
jest.mock('../worker/builder/utils/cconb', () => ({}));
jest.mock('../worker/builder/asset-handler/bundle/utils', () => ({ initBundleConfig: () => undefined }));
jest.mock('../../assets/manager/asset', () => ({}));
jest.mock('../../base/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../../base/utils', () => ({}));

describe('auto-atlas output after shared-asset analysis', () => {
    const originalImage = 'original-image';
    const originalTexture = 'original-texture';
    const spriteFrame = 'sprite-frame';
    const atlasId = 'auto-atlas';
    const atlasImage = 'packed-image';
    const atlasTexture = 'packed-texture';
    let directory: string;
    let oldCc: any;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'cli-atlas-'));
        oldCc = (globalThis as any).cc;
        (globalThis as any).cc = { js: { array: { fastRemove: (array: string[], value: string) => {
            const index = array.indexOf(value);
            if (index >= 0) { array.splice(index, 1); }
        } } } };
    });

    afterEach(() => {
        (globalThis as any).cc = oldCc;
        rmSync(directory, { recursive: true, force: true });
    });

    function createBundles() {
        const main = new Bundle({ name: 'main', root: '', priority: 7, dest: join(directory, 'main'), compressionType: 'none' } as any);
        const source = new Bundle({ name: 'gbundle', root: 'db://assets/gbundle', priority: 6, dest: join(directory, 'gbundle'), compressionType: 'none' } as any);
        for (const uuid of [spriteFrame, originalTexture, originalImage]) {
            main.addAssetWithUuid(uuid);
            source.addRedirect(uuid, 'main');
            source._rootAssets.add(uuid);
        }
        source.addAssetWithUuid(atlasId);
        source._rootAssets.add(atlasId);
        return [main, source];
    }

    it.each([false, true])('generates consistent paths and redirects with original pruning set to %s', async (removeOriginals) => {
        const bundles = createBundles();
        const imagePath = join(directory, 'atlas.png');
        const pixels = Buffer.from('atlas-native-output');
        writeFileSync(imagePath, pixels);
        sortBundleInPac(
            bundles,
            { imageUuid: atlasImage, textureUuid: atlasTexture, imagePath, spriteFrameInfos: [{ uuid: spriteFrame, textureUuid: originalTexture, imageUuid: originalImage }] } as IAtlasInfo,
            { uuid: atlasId, path: 'db://assets/gbundle/lang.pac', spriteFrames: [{ _uuid: spriteFrame }], packOptions: { removeTextureInBundle: removeOriginals, removeImageInBundle: removeOriginals, removeSpriteAtlasInBundle: true } } as IPacInfo,
            {},
        );
        for (const bundle of bundles) {
            bundle.initConfig();
            await bundle.initAssetPaths();
        }
        const [main, source] = bundles;
        for (const uuid of [originalTexture, originalImage]) {
            expect(main.config.uuids.includes(uuid)).toBe(!removeOriginals);
            expect(source.config.uuids.includes(uuid)).toBe(!removeOriginals);
            expect(source.config.paths[uuid] !== undefined).toBe(!removeOriginals);
            expect(source.redirect[uuid]).toBe(removeOriginals ? undefined : 'main');
        }
        for (const [uuid, owner] of Object.entries(source.redirect)) {
            const ownerBundle = bundles.find((bundle) => bundle.name === owner);
            expect(ownerBundle?.assets.includes(uuid)).toBe(true);
        }
        expect(main.config.uuids).toContain(atlasTexture);
        expect(main.config.uuids).toContain(spriteFrame);
        expect(source.config.paths[spriteFrame]).toBeDefined();
        expect(source.redirect[atlasTexture]).toBe('main');
        expect(readFileSync(join(main.dest, 'native', atlasImage.slice(0, 2), `${atlasImage}.png`))).toEqual(pixels);
    });
});
