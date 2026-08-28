import fs from 'fs';
import os from 'os';
import path from 'path';

const mockQueryPath = jest.fn();
const mockReimportAsset = jest.fn();
const mockResolveToRaw = jest.fn();
const mockContains = jest.fn();

jest.mock('@cocos/asset-db', () => ({
    queryPath: (...args: unknown[]) => mockQueryPath(...args),
}));

jest.mock('../../core/assets', () => ({
    assetManager: {
        reimportAsset: (...args: unknown[]) => mockReimportAsset(...args),
    },
}));

jest.mock('../base/utils/path', () => ({
    resolveToRaw: (...args: unknown[]) => mockResolveToRaw(...args),
    contains: (...args: unknown[]) => mockContains(...args),
}));

jest.mock('replace-in-file', () => ({
    replaceInFile: async (options: {
        files: string;
        from: string | RegExp;
        to: string;
        countMatches?: boolean;
        dry?: boolean;
    }) => {
        const nodeFs = require('fs') as typeof import('fs');
        const content = nodeFs.readFileSync(options.files, 'utf8');
        const matches = typeof options.from === 'string'
            ? content.split(options.from).length - 1
            : Array.from(content.matchAll(options.from)).length;
        const replaced = content.replace(options.from, options.to);
        if (!options.dry && replaced !== content) {
            nodeFs.writeFileSync(options.files, replaced);
        }
        return [{
            file: options.files,
            hasChanged: replaced !== content,
            numMatches: options.countMatches ? matches : undefined,
        }];
    },
}));

import { replaceTextInFile } from './file-edit';

function createDeferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function waitForMockCalls(mock: jest.Mock, expected: number) {
    for (let attempt = 0; attempt < 20 && mock.mock.calls.length < expected; attempt++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(mock).toHaveBeenCalledTimes(expected);
}

describe('file edit concurrency', () => {
    let projectDir: string;

    beforeEach(() => {
        jest.clearAllMocks();
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-file-edit-'));
        mockResolveToRaw.mockReturnValue(projectDir);
        mockContains.mockImplementation((root: string, filename: string) => filename.startsWith(root));
    });

    afterEach(() => {
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('serializes replacements for the same file through reimport', async () => {
        const filename = path.join(projectDir, 'Game.ts');
        fs.writeFileSync(filename, 'const first = 1;\nconst second = 2;\n');
        mockQueryPath.mockReturnValue(filename);

        const firstReimport = createDeferred();
        mockReimportAsset
            .mockImplementationOnce(() => firstReimport.promise)
            .mockResolvedValueOnce({});

        const first = replaceTextInFile('db://assets/Game.ts', 'ts', 'first = 1', 'first = 10', false);
        await waitForMockCalls(mockReimportAsset, 1);
        const second = replaceTextInFile('db://assets/Game.ts', 'ts', 'second = 2', 'second = 20', false);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(mockReimportAsset).toHaveBeenCalledTimes(1);
        firstReimport.resolve();
        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
        expect(fs.readFileSync(filename, 'utf8')).toBe('const first = 10;\nconst second = 20;\n');
        expect(mockReimportAsset).toHaveBeenCalledTimes(2);
    });

    it('preserves the unique-match contract for duplicate concurrent replacements', async () => {
        const filename = path.join(projectDir, 'Game.ts');
        fs.writeFileSync(filename, 'const score = 0;\n');
        mockQueryPath.mockReturnValue(filename);

        const firstReimport = createDeferred();
        mockReimportAsset.mockImplementationOnce(() => firstReimport.promise);

        const first = replaceTextInFile('db://assets/Game.ts', 'ts', 'score = 0', 'score = 1', false);
        await waitForMockCalls(mockReimportAsset, 1);
        const second = replaceTextInFile('db://assets/Game.ts', 'ts', 'score = 0', 'score = 2', false);
        firstReimport.resolve();

        await expect(first).resolves.toBe(true);
        await expect(second).rejects.toThrow('No replacement was performed');
        expect(fs.readFileSync(filename, 'utf8')).toBe('const score = 1;\n');
        expect(mockReimportAsset).toHaveBeenCalledTimes(1);
    });

    it('releases the file queue after an edit fails', async () => {
        const filename = path.join(projectDir, 'Game.ts');
        fs.writeFileSync(filename, 'const ready = false;\n');
        mockQueryPath.mockReturnValue(filename);
        mockReimportAsset.mockResolvedValue({});

        const missing = replaceTextInFile('db://assets/Game.ts', 'ts', 'missing = true', 'missing = false', false);
        const valid = replaceTextInFile('db://assets/Game.ts', 'ts', 'ready = false', 'ready = true', false);

        await expect(missing).rejects.toThrow('No replacement was performed');
        await expect(valid).resolves.toBe(true);
        expect(fs.readFileSync(filename, 'utf8')).toBe('const ready = true;\n');
    });

    it('releases the file queue after reimport rejects', async () => {
        const filename = path.join(projectDir, 'Game.ts');
        fs.writeFileSync(filename, 'const first = 1;\nconst second = 2;\n');
        mockQueryPath.mockReturnValue(filename);
        mockReimportAsset
            .mockRejectedValueOnce(new Error('Reimport asset timed out'))
            .mockResolvedValueOnce({});

        const first = replaceTextInFile('db://assets/Game.ts', 'ts', 'first = 1', 'first = 10', false);
        const second = replaceTextInFile('db://assets/Game.ts', 'ts', 'second = 2', 'second = 20', false);

        await expect(first).rejects.toThrow('Reimport asset timed out');
        await expect(second).resolves.toBe(true);
        expect(fs.readFileSync(filename, 'utf8')).toBe('const first = 10;\nconst second = 20;\n');
        expect(mockReimportAsset).toHaveBeenCalledTimes(2);
    });

    it('does not serialize edits to different files', async () => {
        const firstFilename = path.join(projectDir, 'First.ts');
        const secondFilename = path.join(projectDir, 'Second.ts');
        fs.writeFileSync(firstFilename, 'const first = 1;\n');
        fs.writeFileSync(secondFilename, 'const second = 2;\n');
        mockQueryPath.mockImplementation((dbURL: string) => dbURL.includes('First') ? firstFilename : secondFilename);

        const firstReimport = createDeferred();
        const secondReimport = createDeferred();
        mockReimportAsset
            .mockImplementationOnce(() => firstReimport.promise)
            .mockImplementationOnce(() => secondReimport.promise);

        const first = replaceTextInFile('db://assets/First.ts', 'ts', 'first = 1', 'first = 10', false);
        const second = replaceTextInFile('db://assets/Second.ts', 'ts', 'second = 2', 'second = 20', false);
        await waitForMockCalls(mockReimportAsset, 2);

        firstReimport.resolve();
        secondReimport.resolve();
        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    });
});
