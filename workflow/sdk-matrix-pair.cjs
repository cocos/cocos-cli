/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, console */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
async function main() {
    const engine = read(path.join(config.engine, 'engine-sdk.json'));
    const cli = read(path.join(config.cli, 'cli-sdk.json'));
    assert.equal(fs.existsSync(path.join(config.cli, 'packages/engine')), false, 'CLI SDK must not embed Engine SDK');
    fs.mkdirSync(path.join(config.project, 'settings'), { recursive: true });
    fs.writeFileSync(path.join(config.project, 'settings/cocos.config.json'), JSON.stringify({ version: '1.0.0',
        engineSdk: { path: config.engine, version: engine.engineVersion, revision: engine.revision },
    }, null, 2));
    // Test payloads must not send application telemetry.
    require(path.join(config.cli, 'dist/core/base/sentry.js')).initSentry = () => {};
    const { diagnose } = require(path.join(config.cli, 'workflow/engine-diagnostics.js'));
    const diagnosis = diagnose(config.cli, { projectRoot: config.project });
    assert.equal(diagnosis.ok, true, JSON.stringify(diagnosis.errors));
    const Launcher = require(path.join(config.cli, 'dist/core/launcher.js')).default;
    const launcher = new Launcher(config.project);
    {
        await launcher.import();
        const { Engine } = require(path.join(config.cli, 'dist/core/engine/index.js'));
        assert.equal(Engine.getInfo().typescript.path, config.engine);
        assert.equal(Engine.getInfo().revision, engine.revision);
        assert.ok((await Engine.queryLayerBuiltin()).length);
        assert.ok(Array.isArray(await Engine.querySortingLayerBuiltin()));
        const result = await launcher.build('web-desktop', {
            outputName: 'sdk-matrix', buildPath: 'project://build', debug: true,
            startScene: 'f895c111-fd50-4ed6-b07c-f514972cfbd1',
            scenes: [{ url: 'db://assets/scene-2d.scene', uuid: 'f895c111-fd50-4ed6-b07c-f514972cfbd1' }],
        });
        assert.equal(result.code, 0, result.reason);
        const output = path.join(config.project, 'build/sdk-matrix');
        // Same output contract as e2e/helpers/test-utils.ts, asserted rather than warned.
        for (const file of ['index.html', 'assets', 'src']) assert.ok(fs.existsSync(path.join(output, file)), `Missing build output ${file}`);
        assert.ok(fs.statSync(path.join(output, 'index.html')).size > 0);
        const record = read(path.join(config.project, 'temp/engine-sdk.json'));
        assert.equal(record.engine.revision, engine.revision);
        fs.writeFileSync(config.result, JSON.stringify({ status: 'passed', cliVersion: cli.cliVersion, cliRevision: cli.revision,
            engineVersion: engine.engineVersion, engineRevision: engine.revision, output,
            checks: ['identity', 'runtime-interfaces', 'asset-import', 'web-desktop-build', 'build-output'] }, null, 2));
    }
}
// Match cocos build: each invocation owns its process and exits after checking outputs.
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
