'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { resolveEngineSelection } = require('./engine-path');

// Installation and runtime must resolve the same CLI-default SDK.
function resolvePreparationEngine(root, explicitPath) {
    const selection = resolveEngineSelection(root, { explicitPath, projectRoot: root, prepareEditor: true });
    if (selection.packageRoot) {
        for (const file of ['bin/.declarations/cc.d.ts', 'bin/.declarations/cc.editor.d.ts',
            'bin/.cache/dev-cli/editor/loader.js', 'bin/.cache/dev-cli/web/loader.js']) {
            if (!fs.statSync(path.join(selection.path, file), { throwIfNoEntry: false })?.isFile()) {
                throw new Error('[ENGINE_SDK_PREPARE_INCOMPLETE] Missing prepared SDK file: ' + file);
            }
        }
    }
    return selection;
}
module.exports = { resolvePreparationEngine };
