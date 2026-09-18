/* Validate cached platform tools before allowing the downloader to reuse them. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function inventory(root) {
    const files = [];
    async function walk(directory) {
        for (const name of (await fs.promises.readdir(directory)).sort()) {
            const file = path.join(directory, name), stat = await fs.promises.lstat(file);
            const relative = path.relative(root, file).split(path.sep).join('/');
            if (stat.isSymbolicLink()) {
                const target = await fs.promises.readlink(file);
                const resolved = path.resolve(path.dirname(file), target);
                if (path.isAbsolute(target) || !resolved.startsWith(path.resolve(root) + path.sep)) throw Error('Tool link escapes its directory: ' + relative);
                files.push({ path: relative, link: target });
            } else if (stat.isDirectory()) await walk(file);
            else if (stat.isFile()) {
                const hash = crypto.createHash('sha256');
                for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
                files.push({ path: relative, size: stat.size, mode: stat.mode & 0o777, sha256: hash.digest('hex') });
            } else throw Error('Unsupported tool file: ' + relative);
        }
    }
    if (!(await fs.promises.lstat(root)).isDirectory() || (await fs.promises.lstat(root)).isSymbolicLink()) throw Error('Tool must be a real directory');
    await walk(root);
    if (!files.some(file => file.sha256 && file.size > 0)) throw Error('Tool directory contains no nonempty files');
    return files;
}
async function prepare(downloader, output = process.env.GITHUB_OUTPUT, minimal = process.env.MINIMAL_DOWNLOAD_TOOLS === 'true') {
    const started = Date.now();
    const root = path.resolve(downloader.toolsDir);
    // Test SDKs may omit optional platform packagers; cache modes must not mix.
    downloader.minimal = minimal;
    const mode = minimal ? 'minimal' : 'full';
    const manifestFile = path.join(root, '.sdk-tool-integrity.json');
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { /* Cold or invalid cache. */ }
    const records = {}, counts = { reused: 0, downloaded: 0, failed: 0 };
    const processTool = downloader.processTool.bind(downloader);
    downloader.processTool = async (tool, index, total) => {
        const target = path.resolve(root, tool.dist);
        // Only a configured direct child of this workspace's tools directory can be replaced.
        if (path.dirname(target) !== root || fs.lstatSync(root).isSymbolicLink()) throw Error('Invalid tool destination');
        let valid = false, cachedFiles;
        try {
            valid = previous.schemaVersion === 1 && previous.mode === mode && previous.platform === process.platform && previous.arch === process.arch
                && previous.tools?.[tool.dist]?.url === tool.url
                && downloader.manifest?.[tool.dist]?.url === tool.url
                && JSON.stringify(cachedFiles = await inventory(target)) === JSON.stringify(previous.tools[tool.dist].files);
        } catch { /* Redownload only the affected tool. */ }
        if (!valid) {
            if (fs.existsSync(target) || (() => { try { fs.lstatSync(target); return true; } catch { return false; } })()) {
                if (fs.lstatSync(target).isSymbolicLink()) fs.unlinkSync(target);
                else fs.rmSync(target, { recursive: true, force: true });
            }
            delete downloader.manifest[tool.dist];
        }
        const result = await processTool(tool, index, total);
        if (!result.success) { counts.failed++; return result; }
        records[tool.dist] = { url: tool.url, files: valid ? cachedFiles : await inventory(target) };
        if (valid) counts.reused++; else counts.downloaded++;
        return result;
    };
    await downloader.run();
    if (counts.failed || !Object.keys(records).length) throw Error('Incomplete platform tools; refusing to save cache');
    const temporary = manifestFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, mode, platform: process.platform, arch: process.arch, tools: records }));
    fs.renameSync(temporary, manifestFile);
    const durationMs = Date.now() - started;
    console.log('[Platform tools] ' + JSON.stringify({ ...counts, durationMs }));
    if (output) fs.appendFileSync(output, `changed=${counts.downloaded > 0}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `### Platform tools\n\nReused: ${counts.reused}; downloaded: ${counts.downloaded}; elapsed: ${(durationMs / 1000).toFixed(1)} seconds.\n`);
    return { ...counts, durationMs };
}
if (require.main === module) {
    const candidate = path.resolve(process.argv[2]);
    process.env.COCOS_STRICT_TOOL_DOWNLOADS = 'true';
    const { ToolDownloader } = require(path.join(candidate, 'workflow/download-tools.js'));
    prepare(new ToolDownloader()).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { inventory, prepare };
