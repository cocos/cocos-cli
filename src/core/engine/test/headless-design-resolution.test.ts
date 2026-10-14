import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { loadHeadlessDesignResolution } from '../headless-design-resolution';
import { BaseConfiguration } from '../../configuration/script/config';

const defaults = { width: 1280, height: 720 };
const portrait = { width: 393, height: 852 };
let projectPath: string;
const previousFetch = globalThis.fetch;
async function config(relative: string, value: unknown) {
    const file = join(projectPath, relative);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value));
}
beforeEach(async () => { projectPath = await mkdtemp(join(tmpdir(), 'cocos-resolution-')); });
afterEach(async () => { globalThis.fetch = previousFetch; await rm(projectPath, { recursive: true, force: true }); });

describe('headless project resolution source', () => {
    it('reads a migrated offline project before considering legacy settings', async () => {
        await config('settings/cocos.config.json', { engine: { designResolution: portrait } });
        await config('settings/v2/packages/project.json', { general: { designResolution: defaults } });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual(portrait);
    });
    it('reads a legacy project without running migrations or writing a project config', async () => {
        await config('settings/v2/packages/project.json', { general: { designResolution: portrait } });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual(portrait);
    });
    it('uses defaults only when the project has no configured resolution', async () => {
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual(defaults);
        await config('settings/cocos.config.json', { engine: {} });
        await config('settings/v2/packages/project.json', { general: { designResolution: portrait } });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual(defaults);
    });
    it('merges partial project and local overrides like BaseConfiguration', async () => {
        const engineConfig = new BaseConfiguration('engine', { designResolution: defaults });
        await engineConfig.set('designResolution.width', 393);
        await engineConfig.set('designResolution.height', 852, 'local');
        await config('settings/cocos.config.json', { engine: engineConfig.getAll('project') });
        await config('profiles/cocos.config.json', { engine: engineConfig.getAll('local') });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults))
            .toEqual(await engineConfig.get('designResolution'));
    });
    it('merges a partial legacy resolution with defaults', async () => {
        await config('settings/v2/packages/project.json', { general: { designResolution: { width: 393 } } });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual({ width: 393, height: 720 });
    });
    it('honors settings overrides while a root config awaits relocation', async () => {
        await config('cocos.config.json', { engine: { designResolution: portrait } });
        await config('settings/cocos.config.json', { engine: { designResolution: { height: 900 } } });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual({ width: 393, height: 900 });
    });
    it('reads changed offline project dimensions on each sync', async () => {
        await config('settings/cocos.config.json', { engine: { designResolution: portrait } });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual(portrait);
        const next = { width: 800, height: 600 };
        await config('settings/cocos.config.json', { engine: { designResolution: next } });
        expect(await loadHeadlessDesignResolution(projectPath, undefined, defaults)).toEqual(next);
    });
    it('rejects invalid configured dimensions instead of masking them with defaults', async () => {
        await config('settings/cocos.config.json', { engine: { designResolution: { width: 0 } } });
        await expect(loadHeadlessDesignResolution(projectPath, undefined, defaults)).rejects.toThrow('Invalid project design resolution');
    });
    it('rejects malformed config JSON', async () => {
        await mkdir(join(projectPath, 'settings'));
        await writeFile(join(projectPath, 'settings/cocos.config.json'), '{');
        await expect(loadHeadlessDesignResolution(projectPath, undefined, defaults)).rejects.toThrow();
    });
    it('uses the host authoritative configuration when a server exists', async () => {
        const fetch = jest.fn(async () => ({ ok: true, json: async () => portrait }));
        globalThis.fetch = fetch as any;
        expect(await loadHeadlessDesignResolution(projectPath, 'http://localhost:9527', defaults)).toEqual(portrait);
        expect(fetch).toHaveBeenCalledWith('http://localhost:9527/scripting/engine/design-resolution');
    });
    it('propagates host failures even when a local fallback is available', async () => {
        await config('settings/cocos.config.json', { engine: { designResolution: portrait } });
        globalThis.fetch = jest.fn(async () => { throw new Error('connection refused'); }) as any;
        await expect(loadHeadlessDesignResolution(projectPath, 'http://localhost:9527', defaults)).rejects.toThrow('connection refused');
        globalThis.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as any;
        await expect(loadHeadlessDesignResolution(projectPath, 'http://localhost:9527', defaults)).rejects.toThrow('HTTP 500');
    });
});
