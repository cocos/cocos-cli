const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { parseArgs } = require('node:util');
const semver = require('semver');
const { checkEngineCompatibility, matchEngineVersion, readPolicy } = require('./engine-compatibility');
const { resolveEngineSelection } = require('./engine-path');
const { describeArtifact, validateManifest } = require('./sdk-matrix');

const workflowFile = 'sdk-tag-matrix.yml';
const host = () => ({ platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules });
const sameHost = (left, right) => ['platform', 'arch', 'nodeAbi'].every(key => left[key] === right[key]);

function releaseArtifactName(engine, timestamp, shardId) {
    if (!['win32', 'darwin'].includes(engine.platform) || !semver.valid(engine.version)
        || !/^[a-z0-9]+$/.test(engine.arch) || !/^\d+$/.test(engine.nodeAbi)
        || !/^\d{8}$/.test(timestamp) || !/^target-\d+-engine-\d+$/.test(shardId)) {
        throw new Error('Invalid Engine SDK release artifact identity');
    }
    const platform = engine.platform === 'win32' ? 'win' : 'mac';
    return `cocos-engine-sdk-${platform}-${timestamp}-${engine.version}-${engine.arch}-node${engine.nodeAbi}-${shardId}.zip`;
}

function selectEngineArtifact(candidates, policy, platform = host()) {
    const eligible = [];
    for (const { run, artifact } of candidates) {
        const match = /^cocos-engine-sdk-(win|mac)-\d{8}-(.+)-([a-z0-9]+)-node(\d+)-target-\d+-engine-\d+\.zip$/.exec(artifact.name);
        if (!match || artifact.expired || artifact.size_in_bytes <= 0 || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) continue;
        const [, system, version, arch, nodeAbi] = match;
        const identity = { platform: system === 'win' ? 'win32' : 'darwin', arch, nodeAbi };
        const supported = matchEngineVersion(version, policy);
        if (!sameHost(identity, platform) || !supported.supported || supported.experimental) continue;
        eligible.push({
            ...identity, version, runId: run.id, artifactId: artifact.id, name: artifact.name, digest: artifact.digest,
            createdAt: artifact.created_at,
        });
    }
    return eligible.sort((a, b) => semver.rcompare(a.version, b.version)
        || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.artifactId - a.artifactId)[0];
}

function eligibleRun(run, branch) {
    return run.path?.split('@')[0] === `.github/workflows/${workflowFile}` && run.head_branch === branch
        && run.event === 'workflow_dispatch' && run.status === 'completed' && run.conclusion === 'success';
}

