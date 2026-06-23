const mockQueryAssetInfo = jest.fn();
const mockQueryAssetMeta = jest.fn();
const mockRefreshAsset = jest.fn();
const mockCreateAsset = jest.fn();
const mockCreateAssetByType = jest.fn();
const mockImportAsset = jest.fn();
const mockSaveAsset = jest.fn();
const mockQueryPath = jest.fn();
const mockQueryLinesInFile = jest.fn();
const mockEraseLinesInRange = jest.fn();
const mockReplaceTextInFile = jest.fn();
const mockNodeQuery = jest.fn();
const mockNodeDelete = jest.fn();
const mockComponentQuery = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => ({
    description: () => jest.fn(),
    param: () => jest.fn(),
    result: () => jest.fn(),
    title: () => jest.fn(),
    tool: () => jest.fn(),
}), { virtual: true });

jest.mock('../src/core/assets', () => ({
    assetDBManager: {},
    assetManager: {
        queryAssetInfo: (...args: unknown[]) => mockQueryAssetInfo(...args),
        queryAssetMeta: (...args: unknown[]) => mockQueryAssetMeta(...args),
        refreshAsset: (...args: unknown[]) => mockRefreshAsset(...args),
        createAsset: (...args: unknown[]) => mockCreateAsset(...args),
        createAssetByType: (...args: unknown[]) => mockCreateAssetByType(...args),
        importAsset: (...args: unknown[]) => mockImportAsset(...args),
        saveAsset: (...args: unknown[]) => mockSaveAsset(...args),
        queryPath: (...args: unknown[]) => mockQueryPath(...args),
    },
}));

jest.mock('../src/core/filesystem/file-edit', () => ({
    insertTextAtLine: jest.fn(),
    eraseLinesInRange: (...args: unknown[]) => mockEraseLinesInRange(...args),
    replaceTextInFile: (...args: unknown[]) => mockReplaceTextInFile(...args),
    queryLinesInFile: (...args: unknown[]) => mockQueryLinesInFile(...args),
}));

jest.mock('../src/core/scene', () => ({
    NodeType: {
        EMPTY: 'Node',
    },
    Scene: {
        Node: {
            query: (...args: unknown[]) => mockNodeQuery(...args),
            delete: (...args: unknown[]) => mockNodeDelete(...args),
        },
        Component: {
            query: (...args: unknown[]) => mockComponentQuery(...args),
        },
    },
}));

import { AssetsApi } from '../src/api/assets/assets';
import { FileEditorApi } from '../src/api/system/file-editor';
import { NodeApi } from '../src/api/scene/node';
import { ComponentApi } from '../src/api/scene/component';
import { COMMON_STATUS, HTTP_STATUS, HttpStatusCodeSchema, getCommonErrorStatus } from '../src/api/base/schema-base';

