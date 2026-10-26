import { ensureDir, existsSync, mkdtemp, outputFile, pathExists, readFile, remove, symlink, move } from 'fs-extra';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAssets = {
    queryPath: jest.fn(), refreshAsset: jest.fn(), queryUUID: jest.fn(),
    queryAssetMeta: jest.fn(() => ({ userData: { fixAlphaTransparencyArtifacts: false } })),
    queryAssetInfo: jest.fn(), queryAssetUsers: jest.fn(), removeAsset: jest.fn(), moveAsset: jest.fn(),
};
const mockRun = jest.fn();
const mockAssetDB = { ready: true, isBusy: jest.fn(() => false) };
jest.mock('../../assets', () => ({ assetManager: mockAssets, assetDBManager: mockAssetDB }));
jest.mock('../main-process/lightfx/process', () => ({ LightFXProcess: jest.fn(() => ({ run: mockRun, cancel: async () => undefined })) }));
jest.mock('../main-process/lightfx/output', () => ({ decodeLightFXOutput: () => ({ version: 1, meshes: [], terrains: [], probes: [] }) }));
import { LightFXBakeHost } from '../main-process/lightfx-bake-host';
import { LightmapAssetRecord } from '../main-process/lightfx/asset-record';

describe('Immutable Lightmap asset versions', () => {
    let root: string;
    let assetRoot: string;
    let host: LightFXBakeHost;
    const assetPath = (url: string) => join(assetRoot, url.slice('db://assets/'.length));
    const opts = { target: 'lightmap' as const, sceneName: 'SharedName', textureSources: [], timeoutMs: 120_000 };
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'lightfx-versions-'));
        assetRoot = join(root, 'assets');
        mockAssets.queryPath.mockReset().mockReturnValue(assetRoot);
        mockAssets.refreshAsset.mockReset().mockResolvedValue(undefined);
        // Asset identity stands for its unique import URL; the filesystem transaction is real.
        mockAssets.queryUUID.mockReset().mockImplementation((url: string) => url);
        mockRun.mockReset();
        host = new LightFXBakeHost();
        mockAssetDB.ready = true;
        mockAssetDB.isBusy.mockReturnValue(false);
    });
    afterEach(async () => { await host.dispose(); await remove(root); });

    async function bake(bytes: string, outputUrl?: string, sceneUuid?: string, transactionId?: string) {
        mockRun.mockImplementationOnce(async ({ cwd }: { cwd: string }) => {
            await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
            await outputFile(join(cwd, 'output', 'LFX_Mesh_0000.png'), bytes);
            await outputFile(join(cwd, 'lfx.log'), `native ${bytes}`);
        });
        const token = await host.begin({ ...opts, outputUrl, sceneUuid, transactionId });
        await host.appendInput({ ...token, chunkBase64: Buffer.from('input').toString('base64') });
        const output = await host.run(token);
        return { token, url: output.textureUrls[0], path: assetPath(output.textureUrls[0]) };
    }

    function realAssetFiles() {
        const identities = new Map<string, { uuid: string; file: string; url: string }>();
        mockAssets.queryUUID.mockImplementation((url: string) => {
            const existing = [...identities.values()].find(info => info.url === url);
            if (existing) return existing.uuid;
            if (!existsSync(assetPath(url))) return null;
            const uuid = randomUUID();
            identities.set(uuid, { uuid, url, file: assetPath(url) });
            return uuid;
        });
        mockAssets.queryAssetInfo.mockImplementation((uuid: string) => {
            const info = identities.get(uuid);
            return info && existsSync(info.file) ? info : null;
        });
        mockAssets.queryAssetUsers.mockReset().mockResolvedValue([]);
        mockAssets.removeAsset.mockReset().mockImplementation(async (uuid: string) => {
            const info = identities.get(uuid)!;
            await remove(info.file);
            await remove(`${info.file}.meta`);
            identities.delete(uuid);
        });
        mockAssets.moveAsset.mockReset().mockImplementation(async (source: string, target: string) => {
            const info = [...identities.values()].find(info => info.url === source)!;
            await move(info.file, assetPath(target), { overwrite: false });
            info.url = target;
            info.file = assetPath(target);
        });
        return identities;
    }

    it.each([undefined, 'db://assets', 'db://assets/Chosen'])('publishes fixed current textures with the same UUID and supports Clear after reopening (%s)', async outputUrl => {
        const identities = realAssetFiles(), sceneUuid = randomUUID();
        if (outputUrl) await ensureDir(assetPath(outputUrl));
        const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const a = await bake('pixels A', outputUrl, sceneUuid, owner.transactionId);
        const uuid = [...identities.keys()][0];
        const request = { ...a.token, ...owner };
        await expect(host.publishLightmapAssets(request)).rejects.toThrow('ownership');
        await host.commit(a.token);
        await expect(host.publishLightmapAssets({ ...request, operationId: randomUUID() })).rejects.toThrow('ownership');
        const output = await host.publishLightmapAssets(request);
        const target = `${outputUrl && outputUrl !== 'db://assets' ? outputUrl : 'db://assets/LightFX'}/scene-${sceneUuid}/output/LFX_Mesh_0000.png`;
        expect(output.textureUrls).toEqual([target]);
        expect([identities.get(uuid)?.url, await readFile(assetPath(target), 'utf8'), await pathExists(a.path)]).toEqual([target, 'pixels A', false]);
        const auxRoot = target.slice(0, -'/output/LFX_Mesh_0000.png'.length);
        expect(await Promise.all(['tmp/lfx.in', 'output/lfx.out', 'lfx.log'].map(path => readFile(assetPath(`${auxRoot}/${path}`), 'utf8'))))
            .toEqual(['input', '', 'native pixels A']);
        const auxiliary = await new LightmapAssetRecord(root, sceneUuid).readAuxiliary();
        expect(auxiliary).toHaveLength(3);
        await expect(host.publishLightmapAssets(request)).resolves.toEqual(output);
        await host.releaseSceneOperation(owner);
        host = new LightFXBakeHost();
        expect((await host.queryLightmapTextureInfo({ sceneUuid, uuids: [] })).ownedTextureUuids).toEqual([uuid]);
        const cleared = await host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid] });
        expect([cleared.deletedTextureUuids, await pathExists(assetPath(target))]).toEqual([[uuid], false]);
        expect(cleared.deletedAuxiliaryAssetUuids).toEqual(auxiliary);
        expect(await new LightmapAssetRecord(root, sceneUuid).readAuxiliary()).toEqual([]);
    });

    it('cleans prior files inside the committed Bake reservation without deleting the new result', async () => {
        const identities = realAssetFiles(), sceneUuid = randomUUID();
        const a = await bake('pixels A', undefined, sceneUuid);
        await host.commit(a.token);
        const oldUuid = [...identities.keys()][0];
        const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const cleanup = { ...owner, sceneUuid, textureUuids: [oldUuid], action: 'bake' as const };
        await expect(host.removeLightmapAssets(cleanup)).rejects.toThrow('ownership');
        const b = await bake('pixels B', undefined, sceneUuid, owner.transactionId);
        await expect(host.removeLightmapAssets(cleanup)).rejects.toThrow('already in progress');
        await host.commit(b.token);
        await expect(host.removeLightmapAssets({ ...cleanup, transactionId: randomUUID() })).rejects.toThrow('ownership');
        await expect(host.removeLightmapAssets(cleanup)).resolves.toEqual({ deletedTextureUuids: [oldUuid], retainedTextureUuids: [], failures: [] });
        expect([await pathExists(a.path), await readFile(b.path, 'utf8'), (await host.queryCapabilities()).busy])
            .toEqual([false, 'pixels B', true]);
        await host.releaseSceneOperation(owner);
        expect((await host.queryLightmapTextureInfo({ sceneUuid, uuids: [] })).ownedTextureUuids)
            .toEqual([...identities.values()].filter(info => info.url.endsWith('.png')).map(info => info.uuid));
    });

    it('replaces all native products after saving and protects the current set during rebake cleanup', async () => {
        const identities = realAssetFiles(), sceneUuid = randomUUID();
        const first = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const a = await bake('A', undefined, sceneUuid, first.transactionId);
        await host.commit(a.token);
        await host.publishLightmapAssets({ ...a.token, ...first });
        const oldIds = [...identities.keys()];
        await host.releaseSceneOperation(first);
        const second = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const b = await bake('B', undefined, sceneUuid, second.transactionId);
        await host.commit(b.token);
        const cleaned = await host.removeLightmapAssets({ ...second, sceneUuid, action: 'bake', textureUuids: [oldIds[0]] });
        expect([cleaned.deletedTextureUuids, cleaned.deletedAuxiliaryAssetUuids, cleaned.failures])
            .toEqual([[oldIds[0]], oldIds.slice(1), []]);
        expect(await pathExists(b.path)).toBe(true);
        await host.publishLightmapAssets({ ...b.token, ...second });
        expect(await readFile(assetPath(`db://assets/LightFX/scene-${sceneUuid}/lfx.log`), 'utf8')).toBe('native B');
        expect([...identities.values()].map(info => info.url)).toEqual([
            `db://assets/LightFX/scene-${sceneUuid}/output/LFX_Mesh_0000.png`, `db://assets/LightFX/scene-${sceneUuid}/tmp/lfx.in`,
            `db://assets/LightFX/scene-${sceneUuid}/output/lfx.out`, `db://assets/LightFX/scene-${sceneUuid}/lfx.log`,
        ]);
        await host.releaseSceneOperation(second);
    });

    it('protects native products referenced by the same scene and retries with no texture candidates after restart', async () => {
        const identities = realAssetFiles(), sceneUuid = randomUUID();
        const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const a = await bake('A', undefined, sceneUuid, owner.transactionId);
        await host.commit(a.token);
        await host.publishLightmapAssets({ ...a.token, ...owner });
        await host.releaseSceneOperation(owner);
        const [png, ...auxiliary] = [...identities.keys()];
        mockAssets.queryAssetUsers.mockImplementation(async uuid => auxiliary.includes(uuid) ? [sceneUuid] : []);
        const result = await host.removeLightmapAssets({ sceneUuid, textureUuids: [png] });
        expect([result.deletedTextureUuids, result.retainedAuxiliaryAssetUuids]).toEqual([[png], auxiliary]);
        host = new LightFXBakeHost();
        mockAssets.queryAssetUsers.mockResolvedValue([]);
        expect((await host.removeLightmapAssets({ sceneUuid, textureUuids: [] })).deletedAuxiliaryAssetUuids).toEqual(auxiliary);
        expect(identities.size).toBe(0);
    });
    it.each([undefined, 'db://assets', 'db://assets/Shared'])('isolates two same-name scenes, repeated bake and Clear in %s', async outputUrl => {
        const identities = realAssetFiles();
        if (outputUrl) await ensureDir(assetPath(outputUrl));
        const scenes = [randomUUID(), randomUUID()];
        const published: string[] = [];
        for (const sceneUuid of scenes) {
            const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
            const a = await bake(sceneUuid, outputUrl, sceneUuid, owner.transactionId);
            await host.commit(a.token);
            published.push((await host.publishLightmapAssets({ ...a.token, ...owner })).textureUrls[0]);
            await host.releaseSceneOperation(owner);
        }
        expect(published[0]).not.toBe(published[1]);
        const oldIds = await new LightmapAssetRecord(root, scenes[0]).read();
        const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const next = await bake('replacement', outputUrl, scenes[0], owner.transactionId);
        await host.commit(next.token);
        await host.removeLightmapAssets({ ...owner, sceneUuid: scenes[0], textureUuids: oldIds, action: 'bake' });
        expect((await host.publishLightmapAssets({ ...owner, ...next.token })).textureUrls[0]).toBe(published[0]);
        await host.releaseSceneOperation(owner);
        await host.removeLightmapAssets({ sceneUuid: scenes[0], textureUuids: await new LightmapAssetRecord(root, scenes[0]).read() });
        expect(await pathExists(assetPath(published[0]))).toBe(false);
        expect(await readFile(assetPath(published[1]), 'utf8')).toBe(scenes[1]);
        expect([...identities.values()].filter(info => info.url.includes(scenes[1]))).toHaveLength(4);
    });
    it('forgets auxiliary membership already removed through Asset DB, including retries after restart', async () => {
        const identities = realAssetFiles(), sceneUuid = randomUUID();
        const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const a = await bake('A', undefined, sceneUuid, owner.transactionId);
        await host.commit(a.token);
        await host.publishLightmapAssets({ ...a.token, ...owner });
        await host.releaseSceneOperation(owner);
        const log = [...identities.values()].find(info => info.url.endsWith('/lfx.log'))!;
        await mockAssets.removeAsset(log.uuid);
        const png = [...identities.values()].find(info => info.url.endsWith('.png'))!;
        expect((await host.removeLightmapAssets({ sceneUuid, textureUuids: [png.uuid] })).failures).toEqual([]);
        host = new LightFXBakeHost();
        expect((await host.removeLightmapAssets({ sceneUuid, textureUuids: [] })).failures).toEqual([]);
        expect(await new LightmapAssetRecord(root, sceneUuid).readAuxiliary()).toEqual([]);
        const next = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const b = await bake('B', undefined, sceneUuid, next.transactionId);
        await host.commit(b.token);
        await expect(host.publishLightmapAssets({ ...b.token, ...next })).resolves.toHaveProperty('textureUrls');
        await host.releaseSceneOperation(next);
    });
    it('cleans recorded legacy flat output before publishing into the scene-specific directory', async () => {
        const identities = realAssetFiles(), sceneUuid = randomUUID();
        const first = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const a = await bake('legacy', undefined, sceneUuid, first.transactionId);
        await host.commit(a.token);
        await host.publishLightmapAssets({ ...a.token, ...first });
        await host.releaseSceneOperation(first);
        const oldPaths: string[] = [];
        for (const info of [...identities.values()]) {
            const legacy = info.url.replace(`/scene-${sceneUuid}`, '');
            await mockAssets.moveAsset(info.url, legacy);
            oldPaths.push(assetPath(legacy));
        }
        const old = await new LightmapAssetRecord(root, sceneUuid).read();
        const next = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const b = await bake('new', undefined, sceneUuid, next.transactionId);
        await host.commit(b.token);
        expect((await host.removeLightmapAssets({ ...next, sceneUuid, textureUuids: old, action: 'bake' })).failures).toEqual([]);
        const result = await host.publishLightmapAssets({ ...b.token, ...next });
        expect(result.textureUrls[0]).toContain(`/scene-${sceneUuid}/output/`);
        expect(await Promise.all(oldPaths.map(file => pathExists(file)))).toEqual([false, false, false, false]);
        await host.releaseSceneOperation(next);
    });
    it.each(['startup', 'busy', 'query-error'])('retains missing membership during %s', async state => {
        realAssetFiles();
        const sceneUuid = randomUUID(), missing = randomUUID();
        const record = new LightmapAssetRecord(root, sceneUuid);
        await record.add([], [missing]);
        if (state === 'startup') mockAssetDB.ready = false;
        if (state === 'busy') mockAssetDB.isBusy.mockReturnValue(true);
        if (state === 'query-error') {
            mockAssets.queryAssetInfo.mockImplementation(() => { throw new Error('database unavailable'); });
            await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [] })).rejects.toThrow('database unavailable');
        } else {
            expect((await host.removeLightmapAssets({ sceneUuid, textureUuids: [] })).failures).toHaveLength(1);
        }
        expect(await record.readAuxiliary()).toEqual([missing]);
    });

    it('rolls back only newly staged native products without altering a previous fixed result', async () => {
        const identities = realAssetFiles(), sceneUuid = randomUUID();
        const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const a = await bake('A', undefined, sceneUuid, owner.transactionId);
        await host.commit(a.token);
        await host.publishLightmapAssets({ ...a.token, ...owner });
        await host.releaseSceneOperation(owner);
        const oldAuxiliary = await new LightmapAssetRecord(root, sceneUuid).readAuxiliary();
        const next = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const b = await bake('B', undefined, sceneUuid, next.transactionId);
        await host.rollback(b.token);
        expect(await new LightmapAssetRecord(root, sceneUuid).readAuxiliary()).toEqual(oldAuxiliary);
        expect(await readFile(assetPath(`db://assets/LightFX/scene-${sceneUuid}/lfx.log`), 'utf8')).toBe('native A');
        expect(await pathExists(b.path)).toBe(false);
        await host.releaseSceneOperation(next);
        expect([...identities.values()].filter(info => existsSync(info.file))).toHaveLength(4);
    });

    it('does not accept rebake cleanup after a rolled-back native operation or without a reservation', async () => {
        const sceneUuid = randomUUID();
        const owner = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const b = await bake('pixels B', undefined, undefined, owner.transactionId);
        await host.rollback(b.token);
        await expect(host.removeLightmapAssets({ ...owner, sceneUuid, textureUuids: [], action: 'bake' })).rejects.toThrow('ownership');
        await host.releaseSceneOperation(owner);
        await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [], action: 'bake' })).rejects.toThrow('ownership');
    });

    it('remembers unbound products across Host restart and deletes actual files in custom directories', async () => {
        const identities = realAssetFiles();
        const sceneUuid = randomUUID();
        await ensureDir(assetRoot);
        const a = await bake('pixels A', 'db://assets', sceneUuid);
        await host.commit(a.token);
        const b = await bake('pixels B', undefined, sceneUuid);
        await host.commit(b.token);
        await host.dispose();
        host = new LightFXBakeHost();
        const membership = await host.queryLightmapTextureInfo({ uuids: [], sceneUuid });
        expect(membership).toEqual({ textures: [], missingTextureUuids: [], ownedTextureUuids: [...identities.keys()] });
        const cleared = await host.removeLightmapAssets({ sceneUuid, textureUuids: membership.ownedTextureUuids! });
        expect([cleared.deletedTextureUuids.length, cleared.failures, await pathExists(a.path), await pathExists(b.path)])
            .toEqual([2, [], false, false]);
        expect((await host.queryLightmapTextureInfo({ uuids: [], sceneUuid })).ownedTextureUuids).toEqual([]);
    });

    it('retains externally used products for retry and isolates identical scene names by UUID', async () => {
        const identities = realAssetFiles();
        const sceneUuid = randomUUID();
        const otherScene = randomUUID();
        const a = await bake('pixels A', undefined, sceneUuid);
        await host.commit(a.token);
        const b = await bake('pixels B', undefined, otherScene);
        await host.commit(b.token);
        const [aUuid, bUuid] = [...identities.keys()];
        mockAssets.queryAssetUsers.mockResolvedValueOnce([otherScene]);
        expect((await host.removeLightmapAssets({ sceneUuid, textureUuids: [aUuid] })).retainedTextureUuids).toEqual([aUuid]);
        expect((await host.queryLightmapTextureInfo({ uuids: [], sceneUuid })).ownedTextureUuids).toEqual([aUuid]);
        await host.removeLightmapAssets({ sceneUuid, textureUuids: [aUuid] });
        expect([await pathExists(a.path), await pathExists(b.path)]).toEqual([false, true]);
        expect((await host.queryLightmapTextureInfo({ uuids: [], sceneUuid: otherScene })).ownedTextureUuids).toEqual([bUuid]);
    });

    it('does not count an asset API success when its PNG still exists', async () => {
        const identities = realAssetFiles();
        const sceneUuid = randomUUID();
        const a = await bake('pixels A', undefined, sceneUuid);
        await host.commit(a.token);
        mockAssets.removeAsset.mockResolvedValueOnce(undefined);
        const result = await host.removeLightmapAssets({ sceneUuid, textureUuids: [...identities.keys()] });
        expect([result.deletedTextureUuids, result.failures[0]?.reason, await pathExists(a.path)])
            .toEqual([[], 'Lightmap texture file still exists after asset deletion.', true]);
    });

    it('forgets rolled-back imports without losing earlier product membership', async () => {
        const identities = realAssetFiles();
        const sceneUuid = randomUUID();
        const a = await bake('pixels A', undefined, sceneUuid);
        await host.commit(a.token);
        const aUuid = [...identities.keys()][0];
        const b = await bake('pixels B', undefined, sceneUuid);
        await host.rollback(b.token);
        expect((await host.queryLightmapTextureInfo({ uuids: [], sceneUuid })).ownedTextureUuids).toEqual([aUuid]);
        expect([await pathExists(a.path), await pathExists(b.path)]).toEqual([true, false]);
    });

    it('keeps a failed legacy bound-asset delete in the record for later retry', async () => {
        const identities = realAssetFiles();
        const sceneUuid = randomUUID();
        // Legacy begin has no scene identity and therefore no generated-asset record yet.
        const a = await bake('legacy pixels');
        await host.commit(a.token);
        const uuid = [...identities.keys()][0];
        mockAssets.removeAsset.mockRejectedValueOnce(new Error('busy'));
        const result = await host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid] });
        expect(result.failures).toEqual([{ uuid, reason: 'busy' }]);
        const retry = (await new LightFXBakeHost().queryLightmapTextureInfo({ uuids: [], sceneUuid })).ownedTextureUuids!;
        expect(retry).toEqual([uuid]);
        await host.removeLightmapAssets({ sceneUuid, textureUuids: retry });
        expect(await pathExists(a.path)).toBe(false);
    });

    it('rejects a damaged record before native execution or asset deletion', async () => {
        const identities = realAssetFiles();
        const sceneUuid = randomUUID();
        const a = await bake('keep pixels');
        await host.commit(a.token);
        await outputFile(join(root, 'settings', 'lightfx-assets', `${sceneUuid}.json`), '{broken');
        await expect(host.begin({ ...opts, sceneUuid })).rejects.toThrow();
        await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [...identities.keys()] })).rejects.toThrow();
        expect(mockRun).toHaveBeenCalledTimes(1);
        expect(await readFile(a.path, 'utf8')).toBe('keep pixels');
        expect(mockAssets.removeAsset).not.toHaveBeenCalled();
    });

    it('publishes distinct assets across same-name bakes without touching legacy files or earlier versions', async () => {
        const legacy = join(assetRoot, opts.sceneName, 'lightmap', 'LFX_Mesh_0000.png');
        await outputFile(legacy, 'legacy pixels');
        await outputFile(`${legacy}.meta`, 'legacy UUID');
        const a = await bake('pixels A');
        await host.commit(a.token);
        const b = await bake('pixels B');
        await host.commit(b.token);
        expect(a.url).not.toBe(b.url);
        expect(a.url).toContain(`/bake-${a.token.operationId}/LFX_Mesh_0000.png`);
        expect(b.url).toContain(`/bake-${b.token.operationId}/LFX_Mesh_0000.png`);
        expect(await readFile(a.path, 'utf8')).toBe('pixels A');
        expect(await readFile(b.path, 'utf8')).toBe('pixels B');
        expect(await readFile(legacy, 'utf8')).toBe('legacy pixels');
        expect(await readFile(`${legacy}.meta`, 'utf8')).toBe('legacy UUID');
    });

    it('rolls back only the current version and retains the previous published assets', async () => {
        const a = await bake('pixels A');
        await host.commit(a.token);
        const b = await bake('pixels B');
        await host.rollback(b.token);
        expect(await readFile(a.path, 'utf8')).toBe('pixels A');
        expect(await pathExists(b.path)).toBe(false);
    });

    it.each(['db://assets', 'db://assets/烘焙结果/Room A'])('publishes and rolls back within the selected directory: %s', async outputUrl => {
        await ensureDir(join(assetRoot, outputUrl.slice('db://assets'.length)));
        const a = await bake('custom A', outputUrl);
        await host.commit(a.token);
        const b = await bake('custom B', outputUrl);
        expect(a.url).toBe(`${outputUrl}/bake-${a.token.operationId}/LFX_Mesh_0000.png`);
        expect(b.url).not.toBe(a.url);
        await host.rollback(b.token);
        expect(await readFile(a.path, 'utf8')).toBe('custom A');
        expect(await pathExists(b.path)).toBe(false);
        expect(await pathExists(join(assetRoot, opts.sceneName))).toBe(false);
    });

    it.each(['', '/tmp/results', 'db://assets-other', 'db://assets/../outside', 'db://assets//folder', 'db://assets/folder/', 'db://assets/%2e%2e', 'db://assets/a\\b', 'db://assets/a?b', 'db://assets/a\nb', 'db://assets/a\0b'])('rejects invalid output URL before reserving or writing: %s', async outputUrl => {
        await expect(host.begin({ ...opts, outputUrl })).rejects.toThrow('output directory');
        expect((await host.queryCapabilities()).busy).toBe(false);
        expect(await pathExists(join(root, 'temp'))).toBe(false);
    });

    it('rejects missing folders, files and symlinks escaping assets without starting native work', async () => {
        await ensureDir(assetRoot);
        await outputFile(join(assetRoot, 'file'), 'keep');
        await symlink(root, join(assetRoot, 'outside'), 'dir');
        for (const name of ['missing', 'file', 'outside']) {
            await expect(host.begin({ ...opts, outputUrl: `db://assets/${name}` })).rejects.toThrow();
            expect((await host.queryCapabilities()).busy).toBe(false);
        }
        expect(mockRun).not.toHaveBeenCalled();
        expect(await readFile(join(assetRoot, 'file'), 'utf8')).toBe('keep');
    });

    it('keeps previous assets when importing a new version fails', async () => {
        const a = await bake('pixels A');
        await host.commit(a.token);
        mockAssets.refreshAsset.mockRejectedValueOnce(new Error('import unavailable'));
        await expect(bake('pixels B')).rejects.toThrow('import unavailable');
        expect(await readFile(a.path, 'utf8')).toBe('pixels A');
        await expect(host.queryCapabilities()).resolves.toEqual({ sceneTransactionVersion: 1, lightmapAssetVersion: 1, lightmapOutputDirectory: true, lightmapAssetCleanupVersion: 1, lightmapRebakeCleanupVersion: 1, lightmapPublicationVersion: 1, lightmapAuxiliaryAssetsVersion: 1, cancelOwnershipVersion: 1, diagnosticsVersion: 1, busy: false });
    });
});
