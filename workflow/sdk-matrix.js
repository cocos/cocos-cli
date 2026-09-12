/* Offline/HTTPS SDK matrix. No source build, install, upload or implicit engine fallback. */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { readPolicy, matchEngineVersion } = require('./engine-compatibility');
const semver = require('semver');
const { runCiTests } = require('./sdk-ci-tests');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const host = () => ({ platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules });
const sameHost = entry => Object.entries(host()).every(([key, value]) => entry[key] === value);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
function safeFile(value) {
    if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.includes('\0')
        || path.posix.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe artifact file path');
    return value;
}
function remote(value) { return /^https:\/\//.test(value); }
function validateLocation(value) {
    if (typeof value !== 'string' || !value) throw new Error('Missing artifact location');
    if (/^[a-z]+:\/\//i.test(value)) {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use HTTPS without embedded credentials, query or fragment');
    }
}
async function download(url) {
    validateLocation(url);
    const headers = {};
    // Credentials are sent only to an explicitly configured origin, never following redirects.
    if (process.env.SDK_CATALOG_TOKEN && new URL(url).origin === process.env.SDK_CATALOG_AUTH_ORIGIN) headers.Authorization = `Bearer ${process.env.SDK_CATALOG_TOKEN}`;
    const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Artifact download failed: HTTP ${response.status}`);
    return response;
}
async function bytesAt(base, file) {
    if (remote(base)) return Buffer.from(await (await download(`${base.replace(/\/$/, '')}/${file.split('/').map(encodeURIComponent).join('/')}`)).arrayBuffer());
    const root = fs.realpathSync(base);
    const real = fs.realpathSync(path.join(root, safeFile(file)));
    if (!inside(root, real)) throw new Error('Artifact source link escapes its directory');
    return fsp.readFile(real);
}
function validateCatalog(catalog) {
    if (catalog?.schemaVersion !== 1 || !['local', 'published'].includes(catalog.coverage) || typeof catalog.snapshotId !== 'string' || !catalog.snapshotId
        || !Array.isArray(catalog.engines) || !catalog.engines.length || !Array.isArray(catalog.clis)) throw new Error('Invalid or empty SDK catalog');
    const seen = new Set();
    for (const [kind, entries] of [['engine', catalog.engines], ['cli', catalog.clis]]) {
        for (const entry of entries) {
            if (!semver.valid(entry.version) || !/^sha256:[a-f0-9]{64}$/.test(entry.revision) || !/^[a-f0-9]{64}$/.test(entry.manifestSha256)
                || !['platform', 'arch', 'nodeAbi'].every(key => typeof entry[key] === 'string' && entry[key])) throw new Error(`Invalid ${kind} catalog identity`);
            validateLocation(entry.location);
            if (kind === 'cli' && typeof entry.maintained !== 'boolean') throw new Error('CLI catalog entry requires maintained');
            const key = `${kind}/${entry.version}/${entry.revision}/${entry.platform}/${entry.arch}/${entry.nodeAbi}`;
            if (seen.has(key)) throw new Error(`Duplicate catalog identity: ${key}`);
            seen.add(key);
        }
    }
    return catalog;
}
async function loadCatalog(location) {
    validateLocation(location);
    const bytes = remote(location) ? Buffer.from(await (await download(location)).arrayBuffer()) : await fsp.readFile(location);
    const catalog = validateCatalog(JSON.parse(bytes.toString('utf8')));
    for (const entry of [...catalog.engines, ...catalog.clis]) {
        if (!remote(entry.location)) {
            if (remote(location)) throw new Error('Remote catalog cannot reference local files');
            entry.location = path.resolve(path.dirname(location), entry.location);
        }
    }
    return { catalog, bytes, sha256: sha(bytes) };
}
function selectEngines(catalog, policy) {
    const supported = catalog.engines.filter(entry => matchEngineVersion(entry.version, policy).supported);
    if (!supported.length) throw new Error('Empty matrix: no supported Engine SDK versions in catalog');
    for (const version of new Set(supported.map(entry => entry.version))) {
        if (!supported.some(entry => entry.version === version && sameHost(entry))) throw new Error(`Missing Engine SDK for ${version} on ${JSON.stringify(host())}`);
    }
    return supported.filter(sameHost).sort((a, b) => semver.compare(a.version, b.version) || a.revision.localeCompare(b.revision));
}
async function describeArtifact(location, kind) {
    const bytes = await bytesAt(location, `${kind}-sdk.json`);
    const metadata = JSON.parse(bytes.toString('utf8'));
    return { location: path.resolve(location), version: metadata[`${kind}Version`], revision: metadata.revision, manifestSha256: sha(bytes),
        platform: metadata.platform, arch: metadata.arch, nodeAbi: metadata.nodeAbi };
}
function validateManifest(metadata, descriptor, kind) {
    if (metadata?.schemaVersion !== 1 || metadata.kind !== kind || metadata[`${kind}Version`] !== descriptor.version || metadata.revision !== descriptor.revision
        || !['platform', 'arch', 'nodeAbi'].every(key => metadata[key] === descriptor[key]) || !Array.isArray(metadata.files) || !metadata.files.length) throw new Error('SDK manifest identity mismatch');
    if (`sha256:${sha(JSON.stringify(metadata.files))}` !== descriptor.revision) throw new Error('SDK revision does not match its file manifest');
    const seen = new Set();
    for (const entry of metadata.files) {
        safeFile(entry.path);
        const normalized = process.platform === 'win32' ? entry.path.toLowerCase() : entry.path;
        if (seen.has(normalized) || entry.path === `${kind}-sdk.json` || (kind === 'cli' && entry.path.startsWith('packages/engine/'))
            || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !Number.isInteger(entry.mode)) throw new Error('Invalid SDK file manifest');
        seen.add(normalized);
    }
}
async function fileHash(file) {
    const hash = crypto.createHash('sha256');
    for await (const data of fs.createReadStream(file)) hash.update(data);
    return hash.digest('hex');
}
async function validFile(file, entry) {
    try { const stat = await fsp.lstat(file); return stat.isFile() && !stat.isSymbolicLink() && stat.size === entry.bytes && await fileHash(file) === entry.sha256; }
    catch { return false; }
}
async function mapLimit(entries, action, limit = 12) {
    let next = 0;
    let failure;
    await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, async () => {
        while (!failure && next < entries.length) {
            const entry = entries[next++];
            try { await action(entry); } catch (error) { failure = error; }
        }
    }));
    if (failure) throw failure;
}
async function materialize(descriptor, kind, cacheRoot, destination) {
    const manifestBytes = await bytesAt(descriptor.location, `${kind}-sdk.json`);
    if (sha(manifestBytes) !== descriptor.manifestSha256) throw new Error('SDK manifest SHA256 mismatch');
    const metadata = JSON.parse(manifestBytes.toString('utf8'));
    validateManifest(metadata, descriptor, kind);
    const cache = path.join(cacheRoot, kind, descriptor.platform, descriptor.arch, descriptor.nodeAbi, descriptor.revision.slice(7));
    await fsp.mkdir(destination, { recursive: false });
    await mapLimit(metadata.files, async entry => {
        const stored = path.join(cache, entry.path);
        await fsp.mkdir(path.dirname(stored), { recursive: true });
        if (!await validFile(stored, entry)) {
            const data = await bytesAt(descriptor.location, entry.path);
            if (data.length !== entry.bytes || sha(data) !== entry.sha256) throw new Error(`SDK content SHA256 mismatch: ${entry.path}`);
            const temp = `${stored}.${crypto.randomUUID()}.tmp`;
            await fsp.writeFile(temp, data, { flag: 'wx' });
            await fsp.rename(temp, stored);
        }
        const target = path.join(destination, entry.path);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.copyFile(stored, target); // Never hardlink: the engine creates runtime caches.
        if (process.platform !== 'win32') await fsp.chmod(target, entry.mode & 0o777);
    });
    await fsp.writeFile(path.join(destination, `${kind}-sdk.json`), manifestBytes);
    if (json(path.join(destination, 'package.json')).version !== descriptor.version) throw new Error('SDK package version mismatch');
    return metadata;
}
function executePair(configFile, logFile, timeoutMs) {
    return new Promise(resolve => {
        const log = fs.openSync(logFile, 'w');
        const config = json(configFile);
        const guard = path.join(__dirname, 'sdk-matrix-guard.cjs');
        const env = { ...process.env, SDK_MATRIX_CONFIG: configFile, NODE_PATH: '', NODE_OPTIONS: `--require ${JSON.stringify(guard)}` };
        delete env.SDK_CATALOG_TOKEN;
        delete env.SDK_CATALOG_AUTH_ORIGIN;
        const child = spawn(process.execPath, [path.join(__dirname, 'sdk-matrix-pair.cjs'), configFile], {
            cwd: config.work, env, stdio: ['ignore', log, log], detached: process.platform !== 'win32',
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
        }, timeoutMs);
        let spawnError;
        child.on('error', error => { spawnError = error.message; });
        child.on('close', code => { clearTimeout(timer); fs.closeSync(log); resolve({ status: timedOut ? 'timeout' : code === 0 && !spawnError ? 'passed' : 'failed', exitCode: code, ...(spawnError ? { error: spawnError } : {}) }); });
    });
}
async function runMatrix(options) {
    if (!options.catalog || !options.output) throw new Error('Provide --catalog and a new --output directory');
    const output = path.resolve(options.output);
    const cache = path.resolve(options.cache || path.join(__dirname, '../.publish/sdk-cache'));
    if (inside(cache, output) || inside(output, cache)) throw new Error('Cache and output must be separate directories');
    await fsp.mkdir(path.dirname(output), { recursive: true });
    await fsp.mkdir(output); // Refuse overwrite; retain all evidence and partial failures.
    const report = { schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(), host: host(), catalog: null, pairs: [], errors: [] };
    const save = () => write(path.join(output, 'report.json'), report);
    save();
    try {
        const loaded = await loadCatalog(options.catalog);
        const catalog = loaded.catalog;
        report.catalog = { snapshotId: catalog.snapshotId, sha256: loaded.sha256, coverage: catalog.coverage };
        fs.writeFileSync(path.join(output, 'catalog.snapshot.json'), loaded.bytes);
        if (options.requirePublished && catalog.coverage !== 'published') throw new Error('Release gate requires a published catalog, not a local sample');
        const candidates = options.cli ? [await describeArtifact(options.cli, 'cli')] : catalog.clis.filter(entry => entry.maintained && sameHost(entry));
        if (!candidates.length) throw new Error('No maintained CLI SDKs for this host');
        let ordinal = 0;
        for (const cli of candidates) {
            if (!sameHost(cli)) throw new Error('CLI SDK platform or Node ABI does not match this process');
            const baseline = path.join(output, `cli-${ordinal++}`);
            await materialize(cli, 'cli', cache, baseline);
            const policy = readPolicy(baseline);
            const engines = selectEngines(catalog, policy);
            for (const engine of engines) {
                const work = path.join(output, `pair-${report.pairs.length + 1}`);
                const pair = { cli, engine, status: 'preparing', work };
                report.pairs.push(pair); save();
                try {
                    await fsp.mkdir(work);
                    const cliRoot = path.join(work, 'cli');
                    const engineRoot = path.join(work, 'engine');
                    await materialize(cli, 'cli', cache, cliRoot);
                    await materialize(engine, 'engine', cache, engineRoot);
                    const config = { work, cli: cliRoot, engine: engineRoot, project: path.join(work, 'project'), result: path.join(work, 'result.json') };
                    await fsp.cp(path.join(__dirname, '../e2e/sdk-project'), config.project, { recursive: true });
                    write(path.join(work, 'pair.json'), config);
                    pair.status = 'running'; save();
                    Object.assign(pair, await executePair(path.join(work, 'pair.json'), path.join(work, 'build.log'), options.timeoutMs || 20 * 60 * 1000));
                    if (pair.status === 'passed') {
                        pair.result = json(config.result);
                        if (pair.result.status !== 'passed' || pair.result.engineRevision !== engine.revision || pair.result.cliRevision !== cli.revision) throw new Error('Missing or mismatched pair completion evidence');
                    }
                    pair.smokeStatus = pair.status;
                    pair.ci = await runCiTests(config, options.testRoot || path.join(__dirname, '..'), options.suiteTimeoutMs);
                    pair.status = pair.smokeStatus === 'passed' && pair.ci.status === 'passed' ? 'passed' : 'failed';
                } catch (error) { pair.status = 'failed'; pair.error = error.message; }
                save();
            }
        }
        report.status = report.pairs.length && report.pairs.every(pair => pair.status === 'passed') ? 'passed' : 'failed';
    } catch (error) { report.errors.push(error.message); report.status = 'failed'; }
    report.completedAt = new Date().toISOString(); save();
    return report;
}
async function main() {
    const { values } = parseArgs({ options: { catalog: { type: 'string' }, cli: { type: 'string' }, output: { type: 'string' }, cache: { type: 'string' }, 'test-root': { type: 'string' }, 'require-published': { type: 'boolean' }, 'timeout-ms': { type: 'string' } } });
    const timeoutMs = values['timeout-ms'] === undefined ? undefined : Number(values['timeout-ms']);
    if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000)) throw new Error('timeout-ms must be an integer >= 1000');
    const report = await runMatrix({ ...values, testRoot: values['test-root'], catalog: values.catalog || process.env.SDK_CATALOG_URL, requirePublished: values['require-published'], timeoutMs });
    console.log(JSON.stringify({ status: report.status, pairs: report.pairs.length, errors: report.errors, report: path.resolve(values.output, 'report.json') }));
    process.exitCode = report.status === 'passed' ? 0 : 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateCatalog, loadCatalog, selectEngines, describeArtifact, validateManifest, materialize, runMatrix, executePair, safeFile };
