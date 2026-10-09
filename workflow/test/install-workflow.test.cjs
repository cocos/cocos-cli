/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { resolveEnginePath } = require('../engine-path');
const { setupDev } = require('../setup-dev');
const { installEngine } = require('../install-engine');
const UpdateRepo = require('../update-repo');

function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cocos install workflow ')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function write(root, name, content = '') {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
    return file;
}
function prepared(root, engine = 'my engine') {
    write(root, 'config.local.json', { project: 'preserve-me', enginePath: engine });
    for (const file of ['package.json', 'bin/.declarations/cc.d.ts', 'bin/.declarations/cc.editor.d.ts', 'bin/.cache/dev-cli/editor/loader.js']) write(root, `${engine}/${file}`, '{}');
    return path.join(root, engine);
}
function repoConfig(root, dist = 'packages/engine') {
    write(root, 'repo.json', { engine: { repo: 'https://example.invalid/engine.git', dist, tag: '4.0.0' }, external: { repo: 'https://example.invalid/external.git', dist: `${dist}/native/external`, tag: '1.0.0' } });
}

test('local default supports relative paths with spaces, absolute paths and explicit overrides', t => {
    const root = fixture(t);
    assert.equal(resolveEnginePath(root), path.join(root, 'packages/engine'));
    write(root, 'config.local.json', { project: 'unchanged' });
    assert.equal(resolveEnginePath(root), path.join(root, 'packages/engine'));
    write(root, 'config.local.json', { project: 'unchanged', enginePath: '../my engine' });
    assert.equal(resolveEnginePath(root), path.resolve(root, '../my engine'));
    const absolute = path.join(root, 'another engine');
    write(root, 'config.local.json', { project: 'unchanged', enginePath: absolute });
    assert.equal(resolveEnginePath(root), absolute);
    assert.equal(resolveEnginePath(root, './override engine'), path.resolve('./override engine'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'config.local.json'))).project, 'unchanged');
});

test('invalid local configuration fails instead of silently using another engine', t => {
    const root = fixture(t);
    for (const config of ['{', 'null', '[]', '{"enginePath":" "}', '{"enginePath":42}']) {
        write(root, 'config.local.json', config);
        assert.throws(() => resolveEnginePath(root), /config.local.json/);
    }
    assert.equal(resolveEnginePath(root, './explicit'), path.resolve('./explicit'));
    assert.throws(() => resolveEnginePath(root, ''), /non-empty/);
});

test('compiled CLI global paths honor local config when launched outside the CLI directory', t => {
    const root = fixture(t);
    const cliRoot = path.resolve(__dirname, '../..');
    const ts = require('typescript');
    const source = fs.readFileSync(path.join(cliRoot, 'src/global.ts'), 'utf8');
    write(root, 'dist/global.js', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    write(root, 'workflow/engine-path.js', fs.readFileSync(path.join(cliRoot, 'workflow/engine-path.js'), 'utf8'));
    write(root, 'config.local.json', { enginePath: '../external engine' });
    const output = execFileSync(process.execPath, ['-e', 'process.stdout.write(require(process.argv[1]).GlobalPaths.enginePath)', path.join(root, 'dist/global.js')], { cwd: os.tmpdir(), encoding: 'utf8' });
    assert.equal(output, path.resolve(root, '../external engine'));
});

test('npm install runs the actual root lifecycle without any engine or build prerequisites', t => {
    const root = fixture(t);
    const cliRoot = path.resolve(__dirname, '../..');
    const pkg = JSON.parse(fs.readFileSync(path.join(cliRoot, 'package.json')));
    const scripts = Object.fromEntries(Object.entries(pkg.scripts).filter(([name]) => ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'].includes(name)));
    write(root, 'package.json', { name: 'cocos-install-regression', version: '1.0.0', private: true, scripts });
    write(root, 'workflow/postinstall.js', fs.readFileSync(path.join(cliRoot, 'workflow/postinstall.js'), 'utf8'));
    const sentinel = write(root, 'packages/engine/local-source.txt', 'do not change');
    const before = fs.statSync(sentinel).mtimeMs;
    const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const output = execFileSync(process.execPath, [npm, 'install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts=false'], {
        cwd: root, encoding: 'utf8', timeout: 60000,
        env: { ...process.env, FORCE_UPDATE: 'true', npm_config_cache: path.join(root, 'npm-cache') },
    });
    assert.match(output, /Dependencies installed/);
    assert.equal(fs.statSync(sentinel).mtimeMs, before);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'do not change');
    for (const name of ['dist', 'packages/engine/bin', 'packages/cc-module']) assert.equal(fs.existsSync(path.join(root, name)), false);
});

test('CLI setup uses a prepared custom engine without compiling or installing it', async t => {
    const root = fixture(t);
    const engine = prepared(root);
    const calls = [];
    await setupDev({ root, compileEngine: false, minimalTools: true, run: async (...args) => calls.push(args) });
    assert.equal(calls.length, 3);
    assert.equal(path.basename(calls[0][1][0]), 'build-cc-module.js');
    assert.deepEqual(calls[0][1].slice(1), ['--engine-path', engine]);
    assert.equal(calls[0][2].shell, false);
    assert.deepEqual(calls[1].slice(0, 2), ['npm', ['run', 'build']]);
    assert.ok(calls[2][1].includes('--minimal'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'config.local.json'))).project, 'preserve-me');
});

