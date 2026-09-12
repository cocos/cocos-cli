/** Local SDK snapshots. No installs, lifecycle scripts, Git updates or uploads. */
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const semver = require('semver');
const { resolveEnginePath } = require('./engine-path');

const CLI_ROOTS = ['dist', 'static', 'docs/en', 'docs/zh', 'docs/sdk-packaging.md', 'docs/dev/environment-setup.md', 'readme.md', 'README-zh.md', 'config.local.example.json', 'engine-compatibility.json', 'workflow/engine-path.js', 'workflow/engine-compatibility.js', 'workflow/engine-diagnostics.js', 'packages/cc-module', 'packages/engine-compiler/dist', 'packages/platforms', 'LICENSE'];
const ENGINE_ROOTS = ['cocos', 'editor', 'exports', 'extensions', 'external', 'native', 'pal', 'templates', 'vendor', 'licenses', '@types', 'bin/.cache/dev-cli', 'bin/.declarations', 'bin/.editor', 'bin/adapter', 'bin/simulator', 'cc.config.json', 'cc.config.schema.json', 'DebugInfos.json', 'DebugInfos.d.ts', 'predefine.ts', 'tsconfig.json', 'LICENSE', 'AUTHORS.txt'];
const REQUIRED = {
    cli: ['dist/cli.js', 'dist/index.js', 'workflow/engine-path.js', 'workflow/engine-compatibility.js', 'workflow/engine-diagnostics.js', 'engine-compatibility.json', 'packages/cc-module/loader.js', 'packages/cc-module/preload.js', 'packages/engine-compiler/dist/index.js'],
    engine: ['cc.config.json', 'cocos/core/platform/macro.ts', 'editor/engine-features/render-config.json', 'bin/.cache/dev-cli/editor/loader.js', 'bin/.cache/dev-cli/web/loader.js', 'bin/.editor/web-adapter.js', 'bin/.editor/engine-adapter.js', 'bin/.declarations/cc.d.ts'],
};
const slash = value => value.split(path.sep).join('/');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
function inside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function findPackage(name, from) {
    if (!/^(?:@[a-z0-9_][a-z0-9._-]*\/)?[a-z0-9_][a-z0-9._-]*$/i.test(name)) throw new Error(`Invalid dependency name: ${name}`);
    for (let current = from; ; current = path.dirname(current)) {
        const candidate = path.join(current, 'node_modules', name);
        if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
        if (current === path.dirname(current)) return undefined;
    }
}

/** Preserve npm's installed layout; materialize workspace links within the SDK. */
function dependencies(root, manifest) {
    root = fs.realpathSync.native(root);
    const nodes = new Map();
    const mappings = [{ source: root, destination: '' }];
    const queue = [{ source: root, destination: '', manifest }];
    const warnings = [];
    const skippedOptional = [];
    for (let index = 0; index < queue.length; index++) {
        const owner = queue[index];
        const specs = { ...owner.manifest.peerDependencies, ...owner.manifest.dependencies, ...owner.manifest.optionalDependencies };
        for (const [name, spec] of Object.entries(specs)) {
            const optional = Object.hasOwn(owner.manifest.optionalDependencies || {}, name)
                || (!Object.hasOwn(owner.manifest.dependencies || {}, name) && owner.manifest.peerDependenciesMeta?.[name]?.optional);
            const installed = findPackage(name, owner.source);
            if (!installed) {
                if (optional) { skippedOptional.push(`${owner.manifest.name}: ${name}`); continue; }
                throw new Error(`Missing runtime dependency ${name} required by ${owner.manifest.name}. Prepare dependencies before packing.`);
            }
            const mapping = mappings.filter(item => inside(item.source, installed)).sort((a, b) => b.source.length - a.source.length)[0];
            if (!mapping) throw new Error(`Dependency ${installed} resolves outside SDK source ${root}; install it inside the SDK source first.`);
            const destination = slash(path.join(mapping.destination, path.relative(mapping.source, installed)));
            const source = fs.realpathSync.native(installed);
            if (!inside(root, source)) throw new Error(`Dependency link escapes SDK source: ${installed} -> ${source}`);
            const pkg = readJson(path.join(source, 'package.json'));
            if (semver.validRange(spec) && !semver.satisfies(pkg.version, spec)) {
                warnings.push(`${owner.manifest.name} requires ${name}@${spec}; installed ${pkg.version}`);
            }
            if (nodes.has(destination)) {
                if (nodes.get(destination).source !== source) throw new Error(`Conflicting dependency destination: ${destination}`);
                continue;
            }
            const node = { source, destination, manifest: pkg };
            nodes.set(destination, node);
            if (source !== installed) mappings.push({ source, destination });
            queue.push(node);
        }
    }
    return { nodes: [...nodes.values()], warnings: [...new Set(warnings)].sort(), skippedOptional: [...new Set(skippedOptional)].sort() };
}

