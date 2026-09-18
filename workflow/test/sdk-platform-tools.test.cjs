/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare } = require('../sdk-platform-tools');
const { ToolDownloader } = require('../download-tools');
const prepareFull = (downloader, output) => prepare(downloader, output, false);
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-tools-cache-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function downloader(root, fail = false) {
    const value = new ToolDownloader();
    Object.assign(value, { projectRoot: root, toolsDir: path.join(root, 'tools'), tempDir: path.join(root, 'temp'), minimal: true });
    value.manifestPath = path.join(value.toolsDir, 'manifest.json');
    value.manifest = value.loadManifestLocalFile();
    value.checkExtractTools = () => true;
    value.downloadFile = async (url, file) => { if (fail) throw Error('Test download failure'); fs.writeFileSync(file, url); };
    value.extractFile = async (file, target) => fs.copyFileSync(file, path.join(target, 'tool.bin'));
    return value;
}
test('cold tools cache downloads the full set; warm cache validates and reuses every tool', async t => {
    const root = fixture(t), output = path.join(root, 'output');
    const first = await prepareFull(downloader(root), output);
    assert(first.downloaded >= 3); assert.equal(first.reused, 0);
    assert(fs.existsSync(path.join(root, 'tools/keystore'))); // Not in minimal mode.
    const second = await prepareFull(downloader(root, true), output);
    assert.equal(second.reused, first.downloaded); assert.equal(second.downloaded, 0);
    assert.equal(fs.readFileSync(output, 'utf8'), 'changed=true\nchanged=false\n');
});
test('missing, modified and outdated tool records are selectively repaired', async t => {
    const root = fixture(t);
    const first = await prepareFull(downloader(root), null);
    const cache = path.join(root, 'tools/.sdk-tool-integrity.json');
    const metadata = JSON.parse(fs.readFileSync(cache, 'utf8'));
    const names = Object.keys(metadata.tools);
    const target = name => path.join(root, 'tools', name, metadata.tools[name].files.find(file => file.sha256).path);
    fs.unlinkSync(target(names[0]));
    fs.writeFileSync(target(names[1]), 'corrupt');
    metadata.tools[names[2]].url = 'https://invalid.example/old-tool';
    fs.writeFileSync(cache, JSON.stringify(metadata));
    const repaired = await prepareFull(downloader(root), null);
    assert.equal(repaired.downloaded, 3); assert.equal(repaired.reused, first.downloaded - 3);
    assert.equal((await prepareFull(downloader(root, true), null)).downloaded, 0);
});
test('partial download failure cannot create a successful cache manifest or save output', async t => {
    const root = fixture(t), output = path.join(root, 'output');
    await assert.rejects(prepareFull(downloader(root, true), output));
    assert.equal(fs.existsSync(path.join(root, 'tools/.sdk-tool-integrity.json')), false);
    assert.equal(fs.existsSync(output), false);
});
test('tools cache is restored and validated before compilation and only saved after repair', () => {
    const yaml = require('js-yaml');
    const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/sdk-target-tests.yml'), 'utf8'));
    const steps = workflow.jobs.build.steps;
    const restore = steps.findIndex(step => step.id === 'platform-tools-cache');
    const validate = steps.findIndex(step => step.id === 'platform-tools');
    const save = steps.findIndex(step => step.uses === 'actions/cache/save@v4');
    const compile = steps.findIndex(step => step.run?.includes('setup-dev.js'));
    assert(restore < validate && validate < save && save < compile);
    assert.match(steps[restore].with.key, /runner.arch/);
    assert.match(steps[restore].with.key, /download-tools.js/);
    assert.match(steps[save].if, /outputs.changed == 'true'/);
    assert.equal(steps[restore].with.path, 'candidate/static/tools');
});

test('minimal mode omits optional packagers and rejects full-mode integrity records', async t => {
    const root = fixture(t);
    const full = await prepareFull(downloader(root), null);
    const minimal = await prepare(downloader(root), null, true);
    assert(minimal.downloaded > 0 && minimal.downloaded < full.downloaded);
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'tools/.sdk-tool-integrity.json'), 'utf8'));
    assert.equal(metadata.mode, 'minimal');
    assert.equal(metadata.tools.keystore, undefined);
    const warm = await prepare(downloader(root, true), null, true);
    assert.equal(warm.downloaded, 0);
    assert.equal(warm.reused, minimal.downloaded);
    const fresh = fixture(t);
    await prepare(downloader(fresh), null, true);
    assert.equal(fs.existsSync(path.join(fresh, 'tools/quickgame-toolkit')), false);
    const yaml = require('js-yaml');
    const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/sdk-target-tests.yml'), 'utf8'));
    assert.equal(workflow.jobs.build.env.MINIMAL_DOWNLOAD_TOOLS, 'true');
    assert.match(workflow.jobs.build.steps.find(step => step.id === 'platform-tools-cache').with.key, /MINIMAL_DOWNLOAD_TOOLS/);
});
