import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GlobalPaths } from '../../../../../global';
import { browserRuntimeRoutes } from '../browser-runtime';

describe('CLI browser runtime resources', () => {
    const original = GlobalPaths.workspace;
    let directory: string;
    const buildId = '0123456789abcdef';
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'cli-browser-resources-'));
        GlobalPaths.workspace = directory;
        mkdirSync(join(directory, 'dist/scene-runtime'), { recursive: true });
    });
    afterEach(() => {
        GlobalPaths.workspace = original;
        rmSync(directory, { recursive: true, force: true });
    });
    function manifest() {
        writeFileSync(join(directory, 'dist/scene-runtime/manifest.json'), JSON.stringify({ apiVersion: 1, buildId }));
    }
    async function request(path: string) {
        const res: any = { setHeader: jest.fn(), json: jest.fn(), sendFile: jest.fn(), sendStatus: jest.fn() };
        res.status = jest.fn(() => res);
        const next = jest.fn();
        await browserRuntimeRoutes[0].handler({ path } as any, res, next);
        expect(next).not.toHaveBeenCalled();
        return res;
    }
    it('reports an unbuilt CLI instead of falling through to project asset routes', async () => {
        const res = await request('/scripting/scene-runtime/manifest.json');
        expect(res.status).toHaveBeenCalledWith(503);
    });
    it('serves a fresh descriptor and immutable files from the selected build', async () => {
        manifest();
        const descriptor = await request('/scripting/scene-runtime/manifest.json');
        expect(descriptor.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(descriptor.json).toHaveBeenCalledWith({ apiVersion: 1, buildId });
        writeFileSync(join(directory, 'dist/scene-runtime/loader.js'), 'export {};');
        const resource = await request(`/scripting/scene-runtime/${buildId}/loader.js`);
        expect(resource.sendFile).toHaveBeenCalledWith(join(directory, 'dist/scene-runtime/loader.js'), { dotfiles: 'allow' });
        expect(resource.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
    });
    it('rejects stale builds, missing files and paths outside the artifact directory', async () => {
        manifest();
        expect((await request('/scripting/scene-runtime/old/loader.js')).sendStatus).toHaveBeenCalledWith(404);
        expect((await request(`/scripting/scene-runtime/${buildId}/missing.js`)).sendStatus).toHaveBeenCalledWith(404);
        expect((await request(`/scripting/scene-runtime/${buildId}/%2e%2e%2fsecret.json`)).sendStatus).toHaveBeenCalledWith(403);
        expect((await request(`/scripting/scene-runtime/${buildId}/%2e%2e%5csecret.json`)).sendStatus).toHaveBeenCalledWith(403);
    });
});
