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

async function runCiTests(config, source, timeoutMs = 60 * 60 * 1000, options = {}) {
    source = fs.realpathSync(source);
    const root = path.join(config.work, 'tests');
    const reportFile = path.join(config.work, 'ci-tests.json');
    const report = { status: 'preparing', source, suites: {}, preparation: {}, startedAt: new Date().toISOString() };
    write(reportFile, report);
    const timed = async (name, action) => {
        const start = performance.now();
        try { return await action(); }
        finally {
            report.preparation[name] = Math.round(performance.now() - start);
            console.log('CI preparation ' + name + ': ' + report.preparation[name] + 'ms');
            write(reportFile, report);
        }
    };
    try {
        const metadata = read(path.join(config.cli, 'cli-sdk.json'));
        if (read(path.join(source, 'package.json')).version !== metadata.cliVersion) throw new Error('Test source CLI version mismatch');
        await timed('validateSourceMs', async () => {
            // Unit tests exercise source; ensure its prepared runtime matches the tested artifact.
            for (const file of metadata.files.filter(file => file.path.startsWith('dist/'))) {
                const digest = crypto.createHash('sha256').update(await fsp.readFile(path.join(source, file.path))).digest('hex');
                if (digest !== file.sha256) throw new Error(`Test source build differs from CLI SDK: ${file.path}`);
            }
        });
        await timed('sourceSnapshotMs', async () => {
            if (options.consumeSource) {
                // Only the single-engine CI shard opts in with its private extraction.
                // Rename preserves independent files without another complete copy.
                if (fs.existsSync(path.join(source, 'packages/engine'))) throw new Error('Disposable source contains an embedded engine');
                await fsp.rename(source, root);
                report.sourceMode = 'moved';
                return;
            }
            report.sourceMode = 'copied';
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
        });
        await timed('configureSnapshotsMs', async () => {
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
        });
        const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192', NODE_PATH: '', E2E_CLI_PATH: path.join(config.cli, 'dist/cli.js'), E2E_TEST_SUITE: 'full' };
        delete env.SDK_CATALOG_TOKEN;
        delete env.SDK_CATALOG_AUTH_ORIGIN;
        delete env.SDK_MATRIX_CONFIG;
        // Unit tests and E2E may rebuild engine caches and mutate project settings.
        // Copy writable inputs before either suite starts; never share hard links.
        // Request copy-on-write where supported, falling back to independent copies.
        const unitRoot = path.join(config.work, 'unit-tests');
        const unitEngine = path.join(config.work, 'unit-engine');
        const unitCli = path.join(config.work, 'unit-cli');
        await timed('unitSourceCopyMs', () => fsp.cp(root, unitRoot, { recursive: true, dereference: true, mode: fs.constants.COPYFILE_FICLONE,
            filter: file => file !== path.join(root, 'packages/engine') }));
        await timed('unitEngineCopyMs', () => fsp.cp(config.engine, unitEngine, { recursive: true, dereference: true, mode: fs.constants.COPYFILE_FICLONE }));
        await timed('unitCliCopyMs', () => fsp.cp(config.cli, unitCli, { recursive: true, dereference: true, mode: fs.constants.COPYFILE_FICLONE }));
        await timed('configureUnitMs', async () => {
            await fsp.symlink(unitEngine, path.join(unitRoot, 'packages/engine'), process.platform === 'win32' ? 'junction' : 'dir');
            for (const file of [path.join(unitRoot, 'packages/cc-module/cc.d.ts'), path.join(unitRoot, 'node_modules/cc/cc.d.ts')]) {
                const text = await fsp.readFile(file, 'utf8');
                await fsp.writeFile(file, text.split(config.engine.replace(/\\/g, '/')).join(unitEngine.replace(/\\/g, '/')));
            }
            write(path.join(unitRoot, 'config.local.json'), { enginePath: unitEngine });
            write(path.join(unitCli, 'config.local.json'), { enginePath: unitEngine });
        });
        report.preparationMs = Date.now() - Date.parse(report.startedAt);
        report.status = 'running'; write(reportFile, report);
        const executeSuite = async name => {
            const suiteRoot = name === 'unit' ? unitRoot : root;
            const suiteEnv = name === 'unit' ? { ...env, NODE_OPTIONS: '--max-old-space-size=4096', E2E_CLI_PATH: path.join(unitCli, 'dist/cli.js') } : env;
            const jest = path.join(suiteRoot, 'node_modules/jest/bin/jest.js');
            const args = name === 'mcp-types'
                ? [path.join(suiteRoot, 'node_modules/tsx/dist/cli.mjs'), 'e2e/scripts/generate-mcp-types.ts']
                : [jest, '--config', name === 'unit' ? 'jest.config.ts' : 'e2e/jest.config.e2e.ts', '--maxWorkers=1', ...(name === 'unit' ? ['--silent'] : []), '--json', '--outputFile', path.join(config.work, name + '.json')];
            try {
                report.suites[name] = { status: 'running' }; write(reportFile, report);
                const startedAt = new Date().toISOString();
                console.log('Run full ' + name);
                if (name === 'mcp-types') {
                    const { generate } = require('./generate-dts-runner');
                    const attempts = [];
                    await generate(async () => {
                        const logName = attempts.length ? name + '-retry-' + attempts.length : name;
                        const result = await run(args, suiteRoot, path.join(config.work, logName + '.log'), suiteEnv, timeoutMs);
                        attempts.push(result);
                        report.suites[name] = result;
                        return result.status === 'timeout' || result.error ? 1 : result.exitCode;
                    }, process.platform, name);
                    report.suites[name] = { ...report.suites[name], attempts };
                } else {
                    report.suites[name] = await run(args, suiteRoot, path.join(config.work, name + '.log'), suiteEnv, timeoutMs);
                }
                Object.assign(report.suites[name], { startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(startedAt) });
                if (name !== 'mcp-types') {
                    try {
                        const results = read(path.join(config.work, `${name}.json`));
                        Object.assign(report.suites[name], { total: results.numTotalTests, passed: results.numPassedTests, failed: results.numFailedTests, pending: results.numPendingTests });
                        if (!results.success || !results.numTotalTests || results.numFailedTests || results.numFailedTestSuites) report.suites[name].status = 'failed';
                    } catch (error) { report.suites[name].status = 'failed'; report.suites[name].error = `Missing Jest completion report: ${error.message}`; }
                }
                console.log(name + ': ' + JSON.stringify(report.suites[name]));
                write(reportFile, report);
            } catch (error) {
                report.suites[name] = { status: 'failed', error: error.message };
                write(reportFile, report);
            }
        };
        await Promise.all([
            executeSuite('unit'),
            (async () => { await executeSuite('mcp-types'); await executeSuite('e2e'); })(),
        ]);
        report.status = Object.values(report.suites).every(suite => suite.status === 'passed') ? 'passed' : 'failed';
    } catch (error) { report.status = 'failed'; report.error = error.message; }
    report.completedAt = new Date().toISOString(); write(reportFile, report);
    return report;
}
module.exports = { runCiTests, run };
