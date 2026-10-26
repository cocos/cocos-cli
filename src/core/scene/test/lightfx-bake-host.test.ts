import { mkdtemp, outputFile, pathExists, readFile, readdir, remove } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAssetManager = {
    queryPath: jest.fn(),
    refreshAsset: jest.fn(),
    queryUUID: jest.fn(),
    queryAssetInfo: jest.fn(),
    queryAssetUsers: jest.fn(),
    removeAsset: jest.fn(),
    queryAssetMeta: jest.fn(),
    saveAssetMeta: jest.fn(),
};
const mockRunnerRun = jest.fn();
const mockRunnerCancel = jest.fn();
const mockDecodedResult = { version: 1, meshes: [], terrains: [], probes: [] };

jest.mock('../../assets', () => ({ assetManager: mockAssetManager }));
jest.mock('../main-process/lightfx/process', () => ({
    LightFXProcess: jest.fn().mockImplementation(() => ({
        run: mockRunnerRun,
        cancel: mockRunnerCancel,
    })),
}));
jest.mock('../main-process/lightfx/asset-transaction', () => ({
    LightmapAssetTransaction: jest.fn(),
}));
jest.mock('../main-process/lightfx/output', () => ({
    decodeLightFXOutput: jest.fn(() => mockDecodedResult),
}));

import { LightFXBakeHost, parseLightFXProgressRate } from '../main-process/lightfx-bake-host';