describe('Bug #497 common API error status codes', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    beforeEach(() => {
        mockQueryAssetInfo.mockReset();
        mockQueryAssetMeta.mockReset();
        mockRefreshAsset.mockReset();
        mockCreateAsset.mockReset();
        mockCreateAssetByType.mockReset();
        mockImportAsset.mockReset();
        mockSaveAsset.mockReset();
        mockQueryPath.mockReset();
        mockQueryLinesInFile.mockReset();
        mockEraseLinesInRange.mockReset();
        mockReplaceTextInFile.mockReset();
        mockNodeQuery.mockReset();
        mockNodeDelete.mockReset();
        mockComponentQuery.mockReset();
    });

    it('allows client-side business error codes in common results', () => {
        expect(HttpStatusCodeSchema.parse(HTTP_STATUS.BAD_REQUEST)).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(HttpStatusCodeSchema.parse(HTTP_STATUS.NOT_FOUND)).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('classifies common not-found and bad-request errors without using 500', () => {
        expect(getCommonErrorStatus(new Error('ENOENT: no such file or directory'))).toBe(COMMON_STATUS.NOT_FOUND);
        expect(getCommonErrorStatus(new Error('Asset can not be found: db://assets/missing.scene'))).toBe(COMMON_STATUS.NOT_FOUND);
        expect(getCommonErrorStatus(new Error('can not find asset d:\\cocos\\program\\snake2\\assets\\resources\\Image'))).toBe(COMMON_STATUS.NOT_FOUND);
        expect(getCommonErrorStatus(new Error('Invalid scene/prefab asset content: invalid JSON'))).toBe(COMMON_STATUS.BAD_REQUEST);
        expect(getCommonErrorStatus(new Error('Filename cannot be empty.'))).toBe(COMMON_STATUS.BAD_REQUEST);
        expect(getCommonErrorStatus(new Error('parameter error'))).toBe(COMMON_STATUS.BAD_REQUEST);
        expect(getCommonErrorStatus(new Error('file GameManager.ts already exists, please use overwrite option'))).toBe(COMMON_STATUS.BAD_REQUEST);
        expect(getCommonErrorStatus(new Error('unexpected internal crash'))).toBe(COMMON_STATUS.FAIL);
    });

    it('classifies script module resolution failures as bad requests', () => {
        expect(getCommonErrorStatus(new Error('(i18n needed)resolve_error _module_not_found: {"specifier":"../core/GameEvent"}'))).toBe(COMMON_STATUS.BAD_REQUEST);
    });

    it('classifies text replacement targeting failures as bad requests', () => {
        expect(getCommonErrorStatus(new Error('Multiple (2) occurrences found. File is not changed.'))).toBe(COMMON_STATUS.BAD_REQUEST);
        expect(getCommonErrorStatus(new Error('No replacement was performed, TargetText foo did not appear verbatim in D:\\project\\assets\\scripts\\Game.ts.'))).toBe(COMMON_STATUS.BAD_REQUEST);
    });

    it('returns 404 when detailed asset info is not found', async () => {
        mockQueryAssetInfo.mockReturnValue(null);

        const result = await new AssetsApi().queryAssetInfo('db://assets/missing.scene');

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('Asset can not be found');
    });

    it('returns 404 when asset metadata is not found', async () => {
        mockQueryAssetMeta.mockReturnValue(null);

        const result = await new AssetsApi().queryAssetMeta('db://assets/missing.scene');

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('Asset not found');
    });

    it('returns 400 for asset query parameter errors', async () => {
        mockQueryAssetInfo.mockImplementation(() => {
            throw new Error('parameter error');
        });

        const result = await new AssetsApi().queryAssetInfo('bad');

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toBe('parameter error');
    });

    it('returns 404 when refreshing a missing asset directory', async () => {
        mockRefreshAsset.mockRejectedValue(new Error('can not find asset d:\\cocos\\program\\snake2\\assets\\resources\\Image'));

        const result = await new AssetsApi().refresh('d:\\cocos\\program\\snake2\\assets\\resources\\Image');

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('can not find asset');
    });

    it('returns 400 when asset creation receives an invalid target URL', async () => {
        mockCreateAsset.mockRejectedValue(new Error('Invalid URL: input URL must be a string and start with db:// \n  url:'));

        const result = await new AssetsApi().createAsset({
            target: 'd:\\cocos\\program\\snake2\\assets\\resources',
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('Invalid URL');
    });

    it('returns 400 when createAssetByType receives an invalid target URL', async () => {
        mockCreateAssetByType.mockRejectedValue(new Error('Invalid URL: input URL must be a string and start with db:// \n  url:'));

        const result = await new AssetsApi().createAssetByType('typescript', 'assets/Script', 'Food');

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('Invalid URL');
        expect(result.reason).not.toContain('Error: Invalid URL');
    });

    it('returns 404 when importing from a missing asset path', async () => {
        mockImportAsset.mockRejectedValue(new Error('can not find asset d:\\cocos\\program\\snake2\\assets\\resources\\Image\\food.png'));

        const result = await new AssetsApi().importAsset(
            'd:\\cocos\\program\\snake2\\assets\\resources\\Image\\food.png',
            'd:\\cocos\\program\\snake2\\assets\\resources\\Image\\food.png'
        );

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.data).toEqual([]);
        expect(result.reason).toContain('can not find asset');
    });

    it('returns 404 when saving a missing existing asset', async () => {
        mockSaveAsset.mockRejectedValue(new Error('Failed to save asset: cannot find asset e:\\pink\\test12\\assets\\scripts\\Board.ts.tmp'));

        const result = await new AssetsApi().saveAsset(
            'e:\\pink\\test12\\assets\\scripts\\Board.ts.tmp',
            '// temp file for fix'
        );

        expect(mockSaveAsset).toHaveBeenCalledWith(
            'e:\\pink\\test12\\assets\\scripts\\Board.ts.tmp',
            '// temp file for fix'
        );
        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('cannot find asset');
    });

    it('returns 400 when querying asset path with a parameter error', async () => {
        mockQueryPath.mockImplementation(() => {
            throw new Error('parameter error');
        });

        const result = await new AssetsApi().queryPath('bad');

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.data).toBeNull();
        expect(result.reason).toBe('parameter error');
    });

    it('returns 404 when querying asset path cannot resolve a path', async () => {
        mockQueryPath.mockReturnValue('');

        const result = await new AssetsApi().queryPath('assets/resources/Image/missing.png');

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('Asset path can not be found');
    });

    it('returns 400 when saving invalid scene or prefab content', async () => {
        mockSaveAsset.mockRejectedValue(new Error('Invalid scene/prefab asset content: invalid JSON: Unexpected token'));

        const result = await new AssetsApi().saveAsset(
            'db://assets/scenes/GameScene.scene',
            'test content'
        );

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.data).toBeNull();
        expect(result.reason).toContain('Invalid scene/prefab asset content');
    });

    it('returns 404 when queried file does not exist', async () => {
        mockQueryLinesInFile.mockRejectedValue(new Error("ENOENT: no such file or directory, open 'D:/project/assets/package.json'"));

        const result = await new FileEditorApi().queryFileText({
            dbURL: 'db://assets/package.json',
            fileType: 'json',
            startLine: 1,
            lineCount: 40,
        });

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.reason).toContain('ENOENT');
    });

    it('returns 400 when the db URL cannot resolve to a file path', async () => {
        mockQueryLinesInFile.mockRejectedValue(new Error('Filename cannot be empty.'));

        const result = await new FileEditorApi().queryFileText({
            dbURL: 'db://project.json',
            fileType: 'json',
            startLine: 1,
            lineCount: 40,
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toBe('Filename cannot be empty.');
    });

    it('returns 400 when deleting file text triggers a script module resolution failure', async () => {
        mockEraseLinesInRange.mockRejectedValue(new Error('(i18n needed)resolve_error _module_not_found: {"specifier":"../core/GameEvent"}'));

        const result = await new FileEditorApi().eraseLinesInRange({
            dbURL: 'db://assets/scripts/board/BoardController.ts',
            fileType: 'ts',
            startLine: 1,
            endLine: 2,
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toContain('_module_not_found');
    });

    it('returns 400 when replacing file text matches multiple occurrences', async () => {
        mockReplaceTextInFile.mockRejectedValue(new Error('Multiple (2) occurrences found. File is not changed.'));

        const result = await new FileEditorApi().replaceTextInFile({
            dbURL: 'db://assets/scripts/Game.ts',
            fileType: 'ts',
            targetText: 'this.score = 0;',
            replacementText: 'this.score = 1;',
            regex: false,
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toContain('Multiple (2) occurrences found');
    });

    it('returns 400 when replacing file text finds no verbatim match', async () => {
        mockReplaceTextInFile.mockRejectedValue(new Error('No replacement was performed, TargetText this.score = 0; did not appear verbatim in D:\\project\\assets\\scripts\\Game.ts.'));

        const result = await new FileEditorApi().replaceTextInFile({
            dbURL: 'db://assets/scripts/Game.ts',
            fileType: 'ts',
            targetText: 'this.score = 0;',
            replacementText: 'this.score = 1;',
            regex: false,
        });

        expect(result.code).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(result.reason).toContain('No replacement was performed');
    });

    it('returns 404 when a queried node is not found', async () => {
        mockNodeQuery.mockResolvedValue(null);

        const result = await new NodeApi().queryNode({
            path: 'Canvas/Missing',
            includeChildren: false,
            includeComponents: false,
        });

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.reason).toBe('node not found at path: Canvas/Missing');
    });

    it('returns 404 when a deleted node is not found', async () => {
        mockNodeDelete.mockResolvedValue(null);

        const result = await new NodeApi().deleteNode({ path: 'Canvas/Missing' });

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.reason).toBe('node not found at path: Canvas/Missing');
    });

    it('returns 404 when a queried component is not found', async () => {
        mockComponentQuery.mockResolvedValue(null);

        const result = await new ComponentApi().queryComponent({ componentPath: 'Canvas/Missing/cc.Label' });

        expect(result.code).toBe(HTTP_STATUS.NOT_FOUND);
        expect(result.reason).toBe('component not found: Canvas/Missing/cc.Label');
    });
});