function excluded(relative, kind, dependency) {
    const parts = relative.split('/');
    if (parts.some(part => ['node_modules', '.git', '.github', '.idea', '.vscode', '.omc', '.npmrc', '.DS_Store'].includes(part))) return true;
    if (dependency) return false;
    if (kind === 'cli' && (parts.includes('test') || parts.includes('tests') || parts.includes('__tests__'))) return true;
    if (kind === 'cli' && relative.startsWith('packages/') && parts.includes('src')) return true;
    if (kind === 'engine' && (/^bin\/\.cache\/dev-cli\/(editor|web)\/transform-cache\//.test(relative) || /\/(?:\.incremental\.json|partial-import-map\.json)$/.test(relative))) return true;
    return false;
}

async function scanUnit(unit, kind) {
    const files = [];
    async function walk(source, relative, ancestors) {
        if (excluded(unit.dependency ? relative : slash(path.join(unit.destination, relative)), kind, unit.dependency)) return;
        const real = await fsp.realpath(source);
        if (!inside(unit.root, real)) throw new Error(`SDK input link escapes source: ${source} -> ${real}`);
        if (ancestors.has(real)) throw new Error(`Circular link: ${source}`);
        const stat = await fsp.stat(source);
        if (stat.isDirectory()) {
            const next = new Set(ancestors).add(real);
            for (const entry of await fsp.readdir(source)) await walk(path.join(source, entry), relative ? `${relative}/${entry}` : entry, next);
        } else if (stat.isFile()) {
            files.push({ source, path: slash(path.join(unit.destination, relative)), bytes: stat.size, mode: stat.mode & 0o777 });
        }
    }
    await walk(unit.source, '', new Set());
    return files;
}

async function mapLimit(items, action, concurrency = 8) {
    let cursor = 0;
    const results = new Array(items.length);
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await action(items[index]);
        }
    }));
    return results;
}

