import { mkdtemp, outputFile, pathExists, readFile, remove } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
import { LightmapAssetTransaction } from '../main-process/lightfx/asset-transaction';

describe('LightmapAssetTransaction', () => {
    let root: string;

    beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'lightfx-assets-')); });
    afterEach(async () => { await remove(root); });

    it('restores an existing lightmap directory after a failed import', async () => {
        const target = join(root, 'assets', 'Scene', 'lightmap');
        await outputFile(join(target, 'old.png'), 'old');
        await outputFile(join(target, 'old.png.meta'), 'meta');
        const transaction = new LightmapAssetTransaction(target, join(root, 'workspace'));
        await transaction.prepare();
        expect(await pathExists(join(target, 'old.png'))).toBe(false);
        await transaction.preserveMeta('old.png');
        expect((await readFile(join(target, 'old.png.meta'))).toString()).toBe('meta');
        await outputFile(join(target, 'new.png'), 'new');
        await transaction.rollback();
        expect((await readFile(join(target, 'old.png'))).toString()).toBe('old');
        expect(await pathExists(join(target, 'new.png'))).toBe(false);
    });

    it('removes a newly created lightmap directory after rollback', async () => {
        const target = join(root, 'assets', 'Scene', 'lightmap');
        const transaction = new LightmapAssetTransaction(target, join(root, 'workspace'));
        await transaction.prepare();
        await outputFile(join(target, 'new.png'), 'new');
        await transaction.rollback();
        expect(await pathExists(target)).toBe(false);
    });

    it('keeps rollback retryable when restoring the backup fails', async () => {
        const target = join(root, 'assets', 'Scene', 'lightmap');
        await outputFile(join(target, 'old.png'), 'old');
        const workspace = join(root, 'workspace');
        const backup = join(workspace, 'lightmap-asset-backup');
        const transaction = new LightmapAssetTransaction(target, workspace);
        await transaction.prepare();
        await remove(backup);

        await expect(transaction.rollback()).rejects.toThrow();
        await outputFile(join(backup, 'old.png'), 'old');
        await expect(transaction.rollback()).resolves.toBeUndefined();
        await expect(readFile(join(target, 'old.png'), 'utf8')).resolves.toBe('old');
    });
});