describe('LightFXBakeHost', () => {
    const sceneUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    let root: string;
    let assetRoot: string;
    let host: LightFXBakeHost;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'lightfx-host-'));
        assetRoot = join(root, 'assets');
        mockAssetManager.queryPath.mockReset().mockImplementation((value: string) => (
            value === 'db://assets' ? assetRoot : null
        ));
        mockAssetManager.refreshAsset.mockReset().mockResolvedValue(undefined);
        mockAssetManager.queryUUID.mockReset();
        mockAssetManager.queryAssetInfo.mockReset();
        mockAssetManager.queryAssetUsers.mockReset().mockResolvedValue([]);
        mockAssetManager.removeAsset.mockReset().mockResolvedValue({});
        mockAssetManager.queryAssetMeta.mockReset();
        mockAssetManager.saveAssetMeta.mockReset();
        mockRunnerRun.mockReset();
        mockRunnerCancel.mockReset().mockResolvedValue(undefined);
        host = new LightFXBakeHost();
    });

    afterEach(async () => {
        await host.dispose();
        await remove(root);
    });

    async function finishLightProbe(transactionId?: string): Promise<string> {
        mockRunnerRun.mockImplementationOnce(async ({ cwd }: { cwd: string }) => {
            await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
        });
        const { operationId } = await host.begin({
            transactionId,
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
        await expect(host.run({ operationId })).resolves.toEqual({ result: mockDecodedResult, textureUrls: [] });
        return operationId;
    }

    it('extracts only verified percentages from the native Progress channel', () => {
        expect([
            parseLightFXProgressRate('Build lighting 0%'),
            parseLightFXProgressRate('Build lighting 25%\n'),
            parseLightFXProgressRate('Build lighting 99.5%'),
            parseLightFXProgressRate('Build lighting 100%'),
        ]).toEqual([0, 25, 99.5, 100]);
        for (const value of ['[2,400]', 'Build lighting 101%', 'Build lighting -1%', 'Other stage 25%', '25%', { rate: 25 }]) {
            expect(parseLightFXProgressRate(value)).toBeUndefined();
        }
    });

    it('queries protocol and occupancy without reserving, releasing or exposing ownership', async () => {
        const idle = { sceneTransactionVersion: 1, lightmapAssetVersion: 1, lightmapOutputDirectory: true, lightmapAssetCleanupVersion: 1, lightmapRebakeCleanupVersion: 1, lightmapPublicationVersion: 1, lightmapAuxiliaryAssetsVersion: 1, cancelOwnershipVersion: 1, diagnosticsVersion: 1, busy: false };
        const busy = { ...idle, busy: true };
        await expect(host.queryCapabilities()).resolves.toEqual(idle);
        const token = await host.reserveSceneOperation({ target: 'light-probe', action: 'bake' });
        await expect(host.queryCapabilities()).resolves.toEqual(busy);
        await expect(host.queryCapabilities()).resolves.toEqual(busy);
        const operationId = await finishLightProbe(token.transactionId);
        await expect(host.queryCapabilities()).resolves.toEqual(busy);
        await host.commit({ operationId });
        await expect(host.queryCapabilities()).resolves.toEqual(busy);
        await host.releaseSceneOperation(token);
        await expect(host.queryCapabilities()).resolves.toEqual(idle);
        const legacyId = await finishLightProbe();
        await expect(host.queryCapabilities()).resolves.toEqual(busy);
        await host.rollback({ operationId: legacyId });
        await expect(host.queryCapabilities()).resolves.toEqual(idle);
    });

    it('bounds native diagnostics, checks exact ownership and retains terminal logs without accepting late callbacks', async () => {
        let lateLog!: (message: string) => void;
        mockRunnerRun.mockImplementationOnce(async ({ cwd, onLog, onProgress }: {
            cwd: string; onLog: (message: string) => void; onProgress: (value: unknown) => void;
        }) => {
            lateLog = onLog;
            for (let index = 0; index < 150; index++) { onLog(`line ${index}`); }
            onProgress({ native: [1, 4], file: cwd });
            onProgress('Build lighting 25%\n');
            await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
        });
        const token = await host.reserveSceneOperation({ target: 'light-probe', action: 'bake' });
        const { operationId } = await host.begin({ ...token, target: 'light-probe', sceneName: 'Probe', textureSources: [], timeoutMs: 120_000 });
        const owner = { ...token, operationId, target: 'light-probe' as const };
        await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
        await host.run({ operationId });
        const diagnostic = (await host.queryDiagnostics(owner))!;
        expect([diagnostic.stage, diagnostic.logs.length, diagnostic.logs[0], diagnostic.logs.at(-1), diagnostic.progress, diagnostic.rate])
            .toEqual(['awaiting-commit', 128, 'line 22', 'line 149', 'Build lighting 25%\n', 25]);
        diagnostic.logs.length = 0;
        await expect(host.queryDiagnostics({ ...owner, target: 'lightmap' })).resolves.toBeUndefined();
        await expect(host.queryDiagnostics({ ...owner, transactionId: undefined })).resolves.toBeUndefined();
        await expect(host.queryDiagnostics({ ...owner, operationId: 'old' })).resolves.toBeUndefined();
        await host.commit({ operationId });
        lateLog('late callback');
        const completed = (await host.queryDiagnostics(owner))!;
        expect([completed.stage, completed.logs.length, completed.logs.at(-1)]).toEqual(['committed', 128, 'line 149']);
        await host.releaseSceneOperation(token);
    });

    it('assembles product logs from real progress and exported counts, not the verbose native file', async () => {
        jest.spyOn(host as any, 'stageLightmapAssets').mockResolvedValue([]);
        mockRunnerRun.mockImplementationOnce(async ({ cwd, onProgress }: { cwd: string; onProgress: (value: string) => void }) => {
            onProgress('Build lighting 25%');
            onProgress('Build lighting 50%');
            onProgress('Build lighting 100%');
            await outputFile(join(cwd, 'lfx.log'), '2026-09-12 Version 382\nCmdLine: /native/LightFX\nStarting thread 0\n');
            await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
        });
        const token = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const { operationId } = await host.begin({ ...token, target: 'lightmap', sceneName: 'Scene', textureSources: [], timeoutMs: 120_000,
            sceneStats: { objects: 3, lights: 1, triangles: 224 } });
        await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
        await host.run({ operationId });
        await host.commit({ operationId });
        expect((await host.queryDiagnostics({ ...token, operationId, target: 'lightmap' }))?.logs).toEqual([
            'Baking started', 'Build lighting 25%', 'Build lighting 50%', 'Build lighting 100%',
            'The baking is ready to complete and begin generating images.',
            'Bake scene stats: objects 3 lights 1 triangles 224', 'End of the baking.',
        ]);
        await host.releaseSceneOperation(token);
    });

    it('does not report successful image generation or statistics when native work fails', async () => {
        mockRunnerRun.mockImplementationOnce(async ({ onLog, onProgress }) => {
            onLog('Version 382');
            onLog('Warning: native sample warning');
            onProgress('Build lighting 25%');
            throw new Error('native bake failed');
        });
        const token = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const { operationId } = await host.begin({ ...token, target: 'lightmap', sceneName: 'Scene', textureSources: [], timeoutMs: 120_000,
            sceneStats: { objects: 2, lights: 1, triangles: 4108 } });
        await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
        await expect(host.run({ operationId })).rejects.toThrow('native bake failed');
        expect((await host.queryDiagnostics({ ...token, operationId, target: 'lightmap' }))?.logs)
            .toEqual(['Baking started', 'Warning: native sample warning', 'Build lighting 25%']);
        await host.releaseSceneOperation(token);
    });

    it.each([-1, NaN, 1.5])('rejects malformed exported statistics %s before starting native work', async triangles => {
        await expect(host.begin({ target: 'lightmap', sceneName: 'Scene', textureSources: [], timeoutMs: 120_000,
            sceneStats: { objects: 2, lights: 1, triangles } })).rejects.toThrow('exported scene statistics');
        expect(mockRunnerRun).not.toHaveBeenCalled();
        expect((await host.queryCapabilities()).busy).toBe(false);
    });

    it('reserves before export, rejects missing/wrong ownership and keeps the lease past native commit', async () => {
        const token = await host.reserveSceneOperation({ target: 'light-probe', action: 'bake' });
        const opts = { target: 'light-probe' as const, sceneName: 'LightProbe', textureSources: [], timeoutMs: 120_000 };
        await expect(host.reserveSceneOperation({ target: 'lightmap', action: 'clear' })).rejects.toThrow('already in progress');
        await expect(host.begin(opts)).rejects.toThrow('ownership');
        await expect(host.begin({ ...opts, transactionId: 'other' })).rejects.toThrow('ownership');
        await expect(host.begin({ ...opts, ...token, target: 'lightmap' })).rejects.toThrow('ownership');
        await expect(host.releaseSceneOperation({ transactionId: 'other' })).rejects.toThrow('Unknown');
        const operationId = await finishLightProbe(token.transactionId);
        await expect(host.releaseSceneOperation(token)).rejects.toThrow('cleanup has not finished');
        await host.commit({ operationId });
        await expect(host.reserveSceneOperation({ target: 'lightmap', action: 'clear' })).rejects.toThrow('already in progress');
        await expect(host.begin({ ...opts, ...token })).rejects.toThrow('already started');
        await host.releaseSceneOperation(token);
        const next = await host.reserveSceneOperation({ target: 'lightmap', action: 'clear' });
        await host.releaseSceneOperation(token); // A repeated release cannot unlock next.
        await expect(host.reserveSceneOperation({ target: 'light-probe', action: 'bake' })).rejects.toThrow('already in progress');
        await host.releaseSceneOperation(next);
        await expect(host.begin({ ...opts, ...token })).rejects.toThrow('ownership');
    });

    it('keeps a reservation after native rollback until scene recovery has finished', async () => {
        const token = await host.reserveSceneOperation({ target: 'light-probe', action: 'bake' });
        const operationId = await finishLightProbe(token.transactionId);
        await host.rollback({ operationId });
        await expect(host.reserveSceneOperation({ target: 'lightmap', action: 'clear' })).rejects.toThrow('already in progress');
        await host.releaseSceneOperation(token);
        await expect(host.reserveSceneOperation({ target: 'lightmap', action: 'clear' })).resolves.toHaveProperty('transactionId');
    });

    it('rejects invalid reservation and clear credentials without deleting assets', async () => {
        await expect(host.reserveSceneOperation({ target: 'invalid' as any, action: 'clear' })).rejects.toThrow('Invalid');
        await expect(host.releaseSceneOperation({ transactionId: '' })).rejects.toThrow('Invalid');
        const uuid = '11111111-1111-4111-8111-111111111111';
        const token = await host.reserveSceneOperation({ target: 'light-probe', action: 'clear' });
        await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid], ...token })).rejects.toThrow('ownership');
        await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid] })).rejects.toThrow('ownership');
        expect(mockAssetManager.removeAsset).not.toHaveBeenCalled();
        await host.releaseSceneOperation(token);
    });

    it.each([false, true])('keeps exact asset deletion locked (legacy=%s)', async (legacy) => {
        let finish!: () => void;
        let entered!: () => void;
        const enteredRemoval = new Promise<void>(resolve => { entered = resolve; });
        const uuid = '11111111-1111-4111-8111-111111111111';
        mockAssetManager.queryAssetInfo.mockReturnValue({ uuid, url: `db://assets/Maps/bake-22222222-2222-4222-8222-222222222222/LFX_Mesh_0000.png` });
        mockAssetManager.removeAsset.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({}); entered(); }));
        const token = legacy ? undefined : await host.reserveSceneOperation({ target: 'lightmap', action: 'clear' });
        const removing = host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid], ...token });
        await enteredRemoval;
        await expect(host.reserveSceneOperation({ target: 'light-probe', action: 'bake' })).rejects.toThrow('already in progress');
        if (token) {
            await expect(host.releaseSceneOperation(token)).rejects.toThrow('cleanup has not finished');
            await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid], ...token })).rejects.toThrow('already being removed');
        }
        finish(); await removing;
        if (token) await host.releaseSceneOperation(token);
        await expect(host.reserveSceneOperation({ target: 'light-probe', action: 'bake' })).resolves.toHaveProperty('transactionId');
    });

    it('deletes only exact unreferenced immutable LightFX textures', async () => {
        const deleted = '11111111-1111-4111-8111-111111111111';
        const retained = '22222222-2222-4222-8222-222222222222';
        const invalid = '33333333-3333-4333-8333-333333333333';
        const failed = '44444444-4444-4444-8444-444444444444';
        mockAssetManager.queryAssetInfo.mockImplementation((uuid: string) => ({
            uuid,
            url: uuid === invalid
                ? 'db://assets/User/texture.png'
                : `db://assets/Maps/bake-55555555-5555-4555-8555-555555555555/LFX_Terrain_0000.png`,
        }));
        mockAssetManager.queryAssetUsers.mockImplementation(async (uuid: string) => uuid === retained
            ? ['66666666-6666-4666-8666-666666666666']
            : uuid === deleted ? [`${deleted}@6c48a`, sceneUuid] : []);
        mockAssetManager.removeAsset.mockImplementation(async (uuid: string) => {
            if (uuid === failed) throw new Error('trash unavailable');
            return {};
        });

        await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [`${deleted}@6c48a`, deleted, retained, invalid, failed] })).resolves.toEqual({
            deletedTextureUuids: [deleted],
            retainedTextureUuids: [retained],
            failures: [
                { uuid: invalid, reason: 'Asset is not a managed LightFX texture.' },
                { uuid: failed, reason: 'trash unavailable' },
            ],
        });
        expect(mockAssetManager.queryAssetUsers).toHaveBeenCalledTimes(3);
        expect(mockAssetManager.removeAsset).toHaveBeenCalledTimes(2);
    });

    it.each(['6c48a', 'f9941'])('retains a parent image referenced only through subasset %s', async suffix => {
        const uuid = '11111111-1111-4111-8111-111111111111';
        const child = `${uuid}@${suffix}`;
        mockAssetManager.queryAssetInfo.mockReturnValue({ uuid,
            url: 'db://assets/Maps/bake-22222222-2222-4222-8222-222222222222/LFX_Mesh_0000.png',
            subAssets: { [suffix]: { uuid: child, subAssets: {} } },
        });
        mockAssetManager.queryAssetUsers.mockImplementation(async (id: string) => id === child
            ? ['66666666-6666-4666-8666-666666666666'] : []);
        const options = { sceneUuid, textureUuids: [uuid] };
        await expect(host.removeLightmapAssets(options)).resolves.toEqual({ deletedTextureUuids: [], retainedTextureUuids: [uuid], failures: [] });
        expect(mockAssetManager.removeAsset).not.toHaveBeenCalled();
        expect(mockAssetManager.queryAssetUsers).toHaveBeenCalledWith(child);
        // Once external references are removed, internal subasset dependencies do not
        // prevent exact cleanup. The same candidate can be retried after Clear.
        mockAssetManager.queryAssetUsers.mockResolvedValue([child]);
        await expect(host.removeLightmapAssets(options)).resolves.toEqual({ deletedTextureUuids: [uuid], retainedTextureUuids: [], failures: [] });
    });

    it('retains an image when only its subasset dependency query fails', async () => {
        const uuid = '11111111-1111-4111-8111-111111111111';
        mockAssetManager.queryAssetInfo.mockReturnValue({ uuid,
            url: 'db://assets/Maps/bake-22222222-2222-4222-8222-222222222222/LFX_Mesh_0000.png',
            subAssets: { texture: { uuid: `${uuid}@6c48a` } },
        });
        mockAssetManager.queryAssetUsers.mockImplementation(async (id: string) => {
            if (id.includes('@')) throw new Error('subasset index unavailable');
            return [];
        });
        await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid] })).resolves.toEqual({
            deletedTextureUuids: [], retainedTextureUuids: [], failures: [{ uuid, reason: 'subasset index unavailable' }],
        });
        expect(mockAssetManager.removeAsset).not.toHaveBeenCalled();
    });

    it('reports dependency query failures without attempting that deletion', async () => {
        const uuid = '11111111-1111-4111-8111-111111111111';
        mockAssetManager.queryAssetInfo.mockReturnValue({
            uuid,
            url: 'db://assets/Maps/bake-22222222-2222-4222-8222-222222222222/LFX_Mesh_0000.png',
        });
        mockAssetManager.queryAssetUsers.mockRejectedValueOnce(new Error('dependency index unavailable'));

        await expect(host.removeLightmapAssets({ sceneUuid, textureUuids: [uuid] })).resolves.toEqual({
            deletedTextureUuids: [],
            retainedTextureUuids: [],
            failures: [{ uuid, reason: 'dependency index unavailable' }],
        });
        expect(mockAssetManager.removeAsset).not.toHaveBeenCalled();
    });

    it('reserves against legacy native operations and keeps ownership after begin validation failure', async () => {
        const operationId = await finishLightProbe();
        await expect(host.reserveSceneOperation({ target: 'lightmap', action: 'clear' })).rejects.toThrow('already in progress');
        await host.rollback({ operationId });
        const token = await host.reserveSceneOperation({ target: 'light-probe', action: 'bake' });
        await expect(host.begin({ ...token, target: 'light-probe', sceneName: 'Scene', textureSources: [], timeoutMs: 1 })).rejects.toThrow('timeout');
        await expect(host.reserveSceneOperation({ target: 'lightmap', action: 'clear' })).rejects.toThrow('already in progress');
        await host.releaseSceneOperation(token);
    });

    it('accepts chunked input, reserves one operation, and rolls it back idempotently', async () => {
        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });

        await expect(host.begin({
            target: 'lightmap',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        })).rejects.toThrow('A light-probe LightFX bake is already in progress.');

        await host.appendInput({ operationId, chunkBase64: Buffer.from('first').toString('base64') });
        await host.appendInput({ operationId, chunkBase64: Buffer.from('-second').toString('base64') });

        const workspaces = await readdir(join(root, 'temp', 'lightfx-bake'));
        expect(workspaces).toHaveLength(1);
        await expect(readFile(join(root, 'temp', 'lightfx-bake', workspaces[0], 'tmp', 'lfx.in'), 'utf8'))
            .resolves.toBe('first-second');

        await host.rollback({ operationId });
        await expect(host.rollback({ operationId })).resolves.toBeUndefined();
        expect(mockRunnerCancel).toHaveBeenCalledTimes(1);
        await expect(pathExists(join(root, 'temp', 'lightfx-bake', workspaces[0])))
            .resolves.toBe(false);

        await expect(host.begin({
            target: 'lightmap',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        })).resolves.toEqual({ operationId: expect.any(String) });
    });

    it('rejects invalid requests without leaving a reserved operation behind', async () => {
        await expect(host.begin({
            target: 'light-probe',
            sceneName: '../LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        })).rejects.toThrow('Invalid LightFX scene name.');
        await expect(host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 999,
        })).rejects.toThrow('LightFX timeout must be an integer between 1000 and 3600000 milliseconds.');

        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        await expect(host.appendInput({ operationId, chunkBase64: 'not-base64' }))
            .rejects.toThrow('Invalid base64 LightFX input chunk.');
        await expect(host.appendInput({ operationId: 'missing', chunkBase64: '' }))
            .rejects.toThrow('Unknown LightFX operation: missing');
    });

    it('returns a stable no-op result when there is no operation to cancel', async () => {
        await expect(host.cancel()).resolves.toEqual({ cancelled: false, target: null });
        expect(mockRunnerCancel).not.toHaveBeenCalled();
    });

    it('queries display-safe metadata for bound lightmap textures', async () => {
        const uuid = '11111111-1111-4111-8111-111111111111';
        const missingUuid = '22222222-2222-4222-8222-222222222222';
        const file = join(assetRoot, 'Lightmap', 'lightmap', 'LFX_Mesh_0000.png');
        await outputFile(file, Buffer.from('lightmap'));
        mockAssetManager.queryAssetInfo.mockImplementation((value: string) => value === uuid ? {
            uuid,
            url: 'db://assets/Lightmap/lightmap/LFX_Mesh_0000.png',
            file,
        } : null);

        await expect(host.queryLightmapTextureInfo({
            uuids: [`${uuid}@6c48a`, uuid, missingUuid],
        })).resolves.toEqual({
            textures: [{
                uuid,
                url: 'db://assets/Lightmap/lightmap/LFX_Mesh_0000.png',
                filename: 'LFX_Mesh_0000.png',
                size: 8,
                createdAt: expect.any(Number),
                modifiedAt: expect.any(Number),
            }],
            missingTextureUuids: [missingUuid],
        });
        expect(mockAssetManager.queryAssetInfo).toHaveBeenCalledTimes(2);
    });

    it('rejects unowned and stale cancellation without stopping the current reserved bake', async () => {
        const token = await host.reserveSceneOperation({ target: 'light-probe', action: 'bake' });
        const operationId = await finishLightProbe(token.transactionId);
        const current = { operationId, ...token, target: 'light-probe' as const };
        for (const request of [undefined, { ...current, operationId: 'old' }, { ...current, transactionId: undefined },
            { ...current, transactionId: 'other' }, { ...current, target: 'lightmap' as const }]) {
            await expect(host.cancel(request)).resolves.toEqual({ cancelled: false, target: null });
        }
        expect(mockRunnerCancel).not.toHaveBeenCalled();
        await expect(host.cancel(current)).resolves.toEqual({ cancelled: true, target: 'light-probe' });
        await host.releaseSceneOperation(token);
        const nextToken = await host.reserveSceneOperation({ target: 'light-probe', action: 'bake' });
        const nextId = await finishLightProbe(nextToken.transactionId);
        await expect(host.cancel(current)).resolves.toEqual({ cancelled: false, target: null });
        await expect(host.cancel({ ...current, ...nextToken })).resolves.toEqual({ cancelled: false, target: null });
        expect(mockRunnerCancel).toHaveBeenCalledTimes(1);
        await host.commit({ operationId: nextId });
        await host.releaseSceneOperation(nextToken);
    });

    it('reports cancellation instead of an unknown operation when upload continues after cancel', async () => {
        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });

        await expect(host.cancel({ operationId, target: 'light-probe' })).resolves.toEqual({ cancelled: true, target: 'light-probe' });
        await expect(host.appendInput({
            operationId,
            chunkBase64: Buffer.from('late chunk').toString('base64'),
        })).rejects.toThrow('LightFX bake was cancelled.');
        await expect(host.run({ operationId })).rejects.toThrow('LightFX bake was cancelled.');
    });

    it('waits for an accepted input write before removing the operation workspace', async () => {
        const { operationId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        const operation = (host as any).operation;
        let finishWrite!: () => void;
        operation.inputWritePromise = new Promise<void>((resolve) => {
            finishWrite = resolve;
        });

        const rollingBack = host.rollback({ operationId });
        await Promise.resolve();
        await expect(pathExists(operation.workspace)).resolves.toBe(true);

        finishWrite();
        await expect(rollingBack).resolves.toBeUndefined();
        await expect(pathExists(operation.workspace)).resolves.toBe(false);
    });

    it('makes commit idempotent but rejects commit after rollback', async () => {
        const committedId = await finishLightProbe();
        await expect(Promise.all([
            host.commit({ operationId: committedId }),
            host.commit({ operationId: committedId }),
        ])).resolves.toEqual([undefined, undefined]);
        await expect(host.commit({ operationId: committedId })).resolves.toBeUndefined();

        const { operationId: rolledBackId } = await host.begin({
            target: 'light-probe',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        await host.rollback({ operationId: rolledBackId });
        await expect(host.commit({ operationId: rolledBackId }))
            .rejects.toThrow('LightFX bake was rolled-back and cannot be committed.');
    });

    it('lets cancel win atomically after run and prevents a stale scene result from committing', async () => {
        const operationId = await finishLightProbe();
        const cancelling = host.cancel({ operationId, target: 'light-probe' });

        await expect(host.commit({ operationId }))
            .rejects.toThrow('LightFX bake was cancelled and cannot be committed.');
        await expect(cancelling).resolves.toEqual({ cancelled: true, target: 'light-probe' });
        await expect(host.commit({ operationId }))
            .rejects.toThrow('LightFX bake was cancelled and cannot be committed.');
    });

    it('lets commit win atomically over a concurrent cancel request', async () => {
        const operationId = await finishLightProbe();
        const committing = host.commit({ operationId });

        await expect(host.cancel({ operationId, target: 'light-probe' })).resolves.toEqual({ cancelled: false, target: null });
        await expect(committing).resolves.toBeUndefined();
        await expect(host.commit({ operationId })).resolves.toBeUndefined();
    });

    it('preserves a rollback backup and the active operation when restoration fails', async () => {
        const token = await host.reserveSceneOperation({ target: 'lightmap', action: 'bake' });
        const { operationId } = await host.begin({
            ...token,
            target: 'lightmap',
            sceneName: 'LightProbe',
            textureSources: [],
            timeoutMs: 120_000,
        });
        const operation = (host as any).operation;
        const rollbackAssets = jest.fn()
            .mockRejectedValueOnce(new Error('restore failed'))
            .mockResolvedValueOnce(undefined);
        operation.assets = { rollback: rollbackAssets };

        await expect(host.rollback({ operationId })).rejects.toThrow('restore failed');
        await expect(pathExists(operation.workspace)).resolves.toBe(true);
        expect((host as any).completedOperations.has(operationId)).toBe(false);
        expect((host as any).operation).toBe(operation);
        await expect(host.releaseSceneOperation(token)).rejects.toThrow('cleanup has not finished');
        await expect(host.reserveSceneOperation({ target: 'light-probe', action: 'clear' })).rejects.toThrow('already in progress');

        await expect(host.rollback({ operationId })).resolves.toBeUndefined();
        expect(rollbackAssets).toHaveBeenCalledTimes(2);
        await expect(pathExists(operation.workspace)).resolves.toBe(false);
        await expect(host.commit({ operationId }))
            .rejects.toThrow('LightFX bake was rolled-back and cannot be committed.');
        await host.releaseSceneOperation(token);
    });

    it('marks an awaiting commit as expired before asynchronous cleanup starts', async () => {
        jest.useFakeTimers();
        try {
            mockRunnerRun.mockImplementationOnce(async ({ cwd }: { cwd: string }) => {
                await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
            });
            const { operationId } = await host.begin({
                target: 'light-probe',
                sceneName: 'LightProbe',
                textureSources: [],
                timeoutMs: 1_000,
            });
            await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
            await host.run({ operationId });

            jest.advanceTimersByTime(1_000);
            await expect(host.commit({ operationId }))
                .rejects.toThrow('LightFX bake was expired and cannot be committed.');
            await Promise.resolve();
            await Promise.resolve();
        } finally {
            jest.useRealTimers();
        }
    });

    it('lets run serialize cleanup when expiry interrupts an active bake', async () => {
        jest.useFakeTimers();
        try {
            let rejectRun!: (error: Error) => void;
            mockRunnerRun.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
                rejectRun = reject;
            }));
            const { operationId } = await host.begin({
                target: 'light-probe',
                sceneName: 'LightProbe',
                textureSources: [],
                timeoutMs: 1_000,
            });
            const operation = (host as any).operation;
            await host.appendInput({ operationId, chunkBase64: Buffer.from('input').toString('base64') });
            const runResult = expect(host.run({ operationId })).rejects.toThrow('LightFX bake timed out.');
            await Promise.resolve();
            expect(mockRunnerRun).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1_000);
            await Promise.resolve();
            await Promise.resolve();
            expect(mockRunnerCancel).toHaveBeenCalledTimes(1);
            expect(operation.cleanupPromise).toBeNull();
            await expect(pathExists(operation.workspace)).resolves.toBe(true);

            rejectRun(new Error('process stopped'));
            await runResult;
            await expect(pathExists(operation.workspace)).resolves.toBe(false);
            await expect(host.commit({ operationId }))
                .rejects.toThrow('LightFX bake was expired and cannot be committed.');
        } finally {
            jest.useRealTimers();
        }
    });
});
