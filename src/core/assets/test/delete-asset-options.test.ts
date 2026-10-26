export {};

const mockRemoveAssetSource = jest.fn();
const mockQueryAsset = jest.fn();
const mockEncodeAsset = jest.fn((asset) => ({ source: asset.source }));
const mockAddTask = jest.fn(async (func: Function, args: any[]) => await func(...args));

jest.mock('@cocos/asset-db', () => ({
    refresh: jest.fn(async () => 0),
    reimport: jest.fn(),
    queryUrl: jest.fn(),
    Asset: class {},
}));

jest.mock('../utils', () => ({
    url2path: jest.fn((value) => value),
    ensureOutputData: jest.fn(),
    url2uuid: jest.fn((value) => value),
    pathToDbUrlIfAssetDBPath: jest.fn((value) => value),
    dirnameForDbUrlOrPath: jest.fn((value: string) => value.replace(/[\\/][^\\/]*$/, '')),
}));

jest.mock('../manager/filesystem', () => ({
    removeAssetSource: (...args: any[]) => mockRemoveAssetSource(...args),
    moveAssetSource: jest.fn(),
    renamePath: jest.fn(),
    setFileSystemProvider: jest.fn(),
    resetFileSystemProvider: jest.fn(),
}));

jest.mock('../manager/asset-db', () => ({
    __esModule: true,
    default: {
        addTask: (func: Function, args: any[]) => mockAddTask(func, args),
        autoRefreshAssetLazy: jest.fn(),
        assetDBInfo: {},
        assetDBMap: {},
    },
}));

jest.mock('../manager/asset-handler', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../asset-config', () => ({
    __esModule: true,
    default: {
        data: {
            tempRoot: 'D:/project/temp',
            root: 'D:/project',
        },
    },
}));

jest.mock('../manager/query', () => ({
    __esModule: true,
    default: {
        queryAsset: (...args: any[]) => mockQueryAsset(...args),
        encodeAsset: (asset: any) => mockEncodeAsset(asset),
        queryUrl: jest.fn(),
        queryAssetInfo: jest.fn(),
        queryAssetInfos: jest.fn(),
    },
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        t: (key: string) => key,
    },
}));

describe('asset delete options', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removeAsset should default useTrash to true for user asset deletion', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const asset = {
            source: 'D:/project/assets/test.txt',
            _parent: null,
            _assetDB: {
                options: {
                    readonly: false,
                },
            },
            url: 'db://assets/test.txt',
        };

        mockQueryAsset.mockReturnValue(asset);
        mockRemoveAssetSource.mockResolvedValue(true);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        await assetOperation.removeAsset(asset.source);

        expect(mockRemoveAssetSource).toHaveBeenCalledWith(asset.source, { useTrash: true });
    });

    it('removeAsset should forward explicit useTrash option', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const asset = {
            source: 'D:/project/assets/test.txt',
            _parent: null,
            _assetDB: {
                options: {
                    readonly: false,
                },
            },
            url: 'db://assets/test.txt',
        };

        mockQueryAsset.mockReturnValue(asset);
        mockRemoveAssetSource.mockResolvedValue(true);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        await (assetOperation as any).removeAsset(asset.source, { useTrash: false });

        expect(mockRemoveAssetSource).toHaveBeenCalledWith(asset.source, { useTrash: false });
    });
});
