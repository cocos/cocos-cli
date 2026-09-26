const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { resolveEnginePath } = require('./engine-path');

function isWithin(root, target) {
    const relative = path.relative(root, target);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Explicit source acquisition. Existing SDKs and local source changes are preserved. */
class UpdateRepo {
    constructor({ rootDir = path.resolve(__dirname, '..'), update = false, exec = execFileSync } = {}) {
        this.rootDir = fs.realpathSync(rootDir);
        this.update = update;
        this.exec = exec;
    }

    git(args, cwd) {
        return this.exec('git', args, { cwd, shell: false, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
    }

    readRepoConfig() {
        const config = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'repo.json'), 'utf8').replace(/^\uFEFF/, ''));
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('repo.json must contain an object');
        return Object.entries(config).map(([name, entry]) => {
            if (!entry || typeof entry.repo !== 'string' || !entry.repo || typeof entry.dist !== 'string' || !entry.dist) throw new Error(`Invalid repository configuration: ${name}`);
            if (entry.tag && entry.branch) throw new Error(`Specify either tag or branch for ${name}`);
            for (const ref of [entry.tag, entry.branch]) {
                if (ref !== undefined && (typeof ref !== 'string' || !ref || ref.startsWith('-'))) throw new Error(`Invalid ref for ${name}`);
            }
            const target = path.resolve(this.rootDir, entry.dist);
            if (!isWithin(this.rootDir, target) || path.relative(this.rootDir, target).split(path.sep).some(part => part.toLowerCase() === '.git')) throw new Error(`Repository destination must stay inside the CLI root: ${entry.dist}`);
            let ancestor = target;
            while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
            const real = fs.realpathSync(ancestor);
            if (real !== this.rootDir && !isWithin(this.rootDir, real)) throw new Error(`Repository destination escapes through a link: ${entry.dist}`);
            return { name, ...entry, target };
        }).sort((a, b) => a.target.length - b.target.length);
    }

    async run() {
        const entries = this.readRepoConfig();
        const engine = entries.find(entry => entry.name === 'engine');
        if (engine && path.relative(engine.target, resolveEnginePath(this.rootDir)) !== '') {
            throw new Error('A custom enginePath is configured. Manage that engine separately; fetch:engine/update:repos only manage repo.json destinations.');
        }
        // Preflight every existing repository before any fetch or checkout.
        if (this.update) {
            for (const entry of entries) {
                if (!fs.existsSync(entry.target)) continue;
                if (!fs.existsSync(path.join(entry.target, '.git'))) throw new Error(`Preserving non-Git directory: ${entry.target}`);
                if (this.git(['status', '--porcelain', '--untracked-files=all'], entry.target)) throw new Error(`Local changes found; preserve or commit them before updating: ${entry.target}`);
                if (this.git(['remote', 'get-url', 'origin'], entry.target) !== entry.repo) throw new Error(`Origin differs from repo.json; preserving custom repository: ${entry.target}`);
            }
        }
        const preserved = [];
        for (const entry of entries) {
            if (preserved.some(parent => isWithin(parent, entry.target))) continue;
            if (fs.existsSync(entry.target)) {
                if (!this.update) {
                    console.log(`Preserving existing directory: ${entry.target}`);
                    preserved.push(entry.target);
                    continue;
                }
                const branch = entry.tag ? undefined : (entry.branch || this.git(['symbolic-ref', '--short', 'HEAD'], entry.target));
                this.git(['fetch', 'origin', '--tags'], entry.target);
                if (entry.tag) this.git(['checkout', '--detach', `refs/tags/${entry.tag}`], entry.target);
                else {
                    this.git(['checkout', branch], entry.target);
                    this.git(['merge', '--ff-only', `refs/remotes/origin/${branch}`], entry.target);
                }
            } else {
                fs.mkdirSync(path.dirname(entry.target), { recursive: true });
                const ref = entry.tag || entry.branch;
                this.git(['clone', ...(ref ? ['--branch', ref] : []), ...(entry.tag ? ['--depth', '1'] : []), '--', entry.repo, entry.target], this.rootDir);
            }
        }
    }
}

if (require.main === module) {
    const { values } = parseArgs({ options: { update: { type: 'boolean' } } });
    new UpdateRepo({ update: values.update }).run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = UpdateRepo;
