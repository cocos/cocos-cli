const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { rollup } = require('rollup');
const virtual = require('@rollup/plugin-virtual');
const { createBrowserRuntimeFacade } = require('../../workflow/build-scene-runtime');

function declarations(implementation) {
    const normalize = file => file.replace(/\\/g, '/');
    const entry = normalize(path.join(__dirname, 'facade-fixture.d.ts'));
    const target = normalize(path.join(__dirname, 'implementation-fixture.d.ts'));
    const files = new Map([
        [entry, "export * from './implementation-fixture'; export { default } from './implementation-fixture';"],
        [target, implementation],
    ]);
    const options = { module: ts.ModuleKind.CommonJS, esModuleInterop: true, types: [], noLib: true };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    host.getSourceFile = (file, ...args) => files.has(normalize(file))
        ? ts.createSourceFile(file, files.get(normalize(file)), ts.ScriptTarget.Latest, true)
        : getSourceFile(file, ...args);
    host.fileExists = file => files.has(normalize(file)) || fileExists(file);
    const program = ts.createProgram([...files.keys()], options, host);
    return { checker: program.getTypeChecker(), source: program.getSourceFile(entry) };
}

async function loadFacade(fixture, api) {
    const source = createBrowserRuntimeFacade(fixture.checker, fixture.source, 'implementation');
    const bundle = await rollup({
        input: 'facade',
        plugins: [virtual({ facade: source, implementation: 'export default globalThis.api;' })],
    });
    try {
        const { output } = await bundle.generate({ format: 'cjs', exports: 'named' });
        const exports = {};
        vm.runInNewContext(output[0].code, { exports, api });
        return exports;
    } finally {
        await bundle.close();
    }
}

test('bundles export-assignment declarations and preserves the CommonJS value', async () => {
    const fixture = declarations('declare function overwrite(engine: unknown): void; export = overwrite;');
    // Match cc/overwrite after a fresh build-cc-module, even with stale local engine declarations.
    const symbols = fixture.checker.getExportsOfModule(fixture.checker.getSymbolAtLocation(fixture.source));
    expect(symbols.map(symbol => symbol.name)).toContain('export=');
    const overwrite = jest.fn();
    const exports = await loadFacade(fixture, overwrite);
    expect(Object.keys(exports)).toEqual(['default']);
    expect(exports.default).toBe(overwrite);
});

test('preserves runtime classes, enums and aliases while excluding type-only declarations', async () => {
    const fixture = declarations(`
        export declare class SceneNode {}
        export declare enum Mode { Edit }
        export { Mode as SceneMode };
        export interface SceneOptions { name: string; }
        export type SceneId = string;
        declare const api: unknown;
        export default api;
    `);
    const api = { SceneNode: class SceneNode {}, Mode: { Edit: 0 } };
    api.SceneMode = api.Mode;
    const exports = await loadFacade(fixture, api);
    expect(Object.keys(exports).sort()).toEqual(['Mode', 'SceneMode', 'SceneNode', 'default']);
    expect(exports.default).toBe(api);
    expect(exports.SceneNode).toBe(api.SceneNode);
    expect(exports.Mode).toBe(api.Mode);
    expect(exports.SceneMode).toBe(api.Mode);
});
