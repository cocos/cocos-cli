const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

test('installation has no engine, build or tool side effects even with legacy CI flags', () => {
    const source = fs.readFileSync(path.join(__dirname, 'postinstall.js'), 'utf8');
    for (const value of ['true', 'false', '']) {
        vm.runInNewContext(source, {
            process: { env: { COCOS_SKIP_POSTINSTALL_BUILD: value } },
            console: { log() {} },
            require() { throw Error('Installation must not load preparation tools'); },
        });
    }
});

test('CI restores caches before install and saves only after explicit strict preparation', () => {
    const steps = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/actions/setup-env/action.yml'), 'utf8')).runs.steps;
    const install = steps.findIndex(step => step.run === 'npm ci');
    const prepare = steps.findIndex(step => step.run === 'node workflow/setup-dev.js --force');
    assert(install >= 0 && prepare > install);
    assert.equal(steps.filter(step => step.run === 'node workflow/setup-dev.js --force').length, 1);
    assert(!steps.some(step => step.run === 'npm run build'));
    assert.equal(steps[prepare].env.COCOS_STRICT_TOOL_DOWNLOADS, 'true');
    for (const id of ['npm-cache', 'tools-cache']) {
        const restore = steps.findIndex(step => step.id === id);
        const save = steps.findIndex(step => step.uses === 'actions/cache/save@v4' && step.with.key.includes(id));
        assert(restore >= 0 && restore < install);
        assert(save > prepare);
        assert.equal(steps[save].with.path, steps[restore].with.path);
        assert.equal(steps[save].if, `steps.${id}.outputs.cache-hit != 'true'`);
    }
});

test('DTS publishing reuses the installation from shared setup', () => {
    const steps = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/publish-dts.yml'), 'utf8')).jobs.publish.steps;
    const setup = steps.findIndex(step => step.uses === './.github/actions/setup-env');
    assert(setup >= 0);
    assert(!steps.slice(setup + 1).some(step => step.run === 'npm ci' && !step['working-directory']));
    assert(steps.slice(setup + 1).some(step => step.run === 'npm run generate:dts'));
});

function runFailedToolDownload(strict) {
    return spawnSync(process.execPath, ['-e', `
        const { ToolDownloader } = require('./workflow/download-tools');
        const downloader = new ToolDownloader();
        downloader.checkExtractTools = () => true;
        downloader.ensureDir = () => {};
        downloader.cleanupTempDir = () => {};
        downloader.processTool = async () => ({ success: false, error: 'download failed' });
        downloader.run().catch(error => { console.error(error.message); process.exitCode = 1; });
    `], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8',
        env: { ...process.env, COCOS_STRICT_TOOL_DOWNLOADS: strict },
    });
}

test('failed tool downloads fail strict CI preparation so it cannot save an incomplete cache', () => {
    const result = runFailedToolDownload('true');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /工具下载失败/);
});

test('tool download failures retain the default local behavior', () => {
    const result = runFailedToolDownload('false');
    assert.equal(result.status, 0, result.stderr);
});
