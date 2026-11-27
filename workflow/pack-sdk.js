/** Local SDK snapshots, with an explicit build step for the Engine SDK command. */
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const semver = require('semver');
const { resolveEnginePath } = require('./engine-path');
const { runCommand } = require('./utils');
const { platformArtifacts } = require('./build-simulator');

const CLI_ROOTS = ['dist', 'static', 'docs/en', 'docs/zh', 'docs/dev/environment-setup.md', 'readme.md', 'README-zh.md', 'config.local.example.json', 'engine-compatibility.json', 'workflow/engine-path.js', 'workflow/engine-compatibility.js', 'workflow/engine-diagnostics.js', 'packages/cc-module', 'packages/engine-compiler/dist', 'packages/platforms', 'LICENSE'];
const XCODE_TOOL = 'scripts/native-pack-tool/xcode';
const ENGINE_COMPILER_OUTPUTS = ['bin/.cache/dev-cli/editor/loader.js', 'bin/.cache/dev-cli/web/loader.js', 'bin/.editor/web-adapter.js', 'bin/.editor/engine-adapter.js'];
const ENGINE_ROOTS = ['cocos', 'editor', 'exports', 'extensions', 'external', 'native', 'pal', 'templates', 'vendor', 'licenses', '@types', XCODE_TOOL, 'bin/.cache/dev-cli', 'bin/.declarations', 'bin/.editor', 'bin/adapter', 'bin/dev/cc-min', 'bin/simulator', 'bin/native-preview', 'cc.config.json', 'cc.config.schema.json', 'DebugInfos.json', 'DebugInfos.d.ts', 'predefine.ts', 'tsconfig.json', 'LICENSE', 'AUTHORS.txt'];
const REQUIRED = {
    cli: ['dist/cli.js', 'dist/index.js', 'workflow/engine-path.js', 'workflow/engine-compatibility.js', 'workflow/engine-diagnostics.js', 'engine-compatibility.json', 'packages/cc-module/loader.js', 'packages/cc-module/preload.js', 'packages/engine-compiler/dist/index.js'],
    engine: ['cc.config.json', 'cocos/core/platform/macro.ts', 'editor/engine-features/render-config.json', ...ENGINE_COMPILER_OUTPUTS, 'bin/.declarations/cc.d.ts', 'bin/.declarations/cc.editor.d.ts'],
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
function dependencies(root, manifest, bundledPackages = []) {
    root = fs.realpathSync.native(root);
    const nodes = new Map();
    const mappings = [{ source: root, destination: '' }];
    const queue = [{ source: root, destination: '', manifest }];
    for (const destination of bundledPackages) {
        const installed = path.join(root, destination);
        const source = fs.realpathSync.native(installed);
        if (!inside(root, source)) throw new Error(`Bundled package link escapes SDK source: ${installed} -> ${source}`);
        if (source !== installed) mappings.push({ source, destination });
        queue.push({ source, destination, manifest: readJson(path.join(source, 'package.json')) });
    }
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
    if (kind === 'engine' && (
        ['.gitignore', '.gitmodules'].includes(parts.at(-1))
        || /^bin\/\.cache\/dev-cli\/(editor|web)\/transform-cache\//.test(relative)
        || /\/(?:\.incremental\.json|partial-import-map\.json)$/.test(relative)
    )) return true;
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

function resolveSdkSource(kind, source) {
    if (!Object.hasOwn(REQUIRED, kind)) throw new Error('kind must be cli or engine');
    const root = fs.realpathSync.native(source);
    const pkg = readJson(path.join(root, 'package.json'));
    if (!semver.valid(pkg.version)) throw new Error(`Invalid ${kind} version: ${pkg.version}`);
    return { root, pkg };
}

async function planSdk({ kind, source }) {
    const { root, pkg } = resolveSdkSource(kind, source);
    for (const required of REQUIRED[kind]) {
        if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing ${kind} SDK build input: ${required}. Build this SDK before packing.`);
    }
    const bundledPackages = kind === 'engine' && fs.existsSync(path.join(root, XCODE_TOOL, 'package.json')) ? [XCODE_TOOL] : [];
    const graph = dependencies(root, pkg, bundledPackages);
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

function requireBuildArtifact(source, relative) {
    const stat = fs.statSync(path.join(source, relative), { throwIfNoEntry: false });
    if (!stat?.isFile() || !stat.size) throw new Error(`Missing Engine SDK build artifact: ${relative} in ${source}`);
}

async function prepareEngineSdk({ source, pkg, skipSimulator, run = runCommand }) {
    if (!pkg.scripts?.['build:min'] || fs.existsSync(path.join(source, 'engine-sdk.json'))) {
        throw new Error(`Engine SDK build requires an installed Engine source checkout with build:min: ${source}. Use --skip-build for a prepared snapshot.`);
    }
    const simulator = !skipSimulator && Object.hasOwn(platformArtifacts, process.platform) ? platformArtifacts[process.platform] : undefined;
    if (simulator && process.platform === 'win32' && process.arch !== 'x64') {
        throw new Error('The Windows simulator build targets x64. Use an x64 build environment or --skip-simulator.');
    }
    const needsCompiler = ENGINE_COMPILER_OUTPUTS.some(relative => !fs.existsSync(path.join(source, relative)));
    const buildDirectories = ['bin/dev/cc-min', 'pal'];
    if (needsCompiler) buildDirectories.push('bin/.cache/dev-cli', 'bin/.cache/logs', 'bin/.editor');
    if (simulator) buildDirectories.push('native/simulator', 'bin/simulator', 'bin/native-preview');
    for (const relative of buildDirectories) {
        if (!inside(source, canonicalDestination(path.join(source, relative)))) throw new Error(`Engine SDK build directory escapes source: ${relative}`);
    }
    if (simulator) {
        requireBuildArtifact(source, 'native/external/CMakeLists.txt');
        if (process.platform === 'darwin') {
            requireBuildArtifact(source, `${XCODE_TOOL}/package.json`);
            const externalCmake = fs.readFileSync(path.join(source, 'native/external/CMakeLists.txt'), 'utf8');
            if (/^\s*include\s*\([^\r\n)]*\/ios-xcframework\/CMakeLists\.txt\s*\)/mi.test(externalCmake)) {
                requireBuildArtifact(source, 'native/external/ios-xcframework/CMakeLists.txt');
            }
        }
    }
    const cliRoot = path.join(__dirname, '..');
    const env = { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192' };
    const nodeOptions = { cwd: cliRoot, shell: false, env };
    if (needsCompiler) {
        for (const name of ['web-adapter.js', 'engine-adapter.js']) requireBuildArtifact(source, `bin/adapter/nodejs/${name}`);
        await run(process.execPath, ['--max-old-space-size=8192', path.join(__dirname, 'compiler-engine.js'), '--force', '--engine-path', source], nodeOptions);
    }
    await run('npm', ['run', 'build:min'], { cwd: source, env });
    const ccMin = path.join(source, 'bin/dev/cc-min');
    if (!fs.existsSync(ccMin) || !fs.readdirSync(ccMin, { withFileTypes: true }).some(entry => entry.isFile() && entry.name.endsWith('.js'))) {
        throw new Error(`Missing Engine SDK build output: ${ccMin}/*.js`);
    }
    if (!simulator) return;

    await run(process.execPath, [path.join(__dirname, 'build-simulator-runtime.js'), '--enginePath', source], nodeOptions);
    await run(process.execPath, [path.join(__dirname, 'build-simulator.js'), '--enginePath', source], nodeOptions);
    for (const relative of ['bin/native-preview/base.js', 'bin/simulator/import-map.json', 'bin/simulator/system.bundle.js', 'bin/simulator/polyfills.bundle.js', `native/simulator/Release/${simulator.entry}`]) {
        requireBuildArtifact(source, relative);
    }
    for (const [directory, kind] of [['bin/simulator', 'runtime'], ['native/simulator/Release', 'native']]) {
        const relative = `${directory}/simulator-artifact.json`;
        requireBuildArtifact(source, relative);
        const artifact = readJson(path.join(source, relative));
        if (artifact.formatVersion !== 1 || artifact.kind !== kind || artifact.engineVersion !== pkg.version || artifact.platform !== process.platform || artifact.arch !== process.arch) {
            throw new Error(`Simulator artifact does not match this Engine SDK: ${relative}`);
        }
    }
}

async function packSdk(options) {
    const { kind, dryRun } = options;
    const { root, pkg } = resolveSdkSource(kind, options.source);
    const output = canonicalDestination(options.output || path.join(__dirname, '..', '.publish', 'sdk', `cocos-${kind}-sdk-${pkg.version}-${process.platform}-${process.arch}`));
    if (inside(output, root)) throw new Error('Output cannot be the source directory or an ancestor of it');
    const reserved = [...(kind === 'cli' ? CLI_ROOTS : ENGINE_ROOTS), 'node_modules'];
    if (reserved.some(relative => inside(path.join(root, relative), output))) throw new Error('Output cannot be inside an SDK input directory');
    if (!dryRun && fs.existsSync(output)) throw new Error(`EEXIST: SDK output already exists: ${output}`);
    if (!dryRun && kind === 'engine' && options.build) {
        await prepareEngineSdk({ source: root, pkg, skipSimulator: options.skipSimulator, run: options.run });
    }
    const plan = await planSdk({ kind, source: root });
    const summary = { kind: plan.kind, version: plan.version, output, files: plan.files.length, bytes: plan.files.reduce((sum, entry) => sum + entry.bytes, 0), dependencies: plan.graph.nodes.length, dependencyWarnings: plan.graph.warnings };
    if (dryRun) return summary;
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
    const { values } = parseArgs({ options: { kind: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' }, 'dry-run': { type: 'boolean' }, 'skip-build': { type: 'boolean' }, 'skip-simulator': { type: 'boolean' }, help: { type: 'boolean' } } });
    if (values.help) {
        console.log('node workflow/pack-sdk.js --kind cli|engine [--source PATH] [--output NEW_DIRECTORY] [--dry-run] [--skip-build] [--skip-simulator]\nFor Engine SDKs, build missing dev-cli output, cc-min, and the Windows/macOS simulator before packing. --skip-build and --dry-run use existing inputs only.');
        return;
    }
    const root = path.join(__dirname, '..');
    const source = values.source || (values.kind === 'engine' ? resolveEnginePath(root) : root);
    console.log(JSON.stringify(await packSdk({
        ...values, source, dryRun: values['dry-run'], build: !values['skip-build'], skipSimulator: values['skip-simulator'],
        onProgress: progress => console.error(`[${values.kind}] ${progress.copied}/${progress.total} files`),
    }), null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { packSdk, planSdk, dependencies, REQUIRED };
