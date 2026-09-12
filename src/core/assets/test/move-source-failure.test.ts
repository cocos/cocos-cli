import { mkdtemp, outputFile, readFile, pathExists, remove, move } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('../asset-config', () => ({ __esModule: true, default: { data: {} } }));
jest.mock('../../base/utils', () => ({ __esModule: true, default: { Path: { contains: () => false } } }));
import { moveAssetSource, resetFileSystemProvider, setFileSystemProvider } from '../manager/filesystem';

describe('non-overwriting asset source move failure', () => {
    let root: string, source: string, target: string;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'asset-move-failure-'));
        source = join(root, 'source.png');
        target = join(root, 'output.png');
        await outputFile(source, 'new pixels');
        await outputFile(`${source}.meta`, '{"uuid":"original"}');
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(async () => {
        resetFileSystemProvider();
        jest.restoreAllMocks();
        await remove(root);
    });
    it('restores metadata and rejects before Asset DB can refresh a failed PNG move', async () => {
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === source) throw new Error('PNG move denied');
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(source, target, { overwrite: false })).rejects.toThrow('PNG move denied');
        expect(await readFile(source, 'utf8')).toBe('new pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(`${target}.meta`)).toBe(false);
        expect(await pathExists(target)).toBe(false);
    });
    it('does not overwrite target metadata that appears before the move', async () => {
        await outputFile(`${target}.meta`, 'unrelated');
        await expect(moveAssetSource(source, target, { overwrite: false })).rejects.toThrow();
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('unrelated');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(true);
    });
    it('still moves both files with their UUID on success', async () => {
        await moveAssetSource(source, target, { overwrite: false });
        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(false);
        expect(await pathExists(`${source}.meta`)).toBe(false);
    });
});
