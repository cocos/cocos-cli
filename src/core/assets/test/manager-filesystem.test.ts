export {};

const mockExistsSync = jest.fn();
const mockMove = jest.fn();
const mockCopy = jest.fn();
const mockRemove = jest.fn();
const mockEnsureDir = jest.fn();
const mockOutputFile = jest.fn();
const mockReadFile = jest.fn();
const mockTrashItem = jest.fn();

jest.mock('fs-extra', () => ({
    existsSync: (...args: any[]) => mockExistsSync(...args),
    move: (...args: any[]) => mockMove(...args),
    copy: (...args: any[]) => mockCopy(...args),
    remove: (...args: any[]) => mockRemove(...args),
    ensureDir: (...args: any[]) => mockEnsureDir(...args),
    outputFile: (...args: any[]) => mockOutputFile(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
}));

jest.mock('../../base/utils', () => ({
    __esModule: true,
    default: {
        File: {
            trashItem: (...args: any[]) => mockTrashItem(...args),
        },
        Path: {
            contains: jest.fn(() => false),
        },
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

describe('asset filesystem manager', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.resetAllMocks();
    });

    it('should expose a provider-shaped local fallback and keep fallback methods after partial override', () => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');

        filesystem.resetFileSystemProvider();

        let provider = filesystem.getFileSystemProvider();
        expect(typeof provider.readFile).toBe('function');
        expect(typeof provider.writeFile).toBe('function');
        expect(typeof provider.createDirectory).toBe('function');
        expect(typeof provider.delete).toBe('function');
        expect(typeof provider.rename).toBe('function');
        expect(typeof provider.copy).toBe('function');

        const customRename = jest.fn(async () => {});
        filesystem.setFileSystemProvider({
            rename: customRename,
        });

        provider = filesystem.getFileSystemProvider();
        expect(typeof provider.readFile).toBe('function');
        expect(typeof provider.writeFile).toBe('function');
        expect(typeof provider.createDirectory).toBe('function');
        expect(typeof provider.delete).toBe('function');
        expect(provider.rename).toBe(customRename);
        expect(typeof provider.copy).toBe('function');
    });

    it('local fallback writeFile and copy should delegate to fs-extra implementations', async () => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');

        filesystem.resetFileSystemProvider();

        const provider = filesystem.getFileSystemProvider();
        const target = 'D:/project/assets/test.txt';
        const copyTarget = 'D:/project/assets/copied.txt';
        const defaultCopyTarget = 'D:/project/assets/copied-default.txt';
        const content = 'hello';

        mockReadFile.mockResolvedValue(content);

        await provider.writeFile!(target, content);
        await provider.copy!(target, copyTarget, { overwrite: true });
        await provider.copy!(target, defaultCopyTarget);
        const result = await provider.readFile!(target, 'utf8');

        expect(mockEnsureDir).toHaveBeenCalledWith('D:/project/assets');
        expect(mockOutputFile).toHaveBeenCalledWith(target, content);
        expect(mockCopy).toHaveBeenCalledWith(target, copyTarget, { overwrite: true });
        expect(mockCopy.mock.calls[1]).toEqual([target, defaultCopyTarget]);
        expect(mockReadFile).toHaveBeenCalledWith(target, 'utf8');
        expect(result).toBe(content);
    });

    it('removeAssetSource should delegate delete to custom provider and forward useTrash', async () => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');
        const provider = {
            delete: jest.fn(async () => {}),
        };
        const file = 'D:/project/assets/test.txt';

        filesystem.setFileSystemProvider(provider);
        mockExistsSync.mockImplementation((path: string) => path === file || path === `${file}.meta`);

        await filesystem.removeAssetSource(file, { useTrash: true });

        expect(provider.delete).toHaveBeenNthCalledWith(1, file, { useTrash: true });
        expect(provider.delete).toHaveBeenNthCalledWith(2, `${file}.meta`, { useTrash: true });
        expect(mockTrashItem).not.toHaveBeenCalled();
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it.each([undefined, false, true])('moveAssetSource forwards overwrite=%s to custom provider for both files', async overwrite => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');
        const provider = {
            readFile: jest.fn(async () => Buffer.from('{"uuid":"source"}')),
            rename: jest.fn(async () => {}),
        };
        const source = 'D:/project/assets/source.txt';
        const target = 'D:/project/assets/target.txt';

        filesystem.setFileSystemProvider(provider);

        await filesystem.moveAssetSource(source, target, overwrite === undefined ? undefined : { overwrite });

        // A non-overwriting move must not replace another asset's UUID either.
        expect(provider.rename).toHaveBeenNthCalledWith(1, `${source}.meta`, `${target}.meta`, { overwrite: !!overwrite });
        expect(provider.rename).toHaveBeenNthCalledWith(2, source, target, { overwrite: !!overwrite });
        expect(provider.rename).toHaveBeenCalledTimes(2);
        if (!overwrite) {
            expect(provider.readFile).toHaveBeenCalledWith(`${source}.meta`, undefined);
        }
        expect(mockReadFile).not.toHaveBeenCalled();
        expect(mockMove).not.toHaveBeenCalled();
    });

    it('does not move either file if the custom provider cannot read metadata for safe recovery', async () => {
        const filesystem = require('../manager/filesystem') as typeof import('../manager/filesystem');
        const error = new Error('metadata read denied');
        const provider = {
            readFile: jest.fn(async () => { throw error; }),
            rename: jest.fn(async () => {}),
        };
        filesystem.setFileSystemProvider(provider);
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await expect(filesystem.moveAssetSource('source.txt', 'target.txt')).rejects.toBe(error);

            expect(provider.rename).not.toHaveBeenCalled();
            expect(mockReadFile).not.toHaveBeenCalled();
            expect(mockMove).not.toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });
});