async function findEngineArtifact({ repo, apiUrl, token, branch, artifactId, policy, platform = host(), fetcher = fetch }) {
    if (!token || !branch || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GitHub repository, default branch and Actions read token are required');
    if (artifactId !== undefined && !/^[1-9]\d*$/.test(artifactId)) throw new Error('Invalid Engine SDK artifact ID');
    const api = `${apiUrl.replace(/\/+$/, '')}/repos/${repo}/actions`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    async function json(resource) {
        const response = await fetcher(api + resource, { headers, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`GitHub Actions request failed (${response.status}) for ${resource}`);
        return response.json();
    }
    async function list(resource, field) {
        const entries = [];
        const delimiter = resource.includes('?') ? '&' : '?';
        for (let page = 1; ; page++) {
            const batch = (await json(`${resource}${delimiter}per_page=100&page=${page}`))[field];
            entries.push(...batch);
            if (batch.length < 100) return entries;
        }
    }
    async function approved(run) {
        if (!eligibleRun(run, branch)) return false;
        const jobs = await list(`/runs/${run.id}/jobs`, 'jobs');
        return jobs.some(job => job.name === 'Engine SDK compatibility gate' && job.conclusion === 'success'
            && job.steps.some(step => step.name === 'Approve Engine SDK artifacts for CLI publishing' && step.conclusion === 'success'));
    }
    let candidates;
    if (artifactId) {
        const artifact = await json(`/artifacts/${artifactId}`);
        const run = await json(`/runs/${artifact.workflow_run.id}`);
        candidates = await approved(run) ? [{ run, artifact }] : [];
    } else {
        const query = new URLSearchParams({ branch, status: 'success', event: 'workflow_dispatch' });
        const runs = (await list(`/workflows/${workflowFile}/runs?${query}`, 'workflow_runs')).filter(run => eligibleRun(run, branch));
        candidates = [];
        for (const run of runs) {
            const artifacts = await list(`/runs/${run.id}/artifacts`, 'artifacts');
            const matches = artifacts.map(artifact => ({ run, artifact }));
            if (selectEngineArtifact(matches, policy, platform) && await approved(run)) candidates.push(...matches);
        }
    }
    const selected = selectEngineArtifact(candidates, policy, platform);
    if (!selected) {
        throw new Error(`No compatible Engine SDK artifact for ${platform.platform}/${platform.arch}/Node ABI ${platform.nodeAbi}`
            + (artifactId ? ` with ID ${artifactId}` : `. Run Engine tag SDK matrix on ${branch} with cli_ref empty.`));
    }
    return selected;
}

async function validateReleaseEngine(root, sdkPath, selected) {
    const selection = resolveEngineSelection(root, { explicitPath: sdkPath });
    const engine = await describeArtifact(selection.path, 'engine');
    const manifest = JSON.parse(await fs.promises.readFile(path.join(engine.location, 'engine-sdk.json'), 'utf8'));
    validateManifest(manifest, engine, 'engine');
    if (selection.version !== engine.version || !sameHost(engine, host())) {
        throw new Error(`Engine SDK identity or Node host mismatch: ${engine.location}`);
    }
    if (selected && (selected.version !== engine.version || !sameHost(engine, selected))) {
        throw new Error('Downloaded Engine SDK manifest does not match its Actions artifact');
    }
    checkEngineCompatibility(selection, root, 'web');
    return { version: engine.version, platform: engine.platform, arch: engine.arch, nodeAbi: engine.nodeAbi, revision: engine.revision };
}

async function downloadEngineSdk({ root, repo, apiUrl, token, branch, artifactId, tempDir = os.tmpdir(), fetcher = fetch }) {
    const selected = await findEngineArtifact({ repo, apiUrl, token, branch, artifactId, policy: readPolicy(root), fetcher });
    const workspace = await fs.promises.mkdtemp(path.join(tempDir, 'cocos-engine-sdk-'));
    const archive = path.join(workspace, 'engine.zip');
    const sdkPath = path.join(workspace, 'engine');
    const signal = AbortSignal.timeout(15 * 60_000);
    const redirect = await fetcher(`${apiUrl.replace(/\/+$/, '')}/repos/${repo}/actions/artifacts/${selected.artifactId}/zip`, {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal,
    });
    const location = redirect.headers.get('location');
    if (redirect.status !== 302 || !location || new URL(location).protocol !== 'https:') throw new Error('GitHub Engine SDK artifact download did not redirect to HTTPS storage');
    const response = await fetcher(location, { signal });
    if (!response.ok || !response.body) throw new Error(`Engine SDK ZIP download failed (${response.status})`);
    const hash = createHash('sha256');
    await pipeline(Readable.fromWeb(response.body), async function* (chunks) {
        for await (const chunk of chunks) { hash.update(chunk); yield chunk; }
    }, fs.createWriteStream(archive, { flags: 'wx' }));
    if (`sha256:${hash.digest('hex')}` !== selected.digest) throw new Error('Engine SDK ZIP SHA-256 mismatch');
    await fs.promises.mkdir(sdkPath);
    execFileSync('tar', ['-xf', archive, '-C', sdkPath], { stdio: 'inherit' });
    await fs.promises.unlink(archive);
    const metadata = await validateReleaseEngine(root, sdkPath, selected);
    const receipt = { ...metadata, repository: repo, runId: selected.runId, artifactId: selected.artifactId, zipSha256: selected.digest };
    const receiptPath = path.join(workspace, 'engine-sdk-selection.json');
    await fs.promises.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    return { sdkPath, receiptPath, receipt };
}

async function main() {
    const { values } = parseArgs({ options: { 'artifact-id': { type: 'string' } } });
    const { sdkPath, receiptPath, receipt } = await downloadEngineSdk({
        root: path.resolve(__dirname, '..'), repo: process.env.GITHUB_REPOSITORY,
        apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com', token: process.env.GH_TOKEN,
        branch: process.env.ENGINE_SDK_DEFAULT_BRANCH, artifactId: values['artifact-id'] || undefined,
        tempDir: process.env.RUNNER_TEMP,
    });
    console.log(`Selected Engine SDK ${receipt.version} from Actions run ${receipt.runId}, artifact ${receipt.artifactId}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `path=${sdkPath}\nreceipt=${receiptPath}\n`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { releaseArtifactName, selectEngineArtifact, findEngineArtifact, validateReleaseEngine, downloadEngineSdk };
