export {};

const mockRemoveAssetSource = jest.fn();

jest.mock('@cocos/asset-db', () => ({
    Asset: class {},
    VirtualAsset: class {},
    queryUUID: jest.fn(),
    Utils: {
        nameToId: jest.fn((value) => value),
    },
    queryAsset: jest.fn(),
    queryPath: jest.fn((value) => value),
}));

jest.mock('fs-extra', () => ({
    move: jest.fn(),
    readFile: jest.fn(),
    readJSON: jest.fn(),
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        Path: {
            resolveToRaw: jest.fn((value) => value),
        },
    },
}));

jest.mock('../manager/filesystem', () => ({
    removeAssetSource: (...args: any[]) => mockRemoveAssetSource(...args),
}));

jest.mock('../../engine/editor-extends/missing-reporter/missing-class-reporter', () => ({
    MissingClass: {
        reset: jest.fn(),
    },
}));

describe('removeFile options', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removeFile should delegate to filesystem bridge', async () => {
        const file = 'D:/project/assets/test.txt';
        const { removeFile } = require('../utils') as typeof import('../utils');

        mockRemoveAssetSource.mockResolvedValue(true);

        await (removeFile as any)(file, { useTrash: false });

        expect(mockRemoveAssetSource).toHaveBeenCalledWith(file, { useTrash: false });
    });
});
