import { mkdtemp, outputFile, readFile, pathExists, remove, move } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';

jest.mock('../asset-config', () => ({ __esModule: true, default: { data: {} } }));
jest.mock('../../base/utils', () => ({ __esModule: true, default: { Path: jest.requireActual('../../base/utils/path') } }));
import assetConfig from '../asset-config';
import { moveAssetSource, resetFileSystemProvider, setFileSystemProvider } from '../manager/filesystem';

describe('asset source move safety and compatibility', () => {
    let root: string, source: string, target: string;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'asset-move-failure-'));
        assetConfig.data.root = root;
        assetConfig.data.tempRoot = join(root, 'temp');
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
    it.each([undefined, { overwrite: false }])('does not overwrite target metadata with options %j', async options => {
        await outputFile(`${target}.meta`, 'unrelated');
        await expect(moveAssetSource(source, target, options)).rejects.toThrow();
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('unrelated');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(true);
    });
    it.each([undefined, { overwrite: false }, { overwrite: true }])('moves both files with their UUID using options %j', async options => {
        await moveAssetSource(source, target, options);
        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(false);
        expect(await pathExists(`${source}.meta`)).toBe(false);
    });
    it('replaces both the target source and metadata when overwrite is explicitly allowed', async () => {
        await outputFile(target, 'old pixels');
        await outputFile(`${target}.meta`, '{"uuid":"old-target"}');

        await moveAssetSource(source, target, { overwrite: true });

        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(false);
        expect(await pathExists(`${source}.meta`)).toBe(false);
    });
    it('preserves both assets when the target already exists and overwrite is omitted', async () => {
        await outputFile(target, 'unrelated pixels');
        await outputFile(`${target}.meta`, '{"uuid":"unrelated"}');

        await expect(moveAssetSource(source, target)).rejects.toThrow();

        expect(await readFile(source, 'utf8')).toBe('new pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await readFile(target, 'utf8')).toBe('unrelated pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"unrelated"}');
    });
    it.each(['sibling', 'nested'])('preserves directory and child UUIDs when moving to a %s path', async location => {
        const folder = join(root, 'folder');
        const destination = location === 'nested' ? join(folder, 'nested') : join(root, 'moved-folder');
        await outputFile(`${folder}.meta`, '{"uuid":"folder"}');
        await outputFile(join(folder, 'child.png'), 'child pixels');
        await outputFile(join(folder, 'child.png.meta'), '{"uuid":"child"}');

        await moveAssetSource(folder, destination);

        expect(await readFile(`${destination}.meta`, 'utf8')).toBe('{"uuid":"folder"}');
        expect(await readFile(join(destination, 'child.png'), 'utf8')).toBe('child pixels');
        expect(await readFile(join(destination, 'child.png.meta'), 'utf8')).toBe('{"uuid":"child"}');
        expect(await pathExists(`${folder}.meta`)).toBe(false);
        expect(await pathExists(join(folder, 'child.png'))).toBe(false);
        expect(await pathExists(join(root, 'temp', 'move-temp', location === 'nested' ? 'folder/nested' : 'moved-folder'))).toBe(false);
    });
    it('uses the local metadata reader when only rename is overridden', async () => {
        const rename = jest.fn(async (from: string, to: string, options?: { overwrite?: boolean }) => {
            await move(from, to, { overwrite: !!options?.overwrite });
        });
        setFileSystemProvider({ rename });

        await moveAssetSource(source, target);

        expect(rename).toHaveBeenCalledTimes(2);
        expect(await readFile(target, 'utf8')).toBe('new pixels');
        expect(await readFile(`${target}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(source)).toBe(false);
        expect(await pathExists(`${source}.meta`)).toBe(false);
    });
    it('restores the source metadata even when a competing target PNG appears', async () => {
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === source) await outputFile(target, 'unrelated pixels');
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(source, target, { overwrite: false })).rejects.toThrow();
        expect(await readFile(target, 'utf8')).toBe('unrelated pixels');
        expect(await readFile(`${source}.meta`, 'utf8')).toBe('{"uuid":"original"}');
        expect(await pathExists(`${target}.meta`)).toBe(false);
    });
    it.each(['source', 'target'])('never overwrites a replacement %s metadata during recovery', async location => {
        setFileSystemProvider({ rename: async (from, to, options) => {
            if (from === source) {
                await outputFile(`${location === 'source' ? source : target}.meta`, 'unrelated meta');
                throw new Error('PNG move denied');
            }
            await move(from, to, { overwrite: !!options?.overwrite });
        } });
        await expect(moveAssetSource(source, target, { overwrite: false })).rejects.toThrow('could not be restored safely');
        expect(await readFile(`${location === 'source' ? source : target}.meta`, 'utf8')).toBe('unrelated meta');
        expect(await readFile(source, 'utf8')).toBe('new pixels');
    });
});
