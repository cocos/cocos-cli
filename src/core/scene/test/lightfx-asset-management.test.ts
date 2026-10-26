import { mkdtemp, outputFile, pathExists, readFile, readdir, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { LightmapAssetRecord } from '../main-process/lightfx/asset-record';
import { LightmapAssetTransaction } from '../main-process/lightfx/asset-transaction';

describe('Exact scene Lightmap asset membership', () => {
    let root: string;
    const scene = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'lightfx-record-')); });
    afterEach(async () => { await remove(root); });

    it('persists only deduplicated root UUIDs and keeps different scenes separate across reopen', async () => {
        const record = new LightmapAssetRecord(root, scene);
        await record.add([a, `${a}@6c48a`]);
        await new LightmapAssetRecord(root, scene).add([b]);
        await new LightmapAssetRecord(root, other).add([a]);
        await record.forget([a]);
        expect(await record.read()).toEqual([b]);
        expect(await new LightmapAssetRecord(root, other).read()).toEqual([a]);
        expect(await readdir(join(root, 'settings', 'lightfx-assets'))).toEqual(expect.arrayContaining([`${scene}.json`, `${other}.json`]));
        expect(await readFile(join(root, 'settings', 'lightfx-assets', `${scene}.json`), 'utf8'))
            .toBe(JSON.stringify({ version: 1, textures: [b] }));
    });

    it('keeps auxiliary membership separate while preserving it through texture changes and restart', async () => {
        const record = new LightmapAssetRecord(root, scene);
        await record.add([a], [`${b}@sub`, b]);
        await record.forget([a]);
        await new LightmapAssetRecord(root, scene).add([a]);
        expect([await record.read(), await record.readAuxiliary()]).toEqual([[a], [b]]);
        await record.forget([b]);
        expect([await record.read(), await record.readAuxiliary()]).toEqual([[a], []]);
    });

    it.each(['../outside', '', 'scene/name'])('rejects unsafe scene identity: %s', invalid => {
        expect(() => new LightmapAssetRecord(root, invalid)).toThrow('scene UUID');
    });

    it.each(['{broken', 'null', '{"version":2,"textures":[]}', '{"version":1,"textures":["../outside"]}',
        '{"version":1,"textures":[],"auxiliary":["../outside"]}', '{"version":1,"textures":[],"auxiliary":null}'])('does not overwrite a damaged record: %s', async content => {
        const file = join(root, 'settings', 'lightfx-assets', `${scene}.json`);
        await outputFile(file, content);
        const record = new LightmapAssetRecord(root, scene);
        await expect(record.add([a])).rejects.toThrow();
        await expect(record.forget([a])).rejects.toThrow();
        expect(await readFile(file, 'utf8')).toBe(content);
    });
});

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
