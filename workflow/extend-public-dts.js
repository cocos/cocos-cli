const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const PACKAGE_NAME = '@cocos/cocos-cli-types';
const root = path.resolve(__dirname, '..');
const entries = require('./scene-api-entries.json');
const { browserFacadePath, generateBrowserFacades } = require('./scene-browser-api');
const normalize = file => path.resolve(file).replace(/\\/g, '/');
const printer = ts.createPrinter({ removeComments: true });

function publicEntries(packageRoot) {
    return fs.readdirSync(packageRoot).filter(name => name.endsWith('.d.ts')).flatMap(name => {
        const id = name.slice(0, -5);
        const source = [path.join(root, 'dist/lib', id, id + '.d.ts'), path.join(root, 'dist/lib', id + '.d.ts')].find(file => fs.existsSync(file));
        return source ? [{ source, output: path.join(packageRoot, name), module: PACKAGE_NAME + (id === 'index' ? '' : '/' + id) }] : [];
    });
}

function declarationSymbol(node, checker) {
    if (!node.name || !ts.isIdentifier(node.name)) return undefined;
    return checker.getSymbolAtLocation(node.name);
}

function originalSymbol(symbol, checker) {
    return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function isModuleSpecifier(node) {
    const parent = node.parent;
    return ts.isStringLiteral(node) && parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)
        || ts.isExternalModuleReference(parent) || ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent));
}

function declarationText(node) {
    const stripped = ts.canHaveModifiers(node) ? ts.factory.replaceModifiers(node, (ts.getModifiers(node) || []).filter(modifier =>
        ![ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DeclareKeyword, ts.SyntaxKind.DefaultKeyword].includes(modifier.kind))) : node;
    const text = printer.printNode(ts.EmitHint.Unspecified, stripped, node.getSourceFile());
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
    const tokens = [];
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
        tokens.push(token === ts.SyntaxKind.StringLiteral ? JSON.stringify(scanner.getTokenValue()) : scanner.getTokenText());
    }
    return tokens.join(' ');
}

/** Track original symbols, including declarations promoted by the public API rollup. */
function reusableSymbols(program, published) {
    const checker = program.getTypeChecker();
    const reused = new Map();
    const publicApis = [];
    for (const entry of published) {
        const rolled = ts.createSourceFile(entry.output, fs.readFileSync(entry.output, 'utf8'), ts.ScriptTarget.Latest, true);
        const declarations = new Map();
        for (const node of rolled.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [node])) {
            if (!node.name || !ts.isIdentifier(node.name)) continue;
            if (!declarations.has(node.name.text)) declarations.set(node.name.text, []);
            declarations.get(node.name.text).push(node);
        }
        const source = program.getSourceFile(entry.source);
        const module = source && checker.getSymbolAtLocation(source);
        if (!module) continue;
        const exported = checker.getExportsOfModule(module);
        for (const item of exported) {
            const symbol = originalSymbol(item, checker);
            if (declarations.has(item.name) && !reused.has(symbol)) reused.set(symbol, { module: entry.module, name: item.name });
        }
        publicApis.push({ entry, exported, declarations });
    }
    // Prefer the public module's explicit exports over types incidentally inlined
    // into another module's rollup (for example scene types also present in cli).
    for (const { entry, exported, declarations } of publicApis) {
        // A rollup also exports types reachable through its API. Only reuse those
        // when both their source provenance and their complete declaration match.
        const visited = new Set();
        const candidates = new Map();
        function follow(symbol) {
            symbol = originalSymbol(symbol, checker);
            if (!symbol || visited.has(symbol)) return;
            visited.add(symbol);
            for (const node of symbol.declarations || []) {
                const topLevel = node.parent && (ts.isSourceFile(node.parent) || ts.isVariableDeclaration(node) && node.parent.parent?.parent && ts.isSourceFile(node.parent.parent.parent));
                if (!topLevel || !node.name || !ts.isIdentifier(node.name)) continue;
                const name = node.name.text;
                if (!candidates.has(name)) candidates.set(name, new Map());
                candidates.get(name).set(symbol, node);
                function visit(child) {
                    if (ts.isIdentifier(child)) follow(checker.getSymbolAtLocation(child));
                    ts.forEachChild(child, visit);
                }
                ts.forEachChild(node, visit);
            }
        }
        for (const item of exported) follow(item);
        for (const [name, possible] of candidates) {
            const rolledDeclarations = declarations.get(name);
            if (!rolledDeclarations) continue;
            const expected = rolledDeclarations.map(declarationText).sort();
            const matching = [...possible].filter(([symbol]) => {
                const actual = (symbol.declarations || []).map(declarationText).sort();
                return actual.length === expected.length && actual.every((text, index) => text === expected[index]);
            });
            if (matching.length === 1 && !reused.has(matching[0][0])) reused.set(matching[0][0], { module: entry.module, name });
        }
    }
    return reused;
}

