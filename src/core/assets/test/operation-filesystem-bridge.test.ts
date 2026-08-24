export {};

const mockCopy = jest.fn();
const mockExistsSync = jest.fn();
const mockCopyPath = jest.fn();
const mockCopyAssetSource = jest.fn();
const mockFinalizeCopy = jest.fn();
const mockRollbackCopy = jest.fn();
const mockCopyTransaction = {
    finalize: mockFinalizeCopy,
    rollback: mockRollbackCopy,
};
const mockMoveAssetSource = jest.fn();
const mockRenamePath = jest.fn();
const mockQueryAsset = jest.fn();
const mockQueryAssetInfo = jest.fn();
const mockQueryAssetInfos = jest.fn();
const mockQueryUrl = jest.fn();
const mockAssetQueryUrl = jest.fn();
const mockRefresh = jest.fn(async (_pathOrUrlOrUUID: string) => 0);
const mockReimport = jest.fn();
const mockAddTask = jest.fn(async (func: Function, args: any[]) => await func(...args));
const mockGetCreateMenuByName = jest.fn();
const mockCreateAssetByHandler = jest.fn();
const mockSaveAssetByHandler = jest.fn();
const mockGetName = jest.fn((path: string) => path);
const mockAssetTreeInfoDataKeys = ['subAssets', 'displayName', 'extends'] as const;
const { dirname, join } = require('path') as typeof import('path');

jest.mock('fs-extra', () => ({
    copy: (...args: any[]) => mockCopy(...args),
    move: jest.fn(),
    remove: jest.fn(),
    rename: jest.fn(),
    existsSync: (...args: any[]) => mockExistsSync(...args),
}));

jest.mock('@cocos/asset-db', () => ({
    refresh: (pathOrUrlOrUUID: string) => mockRefresh(pathOrUrlOrUUID),
    reimport: (...args: any[]) => mockReimport(...args),
    queryUrl: (...args: any[]) => mockQueryUrl(...args),
    Asset: class {},
}));

jest.mock('../utils', () => ({
    url2path: jest.fn((value) => {
        if (value === 'db://assets') {
            return 'D:/project/assets';
        }
        if (value.startsWith('db://assets/')) {
            return `D:/project/assets/${value.slice('db://assets/'.length)}`;
        }
        return value;
    }),
    ensureOutputData: jest.fn(),
    url2uuid: jest.fn((value) => value),
    pathToDbUrlIfAssetDBPath: jest.fn((value: string, assetDBInfo: Record<string, { name: string; target: string }>) => {
        if (!value || value.startsWith('db://')) {
            return value;
        }
        if (value.startsWith('D:/project/assets/')) {
            return `db://assets/${value.slice('D:/project/assets/'.length)}`;
        }
        if (value.startsWith('assets/') || value === 'assets') {
            return value === 'assets' ? 'db://assets' : `db://assets/${value.slice('assets/'.length)}`;
        }
        if (value === 'D:/project/assets/resources/Image' || value === 'assets/resources/Image') {
            return 'db://assets/resources/Image';
        }
        if (value === 'D:/project/assets/resources/Image/snake_head.png') {
            return 'db://assets/resources/Image/snake_head.png';
        }
        return assetDBInfo.assets && value === assetDBInfo.assets.target ? 'db://assets' : value;
    }),
    dirnameForDbUrlOrPath: jest.fn((value: string) => {
        if (value.startsWith('db://')) {
            const index = value.lastIndexOf('/');
            return index <= 'db://assets'.length ? 'db://assets' : value.slice(0, index);
        }
        return value.replace(/[\\/][^\\/]*$/, '');
    }),
}));

jest.mock('../manager/filesystem', () => ({
    copyPath: (...args: any[]) => mockCopyPath(...args),
    moveAssetSource: (...args: any[]) => mockMoveAssetSource(...args),
    renamePath: (...args: any[]) => mockRenamePath(...args),
    removeAssetSource: jest.fn(),
    setFileSystemProvider: jest.fn(),
    resetFileSystemProvider: jest.fn(),
}));

