const fs = require('node:fs');
const path = require('node:path');

/** CLI-machine default. Relative values are always relative to the CLI root, not cwd. */
function resolveEnginePath(root, explicitPath) {
    const cliRoot = path.resolve(root);
    if (explicitPath !== undefined) {
        if (typeof explicitPath !== 'string' || !explicitPath.trim()) throw new Error('engine-path must be a non-empty path');
        return path.resolve(explicitPath);
    }
    const configPath = path.join(cliRoot, 'config.local.json');
    if (!fs.existsSync(configPath)) return path.join(cliRoot, 'packages', 'engine');
    let config;
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')); }
    catch (error) { throw new Error(`Cannot read CLI local configuration ${configPath}: ${error.message}`); }
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Expected an object in ${configPath}`);
    if (!Object.hasOwn(config, 'enginePath')) return path.join(cliRoot, 'packages', 'engine');
    if (typeof config.enginePath !== 'string' || !config.enginePath.trim()) throw new Error(`enginePath in ${configPath} must be a non-empty path`);
    return path.resolve(cliRoot, config.enginePath);
}

/** Resolve one SDK identity without loading engine code or writing project files. */
function resolveEngineSelection(root, { explicitPath, projectRoot, projectConfig = {} } = {}) {
    if (!projectConfig || typeof projectConfig !== 'object' || Array.isArray(projectConfig)) throw new Error('engineSdk must be an object');
    let selected;
    let source;
    if (explicitPath !== undefined) {
        selected = resolveEnginePath(root, explicitPath);
        source = 'explicit';
    } else if (Object.hasOwn(projectConfig, 'path')) {
        if (typeof projectConfig.path !== 'string' || !projectConfig.path.trim()) throw new Error('engineSdk.path must be a non-empty path');
        if (!projectRoot) throw new Error('Project root is required for engineSdk.path');
        selected = path.resolve(projectRoot, projectConfig.path);
        source = 'project';
    } else {
        selected = resolveEnginePath(root);
        source = 'default';
    }
    const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
    try {
        selected = fs.realpathSync(selected);
        const pkg = read(path.join(selected, 'package.json'));
        if (typeof pkg.version !== 'string' || !pkg.version.trim()) throw new Error('package.json.version is missing');
        const metadataPath = path.join(selected, 'engine-sdk.json');
        const metadata = fs.existsSync(metadataPath) ? read(metadataPath) : undefined;
        if (fs.existsSync(metadataPath) && (!metadata || metadata.schemaVersion !== 1 || (metadata.kind !== undefined && metadata.kind !== 'engine')
            || typeof metadata.revision !== 'string' || !metadata.revision.trim()
            || (metadata.capabilities !== undefined && (!Array.isArray(metadata.capabilities) || metadata.capabilities.some(value => typeof value !== 'string'))))) {
            throw new Error('Invalid engine-sdk.json: expected schemaVersion 1 and revision');
        }
        if (metadata && metadata.engineVersion !== pkg.version) throw new Error('engine-sdk.json.engineVersion differs from package.json.version');
        for (const [key, actual] of [['version', pkg.version], ['revision', metadata?.revision]]) {
            if (Object.hasOwn(projectConfig, key) && (typeof projectConfig[key] !== 'string' || !projectConfig[key].trim() || projectConfig[key] !== actual)) {
                throw new Error(`engineSdk.${key} requires ${projectConfig[key]}; actual ${actual ?? 'unrecorded'}`);
            }
        }
        return { path: selected, version: pkg.version, revision: metadata?.revision, source };
    } catch (error) {
        throw new Error(`Cannot use Engine SDK at ${selected}: ${error.message}. Configure a valid engine path; no fallback was attempted.`);
    }
}

module.exports = { resolveEnginePath, resolveEngineSelection };
