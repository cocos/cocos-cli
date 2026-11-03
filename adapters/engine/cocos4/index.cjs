const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const modules = Object.freeze([
    'cc', 'cc/editor/populate-internal-constants', 'cc/editor/serialization',
    'cc/editor/new-gen-anim', 'cc/editor/embedded-player', 'cc/editor/reflection-probe',
    'cc/editor/lod-group-utils', 'cc/editor/material', 'cc/editor/2d-misc',
    'cc/editor/offline-mappings', 'cc/editor/custom-pipeline', 'cc/editor/animation-clip-migration',
    'cc/editor/exotic-animation', 'cc/editor/color-utils',
]);
const files = Object.freeze({
    editorLoader: 'bin/.cache/dev-cli/editor/loader.js', webLoader: 'bin/.cache/dev-cli/web/loader.js',
    webAdapter: 'bin/.editor/web-adapter.js', engineAdapter: 'bin/.editor/engine-adapter.js',
    editorExports: 'editor/exports', declarations: 'bin/.declarations/cc.d.ts', editorDeclarations: 'bin/.declarations/cc.editor.d.ts',
});
function runtime(selection) {
    const absolute = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, path.join(selection.path, file)]));
    return { engineRoot: selection.path, engineDev: path.join(selection.path, 'bin/.cache/dev-cli'), ...absolute, requiredModules: [...modules] };
}
function capability(selection, required) {
    const missing = required.filter(file => { try { return !fs.statSync(path.join(selection.path, file)).isFile(); } catch { return true; } });
    return { status: missing.length ? 'missing' : 'ready', missing, reason: missing.length ? 'Required SDK files are missing' : 'Static file checks passed; runtime interfaces have not been executed' };
}
module.exports = {
    id: 'cocos-4', protocolVersion: 1, implementationVersion: '1.0.0', runtimeSupport: 'implemented',
    supports: version => semver.parse(version)?.major === 4,
    runtime,
    compile: selection => ({ directory: path.join(selection.path, 'bin/.cache/dev-cli'), version: '4', compilerSource: 'packages/engine-compiler', compilerModule: 'packages/engine-compiler/dist/index.js' }),
    inspect(selection, policy) {
        const source = policy?.requiredFiles?.source || ['package.json', 'cc.config.json', 'cocos/core/platform/macro.ts', 'editor/engine-features/render-config.json'];
        const editor = [...source, files.editorLoader, files.webAdapter, files.engineAdapter, files.declarations, files.editorDeclarations];
        return {
            validation: 'static-only', runtimeInterfaces: 'not-tested', layout: runtime(selection),
            capabilities: {
                sourcePreparation: capability(selection, source), sceneEditing: capability(selection, editor),
                webPreview: capability(selection, [...editor, files.webLoader]),
                nativeBuild: { status: 'unverified', missing: [], reason: 'Native platform toolchains are not probed by discovery' },
            },
        };
    },
    validateRuntime(engine) {
        for (const key of ['game.init', 'physics.selector.switchTo', 'Node', 'Component']) {
            if (typeof key.split('.').reduce((value, part) => value?.[part], engine) !== 'function') throw new Error('Missing required interface cc.' + key);
        }
        if (!engine?.Layers || typeof engine.Layers.Enum !== 'object' || !engine.Layers.Enum) throw new Error('Missing required interface cc.Layers.Enum');
    },
};
