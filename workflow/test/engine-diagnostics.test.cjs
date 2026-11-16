/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, __dirname, process */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { diagnose, recordInitialization } = require('../engine-diagnostics');
const cli = path.resolve(__dirname, '../..');
const policy = JSON.parse(fs.readFileSync(path.join(cli, 'engine-compatibility.json')));
function write(root, file, value) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
}
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine doctor '));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    write(root, 'package.json', { version: '1.2.3' });
    write(root, 'engine-compatibility.json', policy);
    const engine = path.join(root, 'custom engine');
    write(engine, 'package.json', { version: '4.0.0' });
    write(engine, 'engine-sdk.json', { schemaVersion: 1, engineVersion: '4.0.0', revision: 'custom-42' });
    for (const file of Object.values(policy.requiredFiles).flat()) write(engine, file, {});
    write(root, 'config.local.json', { enginePath: './custom engine' });
    const project = path.join(root, 'game');
    write(project, 'settings/cocos.config.json', { version: '1.0.0', engineSdk: { path: '../custom engine', version: '4.0.0', revision: 'custom-42' }, untouched: 123 });
    return { root, engine: fs.realpathSync(engine), project };
}
test('diagnostics report exact identity and are read-only', t => {
    const { root, engine, project } = fixture(t);
    const file = path.join(project, 'settings/cocos.config.json');
    const before = fs.readFileSync(file);
    const report = diagnose(root, { projectRoot: project });
    assert.equal(report.ok, true);
    assert.equal(report.cli.version, '1.2.3');
    assert.equal(report.engine.path, engine);
    assert.equal(report.engine.revision, 'custom-42');
    assert.equal(report.runtimeInterfaces, 'not-tested');
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(fs.existsSync(path.join(project, 'temp')), false);
});
test('project pins still apply to explicit paths and default diagnostics need no project', t => {
    const { root, engine, project } = fixture(t);
    assert.equal(diagnose(root).engine.path, engine);
    write(project, 'settings/cocos.config.json', { engineSdk: { path: './missing', revision: 'wrong' } });
    const report = diagnose(root, { projectRoot: project, explicitPath: engine });
    assert.equal(report.ok, false);
    assert.match(report.errors[0], /revision requires wrong/);
});
test('invalid project configuration does not fall back to local defaults', t => {
    const { root, project } = fixture(t);
    for (const engineSdk of [null, [], 'invalid']) {
        write(project, 'settings/cocos.config.json', { engineSdk });
        assert.equal(diagnose(root, { projectRoot: project }).ok, false);
    }
});
test('legacy configuration is inspected without migration and modern settings take precedence', t => {
    const { root, project } = fixture(t);
    write(project, 'cocos.config.json', { engineSdk: { path: './missing' } });
    assert.equal(diagnose(root, { projectRoot: project }).ok, true);
    fs.unlinkSync(path.join(project, 'settings/cocos.config.json'));
    assert.equal(diagnose(root, { projectRoot: project }).ok, false);
    assert.equal(fs.existsSync(path.join(project, 'cocos.config.json')), true);
});
test('missing required files and unsupported versions produce failed reports', t => {
    const { root, engine } = fixture(t);
    fs.unlinkSync(path.join(engine, policy.requiredFiles.web[0]));
    assert.match(diagnose(root).errors[0], /Missing required web file/);
    write(engine, 'package.json', { version: '5.0.0' });
    fs.unlinkSync(path.join(engine, 'engine-sdk.json'));
    const report = diagnose(root);
    assert.equal(report.engine.version, '5.0.0');
    assert.match(report.errors[0], /Outside stable range/);
});
test('experimental and unrecorded source revisions are explicit warnings', t => {
    const { root, engine } = fixture(t);
    fs.unlinkSync(path.join(engine, 'engine-sdk.json'));
    write(engine, 'package.json', { version: '4.1.0-alpha.1' });
    const report = diagnose(root);
    assert.equal(report.ok, true);
    assert.equal(report.engine.revision, null);
    assert.equal(report.warnings.length, 2);
});
test('initialization records retain exact identity without rewriting project pins', t => {
    const { root, project } = fixture(t);
    const file = path.join(project, 'settings/cocos.config.json');
    const before = fs.readFileSync(file);
    const selected = diagnose(root, { projectRoot: project }).engine;
    recordInitialization(root, project, { ...selected, distribution: 'legacy' });
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(project, 'temp/engine-sdk.json'))).engine, 'distribution'), false);
    recordInitialization(root, project, selected);
    const report = diagnose(root, { projectRoot: project });
    assert.equal(report.lastInitialization.engine.revision, 'custom-42');
    assert.equal(report.lastInitialization.cli.version, '1.2.3');
    write(project, 'temp/engine-sdk.json', { ...report.lastInitialization, engine: { ...selected, distribution: 'legacy' } });
    assert.equal(Object.hasOwn(diagnose(root, { projectRoot: project }).lastInitialization.engine, 'distribution'), false);
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readdirSync(path.join(project, 'temp')), ['engine-sdk.json']);
    recordInitialization(root, project, { ...selected, revision: 'previous' });
    assert.match(diagnose(root, { projectRoot: project }).warnings[0], /differs/);
    write(project, 'temp/engine-sdk.json', {});
    assert.match(diagnose(root, { projectRoot: project }).warnings[0], /Cannot read/);
});
test('doctor --json emits one parseable report and meaningful exit codes', t => {
    const { engine, project } = fixture(t);
    const invoke = args => spawnSync(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), '-e',
        "require('./src/core/base/sentry').initSentry = () => {}; process.argv = [process.execPath, 'cocos', ...process.argv.slice(1)]; require('./src/cli');", '--', ...args],
    { cwd: cli, encoding: 'utf8', timeout: 45000 });
    const good = invoke(['doctor', '--json', '--project', project, '--engine-path', engine]);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).engine.revision, 'custom-42');
    const bad = invoke(['doctor', '--json', '--engine-path', path.join(engine, 'missing')]);
    assert.equal(bad.status, 1, bad.stderr);
    assert.equal(JSON.parse(bad.stdout).ok, false);
});
