import { mkdtemp, readFile, writeFile, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';

const mockQuery = jest.fn();
const mockSave = jest.fn();
jest.mock('../manager/query', () => ({
    __esModule: true,
    default: { queryAsset: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock('../manager/operation', () => ({
    __esModule: true,
    default: { saveAsset: (...args: unknown[]) => mockSave(...args) },
}));
jest.mock('../asset-config', () => ({ __esModule: true, default: {} }));

import { querySceneSource, saveSceneSource } from '../scene-source';

describe('scene source revision checks', () => {
    let directory: string;
    let source: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'scene-source-'));
        source = join(directory, 'test.scene');
        await writeFile(source, 'original');
        mockQuery.mockReset().mockReturnValue({ uuid: 'scene', source, meta: { importer: 'scene' } });
        mockSave.mockReset().mockImplementation(async (uuid: string, content: string) => {
            await writeFile(source, content);
            return { uuid };
        });
    });

    afterEach(async () => {
        await remove(directory);
    });

    it('reads the source file and saves when its content still matches', async () => {
        expect(await querySceneSource('scene')).toBe('original');
        await expect(saveSceneSource('scene', 'original', 'edited')).resolves.toEqual({
            asset: { uuid: 'scene' }, source: 'edited',
        });
        expect(await readFile(source, 'utf8')).toBe('edited');
    });

    it('rejects an external edit before invoking the existing save operation', async () => {
        await writeFile(source, 'external edit');
        await expect(saveSceneSource('scene', 'original', 'CLI edit')).rejects.toThrow('changed on disk');
        expect(await readFile(source, 'utf8')).toBe('external edit');
        expect(mockSave).not.toHaveBeenCalled();
    });

    it('returns the imported source as the revision for a subsequent save', async () => {
        mockSave.mockImplementation(async (uuid: string, content: string) => {
            await writeFile(source, content + '\nimporter-normalized');
            return { uuid };
        });
        const first = await saveSceneSource('scene', 'original', 'first');
        expect(first.source).toBe('first\nimporter-normalized');
        await expect(saveSceneSource('scene', first.source, 'second')).resolves.toEqual({
            asset: { uuid: 'scene' }, source: 'second\nimporter-normalized',
        });
    });

    it('does not skip the existing save operation when the content is unchanged', async () => {
        await saveSceneSource('scene', 'original', 'original');
        expect(mockSave).toHaveBeenCalledWith('scene', 'original');
    });

    it('propagates a failed save instead of returning a new revision', async () => {
        mockSave.mockImplementation(async () => {
            await writeFile(source, 'partial save');
            throw new Error('import failed');
        });
        await expect(saveSceneSource('scene', 'original', 'edited')).rejects.toThrow('import failed');
        await expect(saveSceneSource('scene', 'original', 'retry')).rejects.toThrow('changed on disk');
        expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('does not recreate a deleted source file', async () => {
        await remove(source);
        await expect(saveSceneSource('scene', 'original', 'edited')).rejects.toThrow();
        expect(mockSave).not.toHaveBeenCalled();
    });

    it('rejects assets without a scene source', async () => {
        mockQuery.mockReturnValue({ source: join(directory, 'texture.png'), meta: { importer: 'image' } });
        await expect(querySceneSource('texture')).rejects.toThrow('Scene source not found');
    });
});
