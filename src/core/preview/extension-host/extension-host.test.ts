import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MessageBus } from './message-bus';
import { loadExtensionMain } from './extension-loader';
import { scanPreviewExtensions } from './scanner';
import { loadExtensionPreviewHost } from './index';
import { middlewareService } from '../../../server/middleware';

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, JSON.stringify(value), 'utf8');
}

function createExtension(root: string, directory: string, manifest: Record<string, unknown>, files: Record<string, string> = {}): string {
    const extensionRoot = join(root, directory);
    mkdirSync(extensionRoot, { recursive: true });
    writeJson(join(extensionRoot, 'package.json'), manifest);
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(extensionRoot, name), content, 'utf8');
    }
    return extensionRoot;
}

function setResourcesPath(resourcesPath: string): () => void {
    const processObject = process as NodeJS.Process & { resourcesPath?: string };
    const previous = Object.getOwnPropertyDescriptor(processObject, 'resourcesPath');
    Object.defineProperty(processObject, 'resourcesPath', {
        configurable: true,
        value: resourcesPath,
        writable: true,
    });
    return () => {
        if (previous) {
            Object.defineProperty(processObject, 'resourcesPath', previous);
        } else {
            delete processObject.resourcesPath;
        }
    };
}

function hasRoute(url: string): boolean {
    return (middlewareService.router as any).stack.some((layer: any) => layer.route?.path === url);
}

