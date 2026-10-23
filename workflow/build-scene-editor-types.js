const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const TYPES_NAME = '@cocos/scene-editor-types';
const root = path.resolve(__dirname, '..');
const entries = require('./scene-editor-types-entries.json');
const normalize = value => path.resolve(value).replace(/\\/g, '/');

/** Generate self-contained declarations for consumers using TypeScript paths. */
function buildSceneEditorTypes() {
    const output = path.join(root, 'packages/scene-editor-types');
    if (path.relative(root, output).replace(/\\/g, '/') !== 'packages/scene-editor-types') throw new Error('Invalid type declaration output');
    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(output, { recursive: true });
    const cc = path.join(root, 'packages/cc-module/cc.d.ts');
    const targets = Object.values(entries).flatMap(group => Object.values(group).map(id => path.join(root, 'dist', id + '.d.ts')));
    for (const file of targets) if (!fs.existsSync(file)) throw new Error('Build CLI declarations first: ' + file);
    const options = {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true,
        skipLibCheck: true, types: ['node'], baseUrl: root,
        paths: { cc: [cc], 'cc/*': [path.join(root, 'packages/cc-module/*')] },
    };
    const program = ts.createProgram([...targets, cc], options);
    const host = ts.createCompilerHost(options);
    const sources = new Map();
    const nodeBuiltin = new Set(require('node:module').builtinModules.flatMap(id => [id, 'node:' + id]));
    const destination = file => {
        const name = normalize(file);
        if (name.startsWith(normalize(path.join(root, 'dist')) + '/')) return 'internal/cli/' + path.relative(path.join(root, 'dist'), file).replace(/\\/g, '/');
        if (name.startsWith(normalize(path.join(root, 'packages/cc-module')) + '/')) return 'internal/engine/compat/' + path.relative(path.join(root, 'packages/cc-module'), file).replace(/\\/g, '/');
        if (name.startsWith(normalize(path.join(root, 'packages/engine/bin/.declarations')) + '/')) return 'internal/engine/declarations/' + path.relative(path.join(root, 'packages/engine/bin/.declarations'), file).replace(/\\/g, '/');
        const relative = path.relative(root, file).replace(/\\/g, '/');
        if (relative.startsWith('../')) throw new Error('Declaration outside CLI dependency graph: ' + file);
        return 'internal/vendor/' + relative.replace(/node_modules\//g, 'dependencies/').replace(/^src\//, 'declarations/');
    };
    const destinations = new Map();
    for (const source of program.getSourceFiles()) {
        if (program.isSourceFileDefaultLibrary(source) || /[/\\]@types[/\\]node[/\\]/.test(source.fileName)) continue;
        if (!source.isDeclarationFile) throw new Error('Type declaration dependency has no declaration: ' + source.fileName);
        // The types use one declaration-only namespace. Normalize upstream CJS/ESM
        // declaration suffixes so every self-reference matches the .d.ts paths mapping.
        const name = destination(source.fileName).replace(/\.d\.[cm]ts$/, '.d.ts');
        if (destinations.has(name)) throw new Error(`Type declaration path collision: ${source.fileName} and ${destinations.get(name)}`);
        destinations.set(name, source.fileName);
        sources.set(normalize(source.fileName), { source, destination: name });
    }
    const unresolved = new Set();
    const opaque = new Map();
    const engineShims = {
        'pal/audio/type': `export type AudioType = import('cc').__private._pal_audio_type__AudioType;\nexport type AudioState = import('cc').__private._pal_audio_type__AudioState;\nexport type AudioPCMDataView = import('cc').AudioPCMDataView;\nexport type AudioLoadOptions = unknown;\n`,
        'pal/input/input-source': `export interface InputSource<T> { getValue(): T; }\nexport type InputSourceButton = InputSource<number>;\nexport type InputSourceDpad = InputSource<import('cc').Vec2>;\nexport type InputSourceStick = InputSource<import('cc').Vec2>;\nexport type InputSourcePosition = InputSource<import('cc').Vec3>;\nexport type InputSourceOrientation = InputSource<import('cc').Quat>;\n`,
        '../foundation/node-shell': `export type NodeInputPath = readonly [string] | readonly [string, number];\n`,
    };
    const declarationModule = (id, importer) => {
        if (id === 'cc' || id.startsWith('cc/') || nodeBuiltin.has(id)) return id;
        const resolved = ts.resolveModuleName(id, importer, options, host).resolvedModule;
        if (!resolved && id in engineShims) {
            const name = 'internal/engine-shims/' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
            const file = path.join(output, 'types', name + '.d.ts');
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, engineShims[id]);
            return TYPES_NAME + '/' + name;
        }
        if (!resolved) { unresolved.add(id + ' (' + importer + ')'); return id; }
        if (/[/\\]@types[/\\]node[/\\]/.test(resolved.resolvedFileName)) return id;
        const target = sources.get(normalize(resolved.resolvedFileName));
        if (!target && /\.[cm]?js$/.test(resolved.resolvedFileName)) {
            const name = 'internal/opaque/' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
            opaque.set(name, id);
            return TYPES_NAME + '/' + name;
        }
        if (!target) throw new Error('Unpackaged declaration: ' + resolved.resolvedFileName);
        return TYPES_NAME + '/' + target.destination.replace(/\.d\.(?:ts|mts|cts)$/, '');
    };
    for (const { source, destination: name } of sources.values()) {
        const edits = [];
        function visit(node) {
            let literal;
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) literal = node.moduleSpecifier;
            else if (ts.isExternalModuleReference(node) && node.expression && ts.isStringLiteral(node.expression)) literal = node.expression;
            else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) literal = node.argument.literal;
            if (literal) {
                const replacement = declarationModule(literal.text, source.fileName);
                if (replacement !== literal.text) edits.push({ start: literal.getStart(source), end: literal.end, text: JSON.stringify(replacement) });
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
        for (const reference of source.referencedFiles) {
            const original = path.resolve(path.dirname(source.fileName), reference.fileName.replace(/\\/g, '/'));
            const target = sources.get(normalize(original));
            if (!target) throw new Error('Missing referenced declaration: ' + original);
            const relative = path.relative(path.dirname(name), target.destination).replace(/\\/g, '/');
            edits.push({ start: reference.pos, end: reference.end, text: relative.startsWith('.') ? relative : './' + relative });
        }
        let code = source.text;
        for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
        // Declared constants are runtime capabilities, never values baked into consumers.
        code = code.replace(/\bconst enum\b/g, 'enum');
        const file = path.join(output, 'types', name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, code);
    }
    if (unresolved.size) throw new Error('Unresolved type declaration dependencies:\n' + [...unresolved].join('\n'));
    for (const [name, id] of opaque) {
        const file = path.join(output, 'types', name + '.d.ts');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `/** Upstream ${id} supplies no declarations. Preserve its existing opaque type boundary. */\ndeclare const value: unknown;\nexport = value;\n`);
    }
    for (const [kind, group] of Object.entries(entries)) for (const [id, target] of Object.entries(group)) {
        const source = sources.get(normalize(path.join(root, 'dist', target + '.d.ts')));
        const file = path.join(output, 'types', kind, id + '.d.ts');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const original = program.getSourceFile(path.join(root, 'dist', target + '.d.ts'));
        const symbol = original && program.getTypeChecker().getSymbolAtLocation(original);
        const hasDefault = symbol && program.getTypeChecker().getExportsOfModule(symbol).some(item => item.name === 'default');
        const specifier = TYPES_NAME + '/' + source.destination.replace(/\.d\.ts$/, '');
        fs.writeFileSync(file, `export * from '${specifier}';\n` + (hasDefault ? `export { default } from '${specifier}';\n` : ''));
    }
    const ccSource = sources.get(normalize(cc));
    const moduleFields = kind => Object.keys(entries[kind]).map(id => `    '${id}': typeof import('./types/${kind}/${id}');`).join('\n');
    fs.writeFileSync(path.join(output, 'index.d.ts'), `/// <reference path="./types/${ccSource.destination}" />
export interface HostModules {
${moduleFields('host')}
}
export interface BrowserModules {
${moduleFields('browser')}
}
export interface HostCapabilities {
    readonly apiVersion: 1;
    readonly cliVersion: string;
    readonly identity: object;
    readonly modules: HostModules;
    readonly portable: Pick<BrowserModules, 'scene/session/client' | 'scene/session/methods' | 'scene/session/protocol'>;
    readonly browserHostPath: string;
}
export interface BrowserEnvironment { serverURL: string; runtimeResourceBase: string; [key: string]: unknown; }
export interface BrowserCapabilities {
    readonly apiVersion: 1;
    readonly identity: object;
    readonly modules: BrowserModules;
    readonly environment: BrowserEnvironment;
}
export interface BrowserHost {
    readonly apiVersion: 1;
    loadEngine(options: Record<string, unknown>): Promise<BrowserEnvironment>;
    prepareScene(options: Record<string, unknown>): Promise<BrowserCapabilities>;
}
`);
    verifyDeclarationReferences(output);
    console.log(`Scene editor types: ${sources.size} declaration files, ${targets.length} public entry points`);
    return output;
}
/** Check the generated graph even when consumers compile with skipLibCheck. */
function verifyDeclarationReferences(output) {
    const failures = [];
    function visitFile(file) {
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
        function visit(node) {
            let literal;
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) literal = node.moduleSpecifier;
            else if (ts.isExternalModuleReference(node)) literal = node.expression;
            else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) literal = node.argument.literal;
            if (literal && ts.isStringLiteral(literal) && literal.text.startsWith(TYPES_NAME + '/')) {
                const target = path.resolve(output, 'types', literal.text.slice(TYPES_NAME.length + 1) + '.d.ts');
                const relative = path.relative(output, target);
                if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(target)) failures.push(`${file}: ${literal.text}`);
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
        for (const reference of source.referencedFiles) {
            if (!fs.existsSync(path.resolve(path.dirname(file), reference.fileName))) failures.push(`${file}: ${reference.fileName}`);
        }
    }
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (/\.d\.(?:ts|mts|cts)$/.test(file)) visitFile(file);
        }
    }
    walk(output);
    if (failures.length) throw new Error('Unresolved generated type declarations:\n' + failures.join('\n'));
}
module.exports = { buildSceneEditorTypes, verifyDeclarationReferences };
if (require.main === module) { try { buildSceneEditorTypes(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