async function planSdk({ kind, source }) {
    if (!Object.hasOwn(REQUIRED, kind)) throw new Error('kind must be cli or engine');
    const root = fs.realpathSync.native(source);
    const pkg = readJson(path.join(root, 'package.json'));
    if (!semver.valid(pkg.version)) throw new Error(`Invalid ${kind} version: ${pkg.version}`);
    for (const required of REQUIRED[kind]) {
        if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing ${kind} SDK build input: ${required}. Build this SDK before packing.`);
    }
    const graph = dependencies(root, pkg);
    const units = (kind === 'cli' ? CLI_ROOTS : ENGINE_ROOTS)
        .filter(relative => fs.existsSync(path.join(root, relative)))
        .map(relative => ({ source: path.join(root, relative), destination: relative, dependency: false, root }));
    for (const node of graph.nodes) units.push({ ...node, dependency: true, root });
    const scans = await mapLimit(units, unit => scanUnit(unit, kind));
    const files = new Map();
    for (const entry of scans.flat()) {
        if (files.has(entry.path)) throw new Error(`Duplicate SDK file: ${entry.path}`);
        files.set(entry.path, entry);
    }
    // Source-only build commands must never run when a prepared SDK is installed.
    const artifactPackage = { ...pkg, private: true };
    delete artifactPackage.scripts;
    delete artifactPackage.devDependencies;
    delete artifactPackage.workspaces;
    delete artifactPackage.files;
    const packageBytes = Buffer.from(`${JSON.stringify(artifactPackage, null, 2)}\n`);
    files.set('package.json', { path: 'package.json', content: packageBytes, bytes: packageBytes.length, mode: 0o644 });
    const sorted = [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (kind === 'cli' && sorted.some(entry => entry.path.startsWith('packages/engine/'))) throw new Error('CLI SDK unexpectedly contains Engine SDK');
    return { kind, root, version: pkg.version, files: sorted, graph };
}

async function fileHash(filename) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
    return hash.digest('hex');
}

function canonicalDestination(destination) {
    const absolute = path.resolve(destination);
    if (fs.existsSync(absolute)) return fs.realpathSync.native(absolute);
    return path.join(canonicalDestination(path.dirname(absolute)), path.basename(absolute));
}

async function packSdk(options) {
    const plan = await planSdk(options);
    const output = canonicalDestination(options.output || path.join(__dirname, '..', '.publish', 'sdk', `cocos-${plan.kind}-sdk-${plan.version}-${process.platform}-${process.arch}`));
    if (inside(output, plan.root)) throw new Error('Output cannot be the source directory or an ancestor of it');
    const reserved = [...(plan.kind === 'cli' ? CLI_ROOTS : ENGINE_ROOTS), 'node_modules'];
    if (reserved.some(relative => inside(path.join(plan.root, relative), output))) throw new Error('Output cannot be inside an SDK input directory');
    const summary = { kind: plan.kind, version: plan.version, output, files: plan.files.length, bytes: plan.files.reduce((sum, entry) => sum + entry.bytes, 0), dependencies: plan.graph.nodes.length, dependencyWarnings: plan.graph.warnings };
    if (options.dryRun) return summary;
    await fsp.mkdir(path.dirname(output), { recursive: true });
    await fsp.mkdir(output); // Intentionally refuse existing output; never delete user directories.
    const incomplete = path.join(output, '.sdk-incomplete');
    await fsp.writeFile(incomplete, 'Packing in progress. Do not use this SDK until this marker is removed.\n');
    let copied = 0;
    const manifestFiles = await mapLimit(plan.files, async entry => {
        const destination = path.join(output, entry.path);
        await fsp.mkdir(path.dirname(destination), { recursive: true });
        // Most SDK files are small. Read once instead of reopening every copied file.
        const content = entry.content || (entry.bytes <= 2 * 1024 * 1024 ? await fsp.readFile(entry.source) : undefined);
        let bytes, sha256;
        if (content) {
            await fsp.writeFile(destination, content);
            bytes = content.length;
            sha256 = crypto.createHash('sha256').update(content).digest('hex');
        } else {
            await fsp.copyFile(entry.source, destination);
            bytes = (await fsp.stat(destination)).size;
            sha256 = await fileHash(destination);
        }
        if (process.platform !== 'win32') await fsp.chmod(destination, entry.mode);
        copied++;
        if (copied % 10000 === 0 || copied === plan.files.length) options.onProgress?.({ copied, total: plan.files.length });
        return { path: entry.path, bytes, mode: entry.mode, sha256 };
    });
    const revision = `sha256:${crypto.createHash('sha256').update(JSON.stringify(manifestFiles)).digest('hex')}`;
    const metadata = {
        schemaVersion: 1, kind: plan.kind, ...(plan.kind === 'engine' ? { engineVersion: plan.version } : { cliVersion: plan.version }),
        revision, capabilities: [],
        platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules,
        dependencies: plan.graph.nodes.map(node => ({ path: node.destination, name: node.manifest.name, version: node.manifest.version })).sort((a, b) => a.path.localeCompare(b.path)),
        dependencyWarnings: plan.graph.warnings, skippedOptionalDependencies: plan.graph.skippedOptional,
        files: manifestFiles,
    };
    await fsp.writeFile(path.join(output, `${plan.kind}-sdk.json`), `${JSON.stringify(metadata, null, 2)}\n`);
    await fsp.unlink(incomplete);
    return { ...summary, revision };
}

async function main() {
    const { values } = parseArgs({ options: { kind: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } } });
    if (values.help) {
        console.log('node workflow/pack-sdk.js --kind cli|engine [--source PATH] [--output NEW_DIRECTORY] [--dry-run]\nPackages prepared SDK inputs and installed runtime dependencies without rebuilding or downloading. Output is a platform/Node-ABI-specific offline directory snapshot.');
        return;
    }
    const root = path.join(__dirname, '..');
    const source = values.source || (values.kind === 'engine' ? resolveEnginePath(root) : root);
    console.log(JSON.stringify(await packSdk({ ...values, source, dryRun: values['dry-run'], onProgress: progress => console.error(`[${values.kind}] ${progress.copied}/${progress.total} files`) }), null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { packSdk, planSdk, dependencies, REQUIRED };
