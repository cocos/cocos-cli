'use strict';
module.exports = require('../shared/legacy-compiler.cjs')({
    id: 'cocos-3.6-runtime', cacheVersion: 'cocos-3.6-cli-2', cacheDirectory: 'dev-cli-3.6',
    prepareInput(input) {
        const fs = require('node:fs');
        const path = require('node:path');
        const configPath = path.join(input, 'cc.config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.optimizeDecorators ??= { fieldDecorators: [], editorDecorators: [] };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        fs.copyFileSync(path.join(__dirname, 'material-editor.ts'), path.join(input, 'editor/exports/material.ts'));
        fs.writeFileSync(path.join(input, 'editor/exports/color-utils.ts'), "export { linearToSrgb8Bit } from '../../cocos/core/math/color';\n");
        fs.writeFileSync(path.join(input, 'editor/exports/custom-pipeline.ts'), ['graph','types','layout-graph'].map(name => "export * from '../../cocos/core/pipeline/custom/" + name + "';").join('\n'));
        fs.copyFileSync(path.join(__dirname, 'bake-settings.ts'), path.join(input, 'editor/exports/cli-bake-settings.ts'));
        fs.writeFileSync(path.join(input, 'editor/exports/cli-host.ts'), [
            "export { EmptyDevice } from '../../cocos/core/gfx/empty/empty-device';",
            "import { MeshRenderer } from '../../cocos/3d/framework/mesh-renderer';",
            "import { SkinnedMeshRenderer, SkinnedMeshBatchRenderer } from '../../cocos/3d/skinned-mesh-renderer';",
            "import { js, deserialize } from '../../cocos/core';",
            "import { installBakeSettingsCompatibility } from './cli-bake-settings';",
            "installBakeSettingsCompatibility({ js, deserialize, MeshRenderer, SkinnedMeshRenderer, SkinnedMeshBatchRenderer });",
        ].join('\n'));
        const entry = path.join(input, 'editor/exports/2d-misc.ts');
        const implementation = path.join(input, 'cocos/2d/assembler/graphics/webgl/earcut.ts');
        if (!fs.existsSync(entry) && fs.existsSync(implementation)) {
            fs.writeFileSync(entry, "export { earcut } from '../../cocos/2d/assembler/graphics/webgl/earcut';\n");
        }
    },
    supportsVersion: version => typeof version === 'string' && /^3\.6\.[0-3]$/.test(version),
});