function namedImports(module, bindings) {
    return `import { ${bindings.map(([name, local]) => name === local ? name : `${name} as ${local}`).join(', ')} } from '${module}';`;
}

function namedExports(module, bindings) {
    return `export { ${bindings.map(([name, local]) => name === local ? name : `${name} as ${local}`).join(', ')} } from '${module}';`;
}

/** Drop dependencies used only by declarations that now live in a public rollup. */
function pruneImports(code, file) {
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest);
    const used = new Set();
    function visit(node) {
        if (ts.isIdentifier(node)) used.add(node.text);
        ts.forEachChild(node, visit);
    }
    for (const node of source.statements) if (!ts.isImportDeclaration(node)) visit(node);
    const edits = [];
    for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || !node.importClause) continue;
        const clause = node.importClause;
        const defaultName = clause.name && used.has(clause.name.text) ? clause.name.text : undefined;
        const namespace = clause.namedBindings && ts.isNamespaceImport(clause.namedBindings) && used.has(clause.namedBindings.name.text) ? clause.namedBindings.name.text : undefined;
        const names = clause.namedBindings && ts.isNamedImports(clause.namedBindings)
            ? clause.namedBindings.elements.filter(item => used.has(item.name.text)).map(item => item.getText(source)) : [];
        const bindings = [defaultName, namespace ? '* as ' + namespace : names.length ? '{ ' + names.join(', ') + ' }' : undefined].filter(Boolean);
        edits.push({ start: node.getStart(source), end: node.end, text: bindings.length
            ? `import ${clause.isTypeOnly ? 'type ' : ''}${bindings.join(', ')} from ${node.moduleSpecifier.getText(source)};` : '' });
    }
    for (const edit of edits.reverse()) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
    return code;
}

