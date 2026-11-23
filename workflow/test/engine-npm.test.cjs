const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { resolveEngineSelection } = require('../engine-path');
const { readManifest, resolveTargetComponent } = require('../engine-sdk');
const { assembleEditorView } = require('../engine-sdk-view');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-npm-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function write(root, file, value) {
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(value));
}
function pkg(root, name, targets = { 'web-mobile': {} }, overrides = {}) {
    const dest = path.join(root, 'node_modules', name);
    write(dest, 'package.json', { name, version: '4.0.0', exports: { './engine-sdk.json': './engine-sdk.json' } });
    write(dest, 'engine-sdk.json', { schemaVersion: 2, kind: 'engine', engineVersion: '4.0.0', engineRevision: 'r1', sdkReleaseId: 'release1', component: 'web', entries: {}, targets, ...overrides });
    return fs.realpathSync(dest);
}

test('resolves an exported SDK manifest without package.json being exported', t => {
    const root = fixture(t);
    const dest = pkg(root, '@cocos/engine-web');
    const result = resolveEngineSelection(root, { projectRoot: root, projectConfig: { package: '@cocos/engine-web' } });
    assert.equal(result.path, dest);
    assert.equal(result.packageRoot, dest);
    assert.equal(result.revision, 'r1');
    assert.equal(result.source, 'project');
});

test('missing package and conflicting sources fail without a fallback', t => {
    const root = fixture(t);
    assert.throws(() => resolveEngineSelection(root, { projectRoot: root, projectConfig: { package: '@cocos/missing' } }), /ENGINE_SDK_PACKAGE/);
    assert.throws(() => resolveEngineSelection(root, { projectConfig: { path: '.', package: 'engine' } }), /mutually exclusive/);
});

test('targets resolve on demand and reject mixed release identities', t => {
    const root = fixture(t);
    const dest = pkg(root, '@cocos/engine-web');
    const selection = resolveEngineSelection(root, { projectRoot: root, projectConfig: { package: '@cocos/engine-web' } });
    assert.equal(resolveTargetComponent(selection, 'web-mobile').root, dest);
    assert.throws(() => resolveTargetComponent(selection, 'ohos'), /ENGINE_SDK_TARGET/);
    pkg(root, '@cocos/engine-native-ohos', { ohos: {} });
    const config = { platforms: { ohos: { package: '@cocos/engine-native-ohos' } } };
    assert.equal(resolveTargetComponent(selection, 'ohos', root, config).manifest.sdkReleaseId, 'release1');
    pkg(root, '@cocos/engine-native-ohos', { ohos: {} }, { engineRevision: 'different' });
    assert.throws(() => resolveTargetComponent(selection, 'ohos', root, config), /engineRevision differs/);
});

test('profile paths and engine root cannot escape a package', t => {
    const root = fixture(t);
    const dest = pkg(root, 'engine', {}, { entries: { engineRoot: '../outside' } });
    assert.throws(() => readManifest(dest), /ENGINE_SDK_PATH/);
    pkg(root, 'engine', {}, { profiles: { web: { entry: '../outside.js' } } });
    assert.throws(() => readManifest(dest), /ENGINE_SDK_PATH/);
});

test('explicit paths retain priority over a missing npm package', t => {
    const root = fixture(t);
    const dest = pkg(root, 'engine');
    assert.equal(resolveEngineSelection(root, { explicitPath: dest, projectRoot: root, projectConfig: { package: 'missing' } }).path, dest);
});

test('editor components assemble outside installed packages and reject identity/conflict errors', t => {
    const root = fixture(t);
    const web = pkg(root, '@cocos/engine-web');
    write(web, 'cocos/runtime.js', 'web module');
    const editor = pkg(root, '@cocos/engine-editor', {}, { component: 'editor', capabilities: ['editor'] });
    write(editor, 'editor/exports/material.js', 'editor module');
    const source = { package: '@cocos/engine-editor' };
    const output = assembleEditorView(web, source, root);
    assert.ok(output.startsWith(path.join(root, 'temp')));
    assert.equal(fs.existsSync(path.join(web, 'editor/exports/material.js')), false);
    assert.equal(fs.readFileSync(path.join(output, 'editor/exports/material.js'), 'utf8'), '"editor module"');
    assert.equal(readManifest(output).component, 'composite');
    assert.equal(assembleEditorView(web, source, root), output);
    pkg(root, '@cocos/engine-editor', {}, { component: 'editor', engineRevision: 'wrong' });
    assert.throws(() => assembleEditorView(web, source, root), /engineRevision differs/);
});

test('read-only selection does not materialize an editor view', t => {
    const root = fixture(t);
    pkg(root, '@cocos/engine-web');
    const projectConfig = { package: '@cocos/engine-web', editor: { package: '@cocos/not-installed' } };
    assert.equal(resolveEngineSelection(root, { projectRoot: root, projectConfig }).version, '4.0.0');
    assert.equal(fs.existsSync(path.join(root, 'temp')), false);
    assert.throws(() => resolveEngineSelection(root, { projectRoot: root, projectConfig, prepareEditor: true }), /Cannot resolve/);
});

