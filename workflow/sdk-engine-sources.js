const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const semver = require('semver');
const { readPolicy, matchEngineVersion } = require('./engine-compatibility');
const { packSdk } = require('./pack-sdk');
const { describeArtifact, runMatrix } = require('./sdk-matrix');
const root = path.resolve(__dirname, '..');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

function selectRefs(text, policies, sourcePolicy, validationTag) {
    const refs = new Map();
    for (const line of text.trim().split(/\r?\n/)) {
        const [commit, ref] = line.split(/\s+/);
        if (!/^[a-f0-9]{40}$/.test(commit || '') || !/^refs\/(heads|tags)\//.test(ref || '')) throw new Error('Invalid git ls-remote output');
        refs.set(ref, commit);
    }
    const selected = [];
    const supported = version => policies.some(policy => matchEngineVersion(version, policy).supported);
    for (const [ref, commit] of refs) {
        if (!ref.startsWith('refs/tags/') || ref.endsWith('^{}')) continue;
        const tag = ref.slice('refs/tags/'.length);
        const version = tag.replace(/^v(?=\d)/, '');
        if (!semver.valid(version) || !supported(version)) continue;
        selected.push({ ref, tag, version, commit: refs.get(`${ref}^{}`) || commit, baseline: false });
    }
    const baseline = sourcePolicy.baseline;
    if (validationTag === undefined && baseline && supported(baseline.untilStableTag) && !refs.has(`refs/tags/${baseline.untilStableTag}`) && !refs.has(`refs/tags/v${baseline.untilStableTag}`)) {
        if (!baseline.ref.startsWith('refs/heads/')) throw new Error('Baseline must name a branch ref');
        const commit = refs.get(baseline.ref);
        if (!commit) throw new Error(`Missing baseline branch ${baseline.ref}`);
        selected.push({ ref: baseline.ref, commit, baseline: true });
    }
    if (validationTag !== undefined) {
        const single = selected.filter(entry => entry.tag === validationTag);
        if (single.length !== 1) throw new Error('Validation tag must be an existing, supported exact tag');
        return single;
    }
    if (!selected.length) throw new Error('No supported tags or baseline branch');
    return selected.sort((a, b) => a.ref.localeCompare(b.ref));
}

function run(command, args, cwd, logFile, timeoutMs = 30 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const fd = fs.openSync(logFile, 'a');
        fs.writeSync(fd, `\n${command} ${args.join(' ')}\n`);
        const child = spawn(command, args, { cwd, stdio: ['ignore', fd, fd], windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
        let expired = false;
        const timer = setTimeout(() => {
            expired = true;
            if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
        }, timeoutMs);
        let spawnError;
        child.once('error', error => { spawnError = error; });
        child.once('close', code => {
            clearTimeout(timer); fs.closeSync(fd);
            if (code === 0 && !expired && !spawnError) resolve();
            else reject(spawnError || new Error(`${path.basename(command)} ${expired ? 'timed out' : `failed (${code})`}; see source build log`));
        });
    });
}
async function checkout(repository, commit, destination, log, reference) {
    if (fs.existsSync(path.join(destination, '.git'))) {
        const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: destination, encoding: 'utf8' }).trim();
        if (origin !== repository) throw new Error('Resume checkout identity mismatch');
        let actual;
        try { actual = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: destination, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Interrupted initial fetch may leave an empty repository. */ }
        if (actual) {
            if (actual !== commit) throw new Error('Resume checkout identity mismatch');
            execFileSync('git', ['diff', '--exit-code', 'HEAD'], { cwd: destination, stdio: 'ignore' });
            return;
        }
        if (fs.readdirSync(destination).some(name => name !== '.git')) throw new Error('Cannot resume a nonempty checkout without HEAD');
    } else {
        await fsp.mkdir(destination, { recursive: true });
        await run('git', ['init', '.'], destination, log);
        await run('git', ['remote', 'add', 'origin', repository], destination, log);
    }
    let from = 'origin';
    if (reference) {
        try {
            const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: reference, encoding: 'utf8' }).trim();
            execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: reference, stdio: 'ignore' });
            if (origin === repository) from = path.resolve(reference);
        } catch { /* A cache miss must fetch the pinned remote commit. */ }
    }
    await run('git', ['-c', 'protocol.file.allow=always', '-c', 'http.lowSpeedLimit=1024', '-c', 'http.lowSpeedTime=120', 'fetch', '--depth', '1', from, commit], destination, log, 10 * 60 * 1000);
    await run('git', ['checkout', '--detach', 'FETCH_HEAD'], destination, log);
    const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: destination, encoding: 'utf8' }).trim();
    if (actual !== commit) throw new Error('Fetched commit differs from frozen source snapshot');
}
async function prepareSources(options) {
    const sourcePolicy = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-source-policy.json'), 'utf8'));
    const output = path.resolve(options.output);
    await fsp.mkdir(path.dirname(output), { recursive: true });
    if (!options.resume) await fsp.mkdir(output);
    const report = options.resume ? JSON.parse(fs.readFileSync(path.join(output, 'source-report.json'), 'utf8').replace(/^\uFEFF/, ''))
        : { schemaVersion: 1, repository: sourcePolicy.repository, status: 'running', validationTag: options.validationTag ?? null, refs: [], errors: [] };
    if (report.repository !== sourcePolicy.repository) throw new Error('Resume repository mismatch');
    const save = () => write(path.join(output, 'source-report.json'), report);
    save();
    try {
        const policies = [readPolicy(options.cli || root)];
        if (options.resume && (report.validationTag ?? null) !== (options.validationTag ?? null)) throw new Error('Resume validation scope mismatch');
        const refs = options.resume ? fs.readFileSync(path.join(output, 'git-refs.snapshot.txt'), 'utf8')
            : execFileSync('git', ['ls-remote', '--heads', '--tags', sourcePolicy.repository], { encoding: 'utf8', timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
        if (!options.resume) {
            fs.writeFileSync(path.join(output, 'git-refs.snapshot.txt'), refs);
            report.refs = selectRefs(refs, policies, sourcePolicy, options.validationTag).map(entry => ({ ...entry, status: 'pending' }));
        }
        if (options.cli) {
            const cli = await describeArtifact(options.cli, 'cli');
            if (options.resume && (!report.cli || report.cli.manifestSha256 !== cli.manifestSha256)) throw new Error('Resume requires the original CLI SDK manifest');
            report.cli = cli;
        }
        report.status = 'running'; report.errors = []; save();
        if (options.planOnly) { report.status = 'planned'; save(); return report; }
        const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(file => file && fs.existsSync(file));
        if (!npmCli) throw new Error('Cannot locate the npm CLI bundled with Node.js');
        const catalog = { schemaVersion: 1, coverage: 'published', snapshotId: path.basename(output), engines: [], clis: [] };
        let externalCache = options.externalCache;
        for (let index = 0; index < report.refs.length; index++) {
            const entry = report.refs[index];
            if (options.resume && entry.status === 'passed' && entry.sdk) {
                // Matrix materialization revalidates every cached SDK file before testing.
                if (!catalog.engines.some(other => other.revision === entry.sdk.revision && other.version === entry.sdk.version)) catalog.engines.push(entry.sdk);
                continue;
            }
            const work = path.join(output, `source-${index + 1}`);
            const source = path.join(work, 'engine');
            await fsp.mkdir(work, { recursive: options.resume });
            const log = path.join(work, 'build.log');
            entry.status = 'building'; delete entry.error; save();
            console.log('[Engine SDK] Preparing ' + entry.ref + ' at ' + entry.commit);
            try {
                await checkout(sourcePolicy.repository, entry.commit, source, log);
                const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
                if ((!entry.baseline && entry.version !== version) || !policies.some(policy => matchEngineVersion(version, policy).supported)) throw new Error(`Source package version ${version} does not match supported tag ${entry.tag || entry.ref}`);
                entry.version = version;
                const external = JSON.parse(fs.readFileSync(path.join(source, 'native/external-config.json'), 'utf8')).from;
                if (external?.type !== 'github' || !/^[\w.-]+$/.test(external.owner) || !/^[\w.-]+$/.test(external.name) || typeof external.checkout !== 'string' || !external.checkout) throw new Error('Unsupported native/external-config.json; add an explicit versioned adapter');
                const repository = `https://github.com/${external.owner}/${external.name}.git`;
                const externalRefs = entry.external ? `${entry.external.commit}\trefs/tags/${external.checkout}`
                    : execFileSync('git', ['ls-remote', '--tags', '--heads', repository], { encoding: 'utf8', timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
                const map = new Map(externalRefs.trim().split(/\r?\n/).map(line => { const [sha, ref] = line.split(/\s+/); return [ref, sha]; }));
                const commit = map.get(`refs/tags/${external.checkout}^{}`) || map.get(`refs/tags/${external.checkout}`) || map.get(`refs/heads/${external.checkout}`);
                if (!commit) throw new Error('External dependency ref not found');
                entry.external = { repository, ref: external.checkout, commit }; save();
                await checkout(repository, commit, path.join(source, 'native/external'), log, externalCache);
                externalCache = path.join(source, 'native/external');
                await run(process.execPath, [npmCli, 'ci'], source, log);
                // Compile through the prepared CLI toolchain; never rebuild in the developer checkout.
                await run(process.execPath, [path.join(__dirname, 'sdk-source-compile.cjs'), path.resolve(options.cli), source], work, log);
                await run(process.execPath, [path.join(__dirname, 'build-simulator-runtime.js'), '--enginePath', source], work, log);
                const artifact = path.join(work, `engine-sdk-${Date.now()}`);
                await packSdk({ kind: 'engine', source, output: artifact });
                const descriptor = await describeArtifact(artifact, 'engine');
                entry.sdk = descriptor; entry.status = 'passed';
                console.log('[Engine SDK] Prepared ' + entry.ref + ': ' + descriptor.version + ' ' + descriptor.revision);
                if (!catalog.engines.some(other => other.revision === descriptor.revision && other.version === descriptor.version)) catalog.engines.push(descriptor);
            } catch (error) { entry.status = 'failed'; entry.error = error.message; }
            save();
        }
        // A branch baseline is explicitly marked as local coverage; never called an official release.
        if (options.validationTag || report.refs.some(entry => entry.baseline)) catalog.coverage = 'local';
        write(path.join(output, 'catalog.json'), catalog);
        report.sourceStatus = report.refs.every(entry => entry.status === 'passed') ? 'passed' : 'failed';
        report.status = report.sourceStatus === 'passed' ? 'testing' : 'failed'; save();
        if (report.sourceStatus !== 'passed') return report;
        if (options.prepareOnly) { report.status = 'prepared'; save(); return report; }
        report.matrix = await runMatrix({ cli: options.cli, testRoot: options.testRoot, catalog: path.join(output, 'catalog.json'), output: path.join(output, options.resume ? `matrix-${Date.now()}` : 'matrix'), cache: options.cache });
        report.status = report.matrix.status;
    } catch (error) { report.status = 'failed'; report.errors.push(error.message); }
    save(); return report;
}
async function main() {
    const { values } = parseArgs({ options: { cli: { type: 'string' }, output: { type: 'string' }, cache: { type: 'string' }, 'test-root': { type: 'string' }, resume: { type: 'boolean' }, 'validation-tag': { type: 'string' }, 'external-cache': { type: 'string' }, 'plan-only': { type: 'boolean' }, 'prepare-only': { type: 'boolean' } } });
    if (!values.output || (!values.cli && !values['plan-only'])) throw new Error('Provide --cli prepared SDK and new --output directory');
    const result = await prepareSources({ ...values, testRoot: values['test-root'], planOnly: values['plan-only'], prepareOnly: values['prepare-only'], validationTag: values['validation-tag'], externalCache: values['external-cache'] });
    console.log(JSON.stringify({ status: result.status, refs: result.refs.map(({ ref, commit, status }) => ({ ref, commit, status })), errors: result.errors }));
    process.exitCode = ['passed', 'planned', 'prepared'].includes(result.status) ? 0 : 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { selectRefs, prepareSources };