jest.mock('../manager/asset-copy', () => ({
    copyAssetSource: (...args: any[]) => mockCopyAssetSource(...args),
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
    default: {
        getCreateMenuByName: (...args: any[]) => mockGetCreateMenuByName(...args),
        createAsset: (...args: any[]) => mockCreateAssetByHandler(...args),
        saveAsset: (...args: any[]) => mockSaveAssetByHandler(...args),
    },
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
    ASSET_TREE_INFO_DATA_KEYS: mockAssetTreeInfoDataKeys,
    default: {
        queryAsset: (...args: any[]) => mockQueryAsset(...args),
        encodeAsset: jest.fn((asset) => ({ source: asset.source })),
        queryUrl: (...args: any[]) => mockAssetQueryUrl(...args),
        queryAssetInfo: (...args: any[]) => mockQueryAssetInfo(...args),
        queryAssetInfos: (...args: any[]) => mockQueryAssetInfos(...args),
    },
}));

jest.mock('../asset-handler/utils', () => ({
    mergeMeta: jest.fn(),
}));

jest.mock('../../base/utils', () => {
    const actual = jest.requireActual('../../base/utils') as typeof import('../../base/utils');
    return {
        __esModule: true,
        default: {
            ...actual.default,
            File: {
                ...actual.default.File,
                getName: (...args: [string]) => mockGetName(...args),
            },
        },
    };
});

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        t: (key: string) => key,
    },
}));

