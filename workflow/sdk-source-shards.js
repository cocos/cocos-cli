const fs = require('node:fs');
const path = require('node:path');
const { archive, extract, plan } = require('./sdk-ci-shards');
const { prepareSources, selectRefs } = require('./sdk-engine-sources');
const { describeArtifact, runMatrix } = require('./sdk-matrix');
const { readPolicy } = require('./engine-compatibility');
const crypto = require('node:crypto');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const host = () => ({ platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules });
async function digest(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}
async function bundle(target, source, cli, snapshot, output) {
    const report = read(path.join(snapshot, 'source-report.json'));
    if (report.status !== 'planned' || !report.refs.length) throw Error('Expected frozen source plan');
    const candidate = await describeArtifact(cli, 'cli');
    if (candidate.manifestSha256 !== report.cli.manifestSha256) throw Error('CLI changed after planning');
    fs.mkdirSync(output);
    const manifest = { schemaVersion: 2, target, host: host(), toolsMode: process.env.MINIMAL_DOWNLOAD_TOOLS === 'true' ? 'minimal' : 'full', cli: candidate, repository: report.repository,
        sourceSnapshot: fs.readFileSync(path.join(snapshot, 'git-refs.snapshot.txt'), 'utf8'),
        engines: report.refs.map(ref => ({ version: ref.version || ref.ref, source: ref })), archives: {} };
    const files = ['src', 'tests', 'e2e', 'dist', 'static', 'workflow', 'packages', '@types', 'node_modules', '.github', '.vscodeignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.ts', 'engine-compatibility.json', ...['jest.parallel.config.ts', 'jest.serial.config.ts'].filter(file => fs.existsSync(path.join(source, file)))];
    for (const [name, directory, entries] of [['candidate.tar', source, files], ['cli.tar', cli]]) {
        const file = path.join(output, name);
        archive(directory, file, entries);
        manifest.archives[name] = await digest(file);
    }
    write(path.join(output, 'manifest.json'), manifest);
    return manifest;
}
function validate(job, manifest) {
    const expected = plan([manifest]).include.find(entry => entry.id === job.id);
    if (!expected || Object.entries(expected).some(([key, value]) => job[key] !== value)
        || Object.entries(host()).some(([key, value]) => manifest.host[key] !== value)) throw Error('Shard identity or host mismatch');
}
async function prepare(job, directory, output, dependencies = { prepareSources }) {
    const manifest = read(path.join(directory, 'manifest.json'));
    validate(job, manifest);
    fs.mkdirSync(output);
    const source = path.join(output, 'candidate'), cli = path.join(output, 'cli');
    await extract(directory, 'candidate.tar', source, manifest.archives['candidate.tar']);
    await extract(directory, 'cli.tar', cli, manifest.archives['cli.tar']);
    if ((await describeArtifact(cli, 'cli')).manifestSha256 !== manifest.cli.manifestSha256) throw Error('CLI manifest mismatch');
    const policy = read(path.join(__dirname, 'engine-source-policy.json'));
    const refs = selectRefs(manifest.sourceSnapshot, [readPolicy(cli)], policy);
    if (manifest.repository !== policy.repository || refs.length !== manifest.engines.length
        || refs.some((ref, index) => ref.commit !== manifest.engines[index].source.commit || ref.ref !== manifest.engines[index].source.ref)) throw Error('Frozen source plan mismatch');
    const report = await dependencies.prepareSources({ cli, output: path.join(output, 'sources'), prepareOnly: true, preparedCache: process.env.SDK_PREPARED_CACHE === 'true',
        frozenRefs: manifest.sourceSnapshot, refIndex: job.index });
    if (report.status !== 'prepared' || report.refs.length !== 1 || report.refs[0].commit !== job.engineCommit) throw Error('Engine preparation failed: ' + JSON.stringify(report.errors));
}
async function verify(job, directory, output, dependencies = { runMatrix }) {
    const manifest = read(path.join(directory, 'manifest.json'));
    validate(job, manifest);
    const result = { ...job, status: 'failed' };
    try {
        if ((await describeArtifact(path.join(output, 'cli'), 'cli')).manifestSha256 !== manifest.cli.manifestSha256) throw Error('CLI manifest changed');
        const report = read(path.join(output, 'sources/source-report.json'));
        const entry = report.refs[0];
        if (report.status !== 'prepared' || report.refs.length !== 1 || entry.commit !== job.engineCommit || entry.ref !== job.engineRef) throw Error('Prepared source identity mismatch');
        const descriptor = await describeArtifact(entry.sdk.location, 'engine');
        if (descriptor.manifestSha256 !== entry.sdk.manifestSha256) throw Error('Prepared Engine SDK changed');
        result.engineRevision = descriptor.revision;
        result.external = entry.external;
        const matrix = await dependencies.runMatrix({ cli: path.join(output, 'cli'), testRoot: path.join(output, 'candidate'), consumeTestSource: true,
            catalog: path.join(output, 'sources/catalog.json'), output: path.join(output, 'matrix'), cache: path.join(output, 'cache') });
        result.suites = matrix.pairs[0]?.ci?.suites;
        if (matrix.status !== 'passed' || matrix.pairs.length !== 1 || matrix.pairs[0].engine.revision !== descriptor.revision || matrix.pairs[0].cli.revision !== job.cliRevision) throw Error('Full unit/E2E shard failed');
        result.status = 'passed';
    } catch (error) { result.error = error.message; }
    write(path.join(output, 'shard-result.json'), result);
    if (result.status !== 'passed') throw Error(result.error);
    return result;
}
async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'bundle') await bundle(JSON.parse(process.env.TARGET), ...args.map(value => path.resolve(value)));
    else if (command === 'prepare') await prepare(JSON.parse(process.env.SHARD), ...args.map(value => path.resolve(value)));
    else if (command === 'verify') await verify(JSON.parse(process.env.SHARD), ...args.map(value => path.resolve(value)));
    else throw Error('Expected bundle, prepare or verify');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { bundle, validate, prepare, verify };
