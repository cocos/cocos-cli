import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const root = path.resolve(__dirname, '..');
const packageRoot = path.join(root, 'packages/cocos-cli-types');
const { domainEntries } = require('../workflow/public-dts-rollup');
const { browserFacadePath } = require('../workflow/scene-browser-api');
const entries = require('../workflow/scene-api-entries.json');

interface DomainEntry { kind: 'host' | 'browser'; id: string; domain: string; namespace: string; }

describe('editor types integrated into public declarations', () => {
    const mappings: DomainEntry[] = domainEntries();
    const fixture = path.join(root, 'tests/.public-editor-types-fixture.ts');
    const code = `
import type { HostCapabilities, BrowserCapabilities, BrowserHost, Editor } from '../packages/cocos-cli-types/scene';
import type { IAssetInfo } from '../packages/cocos-cli-types/assets';
import type { ConfigInterface, rollup as Rollup } from '../packages/cocos-cli-types/builder';
import { editorExtrasTag, Node } from 'cc';
declare const host: HostCapabilities;
declare const browser: BrowserHost;
declare const capabilities: BrowserCapabilities;
declare const node: Node;
const queried = host.modules['core/assets/index'].assetManager.queryAssetInfo('db://assets/test');
const asset: IAssetInfo | null = queried;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type AssertTyped<T extends false> = T;
type AssetIsTyped = AssertTyped<IsAny<typeof queried>>;
type Session = Editor.Browser.SceneSessionProtocol.SceneSessionDescriptor;
type BuilderConfigIsTyped = AssertTyped<IsAny<ConfigInterface.Config>>;
type RollupOptionsIsTyped = AssertTyped<IsAny<Rollup.RollupOptions>>;
type Manager = typeof Editor.Browser.SceneNode.default;
type ManagerIsTyped = AssertTyped<IsAny<Manager>>;
const manager: Manager = capabilities.modules['scene/node'].default;
const queriedNode: Node | null = manager.query('test-node');
const mountedRoot: Node | undefined = node[editorExtrasTag].mountedRoot;
const portable = host.portable['scene/session/client'];
const prepared = browser.prepareScene({});
const overwrite: typeof import('cc/overwrite') = capabilities.modules['engine/overwrite']['export='];
`;
    const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true,
        skipLibCheck: true, strict: true, types: ['node'], noEmit: true,
    };
    const oldFile = (entry: DomainEntry) => path.join(root, 'dist',
        (entry.kind === 'browser' ? browserFacadePath(entry.id) : entries.host[entry.id]) + '.d.ts');
    function createFixtureProgram(source = code) {
        const compilerHost = ts.createCompilerHost(options);
        const getSourceFile = compilerHost.getSourceFile.bind(compilerHost);
        compilerHost.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => path.resolve(file) === fixture
            ? ts.createSourceFile(file, source, languageVersion, true)
            : getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
        return ts.createProgram([fixture, ...mappings.map(oldFile),
            ...new Set(mappings.map(entry => path.join(packageRoot, entry.domain + '.d.ts')))], options, compilerHost);
    }
    function fixtureDiagnostics(program: ts.Program) {
        const source = program.getSourceFile(fixture);
        expect(source).toBeDefined();
        // SourceFile identity is independent of Windows/POSIX path separators.
        return [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()]
            .filter(diagnostic => diagnostic.file === source)
            .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
    const program = createFixtureProgram();
    const checker = program.getTypeChecker();
    const resolve = (symbol: ts.Symbol): ts.Symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const exportsOf = (symbol: ts.Symbol) => checker.getExportsOfModule(resolve(symbol));

    it('removes the old declaration tree and explicit package exports', () => {
        expect(fs.existsSync(path.join(packageRoot, 'scene-editor'))).toBe(false);
        expect(fs.existsSync(path.join(packageRoot, 'scene-editor.d.ts'))).toBe(false);
        const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
        expect(Object.keys(manifest.exports).some(key => key.includes('scene-editor'))).toBe(false);
        expect(manifest.files).toEqual(['*.d.ts']);
    });

    it('type-checks public capabilities, default exports, shared assets and engine augmentation', () => {
        expect(fixtureDiagnostics(program)).toEqual([]);
    });

    it('detects fixture type errors on every platform', () => {
        const invalid = createFixtureProgram(code + '\nconst invalid: number = "not a number";');
        expect(fixtureDiagnostics(invalid)).toEqual(["Type 'string' is not assignable to type 'number'."]);
    });

    it.each(mappings)('preserves $kind/$id exports in $domain.Editor', entry => {
        const oldSource = program.getSourceFile(oldFile(entry))!;
        // export= is the compiler's export-assignment symbol, not a named export.
        // Its capability-object member is checked in the consumer fixture above.
        const oldExports = exportsOf(checker.getSymbolAtLocation(oldSource)!).filter(item => item.name !== 'export=');
        const newSource = program.getSourceFile(path.join(packageRoot, entry.domain + '.d.ts'))!;
        let symbol = checker.getSymbolAtLocation(newSource)!;
        for (const name of ['Editor', entry.kind === 'host' ? 'Host' : 'Browser', entry.namespace]) {
            const next = exportsOf(symbol).find(item => item.name === name);
            expect(next).toBeDefined();
            symbol = next!;
        }
        const actual = exportsOf(symbol);
        expect(actual.map(item => item.name).sort()).toEqual(oldExports.map(item => item.name).sort());
        for (const expected of oldExports) {
            const exported = actual.find(item => item.name === expected.name)!;
            // Classes/enums must remain usable as both values and types.
            const flags = ts.SymbolFlags.Type | ts.SymbolFlags.Value;
            expect(resolve(exported).flags & flags).toBe(resolve(expected).flags & flags);
        }
    });
});
