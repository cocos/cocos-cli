const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');

function readPolicy(root) {
    const file = path.join(root, 'engine-compatibility.json');
    const policy = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (policy?.schemaVersion !== 1 || typeof policy.stable !== 'string' || !semver.validRange(policy.stable) || !Array.isArray(policy.prereleases)) throw new Error(`Invalid compatibility policy: ${file}`);
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
    return `${policy.stable}; ${policy.prereleases.map(rule => `${rule.core}-${rule.tag}.N (N >= ${rule.min}${rule.max === undefined ? '' : `, N <= ${rule.max}`})`).join('; ')}`;
}

/** Shared by runtime and the SDK matrix. Never globally enable includePrerelease. */
function matchEngineVersion(version, policy) {
    const parsed = typeof version === 'string' && /^\d/.test(version) && version.trim() === version ? semver.parse(version) : null;
    if (!parsed) return { supported: false, reason: 'Invalid SemVer' };
    if (!parsed.prerelease.length) return { supported: semver.satisfies(parsed, policy.stable), experimental: false, reason: 'Outside stable range' };
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
    const match = matchEngineVersion(selection.version, policy);
    if (!match.supported) throw failure(selection, policy, match.reason);
    if (!['source', 'runtime', 'web'].includes(profile)) throw failure(selection, policy, `Unknown validation profile ${profile}`);
    const profiles = profile === 'source' ? ['source'] : profile === 'runtime' ? ['source', 'runtime'] : ['source', 'runtime', 'web'];
    for (const file of profiles.flatMap(name => policy.requiredFiles[name])) {
        try {
            if (!fs.statSync(path.join(selection.path, file)).isFile()) throw new Error('not a file');
        } catch { throw failure(selection, policy, `Missing required ${profile} file: ${file}`); }
    }
    for (const file of ['cc.config.json', 'editor/engine-features/render-config.json']) {
        try {
            const config = JSON.parse(fs.readFileSync(path.join(selection.path, file), 'utf8'));
            if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Expected an object');
        } catch { throw failure(selection, policy, `Invalid required configuration: ${file}`); }
    }
    return match;
}

function assertRuntimeInterfaces(engine, selection, root) {
    const policy = readPolicy(root);
    for (const key of ['game.init', 'physics.selector.switchTo', 'Node', 'Component']) {
        const value = key.split('.').reduce((value, part) => value?.[part], engine);
        if (typeof value !== 'function') throw failure(selection, policy, `Missing required interface cc.${key}`);
    }
    if (!engine.Layers || typeof engine.Layers.Enum !== 'object' || !engine.Layers.Enum) throw failure(selection, policy, 'Missing required interface cc.Layers.Enum');
}

function queryOptionalSortingLayers(engine) {
    return typeof engine.SortingLayers?.getBuiltinLayers === 'function' ? engine.SortingLayers.getBuiltinLayers() : [];
}

module.exports = { readPolicy, describePolicy, matchEngineVersion, checkEngineCompatibility, assertRuntimeInterfaces, queryOptionalSortingLayers, compatibilityError: failure };
