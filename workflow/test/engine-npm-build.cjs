'use strict';

// Explicit integration runner: consumes an installed tarball, never the engine
// checkout. Build through the same worker entry point as project publishing.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseArgs } = require('node:util');
const { resolveEngineSelection } = require('../engine-path');
const { resolveTargetComponent } = require('../engine-sdk');
const { buildEngineCommand } = require('../../dist/core/builder/worker/builder/asset-handler/script/build-engine');

async function verifyPackageBuild(project, output) {
    project = fs.realpathSync(project);
    const config = JSON.parse(fs.readFileSync(path.join(project, 'settings/cocos.config.json'), 'utf8')).engineSdk;
    const selection = resolveEngineSelection(path.resolve(__dirname, '../..'), { projectRoot: project, projectConfig: config, prepareEditor: true });
    assert.ok((selection.packageRoot || selection.path).includes('node_modules'), 'Integration must use the installed npm package');
    const results = [];
    for (const target of ['web-mobile', 'wechatgame', 'taobao-mini-game', 'openpaas']) {
        const component = resolveTargetComponent(selection, target, project, config, { platform: { 'web-mobile': 'HTML5', wechatgame: 'WECHAT', 'taobao-mini-game': 'TAOBAO_MINIGAME', openpaas: 'SUDV2' }[target] });
        const dest = path.join(path.resolve(output), target);
        await buildEngineCommand({ engine: selection.path, out: dest, metaFile: path.join(dest, 'build-meta.json'),
            platform: component.target.platform, features: ['base', 'gfx-webgl', '2d', 'ui'], mode: 'BUILD',
            moduleFormat: 'esm', compress: false, split: false, sourceMap: true, inlineEnum: false,
            flags: { DEBUG: false } });
        const meta = JSON.parse(fs.readFileSync(path.join(dest, 'build-meta.json'), 'utf8'));
        const codeFile = path.join(dest, meta.exports.cc);
        const code = fs.readFileSync(codeFile, 'utf8');
        assert.ok(code.length > 100000 && code.includes('cc.Node'), 'Build must contain real engine code');
        assert.ok(!code.includes('@cocos/engine/cocos/'), 'No unresolved checkout aliases');
        const map = JSON.parse(fs.readFileSync(codeFile + '.map', 'utf8'));
        const sources = map.sources.map(file => file.replaceAll('\\', '/'));
        assert.ok(!sources.some(file => /\/cocos\/(spine|physics)\//.test(file)), 'Disabled Spine/physics implementation entered the build');
        // Mesh data/utility code is shared by the 2D renderer. Directory names
        // alone cannot classify a dependency as an optional 3D feature.
        const sharedMeshModules = new Set(['reflection-probe/reflection-probe-enum.js', 'misc/buffer.js', 'misc/read-mesh.js',
            'misc/buffer-blob.js', 'assets/morph-rendering.js', 'misc/mesh-codec.js', 'assets/mesh.js', 'misc/create-mesh.js']);
        assert.ok(!sources.some(file => file.includes('/cocos/3d/') && !sharedMeshModules.has(file.split('/cocos/3d/')[1])), 'Optional 3D feature entered the 2D build');
        assert.ok(!sources.some(file => /\/pal\/[^/]+\/native\//.test(file)), 'Native PAL implementation entered the build');
        if (target !== 'web-mobile') {
            assert.ok(sources.some(file => /\/pal\/input\/minigame\//.test(file)), 'Missing minigame PAL');
            assert.ok(!sources.some(file => /\/pal\/input\/web\//.test(file)), 'Browser PAL entered minigame build');
        } else assert.ok(!sources.some(file => /\/pal\/input\/minigame\//.test(file)), 'Minigame PAL entered browser build');
        results.push({ target, platform: component.target.platform, bytes: fs.statSync(codeFile).size, sourceModules: sources.length });
    }
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ engine: selection, results }, null, 2));
    return results;
}

module.exports = { verifyPackageBuild };
if (require.main === module) {
    const { values } = parseArgs({ options: { project: { type: 'string' }, output: { type: 'string' } } });
    if (!values.project || !values.output) throw new Error('Usage: node workflow/test/engine-npm-build.cjs --project PROJECT --output OUTPUT');
    verifyPackageBuild(values.project, values.output).then(result => console.log('Verified npm SDK builds:', result)).catch(error => { console.error(error); process.exitCode = 1; });
}
