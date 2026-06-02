import { BundleFilterConfig } from '../@types';

jest.mock('../../base/i18n', () => {
    const mock = {
        t(key: string) { return key; },
        transI18nName(name: string) { return name; },
        setLanguage() {},
        registerLanguagePatch() {},
        _lang: 'en',
    };
    return { __esModule: true, default: mock };
});

jest.mock('../share/builder-config', () => ({
    __esModule: true,
    default: { projectTempDir: '/tmp/test', commonOptionConfigs: {} },
}));

jest.mock('../share/texture-compress', () => ({
    configGroups: {},
}));

jest.mock('../../configuration', () => ({
    configurationRegistry: { register: jest.fn() },
}));

jest.mock('../../../global', () => ({
    GlobalPaths: { workspace: '/tmp/test-workspace' },
}));

// Mock assetManager
const mockQueryAsset = jest.fn();
const mockQueryAssets = jest.fn();
const mockQueryAssetProperty = jest.fn();
const mockQueryAssetInfo = jest.fn();
const mockQueryAssetMeta = jest.fn();
const mockQueryAssetDependencies = jest.fn();
const mockQueryAssetUsers = jest.fn();
const mockUrl2uuid = jest.fn();

jest.mock('../../assets/manager/asset', () => ({
    __esModule: true,
    default: {
        queryAsset: (...args: any[]) => mockQueryAsset(...args),
        queryAssets: (...args: any[]) => mockQueryAssets(...args),
        queryAssetProperty: (...args: any[]) => mockQueryAssetProperty(...args),
        queryAssetInfo: (...args: any[]) => mockQueryAssetInfo(...args),
        queryAssetMeta: (...args: any[]) => mockQueryAssetMeta(...args),
        queryAssetDependencies: (...args: any[]) => mockQueryAssetDependencies(...args),
        queryAssetUsers: (...args: any[]) => mockQueryAssetUsers(...args),
        url2uuid: (...args: any[]) => mockUrl2uuid(...args),
    },
}));

// Mock assetDBManager
jest.mock('../../assets/manager/asset-db', () => ({
    __esModule: true,
    default: { assetDBMap: {} },
}));

// Mock cc modules
jest.mock('cc', () => ({
    deserialize: jest.fn(),
    EffectAsset: class {},
    Asset: class {},
    SceneAsset: class {},
    LightComponent: class {},
    Node: class {},
}));

jest.mock('cc/editor/serialization', () => ({
    CCON: class {},
}));

function makeAsset(uuid: string, url: string, subAssets?: Record<string, any>, userData?: any) {
    return {
        uuid,
        url,
        source: url,
        library: `/tmp/library/${uuid}`,
        invalid: false,
        subAssets: subAssets || {},
        meta: {
            files: ['.json'],
            userData: userData || {},
        },
        isDirectory: () => false,
    };
}

