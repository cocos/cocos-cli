const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const entries = require('./scene-api-entries.json');

const PACKAGE_NAME = '@cocos/cocos-cli-types';
const root = path.resolve(__dirname, '..');

function domainOf(kind, id) {
    if (kind === 'browser') return id.startsWith('engine/') ? 'engine' : 'scene';
    const domain = id.split('/')[1];
    if (id.startsWith('core/') && ['assets', 'base', 'builder', 'configuration', 'project', 'scene', 'scripting'].includes(domain)) return domain;
    if (id === 'lib/simulator/simulator') return 'simulator';
    return id.startsWith('commands/') ? 'base' : 'cli';
}

function namespaceOf(id) {
    return id.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

function restoreNamespaceExports(code) {
    // API Extractor strips the export keyword when rolling up an already emitted
    // namespace export list. Its remaining bare block is invalid in a .d.ts file.
    return code.replace(/^((?:export )?declare namespace [\w$]+ \{\r?\n)([ \t]+)\{(?=\r?\n)/gm, '$1$2export {');
}

function domainEntries() {
    return ['host', 'browser'].flatMap(kind => Object.keys(entries[kind]).map(id => ({
        kind, id, domain: domainOf(kind, id), namespace: namespaceOf(id), file: kind + '/' + id + '.d.ts',
    })));
}

function isModuleSpecifier(node) {
    const parent = node.parent;
    return ts.isStringLiteral(node) && parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)
        || ts.isExternalModuleReference(parent) || ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent));
}

/** Shared public types stay external to extraction instead of being inlined again. */
function externalizePublicImports(code, name) {
    const source = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true);
    const edits = [];
    const namespaceImports = [];
    function visit(node) {
        // API Extractor cannot roll up a bare typeof import() of a local module.
        // An equivalent namespace import retains its value/type shape.
        if (ts.isImportTypeNode(node) && node.isTypeOf && !node.qualifier
            && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)
            && node.argument.literal.text.startsWith('.')) {
            const alias = '__EditorModule' + namespaceImports.length;
            namespaceImports.push(`import * as ${alias} from '${node.argument.literal.text}';`);
            edits.push({ start: node.getStart(source), end: node.end, text: 'typeof ' + alias });
            return;
        }
        if (isModuleSpecifier(node) && node.text.startsWith('.')) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), node.text));
            if (target.startsWith('../')) edits.push({ start: node.getStart(source), end: node.end,
                text: JSON.stringify(PACKAGE_NAME + '/' + target.slice(3).replace(/\.d\.ts$/, '')) });
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    for (const edit of edits.reverse()) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
    return namespaceImports.join('\n') + '\n' + code;
}

function capabilityDeclarations() {
    const fields = kind => domainEntries().filter(entry => entry.kind === kind).map(entry => {
        const namespace = `typeof import('${PACKAGE_NAME}/${entry.domain}').Editor.${kind === 'host' ? 'Host' : 'Browser'}.${entry.namespace}`;
        // export= is a compiler-internal module member, not a named namespace
        // export. Preserve the existing capability object shape explicitly.
        const assignment = kind === 'browser' && entry.id === 'engine/overwrite'
            ? " & { 'export=': typeof import('cc/overwrite') }" : '';
        return `    '${entry.id}': ${namespace}${assignment};`;
    }).join('\n');
    return `
export interface HostModules {
${fields('host')}
}
export interface BrowserModules {
${fields('browser')}
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
`;
}

