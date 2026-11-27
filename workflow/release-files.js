const fs = require('node:fs/promises');
const path = require('node:path');
const { globby } = require('globby');
const { getToolsForPlatform, platformVariantToolDirs } = require('./download-tools');

const toolsDir = 'static/tools';
const toolManifestPath = `${toolsDir}/manifest.json`;

async function collectReleaseFiles(rootDir, ignore, platform = process.platform) {
    const tools = getToolsForPlatform(platform);
    const toolPatterns = tools.flatMap(({ dist }) => [`${toolsDir}/${dist}`, `${toolsDir}/${dist}/**`]);
    const options = { cwd: rootDir, dot: true, onlyFiles: true, expandDirectories: false, ignore };
    const [projectFiles, toolFiles] = await Promise.all([
        globby(['**/*'], { ...options, ignore: [...ignore, `${toolsDir}/**`] }),
        globby([...toolPatterns, toolManifestPath], options),
    ]);
    const files = [...projectFiles, ...toolFiles];
    const sourceManifest = toolFiles.includes(toolManifestPath)
        ? JSON.parse(await fs.readFile(path.join(rootDir, toolManifestPath), 'utf8')) : {};
    const installed = new Set(toolFiles.map(file => file.split('/')[2]));
    const toolManifest = {};
    for (const { dist, url } of tools) {
        if (!installed.has(dist)) continue;
        const record = sourceManifest[dist];
        if (platformVariantToolDirs.has(dist) && record?.url !== url) {
            throw new Error(`Tool ${dist} has no matching download record for ${platform}. Check the setup:dev tool download log.`);
        }
        if (record) toolManifest[dist] = record;
    }
    return { files, toolManifest };
}

module.exports = { collectReleaseFiles, toolManifestPath };
