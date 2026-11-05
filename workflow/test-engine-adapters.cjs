'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { getEngineBackendAdapter } = require('../adapters/engine/registry.cjs');
const { checkEngineCompatibility } = require('./engine-compatibility');
const root = path.resolve(__dirname, '..');
const slash = value => value.split(path.sep).join('/');
const identityTest = 'src/core/engine/test/adapter-runtime-identity.engine-test.ts';
function write(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function sourceFilter(base, file) {
    const rel = slash(path.relative(base, file));
    if (rel === 'packages/engine' || rel.startsWith('packages/engine/')) return false;
    if (rel.split('/').some(part => ['.git', 'node_modules', '.workspace', '.cache'].includes(part))) return false;
    if (/^tests\/fixtures\/projects\/[^/]+\/(library|temp|build)(\/|$)/.test(rel)) return false;
    return true;
}
function engineFilter(base, file, adapterId) {
    const rel = slash(path.relative(base, file));
    if (rel.split('/').some(part => ['.git', 'node_modules', '.idea', '.vscode'].includes(part))) return false;
    if (rel.startsWith('bin/.cache/')) {
        const selected = /^cocos-3\.[5678]-runtime$/.test(adapterId) ? 'dev-cli-' + adapterId.slice(6,9) : 'dev-cli';
        if (!rel.startsWith('bin/.cache/' + selected + '/') && rel !== 'bin/.cache/' + selected) return false;
        if (rel.includes('/transform-cache/')) return false;
    }
    return true;
}
async function link(source, target) {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
}
function bindHostDeclarations(content, hostTypes) {
    return content.split(/\r?\n/).map(line => {
        if (!line.startsWith('/// <reference path=') || !line.includes('.declarations')) return line;
        const file = line.includes('cc.editor.d.ts') ? 'cc.editor.d.ts' : 'cc.d.ts';
        return '/// <reference path="' + slash(path.join(hostTypes, file)) + '" />';
    }).join('\n');
}
async function snapshot(destination, enginePath, adapterId) {
    const source = path.join(destination, 'source'); const engine = path.join(destination, 'engine');
    await fsp.mkdir(source, { recursive: true });
    const entries = ['src', 'dist', 'tests', 'e2e', 'static', 'workflow', 'adapters', 'packages', 'docs', '@types', '.github', '.vscodeignore',
        'package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.ts', 'jest.engine-adapters.config.ts',
        'jest.parallel.config.ts', 'jest.serial.config.ts', 'engine-compatibility.json'];
    for (const entry of entries) if (fs.existsSync(path.join(root, entry))) {
        await fsp.cp(path.join(root, entry), path.join(source, entry), { recursive: true, dereference: true,
            mode: fs.constants.COPYFILE_FICLONE, filter: file => sourceFilter(root, file) });
    }
    await fsp.cp(enginePath, engine, { recursive: true, dereference: true, mode: fs.constants.COPYFILE_FICLONE,
        filter: file => engineFilter(enginePath, file, adapterId) });
    await link(path.join(root, 'node_modules'), path.join(source, 'node_modules'));
    for (const entry of await fsp.readdir(path.join(root, 'packages'), { withFileTypes: true })) {
        if (entry.name === 'engine' || !entry.isDirectory()) continue;
        const modules = path.join(root, 'packages', entry.name, 'node_modules');
        const copiedPackage = path.join(source, 'packages', entry.name);
        if (fs.existsSync(modules) && fs.existsSync(copiedPackage)) await link(modules, path.join(copiedPackage, 'node_modules'));
    }
    if (fs.existsSync(path.join(enginePath, 'node_modules'))) await link(path.join(enginePath, 'node_modules'), path.join(engine, 'node_modules'));
    await link(engine, path.join(source, 'packages/engine'));
    write(path.join(source, 'config.local.json'), { enginePath: engine });
    // CLI implementation is built against its host ABI. Runtime selection must
    // not merge an older engine's ambient declarations into that type program.
    // Project scripts continue to receive declarations from the selected engine.
    const hostTypes = fs.realpathSync(path.join(root, 'packages/engine/bin/.declarations'));
    const binding = path.join(source, 'packages/cc-module/cc.d.ts');
    await fsp.writeFile(binding, bindHostDeclarations(await fsp.readFile(binding, 'utf8'), hostTypes));
    // Only disposable copies are instrumented; engine code and developer inputs are untouched.
    for (const entry of ['src/core/base/sentry.ts', 'dist/core/base/sentry.js']) {
        const file = path.join(source, entry);
        if (fs.existsSync(file)) await fsp.writeFile(file, (await fsp.readFile(file, 'utf8')).replace(/dsn: 'https:[^']*'/g, "dsn: ''"));
    }
    return { source, engine };
}
function execute(args, cwd, env, logFile, timeoutMs) {
    return new Promise(resolve => {
        const output = fs.openSync(logFile, 'w');
        const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', output, output], detached: process.platform !== 'win32' });
        let timedOut = false; let failure;
        const timer = setTimeout(() => {
            timedOut = true;
            if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
        }, timeoutMs);
        child.on('error', error => { failure = error.message; });
        child.on('close', exitCode => { clearTimeout(timer); fs.closeSync(output); resolve({ exitCode, timedOut, error: failure }); });
    });
}
function assertRequestedSuites(results, source, requested) {
    const executed = new Set(results.testResults.map(suite => path.resolve(suite.name)));
    for (const file of requested) {
        if (!executed.has(path.resolve(source, file))) throw new Error('Requested test suite did not run: ' + file);
    }
}
function failures(results, source) {
    return results.testResults.flatMap(suite => {
        const file = slash(path.relative(source, suite.name));
        const failed = suite.assertionResults.filter(test => test.status === 'failed').map(test => ({ file, name: test.fullName, messages: test.failureMessages }));
        if (suite.status === 'failed' && !failed.length) failed.push({ file, name: '[suite setup]', messages: [suite.message] });
        return failed;
    });
}
async function runMatrix({ engines, experimental = false, testPaths = [], output, timeoutMs = 45 * 60 * 1000 }) {
    if (!engines?.length) throw new Error('At least one --engine-path is required');
    if (!fs.existsSync(path.join(root, 'dist/core/scene/scene-process/main.js'))) throw new Error('Build the CLI before running the adapter matrix');
    const work = output ? path.resolve(output) : path.join(root, '.build/adapter-tests', Date.now() + '-' + crypto.randomBytes(3).toString('hex'));
    if (fs.existsSync(work)) throw new Error('Output directory already exists; use a new directory');
    await fsp.mkdir(work, { recursive: true });
    const report = { schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(), work, testPaths, targets: [] };
    const reportFile = path.join(work, 'report.json'); write(reportFile, report);
    for (const [index, input] of engines.entries()) {
        const target = { input, status: 'preparing', startedAt: new Date().toISOString() };
        report.targets.push(target); write(reportFile, report);
        try {
            const enginePath = fs.realpathSync(input);
            const version = JSON.parse(await fsp.readFile(path.join(enginePath, 'package.json'), 'utf8')).version;
            const adapter = getEngineBackendAdapter({ path: enginePath, version });
            Object.assign(target, { version, adapter: adapter.id });
            const previous = process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS;
            try {
                if (experimental) process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS = '1';
                checkEngineCompatibility({ path: enginePath, version }, root, 'web');
            } finally { if (previous === undefined) delete process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS; else process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS = previous; }
            const directory = path.join(work, index + '-' + adapter.id);
            console.log('[adapter-matrix] preparing ' + adapter.id + ' ' + version);
            const paths = await snapshot(directory, enginePath, adapter.id);
            Object.assign(target, paths, { directory, status: 'running' }); write(reportFile, report);
            const identityFile = path.join(directory, 'identity.json'); const resultsFile = path.join(directory, 'jest.json');
            const env = { ...process.env, COCOS_TEST_ENGINE_PATH: paths.engine, COCOS_TEST_ENGINE_VERSION: version,
                COCOS_TEST_ADAPTER_ID: adapter.id, COCOS_TEST_IDENTITY_REPORT: identityFile,
                COCOS_TEST_HOST_ENGINE_PATH: fs.realpathSync(path.join(root, 'packages/engine')),
                ...(experimental ? { COCOS_EXPERIMENTAL_ENGINE_ADAPTERS: '1' } : {}), NODE_OPTIONS: '--max-old-space-size=8192' };
            const args = [require.resolve('jest/bin/jest'), '--config', 'jest.engine-adapters.config.ts', '--runInBand', '--silent', '--json', '--outputFile', resultsFile];
            if (testPaths.length) args.push('--runTestsByPath', ...new Set([identityTest, ...testPaths]));
            console.log('[adapter-matrix] running ' + adapter.id + '; log: ' + path.join(directory, 'jest.log'));
            Object.assign(target, await execute(args, paths.source, env, path.join(directory, 'jest.log'), timeoutMs));
            const results = JSON.parse(await fsp.readFile(resultsFile, 'utf8'));
            Object.assign(target, { total: results.numTotalTests, passed: results.numPassedTests, failed: results.numFailedTests,
                pending: results.numPendingTests, failedSuites: results.numFailedTestSuites, failures: failures(results, paths.source) });
            assertRequestedSuites(results, paths.source, testPaths);
            const verified = JSON.parse(await fsp.readFile(identityFile, 'utf8'));
            if (verified.version !== version || verified.runtimeVersion !== require('./engine-test-identity.cjs').expectedRuntimeVersion(enginePath, version) || verified.adapter !== adapter.id || path.relative(paths.engine, verified.path) !== '') throw new Error('Actual runtime identity does not match the requested engine');
            target.identity = verified;
            target.status = target.exitCode === 0 && results.success && results.numTotalTests > 0 && !target.failed && !target.failedSuites && !target.timedOut ? 'passed' : 'failed';
        } catch (error) { target.status = 'failed'; target.error = error.stack || error.message; }
        target.completedAt = new Date().toISOString(); write(reportFile, report);
        console.log('[adapter-matrix] ' + (target.adapter || target.input) + ': ' + target.status + ', passed=' + (target.passed ?? 0) + ', failed=' + (target.failed ?? 0));
    }
    report.status = report.targets.every(target => target.status === 'passed') ? 'passed' : 'failed';
    report.completedAt = new Date().toISOString(); write(reportFile, report);
    console.log('[adapter-matrix] report: ' + reportFile);
    return report;
}
if (require.main === module) {
    const { values } = parseArgs({ options: { 'engine-path': { type: 'string', multiple: true }, experimental: { type: 'boolean' },
        'test-path': { type: 'string', multiple: true }, output: { type: 'string' }, 'timeout-minutes': { type: 'string' } } });
    const timeout = values['timeout-minutes'] === undefined ? 45 : Number(values['timeout-minutes']);
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('timeout-minutes must be positive');
    runMatrix({ engines: values['engine-path'], experimental: values.experimental, testPaths: values['test-path'], output: values.output, timeoutMs: timeout * 60 * 1000 })
        .then(report => { process.exitCode = report.status === 'passed' ? 0 : 1; })
        .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { bindHostDeclarations, runMatrix, sourceFilter, engineFilter, failures, assertRequestedSuites };
