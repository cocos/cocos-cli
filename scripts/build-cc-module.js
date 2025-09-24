const fse = require('fs-extra');
const path = require('path');
const { spawnSync } = require('child_process');
const utils = require('./utils');

function readDirRecurse(root, visitor, relativeRoot = '') {
    const fileNames = fse.readdirSync(root);
    for (const fileName of fileNames) {
        const file = path.join(root, fileName);
        const stat = fse.statSync(file);
        const relative = path.join(relativeRoot, fileName);
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
    utils.logTitle('Build node_modules/cc');

    console.time('Bundle node_modules/cc');

    const { engine } = require('../.user.json');

    const ccTemplatePath = path.join(__dirname, '../static/engine/cc-template.d.ts');
    const ccPath = path.join(__dirname, '../static/engine/cc-module/cc.d.ts');

    const ccdPath = path.join(engine, './bin/.declarations/cc.d.ts');
    const ccEditorExportsDtsPath = path.join(engine, './bin/.declarations/cc.editor.d.ts');

    fse.writeFileSync(
        ccPath,
        `/// <reference path="${ccdPath}"/>
/// <reference path="${ccEditorExportsDtsPath}"/>\n
${fse.readFileSync(ccTemplatePath)}\n
`
            .replace(/\\/g, '\\\\'),
    );

    // generate static/cc-module/editor
    const proxyRoot = path.join(__dirname, '../static/engine/cc-module/editor');
    readDirRecurse(path.join(engine, 'editor', 'exports'), (relativePath) => {
        const extReplaced = relativePath.endsWith('.ts') ? relativePath.substr(0, relativePath.length - 3) : relativePath;
        const modulePath = path.join(proxyRoot, `${extReplaced}.js`);
        const moduleCode = generateProxyModule(relativePath);
        fse.outputFileSync(
            modulePath,
            moduleCode,
            { encoding: 'utf8' },
        );
    });

    const sourceDir = path.join(__dirname, '../static/engine/cc-module');
    const targetDir = path.join(__dirname, '../node_modules/cc');

    console.log('sourceDir:', sourceDir);
    console.log('targetDir:', targetDir);
    if (fse.existsSync(targetDir)) {
        fse.removeSync(targetDir);
        console.log('Clean:', targetDir);
    }

    const binDir = path.join(__dirname, '../node_modules', '.bin');
    const cmd = path.join(binDir, process.platform === 'win32' ? 'tsc.cmd': 'tsc');
    spawnSync(cmd, { cwd: sourceDir, shell: true, stdio: 'inherit' });
    console.log('Compilation:', sourceDir);

    utils.copyDirWithIgnore(sourceDir, targetDir, ['.ts', '.gitignore', 'tsconfig.json', '.DS_Store', '!.d.ts']);

    console.log('Copy', targetDir);

    console.timeEnd('Bundle node_modules/cc');
})();
