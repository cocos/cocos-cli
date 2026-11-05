'use strict';
module.exports = require('../shared/legacy-compiler.cjs')({
    id: 'cocos-3.5-runtime', cacheVersion: 'cocos-3.5-cli-2', cacheDirectory: 'dev-cli-3.5',
    configureQuery(query, engine) { query.constantManager._getConstantConfig = () => require('./constants.cjs')(engine); },
    prepareInput(input, engine) {
        const fs = require('node:fs');
        const path = require('node:path');
        const configPath = path.join(input, 'cc.config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.constants ??= require('./constants.cjs')(engine);
        config.optimizeDecorators ??= { fieldDecorators: [], editorDecorators: [] };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        fs.copyFileSync(path.join(__dirname, 'material-editor.ts'), path.join(input, 'editor/exports/material.ts'));
        fs.writeFileSync(path.join(input, 'editor/exports/cli-host.ts'), "export { EmptyDevice } from '../../cocos/core/gfx/empty/empty-device';\nexport { default as shaderAssembly } from '../../cocos/core/builtin/shader-source-assembly';\nexport { glsl4 } from '../../cocos/core/builtin/shader-sources/glsl4';\n");
        const entry = path.join(input, 'editor/exports/2d-misc.ts');
        const implementation = path.join(input, 'cocos/2d/assembler/graphics/webgl/earcut.ts');
        if (!fs.existsSync(entry) && fs.existsSync(implementation)) {
            fs.writeFileSync(entry, "export { earcut } from '../../cocos/2d/assembler/graphics/webgl/earcut';\n");
        }
    },
    supportsVersion: version => typeof version === 'string' && /^3\.5\.[0-2]$/.test(version),
});
