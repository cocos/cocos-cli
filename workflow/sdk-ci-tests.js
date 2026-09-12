/* Run the candidate's complete CI suites in a disposable source/test snapshot. */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

function run(args, cwd, logFile, env, timeoutMs) {
    return new Promise(resolve => {
        const log = fs.openSync(logFile, 'w');
        const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', log, log], windowsHide: true, detached: process.platform !== 'win32' });
        let timedOut = false;
        let error;
        const timer = setTimeout(() => {
            timedOut = true;
            if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
        }, timeoutMs);
        child.on('error', value => { error = value.message; });
        child.on('close', exitCode => {
            clearTimeout(timer); fs.closeSync(log);
            resolve({ status: timedOut ? 'timeout' : exitCode === 0 && !error ? 'passed' : 'failed', exitCode, ...(error ? { error } : {}) });
        });
    });
}

async function runCiTests(config, source, timeoutMs = 60 * 60 * 1000) {
    source = fs.realpathSync(source);
    const root = path.join(config.work, 'tests');
    const reportFile = path.join(config.work, 'ci-tests.json');
    const report = { status: 'preparing', source, suites: {}, startedAt: new Date().toISOString() };
    write(reportFile, report);
    try {
        const metadata = read(path.join(config.cli, 'cli-sdk.json'));
        if (read(path.join(source, 'package.json')).version !== metadata.cliVersion) throw new Error('Test source CLI version mismatch');
        // Unit tests exercise source; ensure its prepared runtime matches the tested artifact.
        for (const file of metadata.files.filter(file => file.path.startsWith('dist/'))) {
            const digest = crypto.createHash('sha256').update(await fsp.readFile(path.join(source, file.path))).digest('hex');
            if (digest !== file.sha256) throw new Error(`Test source build differs from CLI SDK: ${file.path}`);
        }
        await fsp.mkdir(root);
        const entries = ['src', 'tests', 'e2e', 'dist', 'static', 'workflow', 'packages', '@types', 'node_modules', '.github', '.vscodeignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.ts', 'engine-compatibility.json'];
        for (const entry of [...entries, ...['jest.parallel.config.ts', 'jest.serial.config.ts'].filter(file => fs.existsSync(path.join(source, file)))]) {
            await fsp.cp(path.join(source, entry), path.join(root, entry), { recursive: true, dereference: true, filter: file => {
                const rel = path.relative(source, file).replace(/\\/g, '/');
                if (rel === 'packages/engine' || rel.startsWith('packages/engine/')) return false;
                if (!rel.startsWith('node_modules/') && /(^|\/)(\.git|\.workspace)(\/|$)/.test(rel)) return false;
                if (/^e2e\/(reports|logs|server\/reports)(\/|$)/.test(rel)) return false;
                if (/^tests\/fixtures\/projects\/[^/]+\/(library|temp|build)(\/|$)/.test(rel)) return false;
                return true;
            } });
        }
        const localConfig = { enginePath: config.engine };
        // Legacy CI cases address packages/engine directly. Alias only the tested
        // isolated SDK, never the developer checkout or a second engine version.
        await fsp.symlink(config.engine, path.join(root, 'packages/engine'), process.platform === 'win32' ? 'junction' : 'dir');
        // cc-module's generated relative references assume an embedded engine.
        // Both copied module locations must reference this pair's SDK declarations.
        for (const file of [path.join(root, 'packages/cc-module/cc.d.ts'), path.join(root, 'node_modules/cc/cc.d.ts')]) {
            const text = await fsp.readFile(file, 'utf8');
            await fsp.writeFile(file, ['cc.d.ts', 'cc.editor.d.ts'].map(name => `/// <reference path="${path.join(config.engine, 'bin/.declarations', name).replace(/\\/g, '/')}"/>\n`).join('')
                + text.replace(/\/\/\/ <reference path=.*cc(?:\.editor)?\.d\.ts.*\/>\r?\n/g, ''));
        }
        // Disable telemetry only in disposable copies; never upload test events.
        for (const file of [path.join(root, 'src/core/base/sentry.ts'), path.join(root, 'dist/core/base/sentry.js'), path.join(config.cli, 'dist/core/base/sentry.js')]) {
            const text = await fsp.readFile(file, 'utf8');
            await fsp.writeFile(file, text.replace(/dsn: 'https:[^']*'/g, "dsn: ''"));
        }
        report.instrumentation = ['Sentry DSN disabled in disposable test copies'];
        write(path.join(root, 'config.local.json'), localConfig);
        write(path.join(config.cli, 'config.local.json'), localConfig);
        const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192', NODE_PATH: '', E2E_CLI_PATH: path.join(config.cli, 'dist/cli.js'), E2E_TEST_SUITE: 'full' };
        delete env.SDK_CATALOG_TOKEN;
        delete env.SDK_CATALOG_AUTH_ORIGIN;
        delete env.SDK_MATRIX_CONFIG;
        const jest = path.join(root, 'node_modules/jest/bin/jest.js');
        report.status = 'running'; write(reportFile, report);
        // Same complete configs as test:quiet and test:e2e; no test-name/path filters.
        for (const [name, args] of [
            ['unit', [jest, '--config', 'jest.config.ts', '--silent', '--json', '--outputFile', path.join(config.work, 'unit.json')]],
            ['mcp-types', [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'e2e/scripts/generate-mcp-types.ts']],
            ['e2e', [jest, '--config', 'e2e/jest.config.e2e.ts', '--json', '--outputFile', path.join(config.work, 'e2e.json')]],
        ]) {
            report.suites[name] = { status: 'running' }; write(reportFile, report);
            const startedAt = new Date().toISOString();
            console.log((process.env.GITHUB_ACTIONS ? '::group::' : '') + 'Run full ' + name);
            report.suites[name] = await run(args, root, path.join(config.work, `${name}.log`), env, timeoutMs);
            Object.assign(report.suites[name], { startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(startedAt) });
            if (name !== 'mcp-types') {
                try {
                    const results = read(path.join(config.work, `${name}.json`));
                    Object.assign(report.suites[name], { total: results.numTotalTests, passed: results.numPassedTests, failed: results.numFailedTests, pending: results.numPendingTests });
                    if (!results.success || !results.numTotalTests || results.numFailedTests || results.numFailedTestSuites) report.suites[name].status = 'failed';
                } catch (error) { report.suites[name].status = 'failed'; report.suites[name].error = `Missing Jest completion report: ${error.message}`; }
            }
            console.log(name + ': ' + JSON.stringify(report.suites[name]));
            if (process.env.GITHUB_ACTIONS) console.log('::endgroup::');
            write(reportFile, report);
        }
        report.status = Object.values(report.suites).every(suite => suite.status === 'passed') ? 'passed' : 'failed';
    } catch (error) { report.status = 'failed'; report.error = error.message; }
    report.completedAt = new Date().toISOString(); write(reportFile, report);
    return report;
}
module.exports = { runCiTests, run };
