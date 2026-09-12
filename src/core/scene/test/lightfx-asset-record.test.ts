import { mkdtemp, outputFile, readFile, readdir, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { LightmapAssetRecord } from '../main-process/lightfx/asset-record';

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