describe('BuildAssetLibrary.queryAssetsInBundle', () => {
    let buildAssetLibrary: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    async function getLibrary() {
        const mod = await import('../worker/builder/manager/asset-library');
        return mod.buildAssetLibrary;
    }

    it('should return empty array when bundle asset not found', async () => {
        buildAssetLibrary = await getLibrary();
        mockQueryAsset.mockReturnValue(null);

        const result = buildAssetLibrary.queryAssetsInBundle('non-existent-uuid');
        expect(result).toEqual([]);
    });

    it('should store serialized build cache under the asset-db temp directory', async () => {
        buildAssetLibrary = await getLibrary();
        const asset = makeAsset('abcdef0123456789', 'db://assets/cache.json') as any;
        asset._assetDB = {
            options: {
                temp: 'C:/project/temp/cli/asset-db/assets',
            },
        };
        mockQueryAsset.mockReturnValue(asset);

        const result = buildAssetLibrary.getAssetTempDirByUuid(asset.uuid).replace(/\\/g, '/');

        expect(result).toBe('C:/project/temp/cli/asset-db/assets/ab/abcdef0123456789/build1.0.1');
    });

    it('should return all asset URLs when no bundleFilterConfig', async () => {
        buildAssetLibrary = await getLibrary();

        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/myBundle', {}, {});
        const asset1 = makeAsset('asset-1', 'db://assets/myBundle/texture.png');
        const asset2 = makeAsset('asset-2', 'db://assets/myBundle/prefab.prefab');

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([asset1, asset2]);
        mockQueryAssetInfo.mockImplementation((uuid: string) => {
            const map: Record<string, any> = {
                'asset-1': { uuid: 'asset-1', url: 'db://assets/myBundle/texture.png', subAssets: {} },
                'asset-2': { uuid: 'asset-2', url: 'db://assets/myBundle/prefab.prefab', subAssets: {} },
            };
            return map[uuid];
        });

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid');

        expect(mockQueryAssets).toHaveBeenCalledWith({ pattern: 'db://assets/myBundle/**/*' });
        expect(result).toEqual([
            'db://assets/myBundle/texture.png',
            'db://assets/myBundle/prefab.prefab',
        ]);
    });

    it('should use bundleFilterConfig from asset meta when not provided', async () => {
        buildAssetLibrary = await getLibrary();

        const filterConfig: BundleFilterConfig[] = [{
            range: 'exclude',
            type: 'url',
            patchOption: { patchType: 'endWith', value: '.png' },
        }];
        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/myBundle', {}, { bundleFilterConfig: filterConfig });
        const asset1 = makeAsset('asset-1', 'db://assets/myBundle/texture.png');
        const asset2 = makeAsset('asset-2', 'db://assets/myBundle/prefab.prefab');

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([asset1, asset2]);
        mockQueryAssetInfo.mockImplementation((uuid: string) => {
            const map: Record<string, any> = {
                'asset-1': { uuid: 'asset-1', url: 'db://assets/myBundle/texture.png', subAssets: {} },
                'asset-2': { uuid: 'asset-2', url: 'db://assets/myBundle/prefab.prefab', subAssets: {} },
            };
            return map[uuid];
        });

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid');

        expect(result).toEqual(['db://assets/myBundle/prefab.prefab']);
    });

    it('should prefer externally provided bundleFilterConfig over asset meta', async () => {
        buildAssetLibrary = await getLibrary();

        const metaConfig: BundleFilterConfig[] = [{
            range: 'exclude',
            type: 'url',
            patchOption: { patchType: 'endWith', value: '.png' },
        }];
        const externalConfig: BundleFilterConfig[] = [{
            range: 'exclude',
            type: 'url',
            patchOption: { patchType: 'endWith', value: '.prefab' },
        }];
        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/myBundle', {}, { bundleFilterConfig: metaConfig });
        const asset1 = makeAsset('asset-1', 'db://assets/myBundle/texture.png');
        const asset2 = makeAsset('asset-2', 'db://assets/myBundle/prefab.prefab');

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([asset1, asset2]);
        mockQueryAssetInfo.mockImplementation((uuid: string) => {
            const map: Record<string, any> = {
                'asset-1': { uuid: 'asset-1', url: 'db://assets/myBundle/texture.png', subAssets: {} },
                'asset-2': { uuid: 'asset-2', url: 'db://assets/myBundle/prefab.prefab', subAssets: {} },
            };
            return map[uuid];
        });

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid', externalConfig);

        expect(result).toEqual(['db://assets/myBundle/texture.png']);
    });

    it('should include sub-assets in results', async () => {
        buildAssetLibrary = await getLibrary();

        const subAsset = makeAsset('sub-asset-1', 'db://assets/myBundle/image@spriteFrame');
        const asset1 = makeAsset('asset-1', 'db://assets/myBundle/image.png', { spriteFrame: subAsset });

        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/myBundle', {}, {});

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([asset1]);
        mockQueryAssetInfo.mockImplementation((uuid: string) => {
            const map: Record<string, any> = {
                'asset-1': { uuid: 'asset-1', url: 'db://assets/myBundle/image.png', subAssets: {} },
                'sub-asset-1': { uuid: 'sub-asset-1', url: 'db://assets/myBundle/image@spriteFrame', subAssets: {} },
            };
            return map[uuid];
        });

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid');

        expect(result).toContain('db://assets/myBundle/image.png');
        expect(result).toContain('db://assets/myBundle/image@spriteFrame');
        expect(result).toHaveLength(2);
    });

    it('should filter with include config', async () => {
        buildAssetLibrary = await getLibrary();

        const filterConfig: BundleFilterConfig[] = [{
            range: 'include',
            type: 'url',
            patchOption: { patchType: 'endWith', value: '.prefab' },
        }];
        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/myBundle', {}, {});
        const asset1 = makeAsset('asset-1', 'db://assets/myBundle/texture.png');
        const asset2 = makeAsset('asset-2', 'db://assets/myBundle/hero.prefab');
        const asset3 = makeAsset('asset-3', 'db://assets/myBundle/data.json');

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([asset1, asset2, asset3]);
        mockQueryAssetInfo.mockImplementation((uuid: string) => {
            const map: Record<string, any> = {
                'asset-1': { uuid: 'asset-1', url: 'db://assets/myBundle/texture.png', subAssets: {} },
                'asset-2': { uuid: 'asset-2', url: 'db://assets/myBundle/hero.prefab', subAssets: {} },
                'asset-3': { uuid: 'asset-3', url: 'db://assets/myBundle/data.json', subAssets: {} },
            };
            return map[uuid];
        });

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid', filterConfig);

        expect(result).toEqual(['db://assets/myBundle/hero.prefab']);
    });

    it('should filter with glob pattern', async () => {
        buildAssetLibrary = await getLibrary();

        const filterConfig: BundleFilterConfig[] = [{
            range: 'include',
            type: 'url',
            patchOption: { patchType: 'glob', value: '**/*.png' },
        }];
        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/myBundle', {}, {});
        const asset1 = makeAsset('asset-1', 'db://assets/myBundle/bg.png');
        const asset2 = makeAsset('asset-2', 'db://assets/myBundle/hero.prefab');

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([asset1, asset2]);
        mockQueryAssetInfo.mockImplementation((uuid: string) => {
            const map: Record<string, any> = {
                'asset-1': { uuid: 'asset-1', url: 'db://assets/myBundle/bg.png', subAssets: {} },
                'asset-2': { uuid: 'asset-2', url: 'db://assets/myBundle/hero.prefab', subAssets: {} },
            };
            return map[uuid];
        });

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid', filterConfig);

        expect(result).toEqual(['db://assets/myBundle/bg.png']);
    });

    it('should return all assets when bundleFilterConfig is empty array', async () => {
        buildAssetLibrary = await getLibrary();

        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/myBundle', {}, {});
        const asset1 = makeAsset('asset-1', 'db://assets/myBundle/a.png');

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([asset1]);
        mockQueryAssetInfo.mockImplementation(() => ({
            uuid: 'asset-1', url: 'db://assets/myBundle/a.png', subAssets: {},
        }));

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid', []);

        expect(result).toEqual(['db://assets/myBundle/a.png']);
    });

    it('should return empty array when bundle folder has no assets', async () => {
        buildAssetLibrary = await getLibrary();

        const bundleAsset = makeAsset('bundle-uuid', 'db://assets/emptyBundle', {}, {});

        mockQueryAsset.mockReturnValue(bundleAsset);
        mockQueryAssets.mockReturnValue([]);

        const result = buildAssetLibrary.queryAssetsInBundle('bundle-uuid');

        expect(result).toEqual([]);
    });
});
