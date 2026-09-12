import EventEmitter from 'events';

const mockCreate = jest.fn();
const mockUpdateDatabases = jest.fn();

jest.mock('@cocos/asset-db', () => ({
    AssetActionEnum: { add: 0, change: 1, delete: 2, none: 3 },
    create: mockCreate,
    setFileSystemProvider: jest.fn(),
}));

jest.mock('../manager/plugin', () => ({
    __esModule: true,
    default: { init: jest.fn() },
}));

jest.mock('../manager/asset-handler', () => ({
    __esModule: true,
    default: {
        init: jest.fn(),
        findImporter: jest.fn(),
        getDefaultImporter: jest.fn(),
    },
}));

jest.mock('../manager/filesystem', () => ({
    setFileSystemProvider: jest.fn(),
}));

jest.mock('../../base/console', () => ({
    newConsole: {
        trackTimeStart: jest.fn(),
        trackTimeEnd: jest.fn(),
        trackMemoryStart: jest.fn(),
        trackMemoryEnd: jest.fn(),
    },
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: { t: (key: string) => key },
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        Path: {
            normalize: (value: string) => value,
            contains: () => false,
        },
    },
}));

jest.mock('../asset-config', () => ({
    __esModule: true,
    default: {
        data: {
            globList: [],
            libraryRoot: 'C:/library',
            tempRoot: 'C:/temp',
        },
    },
}));

jest.mock('../../scripting', () => ({
    __esModule: true,
    default: {
        updateDatabases: mockUpdateDatabases,
    },
}));

jest.mock('../utils', () => ({
    decidePromiseState: jest.fn(),
    PROMISE_STATE: { PENDING: 'pending' },
}));

describe('AssetDBManager.addDB failure atomicity', () => {
    beforeEach(() => {
        mockCreate.mockReset();
        mockUpdateDatabases.mockReset();
        const assetDBManager = require('../manager/asset-db').default as any;
        assetDBManager.assetDBMap = {};
        assetDBManager.assetDBInfo = {};
    });

    it('rolls back partial map/info after scripting registration and start failure', async () => {
        const startError = new Error('controlled start failure');
        const fakeDB = new EventEmitter() as EventEmitter & {
            options: { name: string; target: string };
            importerManager: Record<string, unknown>;
            start: jest.Mock;
            stop: jest.Mock;
        };
        fakeDB.options = {
            name: 'localization-editor',
            target: 'C:/builtin/static/assets',
        };
        fakeDB.importerManager = {};
        fakeDB.start = jest.fn().mockRejectedValue(startError);
        fakeDB.stop = jest.fn().mockResolvedValue(undefined);

        const unrelatedDB = { options: { name: 'assets', target: 'C:/project/assets' } };
        mockCreate.mockReset();
        mockCreate.mockReturnValueOnce(fakeDB);
        mockUpdateDatabases.mockReset();
        mockUpdateDatabases.mockResolvedValue(undefined);

        const assetDBManager = require('../manager/asset-db').default as any;
        const info = {
            name: 'localization-editor',
            target: fakeDB.options.target,
            readonly: true,
            visible: true,
            temp: 'C:/temp/localization-editor',
            library: 'C:/library/localization-editor',
        };
        assetDBManager.assetDBMap.assets = unrelatedDB;
        assetDBManager.assetDBInfo.assets = {
            name: 'assets',
            target: unrelatedDB.options.target,
            state: 'startup',
        };

        await expect(assetDBManager.addDB(info)).rejects.toBe(startError);
        expect(mockUpdateDatabases).toHaveBeenNthCalledWith(
            1,
            { dbID: info.name, target: info.target },
            0,
        );
        expect(mockUpdateDatabases).toHaveBeenNthCalledWith(
            2,
            { dbID: info.name, target: info.target },
            1,
        );
        expect(fakeDB.stop).toHaveBeenCalledTimes(1);
        expect(assetDBManager.assetDBMap[info.name]).toBeUndefined();
        expect(assetDBManager.assetDBInfo[info.name]).toBeUndefined();
        expect(assetDBManager.assetDBMap.assets).toBe(unrelatedDB);
        expect(assetDBManager.assetDBInfo.assets).toMatchObject({ state: 'startup' });

        const retryDB = new EventEmitter() as EventEmitter & {
            options: { name: string; target: string };
            importerManager: Record<string, unknown>;
            start: jest.Mock;
            stop: jest.Mock;
        };
        retryDB.options = fakeDB.options;
        retryDB.importerManager = {};
        retryDB.start = jest.fn().mockResolvedValue(undefined);
        retryDB.stop = jest.fn().mockResolvedValue(undefined);
        mockCreate.mockReturnValueOnce(retryDB);

        await expect(assetDBManager.addDB(info)).resolves.toBeUndefined();
        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(retryDB.start).toHaveBeenCalledTimes(1);
        expect(assetDBManager.assetDBMap[info.name]).toBe(retryDB);
        expect(assetDBManager.assetDBInfo[info.name]).toMatchObject({
            name: info.name,
            target: info.target,
            state: 'startup',
        });
        expect(assetDBManager.assetDBMap.assets).toBe(unrelatedDB);
    });

    it('does not issue scripting remove when the add registration itself fails', async () => {
        const scriptingError = new Error('controlled scripting add failure');
        const fakeDB = new EventEmitter() as EventEmitter & {
            options: { name: string; target: string };
            importerManager: Record<string, unknown>;
            start: jest.Mock;
            stop: jest.Mock;
        };
        fakeDB.options = {
            name: 'localization-editor',
            target: 'C:/builtin/static/assets',
        };
        fakeDB.importerManager = {};
        fakeDB.start = jest.fn();
        fakeDB.stop = jest.fn().mockResolvedValue(undefined);
        mockCreate.mockReturnValue(fakeDB);
        mockUpdateDatabases.mockRejectedValue(scriptingError);

        const assetDBManager = require('../manager/asset-db').default as any;
        const info = {
            name: 'localization-editor',
            target: fakeDB.options.target,
            readonly: true,
            visible: true,
            temp: 'C:/temp/localization-editor',
            library: 'C:/library/localization-editor',
        };

        await expect(assetDBManager.addDB(info)).rejects.toBe(scriptingError);
        expect(fakeDB.start).not.toHaveBeenCalled();
        expect(fakeDB.stop).toHaveBeenCalledTimes(1);
        expect(mockUpdateDatabases).toHaveBeenCalledTimes(1);
        expect(assetDBManager.assetDBMap[info.name]).toBeUndefined();
        expect(assetDBManager.assetDBInfo[info.name]).toBeUndefined();
    });
});
