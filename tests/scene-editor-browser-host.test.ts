import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

function loadHost(manifest: object, loader: object) {
    const file = join(__dirname, '../src/core/scene/runtime/browser-assets/host.js');
    const source = transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    const exports: any = {};
    const fetch = jest.fn(async () => ({ ok: true, json: async () => manifest }));
    runInNewContext(source, { exports, URL, fetch, require: (id: string) => {
        expect(id).toBe('http://localhost:7456/scripting/scene-runtime/0123456789abcdef/loader.js');
        return loader;
    } });
    return { host: exports.createBrowserHost('http://localhost:7456'), fetch };
}

describe('scene editor browser host manifest compatibility', () => {
    const manifest = { apiVersion: 1, capabilitiesApiVersion: 1, buildId: '0123456789abcdef', loader: './0123456789abcdef/loader.js' };
    it('keeps the API 1 manifest usable by old extensions and injects capabilities for new ones', async () => {
        // The former extension requires exactly API 1 and this versioned loader URL.
        const built = JSON.parse(readFileSync(join(__dirname, '../dist/scene-runtime/manifest.json'), 'utf8'));
        expect(built.apiVersion).toBe(1);
        expect(built.capabilitiesApiVersion).toBe(1);
        expect(new URL(built.loader, 'http://localhost:7456/scripting/scene-runtime/manifest.json').href)
            .toBe(`http://localhost:7456/scripting/scene-runtime/${built.buildId}/loader.js`);
        const environment = { serverURL: 'http://localhost:7456', runtimeResourceBase: 'http://private.example/web/' };
        const capabilities = { apiVersion: 1, identity: {}, modules: {}, environment };
        const loader = { loadEngine: jest.fn(async () => environment), prepareSceneCapabilities: jest.fn(async () => capabilities) };
        const { host, fetch } = loadHost(manifest, loader);
        expect(loader.loadEngine).not.toHaveBeenCalled();
        expect(await host.prepareScene({ runtimeResourceBase: environment.runtimeResourceBase })).toBe(capabilities);
        expect(await host.loadEngine()).toBe(environment);
        expect(await host.prepareScene()).toBe(capabilities);
        expect(loader.loadEngine).toHaveBeenCalledTimes(1);
        expect(loader.prepareSceneCapabilities).toHaveBeenCalledWith(environment);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it.each([
        { ...manifest, apiVersion: 2 },
        { ...manifest, capabilitiesApiVersion: undefined },
        { ...manifest, capabilitiesApiVersion: 2 },
        { ...manifest, loader: 'https://unexpected.example/loader.js' },
    ])('rejects incompatible injection or loader URLs before loading the engine', async value => {
        const loader = { loadEngine: jest.fn() };
        await expect(loadHost(value, loader).host.prepareScene()).rejects.toThrow(/API 1|Invalid browser runtime loader/);
        expect(loader.loadEngine).not.toHaveBeenCalled();
    });
});
