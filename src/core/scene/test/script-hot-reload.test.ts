import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { EventEmitter } from 'events';
import type { ImportMap } from '../../builder/@types/protected/import-map';

interface ScriptService {
    init(): Promise<void>;
    investigatePackerDriver(): Promise<void>;
    queryScriptName(uuid: string): Promise<string | null>;
}

const sourcePath = path.resolve(__dirname, '../scene-process/service/script.ts');
const source = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, esModuleInterop: true },
}).outputText;
const prerequisite = 'cce:/internal/x/prerequisite-imports';
const root = 'http://localhost:9527/backend/';
const prerequisiteChunk = './chunks/aa/prerequisites.js';
let systemSource: string;

beforeAll(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'script-hot-reload-'));
    try {
        const output = path.join(directory, 'system.js');
        await require('@cocos/module-system').build({ out: output, minify: false, sourceMap: false, platform: 'web-mobile', editor: true });
        systemSource = fs.readFileSync(output, 'utf8');
    } finally {
        if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('script-hot-reload-')) {
            throw new Error('Unexpected temporary directory');
        }
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function setup(platform = 'browser') {
    const scripts: { type: string; textContent: string; readonly innerHTML: string; remove(): void }[] = [];
    const components = new Map<string, Function[]>();
    let count = 1;
    let mapStatus = 200;
    const importMap = (): ImportMap => ({
        imports: { [prerequisite]: prerequisiteChunk },
        scopes: { [prerequisiteChunk]: Object.fromEntries(Array.from({ length: count }, (_, i) => [
            `__unresolved_${i}`, `./chunks/bb/component-${i}.js`,
        ])) },
    });
    const fetch = jest.fn(async () => ({ ok: mapStatus === 200, status: mapStatus, json: async () => importMap() }));
    const console = { warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const context = vm.createContext({
        URL, console, exports: {}, fetch,
        // Match the scene bundle's process shim, including its misleading Node version.
        process: { platform, versions: { node: '16.0.0' } },
        location: { href: 'https://webview.invalid/index.html', origin: 'https://webview.invalid' },
        addEventListener: () => undefined,
        EditorExtends: new EventEmitter(),
        document: {
            querySelector: () => null,
            querySelectorAll: () => scripts,
            head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) },
            createElement: () => ({
                type: '', textContent: '',
                get innerHTML() { return this.textContent; },
                remove() { scripts.splice(scripts.indexOf(this), 1); },
            }),
        },
        registerComponent: (name: string) => components.set(name, [function Component() {}]),
    });
    context.window = context.self = context;
    vm.runInContext(systemSource, context);
    const system = context.System;
    system.setResolutionDetailMapCallback(async () => ({ json: {}, url: root + 'scripting/x/resolution-detail-map' }));
    system.instantiate = async (url: string) => {
        if (url === new URL(prerequisiteChunk, root + 'scripting/x/pack-import-map-url').href) {
            vm.runInContext(`System.register(${JSON.stringify(Array.from({ length: count }, (_, i) => `__unresolved_${i}`))}, function () {
                return { setters: Array.from({ length: ${count} }, function () { return function () {}; }), execute: function () {} };
            });`, context);
        } else {
            const name = /component-(\d+)\.js$/.exec(url)?.[1];
            if (name === undefined || !url.startsWith(root + 'scripting/x/chunks/')) {
                throw new Error('Unexpected module URL: ' + url);
            }
            vm.runInContext(`System.register([], function () { return { execute: function () { registerComponent('component-${name}'); } }; });`, context);
        }
        return system.getRegister();
    };
    const executor = {
        // The browser bundle invalidates its HTTP chunks before reimporting. Use the
        // real Cocos SystemJS for both map processing and dependency linking here.
        reload: jest.fn(async () => {
            components.clear();
            for (const [id] of system.entries()) system.delete(id);
            await system.import(prerequisite);
        }),
        setPluginScripts: jest.fn(),
        queryClassesInModule: (uuid: string) => components.get(uuid),
    };
    const preload = jest.fn(() => ({ loadDynamic: jest.fn() }));
    const mocks: Record<string, object> = {
        cc: { js: { isChildClassOf: () => true, getClassName: () => 'NewComponent' } },
        '@cocos/lib-programming/dist/executor': { Executor: { create: async () => executor } },
        '@cocos/creator-programming-quick-pack/lib/loader': { QuickPackLoaderContext: { deserialize: () => ({}) } },
        '../rpc': { Rpc: { getInstance: () => ({ request: async () => ({}) }) } },
        './core': { BaseService: EventEmitter, register: () => (value: Function) => value },
        '../../../base/utils': { UUID: { compressUUID: (uuid: string) => uuid } },
        '../i18n': {},
        './service-manager': { serviceManager: { getServerUrl: () => root } },
        '../../../base/global-env': { GlobalEnv: class { record(fn: () => Promise<void>) { return fn(); } } },
    };
    context.require = (id: string) => {
        if (id === 'cc/preload') return preload();
        if (!(id in mocks)) throw new Error('Unexpected dependency: ' + id);
        return mocks[id];
    };
    vm.runInContext(source, context);
    const service = new (context.exports as { ScriptService: new () => ScriptService }).ScriptService();
    return { service, executor, preload, fetch, console, scripts, context, importMap,
        addScript: () => ++count, failMap: () => { mapStatus = 503; }, restoreMap: () => { mapStatus = 200; } };
}

describe('browser script hot reload', () => {
    test('refreshes scoped placeholders after repeated script creation with a Node compatibility shim', async () => {
        const state = setup();
        await state.service.init();
        for (let i = 1; i <= 3; ++i) {
            state.addScript();
            await state.service.investigatePackerDriver();
        }
        expect(await Promise.all(Array.from({ length: 4 }, (_, i) => state.service.queryScriptName(`component-${i}`))))
            .toEqual(['NewComponent', 'NewComponent', 'NewComponent', 'NewComponent']);
        expect(state.preload).not.toHaveBeenCalled();
        expect(state.fetch.mock.calls).toEqual(Array.from({ length: 4 }, () => [root + 'scripting/x/pack-import-map-url', { cache: 'no-store' }]));
        expect(state.console.warn).not.toHaveBeenCalled();
        expect(state.scripts).toHaveLength(0);
    });

    test('keeps registered components when refreshing the map fails and recovers on the next build', async () => {
        const state = setup();
        await state.service.init();
        state.failMap();
        state.addScript();
        await state.service.investigatePackerDriver();
        expect(state.executor.reload).toHaveBeenCalledTimes(1);
        expect(await state.service.queryScriptName('component-0')).toBe('NewComponent');
        expect(state.console.warn.mock.calls[0][1].message).toContain('(503)');
        state.restoreMap();
        await state.service.investigatePackerDriver();
        expect(await state.service.queryScriptName('component-1')).toBe('NewComponent');
    });

    test('uses the native executor path in Node without querying a browser import map', async () => {
        const state = setup('win32');
        state.executor.reload.mockResolvedValue(undefined);
        await state.service.init();
        await state.service.investigatePackerDriver();
        expect(state.preload).toHaveBeenCalledTimes(1);
        expect(state.fetch).not.toHaveBeenCalled();
    });
});
