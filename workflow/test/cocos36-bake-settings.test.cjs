const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../adapters/engine/cocos36/bake-settings.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
vm.runInNewContext(code, { exports: exportsObject });
const { installBakeSettingsCompatibility: install } = exportsObject;
function fixture() {
    class Settings { constructor() { this.texture = null; this.uvParam = [0, 0, 0, 0]; } }
    class Mesh { constructor() { this.lightmapSettings = new Settings(); } }
    class Skin extends Mesh {}
    Mesh.__values__ = ['lightmapSettings']; Skin.__values__ = ['lightmapSettings'];
    const classes = { 'cc.ModelLightmapSettings': Settings, 'cc.MeshRenderer': Mesh, 'cc.SkinnedMeshRenderer': Skin };
    const engine = { MeshRenderer: Mesh, SkinnedMeshRenderer: Skin, js: {
        getClassByName: name => classes[name],
        getClassName: klass => Object.keys(classes).find(key => classes[key] === klass),
        setClassAlias: (klass, alias) => { classes[alias] = klass; },
    }, deserialize(data) {
        const Klass = classes[data.__type__];
        if (!Object.hasOwn(Klass, '__deserialize__')) Klass.__deserialize__ = (_reader, object, value) => {
            if (Object.hasOwn(value, 'lightmapSettings')) object.lightmapSettings = value.lightmapSettings;
        };
        return new Klass();
    } };
    return { engine, classes, Settings, Mesh, Skin };
}
test('uses the native settings class and does not change canonical serialization fields', () => {
    const { engine, classes, Settings, Mesh } = fixture();
    const fields = Mesh.__values__.slice();
    assert.equal(install(engine), true);
    assert.equal(classes['cc.ModelBakeSettings'], Settings);
    assert.deepEqual(Mesh.__values__, fields);
    const decode = Mesh.__deserialize__;
    install(engine);
    assert.equal(Mesh.__deserialize__, decode);
});
test('converts new bake settings for static and skinned renderers without mutating input', () => {
    const { engine, Settings, Mesh, Skin } = fixture(); install(engine);
    for (const Renderer of [Mesh, Skin]) {
        const settings = new Settings(); settings.uvParam = [1, 2, 3, 4]; settings.texture = { uuid: 'lightmap' };
        const input = Object.freeze({ bakeSettings: settings });
        const object = new Renderer();
        Renderer.__deserialize__({}, object, input, Renderer);
        assert.equal(object.lightmapSettings, settings);
        assert.deepEqual(object.lightmapSettings.uvParam, [1, 2, 3, 4]);
        assert.equal(input.lightmapSettings, undefined);
    }
});
test('retains legacy data and restores a native default for null settings', () => {
    const { engine, Settings, Mesh } = fixture(); install(engine);
    const legacy = new Settings(); const object = new Mesh();
    Mesh.__deserialize__({}, object, { lightmapSettings: legacy }, Mesh);
    assert.equal(object.lightmapSettings, legacy);
    Mesh.__deserialize__({}, object, { lightmapSettings: null }, Mesh);
    assert.ok(object.lightmapSettings instanceof Settings);
});
test('does not replace a real modern implementation or create an unsupported feature class', () => {
    const { engine, classes } = fixture(); class Modern {}
    classes['cc.ModelBakeSettings'] = Modern;
    assert.equal(install(engine), false);
    assert.equal(classes['cc.ModelBakeSettings'], Modern);
    assert.equal(classes['cc.LightProbeGroup'], undefined);
});
