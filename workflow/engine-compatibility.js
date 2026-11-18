const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const { getEngineBackendAdapter } = require('../adapters/engine/registry.cjs');

function readPolicy(root) {
    const file = path.join(root, 'engine-compatibility.json');
    const policy = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (policy?.schemaVersion !== 1 || typeof policy.stable !== 'string' || !semver.validRange(policy.stable) || !Array.isArray(policy.prereleases)) throw new Error(`Invalid compatibility policy: ${file}`);
    if (policy.defaultAdapterRanges !== undefined && (!Array.isArray(policy.defaultAdapterRanges) || policy.defaultAdapterRanges.some(range => typeof range !== 'string' || !semver.validRange(range)))) throw new Error(`Invalid default adapter ranges in ${file}`);
    for (const rule of policy.prereleases) {
        const core = semver.parse(rule?.core);
        if (!core || core.prerelease.length || core.build.length || core.version !== rule.core || typeof rule.tag !== 'string' || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(rule.tag)
            || !Number.isSafeInteger(rule.min) || rule.min < 0 || typeof rule.experimental !== 'boolean'
            || (rule.max !== undefined && (!Number.isSafeInteger(rule.max) || rule.max < rule.min))) throw new Error(`Invalid prerelease rule in ${file}`);
    }
    for (const profile of ['source', 'runtime', 'web']) {
        const files = policy.requiredFiles?.[profile];
        if (!Array.isArray(files) || !files.length || files.some(value => typeof value !== 'string' || !value || path.isAbsolute(value) || value.split(/[\\/]/).includes('..'))) throw new Error(`Invalid ${profile} file contract in ${file}`);
    }
    return policy;
}

function describePolicy(policy) {
    const adapters = policy.defaultAdapterRanges?.length ? `; default adapters: ${policy.defaultAdapterRanges.join(', ')} (partial version validation)` : '';
    return `${policy.stable}${adapters}; ${policy.prereleases.map(rule => `${rule.core}-${rule.tag}.N (N >= ${rule.min}${rule.max === undefined ? '' : `, N <= ${rule.max}`})`).join('; ')}`;
}

function usesDefaultAdapter(version, policy) {
    return (policy.defaultAdapterRanges || []).some(range => semver.satisfies(version, range));
}

/** Shared by runtime and the SDK matrix. Never globally enable includePrerelease. */
function matchEngineVersion(version, policy) {
    const parsed = typeof version === 'string' && /^\d/.test(version) && version.trim() === version ? semver.parse(version) : null;
    if (!parsed) return { supported: false, reason: 'Invalid SemVer' };
    if (!parsed.prerelease.length) {
        const defaultAdapter = usesDefaultAdapter(parsed, policy);
        return { supported: semver.satisfies(parsed, policy.stable) || defaultAdapter, experimental: defaultAdapter, reason: defaultAdapter ? 'Default-enabled adapter; individual versions may be unverified' : 'Outside stable range' };
    }
    const [tag, sequence] = parsed.prerelease;
    const core = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    const rule = parsed.prerelease.length === 2 && Number.isSafeInteger(sequence) && policy.prereleases.find(rule => rule.core === core && rule.tag === tag && sequence >= rule.min && (rule.max === undefined || sequence <= rule.max));
    return { supported: !!rule, experimental: !!rule?.experimental, reason: 'Undeclared prerelease series or sequence' };
}

function failure(selection, policy, reason) {
    return new Error(`[Engine compatibility] ${reason}. Engine: ${selection.version} at ${selection.path}. Supported: ${describePolicy(policy)}. Use a compatible, complete Engine SDK or update the CLI.`);
}

function checkEngineCompatibility(selection, root, profile = 'source') {
    const policy = readPolicy(root);
    let match = matchEngineVersion(selection.version, policy);
    const optIn = process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS === '1';
    if (!match.supported && optIn) {
        try {
            if (getEngineBackendAdapter(selection).runtimeSupport === 'experimental') match = { supported: true, experimental: true };
        } catch { /* Preserve the version-policy error for unsupported engines. */ }
    }
    if (!match.supported) throw failure(selection, policy, match.reason);
    if (!['source', 'runtime', 'web'].includes(profile)) throw failure(selection, policy, 'Unknown validation profile ' + profile);
    let adapter;
    try {
        adapter = getEngineBackendAdapter(selection);
        if (adapter.runtimeSupport === 'discovery-only') throw new Error('Adapter ' + adapter.id + ' supports discovery only; runtime adaptation is not implemented');
        if (adapter.runtimeSupport === 'experimental' && !optIn && !usesDefaultAdapter(selection.version, policy)) throw new Error('Experimental backend requires COCOS_EXPERIMENTAL_ENGINE_ADAPTERS=1');
    } catch (error) { throw failure(selection, policy, error.message); }
    const profiles = profile === 'source' ? ['source'] : profile === 'runtime' ? ['source', 'runtime'] : ['source', 'runtime', 'web'];
    const required = adapter.requiredFiles ? adapter.requiredFiles(selection, profile) : profiles.flatMap(name => policy.requiredFiles[name]).map(file => path.join(selection.path, file));
    for (const file of required) {
        try {
            if (!fs.statSync(file).isFile()) throw new Error('not a file');
        } catch { throw failure(selection, policy, 'Missing required ' + profile + ' file: ' + path.relative(selection.path, file).split(path.sep).join('/')); }
    }
    try { adapter.validatePreparation?.(selection, profile); } catch (error) { throw failure(selection, policy, error.message); }
    for (const file of ['cc.config.json', 'editor/engine-features/render-config.json']) {
        try {
            const config = JSON.parse(fs.readFileSync(path.join(selection.path, file), 'utf8'));
            if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Expected an object');
        } catch { throw failure(selection, policy, 'Invalid required configuration: ' + file); }
    }
    return match;
}

function assertRuntimeInterfaces(engine, selection, root) {
    const policy = readPolicy(root);
    try { getEngineBackendAdapter(selection).validateRuntime(engine, selection); }
    catch (error) { throw failure(selection, policy, error.message); }
}

function queryOptionalSortingLayers(engine) {
    return typeof engine.SortingLayers?.getBuiltinLayers === 'function' ? engine.SortingLayers.getBuiltinLayers() : [];
}

module.exports = { readPolicy, describePolicy, matchEngineVersion, checkEngineCompatibility, assertRuntimeInterfaces, queryOptionalSortingLayers, compatibilityError: failure };
