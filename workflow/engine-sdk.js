'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function fail(code, message) {
    const error = new Error(`[${code}] ${message}`);
    error.code = code;
    throw error;
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function containedFile(root, relative, directory = false) {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[a-z]:|^\\/i.test(relative)
        || relative.split(/[\\/]/).includes('..')) fail('ENGINE_SDK_PATH', `Invalid SDK path: ${relative}`);
    const realRoot = fs.realpathSync(root);
    const target = fs.realpathSync(path.resolve(root, relative));
    const rel = path.relative(realRoot, target);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail('ENGINE_SDK_PATH', `SDK path escapes package: ${relative}`);
    const stat = fs.statSync(target);
    if (directory ? !stat.isDirectory() : !stat.isFile()) fail('ENGINE_SDK_PATH', `Invalid SDK ${directory ? 'directory' : 'file'}: ${relative}`);
    return target;
}

function readManifest(root) {
    const file = path.join(root, 'engine-sdk.json');
    if (!fs.existsSync(file)) return undefined;
    const manifest = read(file);
    if (!object(manifest) || ![1, 2].includes(manifest.schemaVersion)) fail('ENGINE_SDK_MANIFEST', `Invalid engine-sdk.json at ${root}`);
    if (manifest.schemaVersion === 1) {
        if ((manifest.kind !== undefined && manifest.kind !== 'engine') || typeof manifest.revision !== 'string' || !manifest.revision.trim()) {
            fail('ENGINE_SDK_MANIFEST', 'Invalid engine-sdk.json: expected schemaVersion 1 and revision');
        }
    } else {
        for (const key of ['engineVersion', 'engineRevision', 'sdkReleaseId', 'component']) {
            if (typeof manifest[key] !== 'string' || !manifest[key].trim()) fail('ENGINE_SDK_MANIFEST', `Missing SDK identity: ${key}`);
        }
        if (manifest.kind !== 'engine' || !object(manifest.entries) || !object(manifest.targets)) fail('ENGINE_SDK_MANIFEST', 'Invalid SDK entries or targets');
        if (manifest.platformResolution !== undefined && manifest.platformResolution !== 'plugin') fail('ENGINE_SDK_MANIFEST', 'Invalid platformResolution');
        if (manifest.platformResolution === 'plugin' && (!Array.isArray(manifest.platformConstants) || manifest.platformConstants.some(value => typeof value !== 'string'))) fail('ENGINE_SDK_MANIFEST', 'Invalid platformConstants');
        if (manifest.profiles !== undefined && !object(manifest.profiles)) fail('ENGINE_SDK_MANIFEST', 'Invalid SDK profiles');
        if (manifest.entries.engineRoot !== undefined) containedFile(root, manifest.entries.engineRoot, true);
        for (const key of ['featureConfig', 'moduleEntries']) if (manifest.entries[key] !== undefined) containedFile(root, manifest.entries[key]);
        for (const [name, profile] of Object.entries(manifest.profiles || {})) {
            if (!object(profile)) fail('ENGINE_SDK_MANIFEST', `Invalid profile: ${name}`);
            for (const key of ['entry', 'manifest']) if (profile[key] !== undefined) containedFile(root, profile[key]);
        }
    }
    if (manifest.capabilities !== undefined && (!Array.isArray(manifest.capabilities) || manifest.capabilities.some(item => typeof item !== 'string'))) {
        fail('ENGINE_SDK_MANIFEST', 'Invalid SDK capabilities');
    }
    return manifest;
}

function resolvePackageRoot(name, projectRoot) {
    if (typeof name !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) fail('ENGINE_SDK_PACKAGE', `Invalid engine package name: ${name}`);
    if (!projectRoot) fail('ENGINE_SDK_PACKAGE', 'Project root is required for an engine package');
    const resolve = createRequire(path.join(path.resolve(projectRoot), 'package.json')).resolve;
    let file;
    try { file = resolve(`${name}/engine-sdk.json`); }
    catch (error) { fail('ENGINE_SDK_PACKAGE', `Cannot resolve ${name}/engine-sdk.json from ${projectRoot}. Install the package and export its SDK manifest. ${error.message}`); }
    const root = path.dirname(fs.realpathSync(file));
    if (read(path.join(root, 'package.json')).name !== name) fail('ENGINE_SDK_PACKAGE', `SDK manifest does not belong to ${name}`);
    if (!readManifest(root)) fail('ENGINE_SDK_MANIFEST', `Missing manifest in ${name}`);
    return root;
}