describe('preview extension host discovery and lifecycle', () => {
    let projectRoot: string;
    let restoreResourcesPath: (() => void) | undefined;

    beforeEach(() => {
        projectRoot = mkdtempSync(join(tmpdir(), 'cocos-preview-host-'));
        mkdirSync(join(projectRoot, 'extensions'), { recursive: true });
        delete (globalThis as any).Editor;
    });

    afterEach(() => {
        restoreResourcesPath?.();
        restoreResourcesPath = undefined;
        delete (globalThis as any).Editor;
        delete (globalThis as any).__previewHostCounters;
        rmSync(projectRoot, { recursive: true, force: true });
    });

    test('discovers both roots, keeps project priority, and preserves different identities', () => {
        const resourcesRoot = join(projectRoot, 'resources');
        const builtinExtensionsRoot = join(resourcesRoot, 'app', 'extensions');
        mkdirSync(builtinExtensionsRoot, { recursive: true });
        restoreResourcesPath = setResourcesPath(resourcesRoot);

        const projectShared = createExtension(join(projectRoot, 'extensions'), 'project-shared', {
            name: 'shared-preview',
            contributions: { server: './server.js' },
        }, { 'server.js': 'module.exports = { get: [] };' });
        createExtension(builtinExtensionsRoot, 'builtin-shared', {
            name: 'shared-preview',
            contributions: { server: './server.js' },
        }, { 'server.js': 'module.exports = { get: [] };' });
        const builtinOther = createExtension(builtinExtensionsRoot, 'builtin-other', {
            name: 'other-preview',
            contributions: { server: './server.js' },
        }, { 'server.js': 'module.exports = { get: [] };' });

        const extensions = scanPreviewExtensions(projectRoot);

        expect(extensions.map((extension) => extension.name)).toEqual(['shared-preview', 'other-preview']);
        expect(extensions[0].dir).toBe(projectShared);
        expect(extensions[1].dir).toBe(builtinOther);
    });

    test('uses explicit preview main, fails closed, and only falls back to legacy main when the field is absent', () => {
        const builtinExtensionsRoot = join(projectRoot, 'resources', 'app', 'extensions');
        mkdirSync(builtinExtensionsRoot, { recursive: true });
        restoreResourcesPath = setResourcesPath(join(projectRoot, 'resources'));
        const explicit = createExtension(join(projectRoot, 'extensions'), 'explicit', {
            name: 'explicit-preview',
            main: './vscode-main.js',
            contributions: {
                server: './server.js',
                preview: { main: './preview-main.js' },
            },
        }, {
            'vscode-main.js': 'module.exports = {};',
            'preview-main.js': 'module.exports = {};',
            'server.js': 'module.exports = { get: [] };',
        });
        const legacy = createExtension(join(projectRoot, 'extensions'), 'legacy', {
            name: 'legacy-preview',
            main: './legacy-main.js',
            contributions: { messages: { ping: { methods: ['ping'] } } },
        }, { 'legacy-main.js': 'module.exports = {};' });
        createExtension(join(projectRoot, 'extensions'), 'invalid', {
            name: 'invalid-preview',
            main: './vscode-main.js',
            contributions: {
                server: './server.js',
                preview: { main: '../outside.js' },
            },
        }, {
            'vscode-main.js': 'module.exports = {};',
            'server.js': 'module.exports = { get: [] };',
        });
        createExtension(builtinExtensionsRoot, 'builtin-invalid', {
            name: 'invalid-preview',
            contributions: { server: './server.js' },
        }, { 'server.js': 'module.exports = { get: [] };' });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        const extensions = scanPreviewExtensions(projectRoot);

        expect(extensions.find((extension) => extension.name === 'explicit-preview')?.mainPath).toBe(join(explicit, 'preview-main.js'));
        expect(extensions.find((extension) => extension.name === 'legacy-preview')?.mainPath).toBe(join(legacy, 'legacy-main.js'));
        expect(extensions.some((extension) => extension.name === 'invalid-preview')).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("invalid contributions.preview.main"));
        warn.mockRestore();
    });

    test('does not include preview.main-only extensions and rejects unsafe contribution paths', () => {
        const previewOnly = createExtension(join(projectRoot, 'extensions'), 'preview-only', {
            name: 'preview-only',
            contributions: { preview: { main: './preview-main.js' } },
        }, { 'preview-main.js': 'module.exports = {};' });
        const unsafe = createExtension(join(projectRoot, 'extensions'), 'unsafe', {
            name: 'unsafe-preview',
            contributions: {
                server: '../outside-server.js',
                messages: { ping: { methods: ['ping'] } },
            },
            main: '../outside-main.js',
        });
        const uri = createExtension(join(projectRoot, 'extensions'), 'uri', {
            name: 'uri-preview',
            contributions: {
                server: 'file:///outside-server.js',
                messages: { ping: { methods: ['ping'] } },
            },
            main: 'https://example.com/main.js',
        });
        createExtension(join(projectRoot, 'extensions'), 'absolute', {
            name: 'absolute-preview',
            contributions: {
                server: 'C:\\outside-server.js',
                messages: { ping: { methods: ['ping'] } },
            },
            main: '/outside-main.js',
        });

        const extensions = scanPreviewExtensions(projectRoot);

        expect(extensions.some((extension) => extension.dir === previewOnly)).toBe(false);
        expect(extensions.find((extension) => extension.name === 'unsafe-preview')).toMatchObject({
            serverPath: undefined,
            mainPath: undefined,
        });
        expect(extensions.find((extension) => extension.name === 'uri-preview')).toMatchObject({
            serverPath: undefined,
            mainPath: undefined,
        });
        expect(extensions.find((extension) => extension.name === 'absolute-preview')).toMatchObject({
            serverPath: undefined,
            mainPath: undefined,
        });
    });

    test('routes messages through the loaded main module', async () => {
        createExtension(join(projectRoot, 'extensions'), 'lifecycle', {
            name: 'lifecycle-preview',
            main: './main.js',
            contributions: { messages: { ping: { methods: ['ping'] } } },
        }, {
            'main.js': [
                'module.exports = {',
                '  methods: { ping: function () { return "pong"; } },',
                '  load: function () { globalThis.__previewHostCounters.load += 1; },',
                '  unload: function () { globalThis.__previewHostCounters.unload += 1; }',
                '};',
            ].join('\n'),
        });
        (globalThis as any).__previewHostCounters = { load: 0, unload: 0 };
        const extension = scanPreviewExtensions(projectRoot)[0];
        const bus = new MessageBus();

        const loaded = await loadExtensionMain(extension, bus);

        expect(loaded).toBeDefined();
        expect(await bus.dispatch('lifecycle-preview', 'ping')).toBe('pong');
        expect((globalThis as any).__previewHostCounters).toEqual({ load: 1, unload: 0 });
    });

    test('calls a loaded main unload only once when the host is disposed repeatedly', async () => {
        createExtension(join(projectRoot, 'extensions'), 'unload-once', {
            name: 'unload-once-preview',
            main: './main.js',
            contributions: { messages: { ping: { methods: ['ping'] } } },
        }, {
            'main.js': [
                'module.exports = {',
                '  methods: { ping: function () { return "pong"; } },',
                '  load: function () { globalThis.__previewHostCounters.load += 1; },',
                '  unload: function () { globalThis.__previewHostCounters.unload += 1; }',
                '};',
            ].join('\n'),
        });
        (globalThis as any).__previewHostCounters = { load: 0, unload: 0 };

        const host = await loadExtensionPreviewHost(projectRoot);
        host.dispose();
        host.dispose();

        expect((globalThis as any).__previewHostCounters).toEqual({ load: 1, unload: 1 });
    });

    test('isolates a failed messages main and does not register its server routes', async () => {
        const url = '/__preview-host-main-failed__';
        const isolatedUrl = '/__preview-host-isolated__';
        createExtension(join(projectRoot, 'extensions'), 'failed', {
            name: 'failed-preview',
            main: './main.js',
            contributions: {
                server: './server.js',
                messages: { ping: { methods: ['ping'] } },
            },
        }, {
            'main.js': 'module.exports = { load: function () { throw new Error("preview main failed"); } };',
            'server.js': `module.exports = { get: [{ url: '${url}', handle: function (_req, res) { res.json('should-not-register'); } }] };`,
        });
        createExtension(join(projectRoot, 'extensions'), 'isolated', {
            name: 'isolated-preview',
            contributions: { server: './server.js' },
        }, {
            'server.js': `module.exports = { get: [{ url: '${isolatedUrl}', handle: function (_req, res) { res.json('ok'); } }] };`,
        });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        const host = await loadExtensionPreviewHost(projectRoot);

        expect(host.extensions).not.toContain('failed-preview');
        expect(hasRoute(url)).toBe(false);
        expect(host.extensions).toContain('isolated-preview');
        expect(hasRoute(isolatedUrl)).toBe(true);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("failed to load main for 'failed-preview'"), expect.anything());
        host.dispose();
        warn.mockRestore();
    });

    test('keeps server-only extensions available without a main module', async () => {
        const url = '/__preview-host-server-only__';
        createExtension(join(projectRoot, 'extensions'), 'server-only', {
            name: 'server-only-preview',
            contributions: { server: './server.js' },
        }, {
            'server.js': `module.exports = { get: [{ url: '${url}', handle: function (_req, res) { res.json('ok'); } }] };`,
        });

        const host = await loadExtensionPreviewHost(projectRoot);

        expect(host.extensions).toContain('server-only-preview');
        expect(hasRoute(url)).toBe(true);
        host.dispose();
    });
});
