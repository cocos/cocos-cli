const { outputFileSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync, removeSync } = require('fs-extra');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { copySync, logTitle } = require('./utils');

function readDirRecurse(root, visitor, relativeRoot = '') {
    const fileNames = readdirSync(root);
    for (const fileName of fileNames) {
        const file = join(root, fileName);
        const stat = statSync(file);
        const relative = join(relativeRoot, fileName);
        if (stat.isFile()) {
            visitor(relative);
        } else {
            readDirRecurse(file, visitor, relative);
        }
    }
}

function generateProxyModule(relativePath) {
    // Normalized path processing
    const noExt = relativePath.replace(/\.ts$/, '');
    const normalized = noExt.replace(/\\/g, '\\\\');
    const moduleId = `cc/editor/${normalized}`;

    // Generate code using template string
    return `/**
 * Auto-generated proxy module (use node ./scripts/build-cc-module.js);
 */
const modsMgr = require('cc/mods-mgr');

/**
 * Proxy for ${moduleId}
 * @type {import('${moduleId}')}
 */
module.exports = modsMgr.syncImport('${moduleId}');
`;
}

(() => {
    logTitle('Build node_modules/cc');

    console.time('Bundle node_modules/cc');

    const { engine } = require('../.user.json');

    const ccTemplatePath = join(__dirname, '../static/engine/cc-template.d.ts');
    const ccPath = join(__dirname, '../static/engine/cc-module/cc.d.ts');

    const ccdPath = join(engine, './bin/.declarations/cc.d.ts');
    const ccEditorExportsDtsPath = join(engine, './bin/.declarations/cc.editor.d.ts');

    writeFileSync(
        ccPath,
        `/// <reference path="${ccdPath}"/>
/// <reference path="${ccEditorExportsDtsPath}"/>\n
${readFileSync(ccTemplatePath)}\n
`
            .replace(/\\/g, '\\\\'),
    );

    // generate static/cc-module/editor
    const proxyRoot = join(__dirname, '../static/engine/cc-module/editor');
    readDirRecurse(join(engine, 'editor', 'exports'), (relativePath) => {
        const extReplaced = relativePath.endsWith('.ts') ? relativePath.substr(0, relativePath.length - 3) : relativePath;
        const modulePath = join(proxyRoot, `${extReplaced}.js`);
        const moduleCode = generateProxyModule(relativePath);
        outputFileSync(
            modulePath,
            moduleCode,
            { encoding: 'utf8' },
        );
    });

    const sourceDir = join(__dirname, '../static/engine/cc-module');
    const targetDir = join(__dirname, '../node_modules/cc');

    console.log('sourceDir:', sourceDir);
    console.log('targetDir:', targetDir);
    if (existsSync(targetDir)) {
        removeSync(targetDir);
        console.log('Clean:', targetDir);
    }

    const cmd = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
    spawnSync(cmd, { cwd: sourceDir });
    console.log('Compilation:', sourceDir);

    copySync(sourceDir, targetDir, ['.ts', '.gitignore', 'tsconfig.json', '.DS_Store', '!.d.ts']);

    console.log('Copy', targetDir);

    console.timeEnd('Bundle node_modules/cc');
})();
