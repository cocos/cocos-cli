const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { browser, browserOptions = {} } = require('./scene-api-entries.json');

const root = path.resolve(__dirname, '..');
const facadeRoot = 'core/scene/runtime/browser';

/** Stable package exports are generated artifacts, not hand-maintained source proxies. */
function browserFacadePath(id) {
    return facadeRoot + '/' + id;
}

function generateBrowserFacades() {
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    const { options, errors } = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, root);
    if (errors.length) throw new Error(ts.flattenDiagnosticMessageText(errors[0].messageText, '\n'));
    for (const [id, target] of Object.entries(browser)) {
        const relativePath = browserFacadePath(id);
        const file = path.join(root, 'dist', relativePath);
        const relative = path.relative(path.dirname(file), path.join(root, 'dist', target)).replace(/\\/g, '/');
        const specifier = target.startsWith('cc/') ? target : relative.startsWith('.') ? relative : './' + relative;
        const settings = browserOptions[id] || {};
        const source = '/** Generated from workflow/scene-api-entries.json. */\n' + (settings.sideEffect
            ? `import '${specifier}';\nexport {};\n`
            : `export ${settings.typeOnly ? 'type ' : ''}* from '${specifier}';\n` + (settings.default ? `export { default } from '${specifier}';\n` : ''));
        const compiled = ts.transpileModule(source, { compilerOptions: options, fileName: path.join(root, 'src', relativePath + '.ts') });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.js', compiled.outputText);
        fs.writeFileSync(file + '.d.ts', source);
    }
}

module.exports = { browserFacadePath, generateBrowserFacades };
