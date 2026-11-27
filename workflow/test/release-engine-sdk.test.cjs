/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readPolicy } = require('../engine-compatibility');
const { packSdk, REQUIRED } = require('../pack-sdk');
const { zipArchive } = require('../utils');
const { downloadEngineSdk, findEngineArtifact, releaseArtifactName, selectEngineArtifact } = require('../release-engine-sdk');

const root = path.resolve(__dirname, '../..');
const policy = readPolicy(root);
const windows = { platform: 'win32', arch: 'x64', nodeAbi: '127' };
const mac = { platform: 'darwin', arch: 'arm64', nodeAbi: '127' };
const trustedRun = { id: 1, event: 'workflow_dispatch', head_branch: 'main', status: 'completed', conclusion: 'success',
    path: '.github/workflows/sdk-tag-matrix.yml@main' };
const approvalJob = { name: 'Engine SDK compatibility gate', conclusion: 'success',
    steps: [{ name: 'Approve Engine SDK artifacts for CLI publishing', conclusion: 'success' }] };
const api = { apiUrl: 'https://api.github.com', repo: 'cocos/cocos-cli', branch: 'main', token: 'fixture' };

function artifact(id, version, platform = windows, extra = {}) {
    return { id, name: releaseArtifactName({ ...platform, version }, '26112712', 'target-0-engine-0'),
        digest: 'sha256:' + 'a'.repeat(64), size_in_bytes: 10, expired: false, created_at: '2026-11-27T08:00:00Z',
        workflow_run: { id: trustedRun.id }, ...extra };
}

test('release selects the highest compatible non-experimental version and newest matching build', () => {
    const candidates = [
        artifact(1, '4.0.0-beta.4', mac),
        artifact(2, '4.0.1', { ...windows, nodeAbi: '137' }),
        artifact(3, '4.1.0-alpha.2'),
        artifact(4, '4.0.1', windows, { expired: true }),
        artifact(5, '4.0.0-beta.3'),
        artifact(6, '4.0.0-beta.3', windows, { created_at: '2026-11-27T09:00:00Z' }),
        artifact(7, '4.0.0-beta.2', windows, { created_at: '2026-11-27T10:00:00Z' }),
        artifact(8, '4.0.2', windows, { name: 'engine-sdk-4.0.2-win32-x64-node127-target-0-engine-0.zip' }),
    ].map(value => ({ run: trustedRun, artifact: value }));
    assert.equal(selectEngineArtifact(candidates, policy, windows).artifactId, 6);
    assert.equal(selectEngineArtifact(candidates, policy, mac).artifactId, 1);
    assert.equal(candidates[5].artifact.name, 'cocos-engine-sdk-win-26112712-4.0.0-beta.3-x64-node127-target-0-engine-0.zip');
});

test('release consumes artifacts only from successful default-branch runs and supports an exact artifact ID', async () => {
    const tested = artifact(20, '4.0.0-beta.3');
    const fetcher = async url => {
        const request = new URL(url);
        if (request.pathname.endsWith('/workflows/sdk-tag-matrix.yml/runs')) {
            assert.equal(request.searchParams.get('branch'), 'main');
            return Response.json({ workflow_runs: [trustedRun, { ...trustedRun, id: 2, head_branch: 'feature' },
                { ...trustedRun, id: 3, conclusion: 'failure' }, { ...trustedRun, id: 4 }] });
        }
        if (request.pathname.endsWith('/runs/1/artifacts')) return Response.json({ artifacts: [tested] });
        if (request.pathname.endsWith('/runs/1/jobs')) return Response.json({ jobs: [approvalJob] });
        if (request.pathname.endsWith('/runs/4/artifacts')) return Response.json({ artifacts: [artifact(21, '4.0.1')] });
        if (request.pathname.endsWith('/runs/4/jobs')) return Response.json({ jobs: [{ ...approvalJob, steps: [] }] });
        if (request.pathname.endsWith('/artifacts/20')) return Response.json(tested);
        if (request.pathname.endsWith('/runs/1')) return Response.json(trustedRun);
        assert.fail('Unexpected request: ' + request.pathname);
    };
    assert.equal((await findEngineArtifact({ ...api, policy, platform: windows, fetcher })).artifactId, 20);
    assert.equal((await findEngineArtifact({ ...api, policy, platform: windows, artifactId: '20', fetcher })).runId, 1);
    await assert.rejects(findEngineArtifact({ ...api, policy, platform: mac, artifactId: '20', fetcher }), /No compatible Engine SDK artifact/);
});

