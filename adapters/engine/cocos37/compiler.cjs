'use strict';
module.exports = require('../shared/legacy-compiler.cjs')({
    id: 'cocos-3.7-runtime', cacheVersion: 'cocos-3.7-cli-3', cacheDirectory: 'dev-cli-3.7',
    prepareInput(input) {
        const fs = require('node:fs');
        const path = require('node:path');
        fs.copyFileSync(path.join(__dirname, 'material-editor.ts'), path.join(input, 'editor/exports/material.ts'));
        const entry = path.join(input, 'editor/exports/2d-misc.ts');
        const implementation = path.join(input, 'cocos/2d/assembler/graphics/webgl/earcut.ts');
        if (!fs.existsSync(entry) && fs.existsSync(implementation)) {
            fs.writeFileSync(entry, "export { earcut } from '../../cocos/2d/assembler/graphics/webgl/earcut';\n");
        }
    },
    supportsVersion: version => typeof version === 'string' && /^3\.7\.[0-4]$/.test(version),
});
