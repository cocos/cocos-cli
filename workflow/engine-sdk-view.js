'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readManifest, validateSource, resolvePackageRoot } = require('./engine-sdk');

function runtimeDependencies(root, ancestry = new Set()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const nodes = [];
    for (const [name, spec] of Object.entries(pkg.dependencies || {})) {
        if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error(`Invalid SDK dependency name: ${name}`);
        let installed;
        for (let current = root; ; current = path.dirname(current)) {
            const candidate = path.join(current, 'node_modules', name);
            if (fs.existsSync(path.join(candidate, 'package.json'))) { installed = fs.realpathSync(candidate); break; }
            if (path.dirname(current) === current) break;
        }
        if (!installed) throw new Error(`Install SDK runtime dependency ${name} before preparing the build view`);
        const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
        const semver = require('semver');
        if (!semver.validRange(spec) || !semver.satisfies(manifest.version, spec)) throw new Error(`SDK dependency mismatch: ${name}@${manifest.version}, required ${spec}`);
        if (ancestry.has(installed)) continue;
        nodes.push({ name, root: installed, version: manifest.version, dependencies: runtimeDependencies(installed, new Set([...ancestry, installed])) });
    }
    return nodes;
}

/** Assemble package inputs outside node_modules; never overwrite either input. */
function assembleEditorView(baseRoot, editorSource, projectRoot, resolutionRoot = projectRoot) {
    validateSource(editorSource, 'engineSdk.editor');
    if (!editorSource.path && !editorSource.package) throw new Error('engineSdk.editor requires path or package');
    if (!projectRoot) throw new Error('Project root is required for an editor component');
    const editorRoot = editorSource.package ? resolvePackageRoot(editorSource.package, resolutionRoot) : fs.realpathSync(path.resolve(resolutionRoot, editorSource.path));
    const base = readManifest(baseRoot), editor = readManifest(editorRoot);
    if (base?.schemaVersion !== 2 || editor?.schemaVersion !== 2 || editor.component !== 'editor') throw new Error('A schemaVersion 2 editor component is required');
    for (const key of ['engineVersion', 'engineRevision', 'sdkReleaseId']) if (base[key] !== editor[key]) throw new Error(`Editor ${key} differs from the selected Web SDK`);
    const dependencies = runtimeDependencies(baseRoot);
    const identity = crypto.createHash('sha256').update(JSON.stringify([2, baseRoot, editorRoot, base.sdkReleaseId, editor.payloadRevision, dependencies])).digest('hex');
    const parent = path.join(fs.realpathSync(projectRoot), 'temp/engine-sdk');
    fs.mkdirSync(parent, { recursive: true });
    const output = path.join(parent, identity);
    const ready = path.join(output, '.sdk-view-ready');
    if (fs.existsSync(ready)) return output;
    const lock = output + '.lock';
    try { fs.mkdirSync(lock); } catch (error) {
        if (error.code === 'EEXIST') throw new Error('Engine SDK view is being prepared by another process; retry after it finishes.');
        throw error;
    }
    const staging = output + '.' + crypto.randomUUID() + '.tmp';
    try {
        fs.mkdirSync(staging);
        for (const [root, isEditor] of [[baseRoot, false], [editorRoot, true]]) {
            function copy(relative = '') {
                for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
                    if (item.name === 'node_modules' || (isEditor && !relative && ['package.json', 'engine-sdk.json', 'LICENSE', 'AUTHORS.txt'].includes(item.name))) continue;
                    const rel = path.join(relative, item.name), from = path.join(root, rel), dest = path.join(staging, rel);
                    if (item.isSymbolicLink()) throw new Error(`SDK payload symlink is not supported: ${rel}`);
                    if (item.isDirectory()) { fs.mkdirSync(dest, { recursive: true }); copy(rel); }
                    else if (fs.existsSync(dest)) {
                        if (!fs.readFileSync(dest).equals(fs.readFileSync(from))) throw new Error(`SDK component file conflict: ${rel}`);
                    } else fs.copyFileSync(from, dest);
                }
            }
            copy();
        }
        // ccbuild's resolver is jailed to engineRoot. Materialize only declared
        // runtime dependencies here, rather than depending on project hoisting.
        function copyDependencies(nodes, owner) {
            for (const node of nodes) {
                const destination = path.join(owner, 'node_modules', node.name);
                fs.cpSync(node.root, destination, { recursive: true, dereference: true,
                    filter: file => !['node_modules', '.git'].includes(path.basename(file)) });
                copyDependencies(node.dependencies, destination);
            }
        }
        copyDependencies(dependencies, staging);
        fs.writeFileSync(path.join(staging, 'engine-sdk.json'), JSON.stringify({ ...base, component: 'composite', profiles: { ...base.profiles, ...editor.profiles }, capabilities: [...new Set([...base.capabilities || [], ...editor.capabilities || []])] }, null, 2));
        fs.writeFileSync(path.join(staging, '.sdk-view-ready'), identity);
        // Windows scanners can briefly retain a handle after a large payload copy.
        // Only retry sharing/access errors; never replace an existing view.
        for (let attempt = 0; ; attempt++) {
            try { fs.renameSync(staging, output); break; }
            catch (error) {
                if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 20 || fs.existsSync(output)) throw error;
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
            }
        }
        return output;
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
        fs.rmdirSync(lock);
    }
}
module.exports = { assembleEditorView };
