const fs = require('node:fs');
const path = require('node:path');
function getEditorMaterials(selection) {
    const effects = {};
    for (const name of ['gizmo', 'grid', 'grid-2d', 'grid-stroke', 'box-height-light', 'light-probe-visualization', 'terrain-select-brush', 'terrain-circle-brush', 'terrain-image-brush']) {
        const prefix = ['internal/editor', 'editor'].find(prefix => fs.existsSync(path.join(selection.path, 'editor/assets/effects', prefix, name + '.effect')));
        if (!prefix) { effects[name] = { supported: false, reason: 'Editor effect is unavailable: ' + name }; continue; }
        const source = fs.readFileSync(path.join(selection.path, 'editor/assets/effects', prefix, name + '.effect'), 'utf8');
        const count = (source.split('}%')[0].match(/^\s*(?:-\s*)?passes:/gm) || []).length;
        effects[name] = { supported: count > 0, effectName: prefix + '/' + name, techniqueCount: count,
            triangleDepthTechnique: name === 'gizmo' ? (count > 4 ? 4 : 0) : undefined,
            triangleDepthOverride: name === 'gizmo' && count === 4 };
    }
    return { protocolVersion: 1, effects };
}
module.exports = { getEditorMaterials };
