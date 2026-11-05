'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseArgs } = require('node:util');
const root = path.resolve(__dirname, '..');

async function smoke({ enginePath, experimental = false, compile = false, sceneWorker = false }) {
    if (!enginePath) throw new Error('--engine-path is required');
    enginePath = fs.realpathSync(enginePath);
    const selection = { path: enginePath, version: JSON.parse(fs.readFileSync(path.join(enginePath, 'package.json'), 'utf8')).version };
    if (experimental) process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS = '1';
    const { getEngineBackendAdapter } = require('../adapters/engine/registry.cjs');
    const adapter = getEngineBackendAdapter(selection);
    require('./engine-compatibility').checkEngineCompatibility(selection, root, 'source');
    if (compile) {
        const compiler = require(path.join(root, adapter.compile(selection).compilerModule));
        await compiler.compileEngine(enginePath);
        await compiler.compileEngine(enginePath, true);
    }
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-adapter-smoke-'));
    try {
        await require('../dist/core/configuration').configurationManager.initialize(project);
        const { Engine } = require('../dist/core/engine');
        await Engine.init(enginePath);
        await Engine.initEngine({ enableCustomPipeline: false, writablePath: project, importBase: project, nativeBase: project, ...(sceneWorker ? { editorMode: true, previewMode: true } : {}) });
        const cc = require('cc');
        assert.equal(cc.VERSION, require('./engine-test-identity.cjs').expectedRuntimeVersion(enginePath, selection.version), 'Loaded engine version must match the selected source');
        require('../dist/core/scene/runtime/core');
        const { Service } = require('../dist/core/scene/scene-process/service/core/decorator');
        const { sceneUtils } = require('../dist/core/scene/scene-process/service/scene/utils');
        const scene = new cc.Scene('AdapterSmoke');
        const parent = new cc.Node('Original');
        const child = new cc.Node('Child');
        scene.addChild(parent); parent.addChild(child);
        await sceneUtils.runScene(scene);
        Service.Editor.adoptRuntimeScene(scene);
        const nodePath = await Service.Node.getPathByUuid(parent.uuid);
        assert.equal(nodePath, 'Original');
        assert.equal(await Service.Node.setProperty({ nodePath, path: 'name', dump: { type: 'String', value: 'Renamed' } }), true);
        assert.equal(parent.name, 'Renamed');
        assert.equal(typeof parent.objFlags, 'number');
        assert.equal(parent.isRealValid, true);
        assert.equal(typeof cc.cclegacy._RF.reset, 'function');
        assert.equal(typeof cc.deserialize._macros, 'object');
        assert.equal(cc.cclegacy.internal.BufferBuilder, require('cc/editor/serialization').BufferBuilder);
        assert.equal(await Service.Node.getPathByUuid(child.uuid), 'Renamed/Child');
        await Service.Undo.undo(); assert.equal(parent.name, 'Original');
        await Service.Redo.redo(); assert.equal(parent.name, 'Renamed');
        const serialization = require('cc/editor/serialization');
        const binary = cc.cclegacy.internal.encodeCCONBinary(new serialization.CCON({ marker: 'adapter' }, [new Uint8Array([1, 2, 3])]));
        const decoded = cc.cclegacy.internal.decodeCCONBinary(binary);
        assert.deepEqual(decoded.document, { marker: 'adapter' });
        assert.deepEqual([...decoded.chunks[0]], [1, 2, 3]);
        const serialized = globalThis.EditorExtends.serialize(scene);
        const file = path.join(project, 'AdapterSmoke.scene');
        fs.writeFileSync(file, typeof serialized === 'string' ? serialized : JSON.stringify(serialized));
        const restored = cc.deserialize(JSON.parse(fs.readFileSync(file, 'utf8')));
        assert.equal(restored.children[0].name, 'Renamed');
        assert.equal(restored.children[0].children[0].name, 'Child');
        const prefab = new cc.Prefab(); prefab.data = new cc.Node('PrefabRoot');
        prefab.data.addChild(new cc.Node('PrefabChild'));
        const prefabText = globalThis.EditorExtends.serialize(prefab);
        const restoredPrefab = cc.deserialize(typeof prefabText === 'string' ? JSON.parse(prefabText) : prefabText);
        assert.equal(restoredPrefab.data.children[0].name, 'PrefabChild');
        Service.Editor.releaseRuntimeScene();
        return { adapter: adapter.id, engine: cc.VERSION, mode: sceneWorker ? 'scene-worker' : 'asset-host', operations: ['initialize', 'node-path', 'rename', 'descendant-path', 'undo', 'redo', 'scene-disk-roundtrip', 'prefab-roundtrip', 'ccon-binary-roundtrip'],
            browserPreview: 'not-tested', nativeBuild: 'not-tested' };
    } finally {
        // Only remove the temporary workspace created by this invocation.
        const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(project));
        if (!relative.startsWith('cocos-adapter-smoke-') || relative.includes(path.sep)) throw new Error('Unexpected smoke workspace path');
        fs.rmSync(project, { recursive: true, force: true });
    }
}
if (require.main === module) {
    const { values } = parseArgs({ options: { 'engine-path': { type: 'string' }, experimental: { type: 'boolean' }, 'scene-worker': { type: 'boolean' }, compile: { type: 'boolean' } } });
    smoke({ enginePath: values['engine-path'], experimental: values.experimental, compile: values.compile, sceneWorker: values['scene-worker'] })
        .then(result => { console.log(JSON.stringify(result)); process.exit(0); })
        .catch(error => { console.error(error); process.exit(1); });
}
module.exports = { smoke };
