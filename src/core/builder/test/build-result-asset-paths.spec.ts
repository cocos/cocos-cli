import { join } from 'path';
import { Bundle } from '../worker/builder/asset-handler/bundle/bundle';
import { BuildResult } from '../worker/builder/manager/build-result';

const mockAssets = new Map<string, any>();

jest.mock('@cocos/asset-db', () => ({ Asset: class {}, VirtualAsset: class {} }));
jest.mock('cc/editor/serialization', () => ({}), { virtual: true });
jest.mock('../worker/builder/manager/asset-library', () => ({
    buildAssetLibrary: { getAsset: (uuid: string) => mockAssets.get(uuid) },
}));
jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: { queryAssetProperty: (asset: { type: string }) => asset.type },
}));
jest.mock('../worker/builder/utils', () => ({
    getBuildPath: () => 'build',
    getResImportPath: (dest: string, uuid: string, ext = '.json') =>
        require('path').join(dest, 'import', uuid.slice(0, 2), uuid + ext),
}));
jest.mock('../worker/builder/utils/bundle', () => ({}));
jest.mock('../worker/builder/utils/zip', () => ({}));
jest.mock('../share/bundle-utils', () => ({
    BundleCompressionTypes: { NONE: 'none' },
    BuiltinBundleName: { MAIN: 'main', INTERNAL: 'internal' },
}));
jest.mock('../share/builder-config', () => ({ __esModule: true, default: {} }));
jest.mock('../../base/utils', () => ({ __esModule: true, default: {} }));
jest.mock('../../base/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

describe('BuildResult asset paths', () => {
    const uuid = '7af2c8c7-541b-404d-8a71-f0f933975e05';

    beforeEach(() => mockAssets.clear());

    function createBundle(name = 'main') {
        return new Bundle({
            name,
            root: '',
            dest: join('build', 'assets', name),
            scriptDest: join('build', 'assets', name, 'index.js'),
            compressionType: 'none',
        } as any);
    }

    function scriptAsset(importer: string) {
        const asset = {
            uuid,
            type: 'cc.Script',
            url: `db://assets/model.${importer === 'typescript' ? 'ts' : 'js'}`,
            meta: { importer, files: ['.json'], userData: {} },
        };
        mockAssets.set(uuid, asset);
        return asset;
    }

    function resultFor(...bundles: Bundle[]) {
        return new BuildResult({ bundleManager: { bundles }, result: { settings: {} } } as any);
    }

    it.each(['typescript', 'javascript'])('reports only module output for an unreferenced %s script', (importer) => {
        const bundle = createBundle();
        bundle.addScript(scriptAsset(importer) as any);
        const result = resultFor(bundle);

        expect(result.getImportAssetPaths(uuid)).toEqual([]);
        expect(result.getAssetPathInfo(uuid)).toEqual([{ bundleName: 'main', raw: [bundle.scriptDest] }]);
    });

    it.each(['typescript', 'javascript'])('keeps standalone reference JSON paths for %s scripts', (importer) => {
        const bundle = createBundle();
        bundle.addScript(scriptAsset(importer) as any);
        bundle.addAssetWithUuid(uuid);
        bundle.assetVer.import[uuid] = 'abcde';
        const path = join(bundle.dest, 'import', uuid.slice(0, 2), `${uuid}.abcde.json`);
        const info = { bundleName: 'main', import: path, json: path };
        const result = resultFor(bundle);

        expect(result.getImportAssetPaths(uuid)).toEqual([info]);
        expect(result.getAssetPathInfo(uuid)).toEqual([{ ...info, raw: [bundle.scriptDest] }]);
    });

    it.each(['typescript', 'javascript'])('keeps packed reference JSON paths for %s scripts', (importer) => {
        const bundle = createBundle();
        bundle.addScript(scriptAsset(importer) as any);
        bundle.addAssetWithUuid(uuid);
        const pack = '0f11396ff';
        bundle.addGroup('NORMAL', ['scene-uuid', uuid], pack);
        const path = join(bundle.dest, 'import', '0f', `${pack}.json`);
        const info = { bundleName: 'main', import: path, json: path, groupIndex: 1 };
        const result = resultFor(bundle);

        expect(result.getImportAssetPaths(uuid)).toEqual([info]);
        expect(result.getAssetPathInfo(uuid)).toEqual([{ ...info, raw: [bundle.scriptDest] }]);
    });

    it.each([['.json', 'cc.JsonAsset'], ['.bin', 'cc.AnimationClip']])('keeps %s paths for non-script assets', (ext, type) => {
        const bundle = createBundle();
        const asset = { uuid, type, meta: { files: [ext] } };
        mockAssets.set(uuid, asset);
        bundle.addAsset(asset as any);
        const path = join(bundle.dest, 'import', uuid.slice(0, 2), uuid + ext);
        const info = { bundleName: 'main', import: path, [ext.slice(1)]: path };
        const result = resultFor(bundle);

        expect(result.getImportAssetPaths(uuid)).toEqual([info]);
        expect(result.getAssetPathInfo(uuid)).toEqual([info]);
    });

    it('keeps reference redirects to the owning bundle', () => {
        const owner = createBundle();
        owner.addScript(scriptAsset('typescript') as any);
        owner.addAssetWithUuid(uuid);
        const source = createBundle('remote');
        source.addRedirect(uuid, owner.name);
        const result = resultFor(source);

        expect(result.getImportAssetPaths(uuid)).toEqual([{ bundleName: 'remote', redirect: 'main' }]);
        expect(result.getAssetPathInfo(uuid)).toEqual([{ bundleName: 'remote', redirect: 'main' }]);
    });
});
