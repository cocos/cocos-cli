const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveEngineSelection } = require('./engine-path');
const { readPolicy, describePolicy, checkEngineCompatibility } = require('./engine-compatibility');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
function engineIdentity(selection) {
    return { path: selection.path, version: selection.version, revision: selection.revision ?? null, source: selection.source };
}
function cliIdentity(root) {
    return { version: readJson(path.join(root, 'package.json')).version, path: path.resolve(root) };
}

/** Read only: use the same settings-before-legacy precedence as ConfigurationManager.
 * Do not initialize that manager here: diagnostics must not migrate or save a project.
 */
function projectSettings(projectRoot) {
    if (!projectRoot) return {};
    if (!fs.statSync(projectRoot).isDirectory()) throw new Error(`Not a project directory: ${projectRoot}`);
    const settings = path.join(projectRoot, 'settings/cocos.config.json');
    const legacy = path.join(projectRoot, 'cocos.config.json');
    const file = fs.existsSync(settings) ? settings : fs.existsSync(legacy) ? legacy : undefined;
    if (!file) return {};
    const config = readJson(file);
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Expected configuration object in ${file}`);
    return config.engineSdk === undefined ? {} : config.engineSdk;
}

function diagnose(root, { projectRoot, explicitPath } = {}) {
    const report = {
        schemaVersion: 1, ok: false, cli: cliIdentity(root),
        environment: { node: process.version, platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules },
        project: projectRoot ? path.resolve(projectRoot) : null,
        engine: null, compatibility: null, runtimeInterfaces: 'not-tested',
        lastInitialization: null, warnings: [], errors: [],
    };
    try {
        const policy = readPolicy(root);
        report.compatibility = { supported: describePolicy(policy), profile: 'web', passed: false };
        const projectConfig = projectSettings(report.project);
        const selection = resolveEngineSelection(root, { projectRoot: report.project, explicitPath, projectConfig });
        report.engine = engineIdentity(selection);
        const match = checkEngineCompatibility(selection, root, 'web');
        report.compatibility.passed = true;
        if (match.experimental) report.warnings.push('Experimental successor engine; full compatibility is not guaranteed.');
        if (!selection.revision) report.warnings.push('Engine revision is unrecorded; the version alone does not identify source changes.');
        report.ok = true;
    } catch (error) { report.errors.push(error.message); }
    if (report.project) {
        const file = path.join(report.project, 'temp/engine-sdk.json');
        try {
            if (fs.existsSync(file)) {
                const record = readJson(file);
                if (record?.schemaVersion !== 1 || record.status !== 'initialized' || typeof record.engine?.path !== 'string'
                    || typeof record.engine?.version !== 'string') throw new Error('Invalid initialization record');
                report.lastInitialization = { ...record, engine: engineIdentity(record.engine) };
                if (report.engine && ['path', 'version', 'revision'].some(key => (record.engine[key] ?? null) !== report.engine[key])) {
                    report.warnings.push('The last initialized engine differs from the currently selected engine.');
                }
            }
        } catch (error) { report.warnings.push(`Cannot read ${file}: ${error.message}`); }
    }
    return report;
}

/** Called only after successful runtime initialization; never changes engineSdk pins. */
function recordInitialization(root, projectRoot, selection) {
    const record = {
        schemaVersion: 1, status: 'initialized', initializedAt: new Date().toISOString(),
        cli: cliIdentity(root), engine: engineIdentity(selection),
    };
    const file = path.join(path.resolve(projectRoot), 'temp/engine-sdk.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
        fs.renameSync(temporary, file);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return record;
}

module.exports = { diagnose, recordInitialization };
