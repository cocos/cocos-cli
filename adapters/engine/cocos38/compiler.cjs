'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CACHE_VERSION = 'cocos-3.8-cli-6';
const ADAPTER_ID = 'cocos-3.8-runtime';
const supportsVersion = version => typeof version === 'string' && /^3\.8\.[0-8]$/.test(version);
const directory = engine => path.join(engine, 'bin/.cache/dev-cli-3.8');
function sourceFingerprint(engine) {
    const hash = crypto.createHash('sha256');
    const walk = relative => {
        const absolute = path.join(engine, relative);
        if (!fs.existsSync(absolute)) return;
        if (fs.statSync(absolute).isDirectory()) {
            for (const name of fs.readdirSync(absolute).sort()) {
                if (!['test', 'tests', '__tests__'].includes(name)) walk(path.join(relative, name));
            }
        } else if (/\.(?:ts|js|json|effect|glsl)$/.test(relative) && !relative.endsWith('.d.ts') && !/\.(?:test|spec)\./.test(relative)) {
            const content = fs.readFileSync(absolute);
            hash.update(relative.split(path.sep).join('/') + '\0' + content.length + '\0');
            hash.update(content);
        }
    };
    for (const relative of ['cocos', 'pal', 'exports', 'editor/exports', 'editor/engine-features/render-config.json']) walk(relative);
    return hash.digest('hex');
}
function identity(engine) {
    const pkg = JSON.parse(fs.readFileSync(path.join(engine, 'package.json'), 'utf8'));
    if (!supportsVersion(pkg.version)) throw new Error('The experimental 3.8 backend requires a stable engine version from 3.8.0 through 3.8.8');
    return { version: pkg.version, source: sourceFingerprint(engine), config: crypto.createHash('sha256').update(fs.readFileSync(path.join(engine, 'cc.config.json'))).digest('hex') };
}
function featuresFor(query, renderConfig, version) {
    const available = query.getFeatures();
    const result = new Set(available.filter(feature => !feature.startsWith('spine-') || feature === 'spine-3.8'));
    // Match Creator's HTML5 module restrictions; do not enable native-only APIs.
    const flags = query.constantManager.genCCEnvConstants({ platform: 'HTML5', mode: 'EDITOR', flags: { DEBUG: true } });
    const visit = (key, item) => {
        if (item.options) { for (const [option, value] of Object.entries(item.options)) visit(option, value); return; }
        if (!result.has(key) || !item.envCondition) return;
        if (!item.envCondition.split('||').some(expression => flags[expression.trim().replace(/^\$/, '')])) {
            result.delete(key);
            if (item.fallback && available.includes(item.fallback)) result.add(item.fallback);
        }
    };
    for (const [key, item] of Object.entries(renderConfig.features)) visit(key, item);
    // Before 3.8.4, importing the custom pipeline redirects EffectAsset registration
    // away from the classic program library even when the classic pipeline is active.
    if (/^3\.8\.[0-3]$/.test(version || '')) result.delete('custom-pipeline');
    return [...result];
}
function overridesFor(query, features) {
    const buildTimeConstants = { ...query.constantManager.genBuildTimeConstants({
        platform: 'HTML5', mode: 'PREVIEW', flags: { DEBUG: true },
    }), ...query.getIntrinsicFlagsOfFeatures(features) };
    return query.evaluateModuleOverrides({ platform: 'HTML5', mode: 'PREVIEW', buildTimeConstants });
}
async function prepareCompilerInput(engine, overrides) {
    const input = path.join(directory(engine), 'input');
    if (path.relative(directory(engine), input) !== 'input') throw new Error('Invalid compiler input directory');
    fs.rmSync(input, { recursive: true, force: true });
    fs.mkdirSync(input, { recursive: true });
    const copy = relative => {
        const from = path.join(engine, relative); const to = path.join(input, relative);
        if (!fs.existsSync(from)) return;
        fs.cpSync(from, to, { recursive: true, dereference: true, filter(file) {
            const rel = path.relative(engine, file).split(path.sep).join('/');
            if (rel.split('/').some(part => ['.git', 'node_modules', 'bin', '__dts_before_bundle'].includes(part))) return false;
            if (rel === 'editor/assets' || rel.startsWith('editor/assets/')) return false;
            if (rel.startsWith('native/') && rel !== 'native/external' && !rel.startsWith('native/external/emscripten')) return false;
            return true;
        } });
    };
    for (const dir of ['cocos', 'pal', 'exports', 'editor', '@types', 'native', 'extensions', 'external', 'vendor']) copy(dir);
    for (const item of fs.readdirSync(engine, { withFileTypes: true })) {
        if (item.isFile() && (/\.(ts|js|json)$/.test(item.name) || item.name.startsWith('.babel'))) copy(item.name);
    }
    const config = JSON.parse(fs.readFileSync(path.join(engine, 'cc.config.json'), 'utf8'));
    const extra = Object.values(overrides).filter(file => path.isAbsolute(file) && fs.existsSync(file))
        .map(file => path.relative(engine, file).split(path.sep).join('/'));
    if (extra.some(file => file.startsWith('../'))) throw new Error('Module override escapes the selected engine');
    config.includes = [...new Set([...(config.includes || []), ...extra])];
    fs.writeFileSync(path.join(input, 'cc.config.json'), JSON.stringify(config, null, 2));
    const modules = path.join(input, 'node_modules');
    if (!fs.existsSync(modules)) fs.symlinkSync(path.join(engine, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir');
    return input;
}
function validateImportMap(target, overrides) {
    const map = JSON.parse(fs.readFileSync(path.join(target, 'import-map.json'), 'utf8'));
    const missing = Object.keys(overrides).filter(key => key.startsWith('pal/') && !map.imports?.[key]);
    if (missing.length) throw new Error('Engine compilation omitted platform modules: ' + missing.join(', '));
}
async function compileEngine(engine, isWeb = false) {
    const source = identity(engine);
    const { StatsQuery } = require('@cocos/ccbuild');
    const { QuickCompiler } = require('@cocos/quick-compiler');
    const query = await StatsQuery.create(engine);
    const features = featuresFor(query, JSON.parse(fs.readFileSync(path.join(engine, 'editor/engine-features/render-config.json'), 'utf8')), source.version);
    const overrides = overridesFor(query, features);
    const input = await prepareCompilerInput(engine, overrides);
    const target = path.join(directory(engine), isWeb ? 'web' : 'editor');
    const stamp = path.join(target, 'backend.json');
    // An incomplete build must never advertise readiness using an older stamp.
    fs.rmSync(stamp, { force: true });
    fs.mkdirSync(directory(engine), { recursive: true });
    fs.writeFileSync(path.join(directory(engine), isWeb ? 'web.log' : 'editor.log'), '');
    const compiler = new QuickCompiler({ rootDir: input, outDir: target, platform: 'HTML5',
        targets: [{ featureUnitPrefix: 'cce:/internal/x/cc-fu/', dir: target, format: 'systemjs',
            targets: isWeb ? 'Chrome >= 80' : { node: '22' }, includeEditorExports: true,
            includeIndex: { features }, loader: true, loose: true }],
        logFile: path.join(directory(engine), isWeb ? 'web.log' : 'editor.log') });
    await compiler.build();
    await compiler.buildImportMap(0, features, {});
    validateImportMap(target, overrides);
    const log = fs.readFileSync(path.join(directory(engine), isWeb ? 'web.log' : 'editor.log'), 'utf8');
    if (/^error:/m.test(log)) throw new Error('Engine compilation reported errors; see ' + target + '/../' + (isWeb ? 'web.log' : 'editor.log'));
    fs.writeFileSync(stamp, JSON.stringify({ adapter: ADAPTER_ID, cacheVersion: CACHE_VERSION, ...source, features }, null, 2));
    return target;
}
module.exports = { compileEngine, directory, identity, featuresFor, sourceFingerprint, CACHE_VERSION, ADAPTER_ID, supportsVersion, overridesFor, prepareCompilerInput, validateImportMap };
