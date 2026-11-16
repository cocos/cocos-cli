const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { builtinModules } = require('module');
const ts = require('typescript');

// Resolve build dependencies inside the packed SDK, using its verified file inventory.
function compilerDependencies(root, cli) {
    const manifests = new Map(cli.files.map(file => [file.path, file]));
    function read(relative) {
        const bytes = fs.readFileSync(path.join(root, relative));
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== manifests.get(relative)?.sha256) throw Error('Build input changed: ' + relative);
        return bytes.toString('utf8');
    }
    const roots = new Set();
    let dynamic = false;
    for (const file of cli.files.filter(file => file.path.startsWith('packages/engine-compiler/') && /\.[cm]?js$/.test(file.path))) {
        const source = ts.createSourceFile(file.path, read(file.path), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        function visit(node) {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) dynamic = true;
            if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && node.expression.text === 'require') || node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
                const request = node.arguments[0];
                if (!request || !ts.isStringLiteral(request)) dynamic = true;
                else if (request.text.startsWith('.')) {
                    if (!path.posix.normalize(path.posix.join(path.posix.dirname(file.path), request.text)).startsWith('packages/engine-compiler/')) dynamic = true;
                } else if (!request.text.startsWith('node:') && !builtinModules.includes(request.text)) roots.add(request.text.startsWith('@') ? request.text.split('/').slice(0, 2).join('/') : request.text.split('/')[0]);
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
    }
    if (dynamic || !roots.size) return { cli, scope: 'all', packages: [] };
    const selected = new Set();
    function resolve(name, owner, optional) {
        if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw Error('Invalid dependency name: ' + name);
        for (let dir = owner; ; dir = path.posix.dirname(dir)) {
            const candidate = path.posix.join(dir === '.' ? '' : dir, 'node_modules', name);
            if (manifests.has(candidate + '/package.json')) return candidate;
            if (!dir || dir === '.') break;
        }
        if (!optional) throw Error('Missing compiler dependency: ' + name + ' from ' + owner);
    }
    function add(name, owner = '', optional = false) {
        const location = resolve(name, owner, optional);
        if (!location || selected.has(location)) return;
        selected.add(location);
        const pkg = JSON.parse(read(location + '/package.json'));
        for (const [dependency] of Object.entries({ ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.optionalDependencies })) {
            add(dependency, location, Object.hasOwn(pkg.optionalDependencies || {}, dependency) || (!Object.hasOwn(pkg.dependencies || {}, dependency) && pkg.peerDependenciesMeta?.[dependency]?.optional));
        }
    }
    for (const name of roots) add(name, 'packages/engine-compiler/dist');
    const files = cli.files.filter(file => !file.path.startsWith('node_modules/') || [...selected].some(location => file.path.startsWith(location + '/')));
    return { cli: { ...cli, files }, scope: 'compiler-closure', packages: [...selected].sort() };
}
module.exports = { compilerDependencies };
