import i18n from '../../base/i18n';
import { mkdtempSync, readFileSync, writeFileSync, removeSync, ensureDirSync, existsSync } from 'fs-extra';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { deflateSync, inflateSync } from 'zlib';
import { Bundle as ActualBundle } from '../worker/builder/asset-handler/bundle/bundle';
import { BundleManager } from '../worker/builder/asset-handler/bundle';
import { bundleOutputTask } from '../worker/builder/asset-handler/bundle/texture-compress';
import { TextureCompress as ActualTextureCompress } from '../worker/builder/asset-handler/texture-compress';
import { TexturePacker as ActualTexturePacker } from '../worker/builder/asset-handler/texture-packer';
import actualPacInfo = require('../worker/builder/asset-handler/texture-packer/pac-info');
import { buildAssetLibrary as actualLibrary } from '../worker/builder/manager/asset-library';
import { pluginManager as actualPlugins } from '../manager/plugin';

jest.mock('@cocos/asset-db', () => ({ Asset: class Asset {}, VirtualAsset: class VirtualAsset {} }));
jest.mock('cc', () => ({}), { virtual: true });
jest.mock('sharp', () => ({}));
jest.mock('fast-glob', () => ({}), { virtual: true });
jest.mock('../share/bundle-utils', () => ({
    BundleCompressionTypes: { NONE: 'none', MERGE_ALL_JSON: 'merge_all_json' },
    BuiltinBundleName: { MAIN: 'main', INTERNAL: 'internal', RESOURCES: 'resources', START_SCENE: 'start-scene' },
}));
jest.mock('../worker/builder/manager/asset-library', () => ({ buildAssetLibrary: { getAsset() {}, queryAssetUsers() {} } }));
jest.mock('../worker/builder/utils', () => ({ queryImageAssetFromSubAssetByUuid: (uuid: string) => uuid.split('@')[0] }));
jest.mock('../worker/builder/utils/bundle', () => ({}));
jest.mock('../worker/builder/utils/zip', () => ({}));
jest.mock('../worker/builder/utils/cconb', () => ({}));
jest.mock('../worker/builder/asset-handler/bundle/utils', () => ({ initBundleConfig: () => [] }));
jest.mock('../worker/builder/asset-handler/bundle/json-group', () => ({}));
jest.mock('../worker/builder/asset-handler/bundle/bin-group', () => ({}));
jest.mock('../worker/builder/asset-handler/texture-packer', () => ({ TexturePacker: class TexturePacker { async init() { return this; } async pack() { return []; } } }));
jest.mock('../worker/builder/asset-handler/texture-packer/pac-info', () => ({ createAssetInstance: () => [] }));
jest.mock('../worker/builder/asset-handler/texture-compress/minimaps', () => ({}));
jest.mock('../worker/builder/asset-handler/texture-compress/compress-tool', () => ({}));
jest.mock('../worker/builder/asset-handler/script', () => ({}));
jest.mock('../worker/builder/manager/asset', () => ({}));
jest.mock('../worker/builder/manager/task-base', () => ({ BuildTaskBase: class BuildTaskBase {} }));
jest.mock('../manager/plugin', () => ({ pluginManager: { getAssetHandlers: () => ({ pkgNameOrder: [] }) } }));
jest.mock('../share/utils', () => ({ formatMSTime: () => '' }));
jest.mock('../share/builder-config', () => ({ __esModule: true, default: { projectRoot: '.' } }));
jest.mock('../share/texture-compress', () => ({}));
jest.mock('../../assets/manager/asset', () => ({}));
jest.mock('../../assets/manager/query', () => ({}));
jest.mock('../../scripting', () => ({}));
jest.mock('../../base/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../../base/utils', () => ({}));
jest.mock('../../base/console', () => ({ newConsole: { trackTimeStart() {}, async trackTimeEnd() { return 0; } } }));

