/* Prepare immutable bundles, fan out engine tests, and require complete coverage. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
async function digest(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}
const host = () => ({ platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules });
const entries = ['src', 'tests', 'e2e', 'dist', 'static', 'workflow', 'packages', '@types', 'node_modules', '.github', '.vscodeignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.ts', 'engine-compatibility.json'];

// Preserve SDK AppleDouble files as ordinary files, without macOS metadata conversion.
const tarOptions = () => ({ stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } });
function archive(source, destination, files) {
    const excludes = files ? ['--exclude=packages/engine', '--exclude=.git', '--exclude=.workspace'] : [];
    execFileSync('tar', ['-chf', destination, ...excludes, '-C', source, ...(files || ['.']).map(file => './' + file)], tarOptions());
}
async function extract(bundle, archiveName, destination, expectedHash) {
    const file = path.join(bundle, archiveName);
    if (await digest(file) !== expectedHash) throw new Error(`Bundle digest mismatch: ${archiveName}`);
    fs.mkdirSync(destination); // Each job owns a new, separate workspace.
    execFileSync('tar', ['-xf', file, '-C', destination], tarOptions());
}
async function bundle(target, source, cli, sources, output) {
    const report = read(path.join(sources, 'source-report.json'));
    const catalog = read(path.join(sources, 'catalog.json'));
    if (report.status !== 'prepared' || report.sourceStatus !== 'passed' || !catalog.engines.length) throw new Error('All engine sources must be prepared before sharding');
    fs.mkdirSync(output);
    const manifest = { schemaVersion: 1, target, host: host(), coverage: catalog.coverage, snapshotId: catalog.snapshotId, cli: report.cli, engines: catalog.engines, archives: {} };
    for (const [name, root, files] of [['candidate.tar', source, [...entries, ...['jest.parallel.config.ts', 'jest.serial.config.ts'].filter(file => fs.existsSync(path.join(source, file)))]], ['cli.tar', cli], ...catalog.engines.map((engine, i) => [`engine-${i}.tar`, engine.location])]) {
        const file = path.join(output, name);
        archive(path.resolve(root), file, files);
        manifest.archives[name] = await digest(file);
    }
    write(path.join(output, 'manifest.json'), manifest);
    return manifest;
}
function plan(manifests) {
    const include = [];
    const ids = new Set();
    for (const manifest of manifests) {
        const target = manifest.target;
        if (!/^target-\d+$/.test(target.id) || ids.has(target.id) || !manifest.engines.length) throw new Error('Invalid or duplicate target');
        ids.add(target.id);
        manifest.engines.forEach((engine, index) => include.push({ id: `${target.id}-engine-${index}`, target: target.id, runner: target.runner, node: target.node, index, engineVersion: engine.version, cliRevision: manifest.cli.revision, engineRevision: engine.revision }));
    }
    if (!include.length || include.length > 256) throw new Error('Matrix must contain 1..256 jobs');
    return { include };
}
function aggregate(matrix, results) {
    const expected = new Map(matrix.include.map(job => [job.id, job]));
    const seen = new Set();
    for (const result of results) {
        const job = expected.get(result.id);
        if (!job || seen.has(result.id)) throw new Error('Unexpected or duplicate shard result');
        seen.add(result.id);
        if (result.status !== 'passed' || result.cliRevision !== job.cliRevision || result.engineRevision !== job.engineRevision) throw new Error(`Shard failed or identity changed: ${result.id}`);
    }
    if (!expected.size || seen.size !== expected.size) throw new Error('Missing shard results');
    return { status: 'passed', count: seen.size };
}
async function verify(job, directory, output) {
    const { describeArtifact, runMatrix } = require('./sdk-matrix');
    const manifest = read(path.join(directory, 'manifest.json'));
    const selected = plan([manifest]).include.find(entry => entry.id === job.id);
    if (!selected || Object.entries(selected).some(([key, value]) => job[key] !== value) || Object.entries(host()).some(([key, value]) => manifest.host[key] !== value)) throw new Error('Shard identity or host mismatch');
    fs.mkdirSync(output);
    const result = { ...job, status: 'failed' };
    try {
        const source = path.join(output, 'candidate');
        const cli = path.join(output, 'cli');
        const engine = path.join(output, 'engine');
        await extract(directory, 'candidate.tar', source, manifest.archives['candidate.tar']);
        await extract(directory, 'cli.tar', cli, manifest.archives['cli.tar']);
        await extract(directory, `engine-${job.index}.tar`, engine, manifest.archives[`engine-${job.index}.tar`]);
        const descriptor = await describeArtifact(engine, 'engine');
        const candidate = await describeArtifact(cli, 'cli');
        if (descriptor.manifestSha256 !== manifest.engines[job.index].manifestSha256 || candidate.manifestSha256 !== manifest.cli.manifestSha256) throw new Error('SDK manifest differs from prepared candidate');
        const catalog = path.join(output, 'catalog.json');
        write(catalog, { schemaVersion: 1, coverage: manifest.coverage, snapshotId: manifest.snapshotId, engines: [descriptor], clis: [] });
        const report = await runMatrix({ cli, catalog, testRoot: source, output: path.join(output, 'matrix'), cache: path.join(output, 'cache') });
        result.suites = report.pairs[0]?.ci?.suites;
        if (report.status !== 'passed' || report.pairs.length !== 1) throw new Error('Full unit/E2E shard failed');
        result.status = 'passed';
    } catch (error) { result.error = error.message; }
    write(path.join(output, 'shard-result.json'), result);
    if (process.env.GITHUB_STEP_SUMMARY) {
        const rows = Object.entries(result.suites || {}).map(([name, suite]) => `| ${name} | ${suite.status} | ${suite.passed ?? '-'} / ${suite.total ?? '-'} | ${suite.durationMs === undefined ? '-' : (suite.durationMs / 1000).toFixed(1)} |`);
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${job.id}: ${result.status}\n\n| Suite | Result | Passed / Total | Seconds |\n|---|---|---|---|\n${rows.join('\n')}\n`);
    }
    return result;
}
function filesNamed(directory, name) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? filesNamed(file, name) : entry.name === name ? [file] : [];
    });
}
async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'bundle') await bundle(JSON.parse(process.env.TARGET), ...args.map(value => path.resolve(value)));
    else if (command === 'plan') {
        const value = plan(filesNamed(args[0], 'manifest.json').map(read));
        const targets = JSON.parse(process.env.TARGETS);
        if (new Set(value.include.map(job => job.target)).size !== targets.length || targets.some(target => !value.include.some(job => job.target === target.id))) throw new Error('Missing prepared targets');
        write(args[1], value);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(value)}\n`);
    } else if (command === 'verify') {
        const result = await verify(JSON.parse(process.env.SHARD), path.resolve(args[0]), path.resolve(args[1]));
        if (result.status !== 'passed') throw new Error(result.error);
    } else if (command === 'aggregate') {
        console.log(JSON.stringify(aggregate(read(args[0]), filesNamed(args[1], 'shard-result.json').map(read))));
    } else throw new Error('Expected bundle, plan, verify or aggregate');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { archive, extract, bundle, plan, aggregate, verify };