async function rollupDomains({ workspace, packageRoot, generated, reachable, publicTargets, published, reused }) {
    const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor');
    const graph = path.join(workspace, 'graph');
    const write = (file, code) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, code); };
    write(path.join(graph, 'package.json'), JSON.stringify({ name: '@cocos/public-dts-graph', version: '1.0.0' }));
    fs.mkdirSync(path.join(graph, 'node_modules/@cocos'), { recursive: true });
    fs.symlinkSync(packageRoot, path.join(graph, 'node_modules/@cocos/cocos-cli-types'), 'junction');
    // Reused-only modules still need facades in the temporary graph for namespace exports.
    for (const name of new Set([...reachable, ...publicTargets.values()])) {
        write(path.join(graph, name), externalizePublicImports(generated.get(name), name));
    }
    const mappings = domainEntries();
    const domains = [...new Set(mappings.map(entry => entry.domain))];
    const staged = new Map();
    for (const domain of domains) {
        const baseline = published.find(entry => entry.module === PACKAGE_NAME + '/' + domain);
        if (!baseline) throw new Error('Missing domain declaration: ' + domain);
        const baselineCode = fs.readFileSync(baseline.output, 'utf8');
        write(path.join(graph, domain + '-baseline.d.ts'), baselineCode + (domain === 'scene' ? capabilityDeclarations() : ''));
        const groups = [];
        for (const kind of ['host', 'browser']) {
            const modules = mappings.filter(entry => entry.domain === domain && entry.kind === kind);
            if (!modules.length) continue;
            write(path.join(graph, domain + '-' + kind + '.d.ts'), modules.map(entry =>
                `export * as ${entry.namespace} from './${entry.file.replace(/\.d\.ts$/, '')}';`).join('\n'));
            groups.push(`export * as ${kind === 'host' ? 'Host' : 'Browser'} from './${domain}-${kind}';`);
        }
        write(path.join(graph, domain + '-editor.d.ts'), groups.join('\n'));
        const main = path.join(graph, domain + '-entry.d.ts');
        write(main, `export * from './${domain}-baseline';\nexport * as Editor from './${domain}-editor';\n`);
        const output = path.join(workspace, domain + '.d.ts');
        const config = ExtractorConfig.prepare({
            configObject: {
                projectFolder: root,
                mainEntryPointFilePath: main,
                compiler: { overrideTsconfig: { compilerOptions: {
                    target: 'es2022', module: 'commonjs', moduleResolution: 'node',
                    esModuleInterop: true, skipLibCheck: true, types: ['node'], baseUrl: root,
                }, files: [main, path.join(root, 'packages/cc-module/statics/cc-template.d.ts')] } },
                dtsRollup: { enabled: true, untrimmedFilePath: output },
                docModel: { enabled: false }, apiReport: { enabled: false }, tsdocMetadata: { enabled: false },
                messages: {
                    compilerMessageReporting: { default: { logLevel: 'warning' } },
                    extractorMessageReporting: { default: { logLevel: 'warning', addToApiReportFile: false } },
                },
            },
            configObjectFullPath: undefined,
            packageJsonFullPath: path.join(graph, 'package.json'),
        });
        console.log('Extending ' + domain + '.d.ts...');
        const result = Extractor.invoke(config, { localBuild: true, messageCallback(message) {
            if (message.logLevel !== 'error') message.handled = true;
        } });
        if (!result.succeeded) throw new Error('Failed to extend ' + domain + '.d.ts: ' + result.errorCount + ' errors');
        let code = restoreNamespaceExports(fs.readFileSync(output, 'utf8'));
        code = code.replace(/^[ \t]+/gm, indent => indent.replace(/\t/g, '    '));
        code = code.replace(/(['"])@cocos\/cocos-cli-types(?:\/([^'"\r\n]+))?\1/g, (_, quote, id) => quote + './' + (id || 'index') + quote);
        if (domain === 'scene') code = '/// <reference path="./cc.d.ts" />\n/// <reference path="./cc.editor.d.ts" />\n' + code;
        staged.set(path.join(packageRoot, domain + '.d.ts'), code);
    }
    for (const name of ['cc.d.ts', 'cc.editor.d.ts']) staged.set(path.join(packageRoot, name), fs.readFileSync(path.join(root, 'packages/engine/bin/.declarations', name), 'utf8'));
    const editorDeclarations = path.join(packageRoot, 'cc.editor.d.ts');
    // The engine rollup leaks one source-relative import. Its public InputKey
    // alias already names the same NodeInputPath type in this namespace.
    const editorCode = staged.get(editorDeclarations).replace(/import\(['"]\.\.\/foundation\/node-shell['"]\)\.NodeInputPath/g, 'InputKey');
    staged.set(editorDeclarations, editorCode + '\n' + fs.readFileSync(path.join(root, 'packages/cc-module/statics/cc-template.d.ts'), 'utf8'));
    for (const [file, code] of staged) {
        const references = ts.preProcessFile(code, true, true);
        for (const item of [...references.importedFiles, ...references.referencedFiles]) {
            if (!item.fileName.startsWith('.')) continue;
            const target = path.resolve(path.dirname(file), item.fileName);
            const insidePackage = path.dirname(target) === packageRoot;
            const exists = [target, target + '.d.ts'].some(candidate => staged.has(candidate) || fs.existsSync(candidate));
            if (!insidePackage || !exists) throw new Error('Invalid public declaration reference: ' + file + ': ' + item.fileName);
        }
    }
    // Publish the set only after every domain and its references have validated.
    for (const [file, code] of staged) fs.writeFileSync(file, code);
    const legacy = path.resolve(packageRoot, 'scene-editor');
    if (legacy !== path.resolve(root, 'packages/cocos-cli-types/scene-editor')) throw new Error('Invalid legacy declaration directory');
    fs.rmSync(legacy, { recursive: true, force: true });
    fs.rmSync(path.join(packageRoot, 'scene-editor.d.ts'), { force: true });
    console.log('Extended ' + domains.length + ' public declaration files; reused ' + reused.size + ' public symbols.');
    return packageRoot;
}

module.exports = { rollupDomains, domainEntries };