function validateSource(source, label) {
    if (!object(source)) fail('ENGINE_SDK_CONFIG', `${label} must be an object`);
    if (Object.hasOwn(source, 'path') && Object.hasOwn(source, 'package')) fail('ENGINE_SDK_CONFIG', `${label}.path and .package are mutually exclusive`);
    for (const key of ['path', 'package']) if (Object.hasOwn(source, key) && (typeof source[key] !== 'string' || !source[key].trim())) fail('ENGINE_SDK_CONFIG', `${label}.${key} must be a non-empty string`);
    if (source.platforms !== undefined && !object(source.platforms)) fail('ENGINE_SDK_CONFIG', `${label}.platforms must be a map`);
    if (source.editor !== undefined) {
        validateSource(source.editor, `${label}.editor`);
        if (!source.editor.path && !source.editor.package) fail('ENGINE_SDK_CONFIG', `${label}.editor requires path/package`);
    }
    for (const [target, entry] of Object.entries(source.platforms || {})) {
        if (!/^[a-z][a-z0-9-]*$/i.test(target)) fail('ENGINE_SDK_CONFIG', `Invalid platform target: ${target}`);
        validateSource(entry, `${label}.platforms.${target}`);
        if (!entry.path && !entry.package) fail('ENGINE_SDK_CONFIG', `Missing path/package for ${target}`);
        if (entry.platforms !== undefined) fail('ENGINE_SDK_CONFIG', `Nested platform mappings are not supported: ${target}`);
    }
}

/** On-demand target resolution; never installs packages, loads engine code or writes caches. */
function resolveTargetComponent(selection, target, projectRoot, config = {}, requirements) {
    if (typeof target !== 'string' || !target) fail('ENGINE_SDK_TARGET', 'A target is required');
    const baseRoot = selection.packageRoot || selection.path;
    const base = readManifest(baseRoot);
    const source = config.platforms?.[target];
    if (!source) {
        if (base?.schemaVersion === 2 && base.platformResolution === 'plugin' && requirements) {
            validatePluginPlatform(baseRoot, requirements.platform);
            for (const resource of requirements.resources || []) containedFile(baseRoot, resource);
            return { root: baseRoot, manifest: base, target: { platform: requirements.platform } };
        }
        if (base?.schemaVersion === 2 && !Object.hasOwn(base.targets, target)) fail('ENGINE_SDK_TARGET', `Engine ${selection.version} does not provide ${target}; configure engineSdk.platforms.${target}`);
        return { root: baseRoot, manifest: base, target: base?.targets?.[target] };
    }
    validateSource(source, `engineSdk.platforms.${target}`);
    if (!source.path && !source.package) fail('ENGINE_SDK_CONFIG', `Missing path/package for ${target}`);
    if (!projectRoot) fail('ENGINE_SDK_CONFIG', 'Project root is required for platform components');
    const root = source.package ? resolvePackageRoot(source.package, projectRoot) : fs.realpathSync(path.resolve(projectRoot, source.path));
    const manifest = readManifest(root);
    if (base?.schemaVersion !== 2 || manifest?.schemaVersion !== 2) fail('ENGINE_SDK_IDENTITY', 'Platform components require schemaVersion 2 identity');
    for (const key of ['engineVersion', 'engineRevision', 'sdkReleaseId']) if (base[key] !== manifest[key]) fail('ENGINE_SDK_IDENTITY', `${target} ${key} differs from the selected engine`);
    if (!Object.hasOwn(manifest.targets, target)) fail('ENGINE_SDK_TARGET', `Component does not provide ${target}`);
    return { root, manifest, target: manifest.targets[target] };
}

function validatePluginPlatform(root, platform) {
    const manifest = readManifest(root);
    if (manifest?.platformResolution !== 'plugin') return;
    if (!manifest.platformConstants.includes(platform)) fail('ENGINE_SDK_PLATFORM', 'Engine package does not provide platform macro: ' + platform);
    const config = read(containedFile(root, manifest.entries.featureConfig));
    if (!config.constants?.[platform]) fail('ENGINE_SDK_PLATFORM', 'Missing engine platform constant: ' + platform);
}

module.exports = { validatePluginPlatform, readManifest, resolvePackageRoot, resolveTargetComponent, containedFile, validateSource };
