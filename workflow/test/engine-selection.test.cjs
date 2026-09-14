/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname, setTimeout, clearTimeout */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, fork } = require('node:child_process');
const ts = require('typescript');
const { resolveEngineSelection } = require('../engine-path');
const cli = path.resolve(__dirname, '../..');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine selection '));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function write(root, file, content) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
    return target;
}
function engine(root, name, version = '4.0.0', revision = 'custom-1') {
    write(root, `${name}/package.json`, { version });
    write(root, `${name}/engine-sdk.json`, { schemaVersion: 1, engineVersion: version, revision });
    for (const file of ['cc.config.json', 'cocos/core/platform/macro.ts', 'editor/engine-features/render-config.json']) write(root, `${name}/${file}`, '{}');
    write(root, `${name}/editor/engine-features/render-config.json`, { version: 'test', features: {}, categories: {} });
    return fs.realpathSync(path.join(root, name));
}
function sourceProcess(code, args = []) {
    return execFileSync(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), '-e', code, '--', ...args], {
        cwd: cli, encoding: 'utf8', timeout: 45000, env: { ...process.env, TS_NODE_PROJECT: path.join(cli, 'tsconfig.json') },
    });
}
function compile(root, source, dest) {
    write(root, dest, ts.transpileModule(fs.readFileSync(path.join(cli, source), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText);
}

test('explicit > project > local > built-in; all relative paths use their intended root', t => {
    const root = fixture(t);
    const builtin = engine(root, 'packages/engine');
    const local = engine(root, 'local engine');
    const project = engine(root, 'project engine');
    const explicit = engine(root, 'explicit engine');
    assert.equal(resolveEngineSelection(root).path, builtin);
    write(root, 'config.local.json', { enginePath: 'local engine' });
    assert.equal(resolveEngineSelection(root).path, local);
    const options = { projectRoot: path.join(root, 'project'), projectConfig: { path: '../project engine' } };
    assert.equal(resolveEngineSelection(root, options).path, project);
    assert.equal(resolveEngineSelection(root, { ...options, explicitPath: path.relative(process.cwd(), explicit) }).path, explicit);
    write(root, 'config.local.json', '{broken');
    assert.equal(resolveEngineSelection(root, options).path, project);
});

test('invalid selected paths and identity mismatches fail without falling back', t => {
    const root = fixture(t);
    const selected = engine(root, 'packages/engine');
    assert.throws(() => resolveEngineSelection(root, { explicitPath: path.join(root, 'missing') }), /no fallback/);
    assert.throws(() => resolveEngineSelection(root, { projectRoot: root, projectConfig: { path: '' } }), /non-empty/);
    assert.throws(() => resolveEngineSelection(root, { projectConfig: { version: '4.0.1' } }), /requires 4.0.1/);
    assert.throws(() => resolveEngineSelection(root, { explicitPath: selected, projectConfig: { revision: 'wrong' } }), /revision requires wrong/);
    write(selected, 'engine-sdk.json', { engineVersion: '4.0.1' });
    assert.throws(() => resolveEngineSelection(root), /Invalid engine-sdk.json/);
});

test('source engines expose actual version without inventing a revision', t => {
    const root = fixture(t);
    write(root, 'packages/engine/package.json', { version: '4.0.0-alpha.32' });
    const result = resolveEngineSelection(root);
    assert.equal(result.version, '4.0.0-alpha.32');
    assert.equal(result.revision, undefined);
});

test('project selection reads settings through ConfigurationManager and preserves the pinned identity', t => {
    const root = fixture(t);
    const selected = engine(root, 'project engine');
    const project = path.join(root, 'project');
    const config = { version: '1.0.0', engineSdk: { path: '../project engine', version: '4.0.0', revision: 'custom-1' } };
    const filename = write(project, 'settings/cocos.config.json', config);
    const before = fs.readFileSync(filename, 'utf8');
    const output = sourceProcess(`
        const assert = require('node:assert/strict');
        const { selectProjectEngine } = require('./src/core/engine/selection');
        const { GlobalPaths } = require('./src/global');
        selectProjectEngine(process.argv[1]).then(result => {
            assert.equal(result.path, process.argv[2]);
            assert.equal(GlobalPaths.enginePath, result.path);
            assert.equal(result.revision, 'custom-1');
            console.log('selected project engine');
        }).catch(error => { console.error(error); process.exitCode = 1; });
    `, [project, selected]);
    assert.match(output, /selected project engine/);
    assert.equal(fs.readFileSync(filename, 'utf8'), before);
});

test('explicit API override wins over project path, and a process cannot switch engines', t => {
    const root = fixture(t);
    const selected = engine(root, 'explicit');
    const other = engine(root, 'other');
    const project = path.join(root, 'project');
    write(project, 'settings/cocos.config.json', { version: '1.0.0', engineSdk: { path: '../missing', version: '4.0.0' } });
    sourceProcess(`
        const assert = require('node:assert/strict');
        const { selectProjectEngine, selectEnginePath } = require('./src/core/engine/selection');
        selectProjectEngine(process.argv[1], process.argv[2]).then(result => {
            assert.equal(result.path, process.argv[2]);
            assert.throws(() => selectEnginePath(process.argv[3]), /Cannot switch/);
        }).catch(error => { console.error(error); process.exitCode = 1; });
    `, [project, selected, other]);
});

test('malformed project engineSdk is rejected instead of using the default engine', t => {
    const root = fixture(t);
    write(root, 'settings/cocos.config.json', { version: '1.0.0', engineSdk: ['invalid'] });
    sourceProcess(`
        const assert = require('node:assert/strict');
        const { selectProjectEngine } = require('./src/core/engine/selection');
        assert.rejects(selectProjectEngine(process.argv[1]), /engineSdk.*must be an object/)
            .catch(error => { console.error(error); process.exitCode = 1; });
    `, [root]);
});

test('CLI engine-path option reaches project creation before default settings are generated', t => {
    const root = fixture(t);
    const selected = engine(root, 'CLI engine');
    const target = path.join(root, 'new project');
    sourceProcess(`
        const assert = require('node:assert/strict');
        require('./src/core/base/sentry').initSentry = () => {};
        const { getEngineSelection } = require('./src/global');
        const selected = process.argv[1];
        const project = process.argv[2];
        process.on('exit', code => {
            if (code === 0) assert.equal(getEngineSelection()?.path, selected);
        });
        process.argv = [process.execPath, 'cocos', 'create', '--project', project, '--engine-path', selected];
        require('./src/cli');
    `, [selected, target]);
    assert.equal(fs.existsSync(path.join(target, 'package.json')), true);
});

test('CLI help and version do not read local engine configuration or engine files', () => {
    for (const argument of ['--help', '--version', 'build --help']) {
        const output = sourceProcess(`
            const fs = require('node:fs');
            let forbiddenReads = 0;
            for (const name of ['existsSync', 'readFileSync', 'statSync', 'realpathSync']) {
                const original = fs[name];
                fs[name] = function(file, ...args) {
                    const p = String(file).replaceAll('\\\\', '/');
                    if (p.endsWith('/config.local.json') || p.includes('/packages/engine/')) {
                        forbiddenReads++;
                        console.error(new Error('Unexpected engine read: ' + p).stack);
                        throw new Error('Engine unavailable for help');
                    }
                    return original.call(this, file, ...args);
                };
                Object.assign(fs[name], original);
            }
            process.on('exit', () => { if (forbiddenReads) throw new Error('Help read engine inputs'); });
            require('./src/core/base/sentry').initSentry = () => {};
            process.argv = [process.execPath, 'cocos', ...process.argv[1].split(' ')];
            require('./src/cli');
        `, [argument]);
        assert.match(output, argument === '--version' ? /0\.0\.1/ : /Usage:/);
    }
});

test('compiler worker uses the parent-selected engine rather than its local default', async t => {
    const root = fixture(t);
    const selected = engine(root, 'selected engine');
    engine(root, 'decoy engine');
    write(root, 'config.local.json', { enginePath: 'decoy engine' });
    compile(root, 'src/global.ts', 'dist/global.js');
    compile(root, 'src/core/engine/selection.ts', 'dist/core/engine/selection.js');
    compile(root, 'src/core/engine/compile-worker.ts', 'dist/core/engine/compile-worker.js');
    write(root, 'workflow/engine-path.js', fs.readFileSync(path.join(cli, 'workflow/engine-path.js'), 'utf8'));
    write(root, 'workflow/engine-compatibility.js', fs.readFileSync(path.join(cli, 'workflow/engine-compatibility.js'), 'utf8'));
    write(root, 'engine-compatibility.json', fs.readFileSync(path.join(cli, 'engine-compatibility.json'), 'utf8'));
    const log = path.join(root, 'compiler-calls.jsonl');
    write(root, 'packages/engine-compiler/dist/index.js', `exports.compileEngine = async (enginePath, web) => require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({ enginePath, web: !!web }) + '\\n');`);
    await new Promise((resolve, reject) => {
        const worker = fork(path.join(root, 'dist/core/engine/compile-worker.js'), [], { execArgv: [], stdio: 'pipe', env: { ...process.env, NODE_PATH: path.join(cli, 'node_modules') } });
        let done = false;
        const timeout = setTimeout(() => { worker.kill(); reject(new Error('Worker timed out')); }, 15000);
        worker.on('error', reject);
        worker.on('message', message => { if (message.type === 'done') done = true; if (message.type === 'error') reject(new Error(message.message)); });
        worker.on('exit', code => { clearTimeout(timeout); if (code === 0 && done) resolve(); else reject(new Error(`Worker failed: ${code}`)); });
        worker.send({ type: 'start', enginePath: selected });
    });
    assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse), [{ enginePath: selected, web: false }, { enginePath: selected, web: true }]);
});

test('compile coordinator passes the explicit path and rejects an exit without completion', () => {
    sourceProcess(`
        const assert = require('node:assert/strict');
        const { EventEmitter } = require('node:events');
        const cp = require('node:child_process');
        cp.fork = () => {
            const worker = new EventEmitter();
            worker.send = request => {
                assert.equal(request.enginePath, 'explicit engine path');
                assert.equal(request.force, true);
                process.nextTick(() => worker.emit('exit', 0));
            };
            return worker;
        };
        const { startCompileEngineProcess } = require('./src/core/engine/compile-process');
        assert.rejects(startCompileEngineProcess(true, 'explicit engine path'), /before completion/)
            .catch(error => { console.error(error); process.exitCode = 1; });
    `);
});
