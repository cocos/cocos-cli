export {};

const mockQueryUUID = jest.fn();
const mockQueryAsset = jest.fn();
const mockQueryPath = jest.fn();
const mockQueryUrl = jest.fn();
const mockAssetDBMap: Record<string, any> = {};

jest.mock('@cocos/asset-db', () => ({
    queryUUID: (...args: any[]) => mockQueryUUID(...args),
    queryAsset: (...args: any[]) => mockQueryAsset(...args),
    VirtualAsset: class {},
    AssetDB: class {},
    Asset: class {},
    forEach: jest.fn(),
    queryPath: (...args: any[]) => mockQueryPath(...args),
    queryUrl: (...args: any[]) => mockQueryUrl(...args),
    Utils: {
        nameToId: (value: string) => value,
    },
}));

jest.mock('../manager/asset-db', () => ({
    __esModule: true,
    default: {
        assetDBInfo: {
            assets: {
                name: 'assets',
                target: 'D:/project/assets',
                readonly: false,
                temp: 'D:/project/temp/assets',
                library: 'D:/project/library',
                level: 0,
                globList: [],
                ignoreFiles: [],
                visible: true,
                state: 'none',
                preImportExtList: [],
            },
        },
        assetDBMap: mockAssetDBMap,
        path2url: jest.fn(),
    },
}));

jest.mock('../manager/asset-handler', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../manager/filesystem', () => ({
    removeAssetSource: jest.fn(),
}));

jest.mock('../asset-config', () => ({
    __esModule: true,
    default: {
        data: {
            root: 'D:/project',
        },
    },
}));

jest.mock('../../scripting', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        t: (key: string) => key,
    },
}));

describe('asset query path normalization', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        Object.keys(mockAssetDBMap).forEach((key) => delete mockAssetDBMap[key]);
        mockAssetDBMap.assets = {
            options: {
                name: 'assets',
                target: 'D:/project/assets',
            },
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('queryAssetInfo should normalize a database-name relative asset path', () => {
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;
        const assetInfo = {
            url: 'db://assets/resources/Image/snake_head.png',
        };

        mockQueryUUID.mockReturnValue('snake-head-uuid');
        mockQueryAsset.mockReturnValue({
            uuid: 'snake-head-uuid',
            isDirectory: () => false,
        });
        const queryByUUID = jest.spyOn(assetQuery, 'queryAssetInfoByUUID').mockReturnValue(assetInfo as any);

        const result = assetQuery.queryAssetInfo('assets/resources/Image/snake_head.png');

        expect(mockQueryUUID).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(queryByUUID).toHaveBeenCalledWith('snake-head-uuid', undefined);
        expect(result).toBe(assetInfo);
    });

    it('queryPath should normalize a database-name relative asset path', () => {
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;

        mockQueryUUID.mockReturnValue('gem-red-uuid');
        mockQueryAsset.mockReturnValue({
            uuid: 'gem-red-uuid',
            isDirectory: () => false,
        });
        mockQueryPath.mockReturnValue('D:/project/assets/resources/Image/gem_red.png');

        const result = assetQuery.queryPath('assets/resources/Image/gem_red.png');

        expect(mockQueryUUID).toHaveBeenCalledWith('db://assets/resources/Image/gem_red.png');
        expect(mockQueryPath).toHaveBeenCalledWith('gem-red-uuid');
        expect(result).toBe('D:/project/assets/resources/Image/gem_red.png');
    });

    it('queryUrl should normalize a Windows absolute asset path with a differently cased drive letter', () => {
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;

        const result = assetQuery.queryUrl('d:\\project\\assets\\extended\\clip-settings\\baseline.scene');

        expect(result).toBe('db://assets/extended/clip-settings/baseline.scene');
        expect(mockQueryUrl).not.toHaveBeenCalled();
    });

    it('queryUrl should normalize mixed separators in an absolute asset path', () => {
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;

        const result = assetQuery.queryUrl('d:/project/assets\\extended/clip-settings\\baseline.scene');

        expect(result).toBe('db://assets/extended/clip-settings/baseline.scene');
        expect(mockQueryUrl).not.toHaveBeenCalled();
    });

    it('queryUrl should not resolve a path for a database that is configured but not registered', () => {
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;
        const target = 'd:\\project\\assets\\extended\\clip-settings\\baseline.scene';

        delete mockAssetDBMap.assets;
        mockQueryUrl.mockReturnValue('');

        expect(assetQuery.queryUrl(target)).toBe('');
        expect(mockQueryUrl).toHaveBeenCalledWith(target);
    });

    it('queryUrl should not treat a similarly prefixed external directory as part of the asset database', () => {
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;
        const externalPath = 'D:\\project\\assets-copy\\baseline.scene';

        mockQueryUrl.mockReturnValue('');

        expect(assetQuery.queryUrl(externalPath)).toBe('');
        expect(mockQueryUrl).toHaveBeenCalledWith(externalPath);
    });

    it('queryUrl should preserve the existing UUID fallback', () => {
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;

        mockQueryUrl.mockReturnValue('db://assets/scenes/Game.scene');

        expect(assetQuery.queryUrl('scene-uuid')).toBe('db://assets/scenes/Game.scene');
        expect(mockQueryUrl).toHaveBeenCalledWith('scene-uuid');
    });
});
