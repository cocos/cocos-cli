const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const problems = [];
if (manifest.exports['./host/*']) problems.push('Unrestricted host export');
for (const [key, value] of Object.entries(manifest.exports)) {
    if (!key.startsWith('./host/')) continue;
    for (const file of Object.values(value)) if (!fs.existsSync(path.join(root, file))) problems.push('Missing export: ' + file);
}
const privatePaths = [
    'core/scene/scene-process/service/operation.js',
    'core/scene/scene-process/service/operation.d.ts',
    'core/scene/scene-process/service/operation/operation-manager.js',
    'core/scene/scene-process/service/operation/operation-manager.d.ts',
    'core/scene/scene-process/service/camera',
    'core/scene/scene-process/service/gizmo',
    'core/scene/scene-process/service/preview',
];
for (const file of privatePaths) if (fs.existsSync(path.join(root, 'dist', file))) problems.push('Private artifact in CLI dist: ' + file);
for (const file of ['scene-bundle.js', 'scene-bundle.js.map', 'input-bridge.js', 'preview-inspect.js']) {
    if (fs.existsSync(path.join(root, 'static/web', file))) problems.push('Private static asset: ' + file);
}
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
else console.log('Scene runtime boundary passed: explicit host exports resolve; checked private artifacts are absent.');