// Synthetic resources exercise the actual manager and compression pipeline; only
// packing, host services and the platform encoder are isolated.
const Bundle = ActualBundle as any;
const TextureCompress = ActualTextureCompress as any;
const TexturePacker = ActualTexturePacker as any;
const pacInfo = actualPacInfo as any;
const buildAssetLibrary = actualLibrary as any;
const pluginManager = actualPlugins as any;

describe('packImage original-image compression retention', () => {
    const image = 'b07096ed-c802-430d-a3e0-bf8afe7f16fc';
    const texture = `${image}@6c48a`;
    const frame = `${image}@f9941`;
    const staticKeys = ['allTextureCompressConfig', 'userCompressConfig', 'compressCacheDir', 'storedCompressInfoPath', 'storedCompressInfo'];
    let directory: string;
    let restore: () => void;
    let warnings: unknown[];

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'cli-atlas-compression-'));
        warnings = [];
        const originalWarn = console.warn;
        const statics = staticKeys.map((key) => TextureCompress[key]);
        const methods = [buildAssetLibrary.getAsset, buildAssetLibrary.queryAssetUsers, TexturePacker.prototype.init, TexturePacker.prototype.pack, pacInfo.createAssetInstance, pluginManager.getAssetHandlers];
        const originalCc = (globalThis as any).cc;
        restore = () => {
            console.warn = originalWarn;
            staticKeys.forEach((key, index) => { TextureCompress[key] = statics[index]; });
            [buildAssetLibrary.getAsset, buildAssetLibrary.queryAssetUsers, TexturePacker.prototype.init, TexturePacker.prototype.pack, pacInfo.createAssetInstance, pluginManager.getAssetHandlers] = methods;
            if (originalCc === undefined) { delete (globalThis as any).cc; } else { (globalThis as any).cc = originalCc; }
        };
        (globalThis as any).cc = originalCc && originalCc.Texture2D ? originalCc : { ...originalCc, Texture2D: { PixelFormat: {} } };
        console.warn = (message: unknown) => { warnings.push(message); };
        TextureCompress.allTextureCompressConfig = { textureFormatConfigs: { deflate: { suffix: '.deflate' } }, formatsInfo: { deflate: { formatType: 'deflate' } } };
        TextureCompress.userCompressConfig = { customConfigs: {} };
        TextureCompress.compressCacheDir = join(directory, 'compress-cache');
        TextureCompress.storedCompressInfoPath = join(directory, 'compress-info.json');
        TextureCompress.storedCompressInfo = {};
        buildAssetLibrary.getAsset = (uuid: string) => ({ uuid, meta: { userData: {} } });
        TexturePacker.prototype.init = async function(this: any) { return this; };
        pacInfo.createAssetInstance = () => [];
        pluginManager.getAssetHandlers = () => ({ pkgNameOrder: [] });
    });

    afterEach(() => {
        restore();
        removeSync(directory);
    });

    [
        { name: 'retain texture and image', removeTexture: false, removeImage: false },
        { name: 'prune texture but retain image', removeTexture: true, removeImage: false },
        { name: 'retained texture protects its image', removeTexture: false, removeImage: true },
        { name: 'prune texture and image', removeTexture: true, removeImage: true },
        { name: 'explicit texture reference protects originals', removeTexture: true, removeImage: true, textureUser: true },
        { name: 'explicit image reference protects its image', removeTexture: true, removeImage: true, imageUser: true },
    ].forEach((options: any) => {
        it(`${options.name}: keeps jobs, native output and suffixes consistent and reuses the cache`, async () => {
            const pixels = Buffer.from('original-image-data');
            const imagePath = join(directory, 'original.png');
            const atlasPath = join(directory, 'atlas.png');
            writeFileSync(imagePath, pixels);
            writeFileSync(atlasPath, 'atlas-native-data');
            const sprite = { uuid: frame, textureUuid: texture, imageUuid: image };
            const packResult = {
                uuid: 'atlas-id', path: 'db://assets/gbundle/lang.pac',
                spriteFrames: [{ _uuid: frame }], spriteFrameInfos: [sprite],
                packOptions: { removeTextureInBundle: options.removeTexture, removeImageInBundle: options.removeImage, removeSpriteAtlasInBundle: true },
                result: { atlases: [{ imageUuid: 'packed-image', textureUuid: 'packed-texture', imagePath: atlasPath, spriteFrameInfos: [sprite] }] },
            };
            TexturePacker.prototype.pack = async () => [packResult];
            buildAssetLibrary.queryAssetUsers = async (uuid: string) => {
                if (uuid === texture) { return options.textureUser ? [frame, 'material'] : [frame]; }
                if (uuid === image) { return options.imageUser ? [texture, 'image-user'] : [texture]; }
                return [];
            };
            const keepTexture = !options.removeTexture || !!options.textureUser;
            const keepImage = !options.removeImage || keepTexture || !!options.imageUser;
            const encoded: string[] = [];
            // Use the real queue on the first run and its compression cache on the second run.
            for (const useCache of [false, true]) {
                const main = new Bundle({ name: 'main', root: '', priority: 7, dest: join(directory, 'main'), compressionType: 'none' });
                const source = new Bundle({ name: 'gbundle', root: 'db://assets/gbundle', priority: 6, dest: join(directory, 'gbundle'), compressionType: 'none' });
                for (const uuid of [image, texture, frame]) {
                    main.addAssetWithUuid(uuid);
                    source.addRedirect(uuid, 'main');
                    source._rootAssets.add(uuid);
                }
                source.addAssetWithUuid('atlas-id');
                const compress = new TextureCompress('web-mobile', useCache);
                const task = compress.addTask(image, { src: imagePath, mtime: 1, compressOptions: { deflate: {} } });
                main.compressTask[image] = task;
                // Replace only the platform encoder; use the real queue, cache, result tracking and Bundle output.
                compress.executeCompressQueue = async function(this: any) {
                    for (const config of this._waitingCompressQueue) {
                        ensureDirSync(dirname(config.dest));
                        writeFileSync(config.dest, deflateSync(readFileSync(config.src)));
                        encoded.push(config.uuid);
                    }
                };
                const instance: any = {};
                const cache = { addInstance() {}, getInstance: async () => instance } as any;
                const manager = Object.create(BundleManager.prototype);
                Object.assign(manager, { options: { buildBundleOnly: false }, _pacAssets: ['atlas-id'], bundles: [main, source], cache, imageCompressManager: compress, updateProcess() {} });
                const previousWarnings = warnings.length;
                await manager.packImage();
                const retentionWarning = i18n.t('builder.warn.retained_originals_with_atlas', { info: `{asset(${packResult.path})}` });
                const retainedByOptions = (!options.removeTexture && !options.textureUser) || (!options.removeImage && !keepTexture && !options.imageUser);
                const matches = warnings.slice(previousWarnings).filter((message) => message === retentionWarning);
                expect(matches.length).toBe(retainedByOptions ? 1 : 0);
                expect(main.assets.includes(texture)).toBe(keepTexture);
                expect(main.assets.includes(image)).toBe(keepImage);
                expect(!!compress.queryTask(image)).toBe(keepImage);
                expect(source.redirect[image]).toBe(keepImage ? 'main' : undefined);
                await compress.run();
                await bundleOutputTask(main, cache);
                const output = join(main.dest, 'native', image.slice(0, 2), `${image}.deflate`);
                expect(existsSync(output)).toBe(keepImage);
                if (keepImage) {
                    expect(main.compressTask[image]).toBe(task);
                    expect(main.compressRes[image]).toEqual([output]);
                    expect(instance._exportedExts).toEqual(['.deflate']);
                    expect(inflateSync(readFileSync(output))).toEqual(pixels);
                } else {
                    expect(main.compressTask[image]).toBeUndefined();
                    expect(instance._exportedExts).toBeUndefined();
                }
            }
            expect(encoded).toEqual(keepImage ? [image] : []);
        });
    });
});
