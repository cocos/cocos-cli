import { randomUUID } from 'crypto';
import { mkdtemp, ensureDir, outputFile, readFile, pathExists, move, remove, symlink } from 'fs-extra';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const mockAssets = { queryAssetInfo: jest.fn(), queryUUID: jest.fn(), moveAsset: jest.fn(), refreshAsset: jest.fn() };
jest.mock('../../assets', () => ({ assetManager: mockAssets }));
import { publishLightmapTextures, removeEmptyLightmapVersion } from '../main-process/lightfx/asset-publication';

describe('Fixed Lightmap publication after saving', () => {
    let project: string, root: string, staging: string;
    let infos: Map<string, { uuid: string; url: string; file: string }>;
    const path = (url: string) => join(root, url.slice('db://assets/'.length));
    beforeEach(async () => {
        project = await mkdtemp(join(tmpdir(), 'lightfx-publish-'));
        root = join(project, 'assets');
        await ensureDir(root);
        staging = `db://assets/staging/bake-${randomUUID()}`;
        infos = new Map();
        mockAssets.queryAssetInfo.mockReset().mockImplementation(uuid => infos.get(uuid));
        mockAssets.queryUUID.mockReset().mockImplementation(url => [...infos.values()].find(info => info.url === url)?.uuid);
        mockAssets.refreshAsset.mockReset().mockResolvedValue(undefined);
        mockAssets.moveAsset.mockReset().mockImplementation(async (source: string, target: string) => {
            const info = [...infos.values()].find(item => item.url === source)!;
            await move(info.file, path(target), { overwrite: false });
            await move(`${info.file}.meta`, `${path(target)}.meta`, { overwrite: false });
            Object.assign(info, { url: target, file: path(target) });
        });
    });
    afterEach(async () => { await remove(project); });
    async function add(name: string) {
        const uuid = randomUUID(), url = `${staging}/${name}`;
        await outputFile(path(url), `pixels:${name}`);
        await outputFile(`${path(url)}.meta`, JSON.stringify({ uuid }));
        infos.set(uuid, { uuid, url, file: path(url) });
        return uuid;
    }

    it('moves Mesh and Terrain files without copying old pixels or changing UUIDs, and removes only the empty staging directory', async () => {
        const ids = await Promise.all([add('LFX_Mesh_0000.png'), add('LFX_Terrain_0000.png')]);
        const result = await publishLightmapTextures(root, ids, staging, 'db://assets/LightFX');
        expect(result).toEqual(['db://assets/LightFX/output/LFX_Mesh_0000.png', 'db://assets/LightFX/output/LFX_Terrain_0000.png']);
        for (let i = 0; i < ids.length; i++) {
            expect(JSON.parse(await readFile(`${path(result[i])}.meta`, 'utf8')).uuid).toBe(ids[i]);
        }
        expect(await pathExists(path(staging))).toBe(false);
    });
    it.each(['file', 'meta', 'database'])('preflights all targets and refuses a %s collision without moving the first file', async kind => {
        const ids = await Promise.all([add('LFX_Mesh_0000.png'), add('LFX_Terrain_0000.png')]);
        const target = 'db://assets/LightFX/output/LFX_Terrain_0000.png';
        if (kind === 'database') infos.set('other', { uuid: 'other', url: target, file: path(target) });
        else await outputFile(`${path(target)}${kind === 'meta' ? '.meta' : ''}`, 'unrelated');
        await expect(publishLightmapTextures(root, ids, staging, 'db://assets/LightFX')).rejects.toThrow('occupied');
        expect(mockAssets.moveAsset).not.toHaveBeenCalled();
        expect(await readFile(infos.get(ids[0])!.file, 'utf8')).toBe('pixels:LFX_Mesh_0000.png');
    });
    it('retains resolvable new UUIDs after partial move failure, then can retry without overwriting', async () => {
        const ids = await Promise.all([add('LFX_Mesh_0000.png'), add('LFX_Terrain_0000.png')]);
        const original = mockAssets.moveAsset.getMockImplementation()!;
        mockAssets.moveAsset.mockImplementationOnce(original).mockRejectedValueOnce(new Error('move denied'));
        await expect(publishLightmapTextures(root, ids, staging, 'db://assets/LightFX')).rejects.toThrow('move denied');
        expect(ids.map(id => infos.get(id)!.url)).toEqual(['db://assets/LightFX/output/LFX_Mesh_0000.png', `${staging}/LFX_Terrain_0000.png`]);
        for (const info of infos.values()) expect(await pathExists(info.file)).toBe(true);
        await publishLightmapTextures(root, ids, staging, 'db://assets/LightFX');
        expect(await pathExists(path(staging))).toBe(false);
    });
    it('does not trust a successful move response without actual files and UUID mapping', async () => {
        const uuid = await add('LFX_Mesh_0000.png');
        mockAssets.moveAsset.mockResolvedValueOnce(undefined);
        await expect(publishLightmapTextures(root, [uuid], staging, 'db://assets/LightFX')).rejects.toThrow('not confirmed');
        expect(await pathExists(infos.get(uuid)!.file)).toBe(true);
    });
    it.each(['directory', 'dangling-meta'])('rejects %s symlinks without modifying outside files', async kind => {
        const uuid = await add('LFX_Mesh_0000.png');
        const outside = join(project, 'outside');
        await ensureDir(outside);
        if (kind === 'directory') await symlink(outside, path('db://assets/LightFX'));
        else {
            const meta = `${path('db://assets/LightFX/output/LFX_Mesh_0000.png')}.meta`;
            await ensureDir(dirname(meta));
            await symlink(join(outside, 'absent'), meta);
        }
        await expect(publishLightmapTextures(root, [uuid], staging, 'db://assets/LightFX')).rejects.toThrow('symbolic');
        expect(mockAssets.moveAsset).not.toHaveBeenCalled();
    });
    it('publishes native file bytes with their UUIDs but returns only preview texture URLs', async () => {
        const texture = await add('LFX_Mesh_0000.png');
        const native = await Promise.all(['lfx.in', 'lfx.out', 'lfx.log'].map(add));
        const result = await publishLightmapTextures(root, [texture], staging, 'db://assets/Chosen', native);
        expect(result).toEqual(['db://assets/Chosen/output/LFX_Mesh_0000.png']);
        const urls = ['tmp/lfx.in', 'output/lfx.out', 'lfx.log'].map(file => `db://assets/Chosen/${file}`);
        expect(native.map(uuid => infos.get(uuid)?.url)).toEqual(urls);
        expect(await Promise.all(urls.map(url => readFile(path(url), 'utf8')))).toEqual(['pixels:lfx.in', 'pixels:lfx.out', 'pixels:lfx.log']);
        expect(await pathExists(path(staging))).toBe(false);
    });
    it('preflights native collisions before moving any PNG and never replaces unrelated files', async () => {
        const texture = await add('LFX_Mesh_0000.png'), log = await add('lfx.log');
        const destination = path('db://assets/LightFX/lfx.log');
        await outputFile(destination, 'user log');
        await expect(publishLightmapTextures(root, [texture], staging, 'db://assets/LightFX', [log])).rejects.toThrow('occupied');
        expect(mockAssets.moveAsset).not.toHaveBeenCalled();
        expect(await readFile(destination, 'utf8')).toBe('user log');
    });
    it('retains new assets on a partial native move failure and can retry without duplicate PNG moves', async () => {
        const texture = await add('LFX_Mesh_0000.png'), input = await add('lfx.in');
        const original = mockAssets.moveAsset.getMockImplementation()!;
        mockAssets.moveAsset.mockImplementationOnce(original).mockRejectedValueOnce(new Error('native move denied'));
        await expect(publishLightmapTextures(root, [texture], staging, 'db://assets/LightFX', [input])).rejects.toThrow('native move denied');
        expect([await pathExists(infos.get(texture)!.file), await pathExists(infos.get(input)!.file)]).toEqual([true, true]);
        await publishLightmapTextures(root, [texture], staging, 'db://assets/LightFX', [input]);
        expect(await pathExists(path(staging))).toBe(false);
    });
    it('never deletes a nonempty version folder or a regular output directory', async () => {
        await outputFile(path(`${staging}/unrelated.txt`), 'keep');
        await removeEmptyLightmapVersion(root, staging);
        await ensureDir(path('db://assets/LightFX/output'));
        await removeEmptyLightmapVersion(root, 'db://assets/LightFX/output');
        expect([await readFile(path(`${staging}/unrelated.txt`), 'utf8'), await pathExists(path('db://assets/LightFX/output'))]).toEqual(['keep', true]);
    });
});