test('source setup explicitly compiles selected engine and stops on failure', async t => {
    const root = fixture(t);
    const engine = prepared(root);
    const calls = [];
    await setupDev({ root, force: true, run: async (...args) => calls.push(args) });
    assert.equal(calls.length, 4);
    assert.ok(calls[0][1].some(arg => arg.endsWith('compiler-engine.js')));
    assert.ok(calls[0][1].includes(engine));
    assert.ok(calls[0][1].includes('--force'));
    let count = 0;
    await assert.rejects(setupDev({ root, run: async () => { count++; throw new Error('compile failed'); } }), /compile failed/);
    assert.equal(count, 1);
});

test('CLI setup reports missing engine outputs before running commands', async t => {
    const root = fixture(t);
    let count = 0;
    const run = async () => { count++; };
    await assert.rejects(setupDev({ root, compileEngine: false, run }), /Engine is missing/);
    write(root, 'packages/engine/package.json', '{}');
    await assert.rejects(setupDev({ root, compileEngine: false, run }), /missing bin/);
    assert.equal(count, 0);
});

test('explicit engine install uses local path and refuses prepared SDKs', async t => {
    const root = fixture(t);
    const engine = prepared(root);
    const calls = [];
    const run = async (...args) => calls.push(args);
    await installEngine({ root, run });
    assert.deepEqual(calls, [['npm', ['install'], { cwd: engine }]]);
    write(engine, 'engine-sdk.json', '{}');
    await assert.rejects(installEngine({ root, run }), /prepared Engine SDK/);
    assert.equal(calls.length, 1);
});

test('fetch preserves existing SDK and never populates its nested source directories', async t => {
    const root = fixture(t);
    repoConfig(root);
    write(root, 'packages/engine/engine-sdk.json', '{}');
    await new UpdateRepo({ rootDir: root, exec: () => assert.fail('must not invoke git') }).run();
    assert.equal(fs.existsSync(path.join(root, 'packages/engine/native')), false);
    await assert.rejects(new UpdateRepo({ rootDir: root, update: true, exec: () => assert.fail('must not invoke git') }).run(), /non-Git/);
});

test('acquisition rejects escaping destinations and separately managed custom engines before git', async t => {
    const root = fixture(t);
    const exec = () => assert.fail('must not invoke git');
    for (const dist of ['../outside', '.', '.git/engine']) {
        repoConfig(root, dist);
        await assert.rejects(new UpdateRepo({ rootDir: root, exec }).run(), /inside the CLI root/);
    }
    repoConfig(root);
    prepared(root);
    await assert.rejects(new UpdateRepo({ rootDir: root, exec }).run(), /custom enginePath/);
});

test('update refuses dirty sources and custom origins before any remote operations', async t => {
    const root = fixture(t);
    repoConfig(root);
    write(root, 'packages/engine/.git/HEAD', 'ref: refs/heads/main');
    for (const dirty of [true, false]) {
        const calls = [];
        const exec = (_cmd, args) => {
            calls.push(args[0]);
            if (args[0] === 'status') return dirty ? ' M local.cpp\n' : '';
            if (args[0] === 'remote') return 'https://example.invalid/custom.git';
            assert.fail('must not invoke remote operations');
        };
        await assert.rejects(new UpdateRepo({ rootDir: root, update: true, exec }).run(), dirty ? /Local changes/ : /Origin differs/);
        assert.equal(calls.includes('fetch'), false);
    }
});

test('fresh acquisition clones configured engine and external refs with argument arrays', async t => {
    const root = fixture(t);
    repoConfig(root);
    const calls = [];
    await new UpdateRepo({ rootDir: root, exec: (cmd, args, options) => { calls.push({ cmd, args, options }); return ''; } }).run();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args.slice(0, 6), ['clone', '--branch', '4.0.0', '--depth', '1', '--']);
    assert.equal(calls[0].args.at(-1), path.join(root, 'packages/engine'));
    assert.equal(calls[1].args.at(-1), path.join(root, 'packages/engine/native/external'));
    assert.equal(calls[0].options.shell, false);
});

test('DTS retries only known Windows native crashes and preserves failures', async () => {
    const { generate } = require('../generate-dts-runner.js');
    let calls = 0;
    assert.equal(await generate(async () => ++calls < 3 ? 0xc0000374 : 0, 'win32'), 0);
    assert.equal(calls, 3);
    calls = 0;
    assert.equal(await generate(async () => { calls++; return 1; }, 'win32'), 1);
    assert.equal(calls, 1);
    calls = 0;
    assert.equal(await generate(async () => { calls++; return 0xc0000409; }, 'win32'), 0xc0000409);
    assert.equal(calls, 3);
    calls = 0;
    assert.equal(await generate(async () => { calls++; return 0xc0000374; }, 'darwin'), 0xc0000374);
    assert.equal(calls, 1);
});