describe('asset operation filesystem bridge', () => {
    function setAssetDBInfo(target = 'D:/project/assets') {
        const assetDBManager = require('../manager/asset-db').default as typeof import('../manager/asset-db').default;
        assetDBManager.assetDBInfo.assets = {
            name: 'assets',
            target,
            readonly: false,
            temp: 'D:/project/temp/assets',
            library: 'D:/project/library',
            level: 0,
            globList: [],
            ignoreFiles: [],
            visible: true,
            state: 'none',
            preImportExtList: [],
        };
        assetDBManager.assetDBMap.assets = {
            options: {
                name: 'assets',
                target,
            },
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockCopyAssetSource.mockResolvedValue(mockCopyTransaction);
        mockFinalizeCopy.mockResolvedValue(undefined);
        mockRollbackCopy.mockResolvedValue(undefined);
        const assetDBManager = require('../manager/asset-db').default as typeof import('../manager/asset-db').default;
        Object.keys(assetDBManager.assetDBInfo).forEach((key) => delete assetDBManager.assetDBInfo[key]);
        Object.keys(assetDBManager.assetDBMap).forEach((key) => delete assetDBManager.assetDBMap[key]);
        const { pathToDbUrlIfAssetDBPath } = jest.requireActual('../asset-db-url') as typeof import('../asset-db-url');
        mockAssetQueryUrl.mockImplementation((value: string) => {
            const normalizedUrl = pathToDbUrlIfAssetDBPath(value, assetDBManager.assetDBInfo);
            const dbName = normalizedUrl.startsWith('db://')
                ? normalizedUrl.slice('db://'.length).split('/', 1)[0]
                : '';
            return dbName && assetDBManager.assetDBMap[dbName] ? normalizedUrl : '';
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('updateUserData replaces sub asset userData through composite uuid with one reimport', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const reimport = jest.fn();
        const subAsset = {
            uuid: '6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a',
            meta: {
                userData: {
                    minfilter: 'linear',
                    obsolete: true,
                },
            },
            save: jest.fn().mockResolvedValue(true),
            _assetDB: {
                reimport,
            },
        };
        mockQueryAsset.mockReturnValue(subAsset);

        const userData = {
            minfilter: 'nearest',
            wrapMode: 'clamp',
        };
        const result = await assetOperation.updateUserData(
            '6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a',
            userData,
        );

        expect(mockQueryAsset).toHaveBeenCalledWith('6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a');
        expect(subAsset.meta.userData).toEqual(userData);
        expect(subAsset.save).toHaveBeenCalledTimes(1);
        expect(reimport).toHaveBeenCalledTimes(1);
        expect(reimport).toHaveBeenCalledWith('6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a');
        expect(result).toBe(subAsset.meta.userData);
    });

    it('reimportAsset waits for a busy asset and retries the latest disk content', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const asset = {
            init: false,
            imported: true,
            invalid: false,
            source: 'D:/project/assets/Game.ts',
            waitInit: jest.fn(async () => {
                asset.init = true;
            }),
        };
        mockReimport.mockResolvedValueOnce(null).mockResolvedValueOnce(asset);
        mockQueryAsset.mockReturnValue(asset);

        const result = await assetOperation.reimportAsset('game-script-uuid');

        expect(mockReimport).toHaveBeenNthCalledWith(1, 'game-script-uuid');
        expect(asset.waitInit).toHaveBeenCalledTimes(1);
        expect(mockReimport).toHaveBeenNthCalledWith(2, 'game-script-uuid');
        expect(result).toEqual({ source: asset.source });
    });

    it('reimportAsset accepts a Windows absolute path with different casing without retrying', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const requestPath = 'g:\\Project\\Assets\\Game.ts';
        const asset = {
            init: true,
            imported: true,
            invalid: false,
            source: 'G:\\Project\\Assets\\Game.ts',
        };
        mockReimport.mockResolvedValue(asset);

        const result = await assetOperation.reimportAsset(requestPath);

        expect(mockReimport).toHaveBeenCalledTimes(1);
        expect(mockReimport).toHaveBeenCalledWith(requestPath);
        expect(mockQueryAsset).not.toHaveBeenCalled();
        expect(result).toEqual({ source: asset.source });
    });

    it('reimportAsset serializes the asset tree metadata contract', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const assetQuery = require('../manager/query').default as typeof import('../manager/query').default;
        const asset = {
            imported: true,
            invalid: false,
            source: 'D:/project/assets/Texture.png',
        };
        mockReimport.mockResolvedValue(asset);

        await assetOperation.reimportAsset('texture-uuid');

        expect(assetQuery.encodeAsset).toHaveBeenCalledWith(asset, ['subAssets', 'displayName', 'extends']);
    });

    it('reimportAsset still reports a genuinely missing asset', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        mockReimport.mockResolvedValue(null);
        mockQueryAsset.mockReturnValue(null);

        await expect(assetOperation.reimportAsset('missing-asset-uuid'))
            .rejects.toThrow('无法找到资源 missing-asset-uuid');
    });

    it('reimportAsset times out instead of waiting forever for a busy asset', async () => {
        jest.useFakeTimers();
        try {
            const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
            const asset = {
                init: false,
                waitInit: jest.fn(() => new Promise<void>(() => undefined)),
            };
            mockReimport.mockResolvedValue(null);
            mockQueryAsset.mockReturnValue(asset);

            const result = assetOperation.reimportAsset('busy-asset-uuid');
            const rejection = expect(result).rejects.toThrow(
                'Reimport asset busy-asset-uuid timed out waiting for the current import to finish'
            );
            await jest.advanceTimersByTimeAsync(10_000);

            await rejection;
            expect(asset.waitInit).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('updateUserDataByPath updates sub asset userData through composite uuid with one reimport', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const reimport = jest.fn();
        const subAsset = {
            uuid: '6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a',
            meta: {
                userData: {
                    minfilter: 'linear',
                },
            },
            save: jest.fn().mockResolvedValue(true),
            _assetDB: {
                reimport,
            },
        };
        mockQueryAsset.mockReturnValue(subAsset);

        const result = await assetOperation.updateUserDataByPath(
            '6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a',
            'minfilter',
            'nearest',
        );

        expect(mockQueryAsset).toHaveBeenCalledWith('6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a');
        expect(subAsset.meta.userData).toEqual({
            minfilter: 'nearest',
        });
        expect(subAsset.save).toHaveBeenCalledTimes(1);
        expect(reimport).toHaveBeenCalledTimes(1);
        expect(reimport).toHaveBeenCalledWith('6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a');
        expect(result).toBe(subAsset.meta.userData);
    });

    it('updateUserDataByPath rejects empty path instead of replacing complete userData', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');

        await expect(assetOperation.updateUserDataByPath(
            '6fa5fbad-0d32-4b63-95d8-24507665775c@6c48a',
            '',
            { minfilter: 'nearest' },
        )).rejects.toThrow('path must not be empty');
        expect(mockQueryAsset).not.toHaveBeenCalled();
    });

    it('renameAsset should delegate rename steps to filesystem bridge', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.txt';
        const target = join(dirname(source), 'renamed.txt');
        const temp = join(dirname(target), '.rename_temp');
        const asset = {
            source,
            _parent: null,
            isDirectory: () => false,
            _assetDB: {
                options: {
                    readonly: false,
                },
            },
            url: 'db://assets/source.txt',
        };

        mockQueryAsset.mockReturnValue(asset);
        mockExistsSync.mockImplementation((path: string) => path === source);
        mockRenamePath.mockResolvedValue(undefined);

        await assetOperation.renameAsset(source, 'renamed.txt');

        expect(mockRenamePath.mock.calls).toEqual([
            [`${source}.meta`, `${temp}.meta`],
            [source, temp],
            [`${temp}.meta`, `${target}.meta`],
            [temp, target],
        ]);
    });

    it('moveAsset should delegate source move to filesystem bridge', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.txt';
        const target = 'D:/project/assets/folder/source.txt';
        const asset = {
            source,
            _parent: null,
            isDirectory: () => false,
            _assetDB: {
                options: {
                    readonly: false,
                },
            },
            url: 'db://assets/source.txt',
        };

        mockQueryAsset.mockReturnValue(asset);
        mockQueryUrl.mockReturnValue('db://assets/folder/source.txt');
        mockExistsSync.mockReturnValue(false);
        mockMoveAssetSource.mockResolvedValue(undefined);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        await assetOperation.moveAsset(source, target);

        expect(mockMoveAssetSource).toHaveBeenCalledWith(source, target, undefined);
    });

    it('importAsset should delegate copy to filesystem bridge', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/outside/source.txt';
        const target = 'D:/project/assets/source.txt';
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/source.txt',
        };

        mockCopyPath.mockResolvedValue(undefined);
        mockQueryAssetInfo.mockReturnValue(assetInfo);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        const result = await assetOperation.importAsset(source, target, { overwrite: true });

        expect(mockCopyPath).toHaveBeenCalledWith(source, target, { overwrite: true });
        expect(mockCopy).not.toHaveBeenCalled();
        expect(result).toEqual([assetInfo]);
    });

    it('copyAsset should delegate source and meta copying and return the imported copy', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.png';
        const target = 'D:/project/assets/source-001.png';
        const sourceAsset = {
            source,
            _parent: null,
        };
        const copiedAsset = {
            source: target,
            imported: true,
            invalid: false,
        };

        setAssetDBInfo();
        mockQueryAsset.mockImplementation((value: string) => value === target ? copiedAsset : sourceAsset);
        mockExistsSync.mockImplementation((path: string) => path === source);
        mockCopyAssetSource.mockResolvedValue(mockCopyTransaction);
        jest.spyOn(assetOperation as any, '_refreshAsset').mockResolvedValue(0);

        const result = await assetOperation.copyAsset(source, target, { overwrite: true });

        expect(mockCopyAssetSource).toHaveBeenCalledWith(source, target, { overwrite: true });
        expect(mockFinalizeCopy).toHaveBeenCalledTimes(1);
        expect(mockRollbackCopy).not.toHaveBeenCalled();
        expect(result).toEqual({ source: target });
    });

    it('copyAsset should resolve a rename conflict before copying metadata', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.png';
        const requestedTarget = source;
        const renamedTarget = 'D:/project/assets/source-001.png';
        const sourceAsset = {
            source,
            _parent: null,
        };
        const copiedAsset = {
            source: renamedTarget,
            imported: true,
            invalid: false,
        };

        setAssetDBInfo();
        mockQueryAsset.mockImplementation((value: string) => value === renamedTarget ? copiedAsset : sourceAsset);
        mockExistsSync.mockImplementation((path: string) => path === source);
        mockCopyAssetSource.mockResolvedValue(mockCopyTransaction);
        jest.spyOn(assetOperation as any, '_checkOverwrite').mockReturnValue(renamedTarget);
        jest.spyOn(assetOperation as any, '_refreshAsset').mockResolvedValue(0);

        await assetOperation.copyAsset(source, requestedTarget, { rename: true });

        expect(mockCopyAssetSource).toHaveBeenCalledWith(source, renamedTarget, { rename: true });
    });

    it('copyAsset should reject replacing an AssetDB root', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/internal/source.png';
        const target = 'D:/project/assets';
        mockQueryAsset.mockReturnValue({ source, _parent: null });
        mockExistsSync.mockImplementation((path: string) => path === source || path === target);
        setAssetDBInfo(target);

        await expect(assetOperation.copyAsset(source, 'db://assets', { overwrite: true }))
            .rejects.toThrow('Cannot copy an asset over an AssetDB root');

        expect(mockCopyAssetSource).not.toHaveBeenCalled();
    });

    it('copyAsset should reject replacing an ancestor of the source asset', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const target = 'D:/project/assets/folder';
        const source = `${target}/child/source.png`;
        mockQueryAsset.mockReturnValue({ source, _parent: null });
        mockExistsSync.mockImplementation((path: string) => path === source || path === target);
        setAssetDBInfo();

        await expect(assetOperation.copyAsset(source, target, { overwrite: true }))
            .rejects.toThrow('Cannot copy an asset into or over itself');

        expect(mockCopyAssetSource).not.toHaveBeenCalled();
    });

    it('copyAsset should roll back the filesystem transaction when refresh fails', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.png';
        const target = 'D:/project/assets/source-001.png';
        const sourceAsset = {
            source,
            _parent: null,
        };

        setAssetDBInfo();
        mockQueryAsset.mockReturnValue(sourceAsset);
        mockExistsSync.mockImplementation((path: string) => path === source);
        const refresh = jest.spyOn(assetOperation as any, '_refreshAsset')
            .mockRejectedValueOnce(new Error('refresh failed'))
            .mockResolvedValueOnce(0);

        await expect(assetOperation.copyAsset(source, target, { overwrite: true })).rejects.toThrow('refresh failed');

        expect(mockRollbackCopy).toHaveBeenCalledTimes(1);
        expect(mockFinalizeCopy).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenLastCalledWith(dirname(target), false);
    });

    it('copyAsset should report backup cleanup failures', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/project/assets/source.png';
        const target = 'D:/project/assets/source-001.png';
        const sourceAsset = { source, _parent: null };
        const copiedAsset = { source: target, imported: true, invalid: false };

        setAssetDBInfo();
        mockQueryAsset.mockImplementation((value: string) => value === target ? copiedAsset : sourceAsset);
        mockExistsSync.mockImplementation((path: string) => path === source);
        mockFinalizeCopy.mockRejectedValueOnce(new Error('cleanup denied'));
        jest.spyOn(assetOperation as any, '_refreshAsset').mockResolvedValue(0);

        await expect(assetOperation.copyAsset(source, target)).rejects.toThrow('cleanup denied');

        expect(mockRollbackCopy).not.toHaveBeenCalled();
    });

    it('refreshAsset should normalize an absolute asset-db path before refreshing', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        setAssetDBInfo();

        await assetOperation.refreshAsset('D:/project/assets/resources/Image');

        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image');
    });

    it('refreshAsset should normalize a database-name relative asset path before refreshing', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        setAssetDBInfo();

        await assetOperation.refreshAsset('assets/resources/Image');

        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image');
    });

    it('importAsset should refresh an existing file in the asset DB when source and target are the same path', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const target = 'D:/project/assets/resources/Image/snake_head.png';
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/resources/Image/snake_head.png',
        };

        setAssetDBInfo();
        mockQueryAssetInfo.mockReturnValue(assetInfo);

        const result = await assetOperation.importAsset(target, target, { overwrite: true });

        expect(mockCopyPath).not.toHaveBeenCalled();
        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(mockQueryAssetInfo).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(result).toEqual([assetInfo]);
    });

    it('importAsset should copy external files to the physical target and refresh the db url', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/outside/snake_head.png';
        const target = 'D:/project/assets/resources/Image/snake_head.png';
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/resources/Image/snake_head.png',
        };

        setAssetDBInfo();
        mockCopyPath.mockResolvedValue(undefined);
        mockQueryAssetInfo.mockReturnValue(assetInfo);

        const result = await assetOperation.importAsset(source, target, { overwrite: true });

        expect(mockCopyPath).toHaveBeenCalledWith(source, target, { overwrite: true });
        expect(mockRefresh).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(mockQueryAssetInfo).toHaveBeenCalledWith('db://assets/resources/Image/snake_head.png');
        expect(result).toEqual([assetInfo]);
    });

    it('importAsset should serialize repeated rename imports before the filesystem bridge', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/outside/snake_head.png';
        const target = 'D:/project/assets/resources/Image/snake_head.png';
        const firstRenamedTarget = 'D:/project/assets/resources/Image/snake_head-001.png';
        const secondRenamedTarget = 'D:/project/assets/resources/Image/snake_head-002.png';
        const occupiedTargets = new Set([target]);
        const inFlightTargets = new Set<string>();
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/resources/Image/snake_head-001.png',
        };
        let releaseFirstCopy: () => void;
        const firstCopyCanFinish = new Promise<void>((resolve) => {
            releaseFirstCopy = resolve;
        });
        let signalFirstCopyStarted: () => void;
        const firstCopyStarted = new Promise<void>((resolve) => {
            signalFirstCopyStarted = resolve;
        });
        let copyCount = 0;

        setAssetDBInfo();
        mockExistsSync.mockImplementation((path: string) => occupiedTargets.has(path));
        mockGetName.mockImplementation(() => (
            occupiedTargets.has(firstRenamedTarget) ? secondRenamedTarget : firstRenamedTarget
        ));
        mockCopyPath.mockImplementation(async (_source: string, destination: string, options?: { overwrite?: boolean }) => {
            if (occupiedTargets.has(destination) || inFlightTargets.has(destination)) {
                throw new Error(
                    `Unable to move/copy '${source}' because target '${destination}' already exists at destination.`,
                );
            }

            inFlightTargets.add(destination);
            copyCount += 1;
            if (copyCount === 1) {
                signalFirstCopyStarted();
                await firstCopyCanFinish;
            }
            expect(options?.overwrite).not.toBe(true);
            inFlightTargets.delete(destination);
            occupiedTargets.add(destination);
        });
        mockQueryAssetInfo.mockReturnValue(assetInfo);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        const imports = Promise.all([
            assetOperation.importAsset(source, target, { rename: true }),
            assetOperation.importAsset(source, target, { rename: true }),
        ]);

        await Promise.race([
            firstCopyStarted,
            imports.catch(error => {
                throw error;
            }),
        ]);
        releaseFirstCopy!();

        await expect(imports).resolves.toEqual([[assetInfo], [assetInfo]]);
        expect(mockCopyPath.mock.calls).toEqual([
            [source, firstRenamedTarget, undefined],
            [source, secondRenamedTarget, undefined],
        ]);
    });

    it('importAsset should continue a queued same-target import after the previous one fails', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const source = 'D:/outside/snake_head.png';
        const target = 'D:/project/assets/resources/Image/snake_head.png';
        const copyError = new Error('copy failed');
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/resources/Image/snake_head.png',
        };
        let rejectFirstCopy: (error: Error) => void;
        const firstCopy = new Promise<void>((_resolve, reject) => {
            rejectFirstCopy = reject;
        });
        let signalFirstCopyStarted: () => void;
        const firstCopyStarted = new Promise<void>((resolve) => {
            signalFirstCopyStarted = resolve;
        });
        let copyCount = 0;

        setAssetDBInfo();
        mockExistsSync.mockReturnValue(false);
        mockCopyPath.mockImplementation(() => {
            copyCount += 1;
            if (copyCount === 1) {
                signalFirstCopyStarted();
                return firstCopy;
            }
            return Promise.resolve();
        });
        mockQueryAssetInfo.mockReturnValue(assetInfo);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        const firstImport = assetOperation.importAsset(source, target);
        await firstCopyStarted;
        const secondImport = assetOperation.importAsset(source, target);
        rejectFirstCopy!(copyError);

        await expect(firstImport).rejects.toThrow(copyError);
        await expect(secondImport).resolves.toEqual([assetInfo]);
        expect(copyCount).toBe(2);
    });

    it('importAsset should not serialize independent targets in the same directory', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const sourceA = 'D:/outside/a.png';
        const sourceB = 'D:/outside/b.png';
        const targetA = 'D:/project/assets/resources/Image/a.png';
        const targetB = 'D:/project/assets/resources/Image/b.png';
        const assetInfo = {
            isDirectory: false,
            url: 'db://assets/resources/Image/imported.png',
        };
        let releaseCopies: () => void;
        const copiesCanFinish = new Promise<void>((resolve) => {
            releaseCopies = resolve;
        });
        let signalFirstCopyStarted: () => void;
        const firstCopyStarted = new Promise<void>((resolve) => {
            signalFirstCopyStarted = resolve;
        });
        let copyCount = 0;

        setAssetDBInfo();
        mockExistsSync.mockReturnValue(false);
        mockCopyPath.mockImplementation(async () => {
            copyCount += 1;
            if (copyCount === 1) {
                signalFirstCopyStarted();
            }
            await copiesCanFinish;
        });
        mockQueryAssetInfo.mockReturnValue(assetInfo);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        const imports = Promise.all([
            assetOperation.importAsset(sourceA, targetA),
            assetOperation.importAsset(sourceB, targetB),
        ]);

        await firstCopyStarted;
        const copiesStartedBeforeRelease = copyCount;
        releaseCopies!();

        await expect(imports).resolves.toEqual([[assetInfo], [assetInfo]]);
        expect(copiesStartedBeforeRelease).toBe(2);
    });

    it('createAsset should accept a Windows asset path after queryUrl normalizes its drive-letter case', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const target = 'g:\\test\\PinK-Animation-Editor-QA\\assets\\extended\\clip-settings\\baseline.scene';
        const template = 'db://assets/extended/clip-settings/source.scene';
        const createdAsset = {
            source: target,
            imported: true,
            invalid: false,
        };

        setAssetDBInfo('G:\\test\\PinK-Animation-Editor-QA\\assets');
        mockCreateAssetByHandler.mockResolvedValue(target);
        mockQueryAsset.mockReturnValue(createdAsset);
        jest.spyOn(assetOperation, 'refreshAsset').mockResolvedValue(0);

        const result = await assetOperation.createAsset({ target, template });

        expect(mockAssetQueryUrl).toHaveBeenCalledWith(target);
        expect(mockCreateAssetByHandler).toHaveBeenCalledWith(expect.objectContaining({
            target,
            template,
        }));
        expect(result).toEqual({ source: target });
    });

    it('createAssetByType should resolve a database-name relative directory before creating', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        setAssetDBInfo();
        mockGetCreateMenuByName.mockResolvedValue([{
            name: 'default',
            label: 'TypeScript',
            fullFileName: 'NewComponent.ts',
            handler: 'typescript',
            template: 'typescript-template',
        }]);
        const target = join('D:/project/assets/Script', 'Food.ts');
        mockCreateAssetByHandler.mockResolvedValue(target);
        mockQueryAsset.mockReturnValue({
            source: target,
            imported: true,
            invalid: false,
        });

        await assetOperation.createAssetByType('typescript', 'assets/Script', 'Food');

        expect(mockCreateAssetByHandler).toHaveBeenCalledWith(expect.objectContaining({
            handler: 'typescript',
            target,
            template: 'typescript-template',
        }));
    });

    it('createAssetByType should not duplicate the extension when baseName already includes it', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        setAssetDBInfo();
        mockGetCreateMenuByName.mockResolvedValue([{
            name: 'default',
            label: 'TypeScript',
            fullFileName: 'NewComponent.ts',
            handler: 'typescript',
        }]);
        const target = join('D:/project/assets/Script', 'Food.ts');
        mockCreateAssetByHandler.mockResolvedValue(target);
        mockQueryAsset.mockReturnValue({
            source: target,
            imported: true,
            invalid: false,
        });

        await assetOperation.createAssetByType('typescript', 'assets/Script', 'Food.ts');

        expect(mockCreateAssetByHandler).toHaveBeenCalledWith(expect.objectContaining({
            target,
        }));
    });

    it('saveAsset should reject incomplete TypeScript content before writing', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const reimport = jest.fn();
        const asset = {
            source: 'D:/project/assets/scripts/Board.ts',
            uuid: 'script-uuid',
            imported: true,
            invalid: false,
            meta: {
                importer: 'typescript',
            },
            _assetDB: {
                options: {
                    readonly: false,
                },
                reimport,
            },
        };
        mockQueryAsset.mockReturnValue(asset);

        await expect(assetOperation.saveAsset(
            'db://assets/scripts/Board.ts',
            "import { _decorator } from 'cc';\nexport class Board {\n"
        )).rejects.toThrow('Invalid script content');

        expect(mockSaveAssetByHandler).not.toHaveBeenCalled();
        expect(reimport).not.toHaveBeenCalled();
    });

    it('saveAsset should keep valid TypeScript content writable', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const reimport = jest.fn();
        const asset = {
            source: 'D:/project/assets/scripts/Board.ts',
            uuid: 'script-uuid',
            imported: true,
            invalid: false,
            meta: {
                importer: 'typescript',
            },
            _assetDB: {
                options: {
                    readonly: false,
                },
                reimport,
            },
        };
        const content = "import { _decorator } from 'cc';\nexport class Board {}\n";
        mockQueryAsset.mockReturnValue(asset);
        mockSaveAssetByHandler.mockResolvedValue(true);

        await assetOperation.saveAsset('db://assets/scripts/Board.ts', content);

        expect(mockSaveAssetByHandler).toHaveBeenCalledWith(asset, content);
        expect(reimport).toHaveBeenCalledWith('script-uuid');
    });

    it('saveAsset should reject invalid scene JSON before writing', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const reimport = jest.fn();
        const asset = {
            source: 'D:/project/assets/scenes/GameScene.scene',
            uuid: 'scene-uuid',
            imported: true,
            invalid: false,
            meta: {
                importer: 'scene',
            },
            _assetDB: {
                options: {
                    readonly: false,
                },
                reimport,
            },
        };
        mockQueryAsset.mockReturnValue(asset);

        await expect(assetOperation.saveAsset(
            'db://assets/scenes/GameScene.scene',
            'test content'
        )).rejects.toThrow('Invalid scene/prefab asset content');

        expect(mockSaveAssetByHandler).not.toHaveBeenCalled();
        expect(reimport).not.toHaveBeenCalled();
    });

    it('saveAsset should reject incomplete prefab JSON before writing', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const reimport = jest.fn();
        const asset = {
            source: 'D:/project/assets/prefabs/Hero.prefab',
            uuid: 'prefab-uuid',
            imported: true,
            invalid: false,
            meta: {
                importer: 'prefab',
            },
            _assetDB: {
                options: {
                    readonly: false,
                },
                reimport,
            },
        };
        mockQueryAsset.mockReturnValue(asset);

        await expect(assetOperation.saveAsset(
            'db://assets/prefabs/Hero.prefab',
            '[{"__type__":"cc.Prefab"'
        )).rejects.toThrow('Invalid scene/prefab asset content');

        expect(mockSaveAssetByHandler).not.toHaveBeenCalled();
        expect(reimport).not.toHaveBeenCalled();
    });

    it('saveAsset should keep valid scene and prefab JSON writable', async () => {
        const { assetOperation } = require('../manager/operation') as typeof import('../manager/operation');
        const reimport = jest.fn();
        const sceneAsset = {
            source: 'D:/project/assets/scenes/GameScene.scene',
            uuid: 'scene-uuid',
            imported: true,
            invalid: false,
            meta: {
                importer: 'scene',
            },
            _assetDB: {
                options: {
                    readonly: false,
                },
                reimport,
            },
        };
        const sceneContent = JSON.stringify([
            { __type__: 'cc.SceneAsset', _name: 'GameScene', scene: { __id__: 1 } },
            { __type__: 'cc.Scene', _name: 'GameScene', _id: 'scene-uuid' },
        ]);
        mockQueryAsset.mockReturnValue(sceneAsset);
        mockSaveAssetByHandler.mockResolvedValue(true);

        await assetOperation.saveAsset('db://assets/scenes/GameScene.scene', sceneContent);

        expect(mockSaveAssetByHandler).toHaveBeenCalledWith(sceneAsset, sceneContent);
        expect(reimport).toHaveBeenCalledWith('scene-uuid');

        jest.clearAllMocks();

        const prefabReimport = jest.fn();
        const prefabAsset = {
            source: 'D:/project/assets/prefabs/Hero.prefab',
            uuid: 'prefab-uuid',
            imported: true,
            invalid: false,
            meta: {
                importer: 'prefab',
            },
            _assetDB: {
                options: {
                    readonly: false,
                },
                reimport: prefabReimport,
            },
        };
        const prefabContent = JSON.stringify([
            { __type__: 'cc.Prefab', _name: 'Hero', data: { __id__: 1 } },
            { __type__: 'cc.Node', _name: 'Hero' },
        ]);
        mockQueryAsset.mockReturnValue(prefabAsset);
        mockSaveAssetByHandler.mockResolvedValue(true);

        await assetOperation.saveAsset('db://assets/prefabs/Hero.prefab', prefabContent);

        expect(mockSaveAssetByHandler).toHaveBeenCalledWith(prefabAsset, prefabContent);
        expect(prefabReimport).toHaveBeenCalledWith('prefab-uuid');
    });
});
