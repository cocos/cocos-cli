import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fork } from 'node:child_process';
import ts from 'typescript';

jest.mock('gl', () => jest.fn());
jest.mock('sharp', () => jest.fn());

const originalProvider = process.env.COCOS_CLI_RUNTIME_PROVIDER;
let directory: string;

beforeEach(() => {
    delete process.env.COCOS_CLI_RUNTIME_PROVIDER;
    jest.resetModules();
    directory = mkdtempSync(join(tmpdir(), 'cocos-provider-'));
});

afterEach(() => {
    if (originalProvider === undefined) {
        delete process.env.COCOS_CLI_RUNTIME_PROVIDER;
    } else {
        process.env.COCOS_CLI_RUNTIME_PROVIDER = originalProvider;
    }
    rmSync(directory, { recursive: true, force: true });
});

function writeProvider(source: string): string {
    const file = join(directory, 'provider.cjs');
    writeFileSync(file, source);
    process.env.COCOS_CLI_RUNTIME_PROVIDER = file;
    return file;
}

function loadAdapter(): typeof import('../native-modules') {
    return require('../native-modules');
}

test('standalone and legacy callers keep using local modules without a provider', () => {
    const adapter = loadAdapter();
    expect(adapter.getGl()).toBe(require('gl'));
    expect(adapter.getSharp()).toBe(require('sharp'));
});

test('host modules include their public JavaScript API and are loaded lazily', () => {
    writeProvider(`module.exports = {
        version: 1,
        getGl() { throw new Error('gl must stay lazy'); },
        getSharp() { return Object.assign(() => 'host image', { versions: { sharp: 'host' } }); }
    };`);
    const adapter = loadAdapter();
    expect(adapter.getSharp().versions.sharp).toBe('host');
    expect(() => adapter.getGl()).toThrow('gl must stay lazy');
});

test.each([
    ['relative provider', 'relative/provider.cjs', 'absolute file path'],
    ['missing provider', 'missing', 'Cannot find module'],
])('%s fails without falling back to local modules', (_label, provider, message) => {
    process.env.COCOS_CLI_RUNTIME_PROVIDER = provider === 'missing' ? join(directory, 'missing.cjs') : provider;
    expect(() => loadAdapter().getSharp()).toThrow(message);
    expect(require('sharp')).not.toHaveBeenCalled();
});

test.each([
    'null',
    '{version: 2, getGl() {}, getSharp() {}}',
    '{version: 1, getGl() {}}',
])('rejects an unsupported provider contract: %s', contract => {
    writeProvider(`module.exports = ${contract};`);
    expect(() => loadAdapter().getSharp()).toThrow('Invalid Cocos runtime provider');
});

test('fork children select the provider even with an empty execArgv', async () => {
    writeProvider(`module.exports = {
        version: 1,
        getGl() { return () => 'host gl'; },
        getSharp() { return () => 'host sharp'; }
    };`);
    const adapterFile = join(directory, 'adapter.cjs');
    const source = readFileSync(join(__dirname, '../native-modules.ts'), 'utf8');
    writeFileSync(adapterFile, ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
    const worker = join(directory, 'worker.cjs');
    writeFileSync(worker, `const m = require('./adapter.cjs'); process.send([m.getGl()(), m.getSharp()()]);`);
    const messages: unknown[] = [];
    await new Promise<void>((done, reject) => {
        const child = fork(worker, [], { execArgv: [], env: { ...process.env }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        let stderr = '';
        child.stderr?.on('data', data => { stderr += data; });
        child.on('message', message => messages.push(message));
        child.on('error', reject);
        child.on('exit', code => code === 0 ? done() : reject(new Error(stderr)));
    });
    expect(messages).toEqual([['host gl', 'host sharp']]);
});

test('runtime imports cannot bypass the adapter (type-only imports remain allowed)', () => {
    const sourceRoot = resolve(__dirname, '../../..');
    const adapter = resolve(__dirname, '../native-modules.ts');
    const violations: string[] = [];
    const visitDirectory = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const file = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (!['node_modules', 'test', 'tests', '__tests__', 'dist'].includes(entry.name)) {
                    visitDirectory(file);
                }
                continue;
            }
            if (!/\.(ts|js)$/.test(file) || /\.(test|spec|d)\.ts$/.test(file) || file === adapter) {
                continue;
            }
            const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
            const visit = (node: ts.Node) => {
                let specifier: ts.Node | undefined;
                if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
                    specifier = node.moduleSpecifier;
                } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
                    || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
                    specifier = node.arguments[0];
                }
                if (specifier && ts.isStringLiteral(specifier) && ['gl', 'sharp'].includes(specifier.text)) {
                    violations.push(file);
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }
    };
    visitDirectory(sourceRoot);
    visitDirectory(resolve(sourceRoot, '../packages/cc-module/src'));
    expect(violations).toEqual([]);
});
