import { mkdtemp, outputFile, pathExists, readFile, remove } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAssets = {
    queryPath: jest.fn(), refreshAsset: jest.fn(), queryUUID: jest.fn(),
    queryAssetMeta: jest.fn(() => ({ userData: { fixAlphaTransparencyArtifacts: false } })),
};
const mockRun = jest.fn();
jest.mock('../../assets', () => ({ assetManager: mockAssets }));
jest.mock('../main-process/lightfx/process', () => ({ LightFXProcess: jest.fn(() => ({ run: mockRun, cancel: async () => undefined })) }));
jest.mock('../main-process/lightfx/output', () => ({ decodeLightFXOutput: () => ({ version: 1, meshes: [], terrains: [], probes: [] }) }));
import { LightFXBakeHost } from '../main-process/lightfx-bake-host';

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
    });
    afterEach(async () => { await host.dispose(); await remove(root); });

    async function bake(bytes: string) {
        mockRun.mockImplementationOnce(async ({ cwd }: { cwd: string }) => {
            await outputFile(join(cwd, 'output', 'lfx.out'), Buffer.alloc(0));
            await outputFile(join(cwd, 'output', 'LFX_Mesh_0000.png'), bytes);
        });
        const token = await host.begin(opts);
        await host.appendInput({ ...token, chunkBase64: Buffer.from('input').toString('base64') });
        const output = await host.run(token);
        return { token, url: output.textureUrls[0], path: assetPath(output.textureUrls[0]) };
    }

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

    it('keeps previous assets when importing a new version fails', async () => {
        const a = await bake('pixels A');
        await host.commit(a.token);
        mockAssets.refreshAsset.mockRejectedValueOnce(new Error('import unavailable'));
        await expect(bake('pixels B')).rejects.toThrow('import unavailable');
        expect(await readFile(a.path, 'utf8')).toBe('pixels A');
        await expect(host.queryCapabilities()).resolves.toEqual({ sceneTransactionVersion: 1, busy: false });
    });
});