test('release verifies the downloaded ZIP digest, manifest and host, and records its provenance', { skip: !['win32', 'darwin'].includes(process.platform) }, async t => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-engine-test-'));
    t.after(() => fs.rmSync(work, { recursive: true, force: true }));
    const engine = path.join(work, 'source');
    for (const file of [...REQUIRED.engine, ...policy.requiredFiles.source]) {
        const destination = path.join(engine, file);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, '{}');
    }
    fs.writeFileSync(path.join(engine, 'package.json'), JSON.stringify({ name: 'engine', version: '4.0.0-beta.3' }));
    const sdk = path.join(work, 'sdk');
    const packed = await packSdk({ kind: 'engine', source: engine, output: sdk });
    const archive = await zipArchive(sdk, path.join(work, 'sdk.zip'), { includeRoot: false });
    const payload = fs.readFileSync(archive);
    const platform = { platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules };
    const released = artifact(20, packed.version, platform, {
        size_in_bytes: payload.length, digest: 'sha256:' + crypto.createHash('sha256').update(payload).digest('hex'),
    });
    const fetcher = async (url, options) => {
        const request = new URL(url);
        if (request.hostname === 'storage.example') {
            assert.equal(options.headers, undefined, 'Do not forward the GitHub token to storage');
            return new Response(payload);
        }
        if (request.pathname.endsWith('/artifacts/20/zip')) return Response.redirect('https://storage.example/engine.zip');
        if (request.pathname.endsWith('/artifacts/20')) return Response.json(released);
        if (request.pathname.endsWith('/runs/1')) return Response.json(trustedRun);
        if (request.pathname.endsWith('/runs/1/jobs')) return Response.json({ jobs: [approvalJob] });
        assert.fail('Unexpected request: ' + request.pathname);
    };
    const args = { ...api, root, artifactId: '20', tempDir: work, fetcher };
    const { sdkPath, receiptPath, receipt } = await downloadEngineSdk(args);
    assert(fs.existsSync(path.join(sdkPath, 'bin/.cache/dev-cli/web/loader.js')));
    assert.equal(receipt.revision, packed.revision);
    assert.equal(receipt.artifactId, 20);
    assert.deepEqual(JSON.parse(fs.readFileSync(receiptPath)), receipt);
    released.digest = 'sha256:' + '0'.repeat(64);
    await assert.rejects(downloadEngineSdk(args), /ZIP SHA-256 mismatch/);
});

test('Publish skips Engine source preparation and passes the selected SDK and receipt to release', () => {
    const yaml = require('js-yaml');
    const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/publish.yml'), 'utf8'));
    const steps = workflow.jobs.publish.steps;
    const setup = steps.findIndex(step => step.uses === './.github/actions/setup-env');
    const download = steps.findIndex(step => step.id === 'engine-sdk');
    const release = steps.findIndex(step => step.id === 'release');
    assert(setup >= 0 && setup < download && download < release);
    assert.equal(workflow.permissions.actions, 'read');
    assert.equal(steps[setup].with['prepare-engine-source'], 'false');
    assert.equal(steps[release].with['engine-sdk'], '${{ steps.engine-sdk.outputs.path }}');
    assert.equal(steps[release].with['engine-sdk-receipt'], '${{ steps.engine-sdk.outputs.receipt }}');
});
