const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getEditorMaterials } = require('../../adapters/engine/shared/editor-materials.cjs');
for (const [prefix, count] of [['editor', 4], ['internal/editor', 5]]) {
    test(`material descriptors: ${prefix}`, () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-materials-'));
        try {
            const dir = path.join(root, 'editor/assets/effects', prefix);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'gizmo.effect'), 'CCEffect %{\n  techniques:\n' + '  - passes:\n    - vert: test\n'.repeat(count) + '}%');
            fs.writeFileSync(path.join(dir, 'terrain-circle-brush.effect'), 'CCEffect %{\n  techniques:\n  - name: transparent\n    passes:\n    - vert: test\n}%');
            const result = JSON.parse(JSON.stringify(getEditorMaterials({ path: root })));
            assert.equal(result.effects.gizmo.effectName, prefix + '/gizmo');
            assert.equal(result.effects.gizmo.triangleDepthTechnique, count === 4 ? 0 : 4);
            assert.equal(result.effects.gizmo.triangleDepthOverride, count === 4);
            assert.equal(result.effects['terrain-circle-brush'].supported, true);
            assert.equal(result.effects['light-probe-visualization'].supported, false);
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
}

test('legacy preview loads project scripts; the default engine keeps its preview hook', () => {
    const registry = require('../../adapters/engine/registry.cjs').createEngineBackendRegistry();
    const legacy = registry.resolve({ path: '.', version: '3.6.0' });
    assert.deepEqual(legacy.getPreviewScriptPackages(), ['cce:/internal/x/prerequisite-imports']);
    const current = registry.resolve({ path: '.', version: '4.0.0-beta.0' });
    assert.equal(current.getPreviewScriptPackages, undefined);
});
