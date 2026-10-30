/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console */
// Actual SDK loading smoke test; each invocation uses a fresh process and temporary project.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const cli = fs.realpathSync(process.argv[2]);
const engine = fs.realpathSync(process.argv[3]);
const mode = process.argv[4] || 'project';
const pkg = JSON.parse(fs.readFileSync(path.join(engine, 'package.json'), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(path.join(engine, 'engine-sdk.json'), 'utf8'));
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-sdk-load-'));
const engineConfig = { path: mode === 'explicit' ? './intentionally-missing' : engine, version: pkg.version, revision: metadata.revision };
fs.mkdirSync(path.join(project, 'settings'));
fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'sdk-load-smoke', version: '1.0.0' }));
fs.writeFileSync(path.join(project, 'settings/cocos.config.json'), JSON.stringify({ version: '1.0.0', engineSdk: engineConfig }));
const builtin = path.join(cli, 'packages/engine');
const original = Module._resolveFilename;
Module._resolveFilename = function (...args) {
    const resolved = original.apply(this, args);
    if (engine !== builtin && typeof resolved === 'string' && resolved.startsWith(builtin + path.sep)) throw new Error(`Loaded bundled engine instead of selected SDK: ${resolved}`);
    return resolved;
};
(async () => {
    try {
        const api = require(path.join(cli, 'dist/lib/engine/engine.js'));
        await api.init(project, mode === 'explicit' ? { enginePath: engine } : {});
        const info = await api.getInfo();
        assert.equal(info.typescript.path, engine);
        assert.equal(info.version, pkg.version);
        assert.equal(info.revision, metadata.revision);
        const record = JSON.parse(fs.readFileSync(path.join(project, 'temp/engine-sdk.json'), 'utf8'));
        assert.equal(record.status, 'initialized');
        assert.equal(record.engine.path, engine);
        assert.equal(record.engine.version, pkg.version);
        assert.equal(record.engine.revision, metadata.revision);
        assert.equal(record.cli.version, JSON.parse(fs.readFileSync(path.join(cli, 'package.json'), 'utf8')).version);
        const savedConfig = JSON.parse(fs.readFileSync(path.join(project, 'settings/cocos.config.json'), 'utf8'));
        assert.deepEqual(savedConfig.engineSdk, engineConfig);
        console.log(JSON.stringify({ mode, engine: info.typescript.path, version: info.version, revision: info.revision, initialized: true }));
    } finally {
        fs.rmSync(project, { recursive: true, force: true });
    }
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
