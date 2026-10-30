const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { wrap } = require('node:module');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const source = fs.readFileSync(path.join(__dirname, 'postinstall.js'), 'utf8');

function runPostinstall(env = {}) {
    const execute = vm.runInNewContext(wrap(source), {
        process: { env }, console: { log() {} },
    });
    const module = { exports: {} };
    execute(module.exports, name => { throw new Error('Install must not load preparation dependencies: ' + name); },
        module, path.join(__dirname, 'postinstall.js'), __dirname);
}

test('installation never prepares an engine, builds the CLI or downloads tools', () => {
    runPostinstall();
    for (const value of ['true', 'false', '0', '']) {
        runPostinstall({ COCOS_SKIP_POSTINSTALL_BUILD: value, FORCE_UPDATE: 'true', MINIMAL_DOWNLOAD_TOOLS: 'true' });
    }
});

test('shared CI setup prepares the SDK explicitly after installing dependencies', () => {
    const action = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/actions/setup-env/action.yml'), 'utf8'));
    const steps = action.runs.steps;
    const installs = steps.filter(step => step.run === 'npm ci');
    assert.equal(installs.length, 1);
    runPostinstall(installs[0].env);
    const preparations = steps.filter(step => step.run === 'npm run setup:dev -- --force');
    assert.equal(preparations.length, 1);
    const prepare = steps.indexOf(preparations[0]);
    assert.ok(steps.indexOf(installs[0]) < prepare);
    for (const command of ['npm run update:repos', 'npm run install:engine']) {
        const index = steps.findIndex(step => step.run === command);
        assert.ok(index > steps.indexOf(installs[0]) && index < prepare);
    }
    assert.ok(!steps.some(step => step.run === 'npm run build'));
});

test('DTS publishing reuses the installation from shared setup', () => {
    const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/publish-dts.yml'), 'utf8'));
    const steps = workflow.jobs.publish.steps;
    const setup = steps.findIndex(step => step.uses === './.github/actions/setup-env');
    assert.ok(setup >= 0);
    assert.ok(!steps.slice(setup + 1).some(step => step.run === 'npm ci' && !step['working-directory']));
    assert.ok(steps.slice(setup + 1).some(step => step.run === 'npm run generate:dts'));
});

test('CI restores downloads before installation and caches tools after successful preparation', () => {
    const action = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/actions/setup-env/action.yml'), 'utf8'));
    const steps = action.runs.steps;
    const install = steps.findIndex(step => step.run === 'npm ci');
    const build = steps.findIndex(step => step.run === 'npm run setup:dev -- --force');
    assert.equal(steps[build].env.COCOS_STRICT_TOOL_DOWNLOADS, 'true');
    assert.equal(steps[install].if, undefined);
    assert.equal(steps[build].if, undefined);
    for (const id of ['npm-cache', 'tools-cache']) {
        const restore = steps.findIndex(step => step.id === id);
        const save = steps.findIndex(step => step.uses === 'actions/cache/save@v4' && step.with.key.includes(id));
        assert.ok(restore >= 0 && restore < install);
        assert.ok(save > (id === 'tools-cache' ? build : install));
        assert.equal(steps[save].with.path, steps[restore].with.path);
        assert.equal(steps[save].if, `steps.${id}.outputs.cache-hit != 'true'`);
    }
    const toolsCache = steps.find(step => step.id === 'tools-cache');
    assert.equal(toolsCache.with['restore-keys'], undefined);
    for (const input of ['runner.os', 'runner.arch', 'MINIMAL_DOWNLOAD_TOOLS', 'workflow/download-tools.js']) {
        assert.ok(toolsCache.with.key.includes(input));
    }
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