/** Extend the existing domain rollups with the editor's reachable API. */
async function extendPublicDts() {
    generateBrowserFacades();
    const packageRoot = path.join(root, 'packages/cocos-cli-types');
    const output = path.join(packageRoot, 'scene-editor');
    if (path.relative(root, output).replace(/\\/g, '/') !== 'packages/cocos-cli-types/scene-editor') throw new Error('Invalid declaration output');
    const published = publicEntries(packageRoot);
    if (!published.some(entry => entry.module === PACKAGE_NAME + '/scene')) throw new Error('Generate public CLI declarations first: npm run generate:dts');
    const publicTargets = new Map();
    for (const kind of ['host', 'browser']) for (const [id, target] of Object.entries(entries[kind])) {
        const file = path.join(root, 'dist', (kind === 'browser' ? browserFacadePath(id) : target) + '.d.ts');
        if (!fs.existsSync(file)) throw new Error('Build CLI declarations first: ' + file);
        publicTargets.set(normalize(file), `${kind}/${id}.d.ts`);
    }
    const cc = path.join(root, 'packages/cc-module/cc.d.ts');
    const options = {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true,
        skipLibCheck: true, types: ['node'], baseUrl: root,
        paths: { cc: [cc], 'cc/*': [path.join(root, 'packages/cc-module/*')] },
    };
    const program = ts.createProgram([...publicTargets.keys(), ...published.map(entry => entry.source), cc], options);
    const checker = program.getTypeChecker();
    const host = ts.createCompilerHost(options);
    const reused = reusableSymbols(program, published);
    const sources = new Map();
    const destinations = new Map();
    const nodeBuiltin = new Set(require('node:module').builtinModules.flatMap(id => [id, 'node:' + id]));
    function destination(file) {
        if (publicTargets.has(normalize(file))) return publicTargets.get(normalize(file));
        const relative = path.relative(root, file).replace(/\\/g, '/');
        if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Declaration outside CLI dependency graph: ' + file);
        return 'internal/' + relative.replace(/^dist\//, 'cli/').replace(/node_modules\//g, 'dependencies/').replace(/^src\//, 'declarations/');
    }
    for (const source of program.getSourceFiles()) {
        if (program.isSourceFileDefaultLibrary(source) || /[/\\]@types[/\\]node[/\\]/.test(source.fileName)) continue;
        const name = destination(source.fileName).replace(/\.d\.[cm]ts$/, '.d.ts');
        if (destinations.has(name)) throw new Error('Declaration path collision: ' + name);
        destinations.set(name, source.fileName);
        sources.set(normalize(source.fileName), { source, destination: name });
    }
    const generated = new Map();
    const unresolved = new Set();
    const engineShims = {
        'pal/audio/type': `export type AudioType = import('cc').__private._pal_audio_type__AudioType;\nexport type AudioState = import('cc').__private._pal_audio_type__AudioState;\nexport type AudioPCMDataView = import('cc').AudioPCMDataView;\nexport type AudioLoadOptions = unknown;\n`,
        'pal/input/input-source': `export interface InputSource<T> { getValue(): T; }\nexport type InputSourceButton = InputSource<number>;\nexport type InputSourceDpad = InputSource<import('cc').Vec2>;\nexport type InputSourceStick = InputSource<import('cc').Vec2>;\nexport type InputSourcePosition = InputSource<import('cc').Vec3>;\nexport type InputSourceOrientation = InputSource<import('cc').Quat>;\n`,
        '../foundation/node-shell': `export type NodeInputPath = readonly [string] | readonly [string, number];\n`,
    };
    function modulePath(target, from) {
        const relative = path.posix.relative(path.posix.dirname(from), target.replace(/\.d\.ts$/, ''));
        return relative.startsWith('.') ? relative : './' + relative;
    }
    function declarationModule(id, importer) {
        if (id === 'cc' || id.startsWith('cc/') || nodeBuiltin.has(id)) return id;
        const resolved = ts.resolveModuleName(id, importer.source.fileName, options, host).resolvedModule;
        if (!resolved && id in engineShims) {
            const name = 'internal/engine-shims/' + id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.d.ts';
            generated.set(name, engineShims[id]);
            return modulePath(name, importer.destination);
        }
        if (!resolved) { unresolved.add(id + ' (' + importer.source.fileName + ')'); return id; }
        if (/[/\\]@types[/\\]node[/\\]/.test(resolved.resolvedFileName)) return id;
        // Match the existing public rollups: keep ordinary third-party packages
        // external, including CommonJS export-assignment namespaces such as express.
        if (!id.startsWith('.') && /[/\\]node_modules[/\\]/.test(resolved.resolvedFileName)
            && !id.startsWith('@cocos/asset-db')) return id;
        const target = sources.get(normalize(resolved.resolvedFileName));
        if (!target || !target.source.isDeclarationFile) {
            if (!/\.[cm]?js$/.test(resolved.resolvedFileName)) throw new Error('Dependency has no declaration: ' + resolved.resolvedFileName);
            const name = 'internal/opaque/' + id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.d.ts';
            generated.set(name, `/** Upstream ${id} supplies no declarations. */\ndeclare const value: unknown;\nexport = value;\n`);
            return modulePath(name, importer.destination);
        }
        return modulePath(target.destination, importer.destination);
    }
    for (const info of sources.values()) {
        const { source, destination: name } = info;
        if (!source.isDeclarationFile) continue;
        const edits = [];
        const aliases = new Map();
        function replacement(node) { return reused.get(originalSymbol(checker.getSymbolAtLocation(node), checker)); }
        function reuse(node, statement) {
            const target = reused.get(declarationSymbol(node, checker));
            if (!target || !ts.isIdentifier(node.name)) return false;
            const local = node.name.text;
            if (!aliases.has(local)) {
                const exported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
                const isDefault = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
                aliases.set(local, namedImports(target.module, [[target.name, local]]) + '\n' +
                    (isDefault ? `export default ${local};\n` : exported ? `export { ${local} };\n` : ''));
            }
            return true;
        }
        function visit(node) {
            let literal;
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) literal = node.moduleSpecifier;
            else if (ts.isExternalModuleReference(node) && node.expression && ts.isStringLiteral(node.expression)) literal = node.expression;
            else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
                literal = node.argument.literal;
                let qualifier = node.qualifier;
                while (qualifier && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
                const target = qualifier && replacement(qualifier);
                if (target) {
                    edits.push({ start: literal.getStart(source), end: literal.end, text: JSON.stringify(target.module) });
                    edits.push({ start: qualifier.getStart(source), end: qualifier.end, text: target.name });
                    return;
                }
            }
            if (literal) edits.push({ start: literal.getStart(source), end: literal.end, text: JSON.stringify(declarationModule(literal.text, info)) });
            ts.forEachChild(node, visit);
        }
        function redirectBindings(statement) {
            const isImport = ts.isImportDeclaration(statement);
            const bindings = isImport ? statement.importClause?.namedBindings : statement.exportClause;
            if (!statement.moduleSpecifier || !bindings || !(isImport ? ts.isNamedImports(bindings) : ts.isNamedExports(bindings))) return false;
            // A default or namespace import must retain its original module shape.
            if (isImport && statement.importClause.name) return false;
            const groups = new Map();
            const remaining = [];
            for (const item of bindings.elements) {
                const target = replacement(isImport ? item.name : item.propertyName || item.name);
                if (!target) { remaining.push(item.getText(source)); continue; }
                if (!groups.has(target.module)) groups.set(target.module, []);
                groups.get(target.module).push([target.name, item.name.text]);
            }
            if (!groups.size) return false;
            const code = [...groups].map(([module, names]) => (isImport ? namedImports : namedExports)(module, names));
            if (remaining.length) code.push(`${isImport ? 'import' : 'export'} ${!isImport && statement.isTypeOnly ? 'type ' : ''}{ ${remaining.join(', ')} } from '${declarationModule(statement.moduleSpecifier.text, info)}';`);
            edits.push({ start: statement.getStart(source), end: statement.end, text: code.join('\n') });
            return true;
        }
        for (const statement of source.statements) {
            if (ts.isExportDeclaration(statement) && !statement.exportClause && statement.moduleSpecifier
                && ts.isStringLiteral(statement.moduleSpecifier) && !statement.moduleSpecifier.text.startsWith('.')) {
                const module = checker.getSymbolAtLocation(statement.moduleSpecifier);
                const names = module ? checker.getExportsOfModule(module).filter(symbol => !['default', 'export='].includes(symbol.name)) : [];
                edits.push({ start: statement.getStart(source), end: statement.end, text: names.length
                    ? namedExports(declarationModule(statement.moduleSpecifier.text, info), names.map(symbol => [symbol.name, symbol.name])) : 'export {};' });
                continue;
            }
            if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1 && reuse(statement.declarationList.declarations[0], statement)
                || !ts.isVariableStatement(statement) && reuse(statement, statement)) {
                edits.push({ start: statement.getStart(source), end: statement.end, text: '' });
            } else if (!redirectBindings(statement)) visit(statement);
        }
        for (const reference of source.referencedFiles) {
            const target = sources.get(normalize(path.resolve(path.dirname(source.fileName), reference.fileName.replace(/\\/g, '/'))));
            if (!target) throw new Error('Missing referenced declaration: ' + reference.fileName);
            const relative = path.posix.relative(path.posix.dirname(name), target.destination);
            edits.push({ start: reference.pos, end: reference.end, text: relative.startsWith('.') ? relative : './' + relative });
        }
        let code = source.text;
        for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
        code = [...aliases.values()].join('') + code.replace(/\bconst enum\b/g, 'enum');
        code = pruneImports(code, name);
        const parsed = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true);
        const publicImports = [];
        function usePublicFile(node) {
            if (isModuleSpecifier(node) && (node.text === PACKAGE_NAME || node.text.startsWith(PACKAGE_NAME + '/'))) {
                const id = node.text === PACKAGE_NAME ? 'index' : node.text.slice(PACKAGE_NAME.length + 1);
                publicImports.push({ start: node.getStart(parsed), end: node.end, text: JSON.stringify(modulePath('../' + id + '.d.ts', name)) });
            }
            ts.forEachChild(node, usePublicFile);
        }
        usePublicFile(parsed);
        for (const edit of publicImports.reverse()) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
        generated.set(name, code);
    }

    // Resolve the rewritten graph, not every file loaded by the compiler program.
    const reachable = new Set();
    function include(name) {
        if (reachable.has(name)) return;
        const code = generated.get(name);
        if (code === undefined) throw new Error('Missing generated declaration: ' + name);
        reachable.add(name);
        const references = ts.preProcessFile(code, true, true);
        for (const item of [...references.importedFiles, ...references.referencedFiles]) {
            if (!item.fileName.startsWith('.')) continue;
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), item.fileName));
            if (target.startsWith('../')) {
                const publicFile = path.resolve(output, target + '.d.ts');
                if (!published.some(entry => normalize(entry.output) === normalize(publicFile))) throw new Error('Unknown shared declaration: ' + target);
                continue;
            }
            const resolved = [target, target + '.d.ts', target + '/index.d.ts'].find(file => generated.has(file));
            if (!resolved) throw new Error('Missing declaration reference: ' + name + ': ' + item.fileName);
            include(resolved);
        }
    }
    const exportedSymbols = new Map([...publicTargets].map(([fileName, name]) => [name,
        checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(fileName)))]));
    for (const [name, symbols] of exportedSymbols) {
        if (symbols.every(symbol => reused.has(originalSymbol(symbol, checker)))) {
            const groups = new Map();
            for (const symbol of symbols) {
                const target = reused.get(originalSymbol(symbol, checker));
                const id = target.module === PACKAGE_NAME ? 'index' : target.module.slice(PACKAGE_NAME.length + 1);
                const module = modulePath('../' + id + '.d.ts', name);
                if (!groups.has(module)) groups.set(module, []);
                groups.get(module).push([target.name, symbol.name]);
            }
            generated.set(name, groups.size ? [...groups].map(([module, names]) => namedExports(module, names)).join('\n') : 'export {};');
        }
        include(name);
    }
    // Keep diagnostics scoped to the graph the editor actually uses.
    for (const message of unresolved) {
        const importer = message.slice(message.lastIndexOf(' (') + 2, -1);
        if (reachable.has(sources.get(normalize(importer))?.destination)) throw new Error('Unresolved type dependency: ' + message);
    }
    const workspace = fs.mkdtempSync(path.join(root, 'dist', '.public-dts-'));
    if (!normalize(workspace).startsWith(normalize(path.join(root, 'dist')) + '/.public-dts-')) throw new Error('Invalid temporary declaration directory');
    try {
        return await require('./public-dts-rollup').rollupDomains({ workspace, packageRoot, generated, reachable, publicTargets, published, reused });
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
}

module.exports = { extendPublicDts };