test('plugin platform resolution accepts new target IDs and checks required capabilities', t => {
 const root=fixture(t); const dest=pkg(root,'engine',{}, { platformResolution:'plugin', platformConstants:['SUDV2'], entries:{featureConfig:'cc.config.json'} });
 write(dest,'cc.config.json',{constants:{SUDV2:{type:'boolean',value:false}}});
 const selection={path:dest,version:'4.0.0'};
 assert.equal(resolveTargetComponent(selection,'openpaas',root,{}, {platform:'SUDV2'}).target.platform,'SUDV2');
 assert.throws(()=>resolveTargetComponent(selection,'openpaas',root,{}, {platform:'ANDROID'}),/ENGINE_SDK_PLATFORM/);
 assert.throws(()=>resolveTargetComponent(selection,'openpaas',root,{}, {platform:'SUDV2',resources:['missing.js']}),/ENOENT/);
});

test('host initialization explains the missing matching Editor component', t => {
 const root=fixture(t);pkg(root,'@cocos/engine-web');
 assert.throws(()=>resolveEngineSelection(root,{projectRoot:root,projectConfig:{package:'@cocos/engine-web'},prepareEditor:true}),/ENGINE_SDK_EDITOR_REQUIRED/);
});

 test('CLI-local package default does not require game dependencies and preserves overrides', t => {
    const root = fixture(t), project = path.join(root, 'game');
    fs.mkdirSync(project);
    const builtin = pkg(root, '@cocos/engine-web');
    write(root, 'config.local.json', { engineSdk: { package: '@cocos/engine-web' } });
    const selected = resolveEngineSelection(root, { projectRoot: project });
    assert.equal(selected.packageRoot, builtin);
    assert.equal(selected.source, 'default');
    const custom = pkg(project, '@cocos/custom-engine');
    assert.equal(resolveEngineSelection(root, { projectRoot: project, projectConfig: { package: '@cocos/custom-engine' } }).packageRoot, custom);
    assert.throws(() => resolveEngineSelection(root, { projectRoot: project, projectConfig: { package: '@cocos/missing' } }), /ENGINE_SDK_PACKAGE/);
 });

test('installed CLI npm engine wins over a configured source without requiring local SDK config', t => {
 const root=fixture(t), project=path.join(root,'game');fs.mkdirSync(project);
 const builtin=pkg(root,'@cocos/engine-web');
 write(root,'config.local.json',{enginePath:'missing-custom-engine'});
 assert.equal(resolveEngineSelection(root,{projectRoot:project}).packageRoot,builtin);
 assert.throws(()=>resolveEngineSelection(root,{projectRoot:project,prepareEditor:true}),/Cannot resolve/);
});
test('without npm packages, custom source precedes packages/engine', t => {
 const root=fixture(t);const custom=pkg(root,'custom');
 write(root,'config.local.json',{enginePath:path.relative(root,custom)});
 assert.equal(resolveEngineSelection(root).path,custom);
 fs.unlinkSync(path.join(root,'config.local.json'));
 write(root,'packages/engine/package.json',{version:'4.0.0'});
 assert.equal(resolveEngineSelection(root).path,fs.realpathSync(path.join(root,'packages/engine')));
});

test('installation reuses prepared npm profiles even when local source lacks NODEJS', t => {
 const root=fixture(t);
 const web=pkg(root,'@cocos/engine-web');
 const editor=pkg(root,'@cocos/engine-editor',{}, {component:'editor'});
 write(root,'config.local.json',{enginePath:'legacy-source'});
 write(root,'legacy-source/package.json',{version:'3.7.2'});
 write(root,'legacy-source/cc.config.json',{constants:{}});
 for(const name of ['cc.d.ts','cc.editor.d.ts'])write(web,'bin/.declarations/'+name,{});
 for(const name of ['editor','web'])write(editor,'bin/.cache/dev-cli/'+name+'/loader.js',{});
 const {resolvePreparationEngine}=require('../prepare-engine-selection');
 const selected=resolvePreparationEngine(root);
 assert.equal(selected.packageRoot,web);
 assert.ok(fs.existsSync(path.join(selected.path,'bin/.cache/dev-cli/editor/loader.js')));
 assert.equal(resolvePreparationEngine(root,path.join(root,'legacy-source')).version,'3.7.2');
});
test('installation rejects incomplete npm profiles without compiling a source fallback', t => {
 const root=fixture(t);
 pkg(root,'@cocos/engine-web');pkg(root,'@cocos/engine-editor',{}, {component:'editor'});
 const {resolvePreparationEngine}=require('../prepare-engine-selection');
 assert.throws(()=>resolvePreparationEngine(root),/ENGINE_SDK_PREPARE_INCOMPLETE/);
});
